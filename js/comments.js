/* ─────────────────────────────────────────────────
   SLATE — comments.js
   Page-level annotation tool.

   USAGE:
     Comments.init()           — call on DOMContentLoaded
     Comments.capture()        — open the note overlay (M key)
     Comments.syncIndicator()  — update the Screen mode dot for current page

   DATA:
     Stored in localStorage as 'slate_comments'.
     Each entry: { page, note, at, created }
     `at` is seconds into the audio at capture time (null if not playing).
───────────────────────────────────────────────── */

'use strict';

const Comments = (() => {

    const STORAGE_KEY = 'slate_comments';
    let _comments = [];

    /* ─────────────────────────────────────────
       INIT
    ───────────────────────────────────────── */
    function init() {
        try {
            _comments = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch (e) {
            _comments = [];
        }

        _bindOverlay();
        renderList();
        syncIndicator();
    }

    /* ─────────────────────────────────────────
       CAPTURE — open the note overlay
    ───────────────────────────────────────── */
    function capture() {
        const page     = STATE.currentPage;
        const duration = (typeof AudioEngine !== 'undefined') ? (AudioEngine.getDuration() || 0) : 0;
        const playing  = (typeof AudioEngine !== 'undefined') && AudioEngine.isPlaying();
        const at       = (playing && duration > 0) ? duration * (STATE.progress / 100) : null;

        const overlay = document.getElementById('comment-overlay');
        const meta    = document.getElementById('comment-box-meta');
        const input   = document.getElementById('comment-input');
        if (!overlay || !meta || !input) return;

        meta.textContent = at !== null
            ? `Note for p.${page}  ·  ${_fmtTime(at)}`
            : `Note for p.${page}`;

        input.value = '';
        overlay.classList.add('open');
        overlay.dataset.page = page;
        overlay.dataset.at   = at !== null ? at : '';

        requestAnimationFrame(() => {
            input.focus();
            _trapFocus(overlay);
        });
    }

    /* ─────────────────────────────────────────
       OVERLAY BINDING
    ───────────────────────────────────────── */
    function _bindOverlay() {
        const overlay  = document.getElementById('comment-overlay');
        const input    = document.getElementById('comment-input');
        const saveBtn  = document.getElementById('comment-save');
        const cancelBtn = document.getElementById('comment-cancel');
        if (!overlay) return;

        function _doSave() {
            const note = input.value.trim();
            if (!note) { _closeOverlay(); return; }
            const page = parseInt(overlay.dataset.page, 10);
            const at   = overlay.dataset.at ? parseFloat(overlay.dataset.at) : null;
            _save(page, at, note);
            _closeOverlay();
        }

        function _closeOverlay() {
            overlay.classList.remove('open');
            input.value = '';
        }

        saveBtn?.addEventListener('click', _doSave);
        cancelBtn?.addEventListener('click', _closeOverlay);

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _doSave(); }
            if (e.key === 'Escape') _closeOverlay();
        });

        // Click outside the box to cancel
        overlay.addEventListener('click', e => {
            if (e.target === overlay) _closeOverlay();
        });
    }

    /* ─────────────────────────────────────────
       SAVE
    ───────────────────────────────────────── */
    function _save(page, at, note) {
        _comments.push({
            page,
            note,
            at:      at !== null ? Math.round(at) : null,
            created: new Date().toISOString(),
        });
        _comments.sort((a, b) => a.page - b.page || (a.at ?? 0) - (b.at ?? 0));
        _persist();
        renderList();
        syncIndicator();

        if (typeof showNowPlaying === 'function') showNowPlaying(`Note saved — p.${page}`);
    }

    /* ─────────────────────────────────────────
       DELETE
    ───────────────────────────────────────── */
    function _delete(idx) {
        _comments.splice(idx, 1);
        _persist();
        renderList();
        syncIndicator();
    }

    /* ─────────────────────────────────────────
       RENDER — populate the comments list in Compose
    ───────────────────────────────────────── */
    function renderList() {
        const list = document.getElementById('comments-list');
        if (!list) return;

        if (_comments.length === 0) {
            list.innerHTML = '<div class="cm-empty">No notes yet. Press M to add one.</div>';
            return;
        }

        list.innerHTML = '';
        _comments.forEach((c, i) => {
            const row = document.createElement('div');
            row.className = 'cm-row';

            const meta = document.createElement('div');
            meta.className = 'cm-meta';
            // Build with DOM methods — avoids innerHTML with data-derived values
            const pageSpan = document.createElement('span');
            pageSpan.className   = 'cm-page';
            pageSpan.textContent = `p.${c.page}`;
            meta.appendChild(pageSpan);
            if (c.at !== null) {
                const atSpan = document.createElement('span');
                atSpan.className   = 'cm-at';
                atSpan.textContent = _fmtTime(c.at);
                meta.appendChild(atSpan);
            }

            const text = document.createElement('div');
            text.className = 'cm-text';
            text.textContent = c.note;

            const del = document.createElement('button');
            del.className = 'cm-del';
            del.setAttribute('aria-label', `Delete note for page ${c.page}`);
            del.innerHTML = `<svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>`;
            del.addEventListener('click', () => _delete(i));

            // Click row → jump to page
            row.addEventListener('click', e => {
                if (e.target.closest('.cm-del')) return;
                if (typeof goToPage === 'function') goToPage(c.page);
            });

            row.appendChild(meta);
            row.appendChild(text);
            row.appendChild(del);
            list.appendChild(row);
        });

        // Update header count
        const hdrCount = document.getElementById('comments-count');
        if (hdrCount) hdrCount.textContent = `${_comments.length} note${_comments.length !== 1 ? 's' : ''}`;
    }

    /* ─────────────────────────────────────────
       SCREEN MODE INDICATOR
       Amber dot in screen-nav when current page has notes
    ───────────────────────────────────────── */
    function syncIndicator() {
        const dot = document.getElementById('comment-dot');
        if (!dot) return;
        const has = _comments.some(c => c.page === STATE.currentPage);
        dot.classList.toggle('visible', has);
        dot.title = has ? 'This page has notes' : '';
        dot.setAttribute('aria-label', has ? 'This page has notes' : '');
    }

    /* ─────────────────────────────────────────
       FOCUS TRAP — keeps keyboard inside dialog
    ───────────────────────────────────────── */
    function _trapFocus(container) {
        const focusable = Array.from(
            container.querySelectorAll('button, textarea, input, [tabindex]:not([tabindex="-1"])')
        ).filter(el => !el.disabled);
        if (!focusable.length) return;
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];

        function onKey(e) {
            if (e.key !== 'Tab') return;
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        }

        container.addEventListener('keydown', onKey);
        // Remove listener once overlay closes
        const observer = new MutationObserver(() => {
            if (!container.classList.contains('open')) {
                container.removeEventListener('keydown', onKey);
                observer.disconnect();
            }
        });
        observer.observe(container, { attributes: true, attributeFilter: ['class'] });
    }

    /* ─────────────────────────────────────────
       HELPERS
    ───────────────────────────────────────── */
    function _persist() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_comments));
    }

    function _fmtTime(seconds) {
        if (seconds == null) return '';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    return { init, capture, renderList, syncIndicator };

})();
