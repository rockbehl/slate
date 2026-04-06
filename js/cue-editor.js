/* ─────────────────────────────────────────────────
   SLATE — cue-editor.js
   Phase 3: Renders and manages the cue table in Compose mode.

   FEATURES:
     - Render cue rows from STATE.cues + STATE.scenes
     - Highlight + scroll-to the active cue (currently playing)
     - Click a row to jump to that page + audio position
     - Inline note editing (click note cell to edit)
     - Suggest Cues button → imports interpreter's scene stubs
     - Delete cue (hover row to reveal delete icon)
     - Save changes to localStorage (no backend needed)
     - Export cues.json button (downloads the current cue list)
───────────────────────────────────────────────── */

'use strict';

const CueEditor = (() => {

    const STORAGE_KEY = 'slate_cues';
    let _pendingSuggest = false;

    /* ─────────────────────────────────────────
       INIT — call after cues + scenes loaded
    ───────────────────────────────────────── */
    function init() {
        // Restore saved cues from localStorage — only when non-empty,
        // so an empty saved list never silently wipes the loaded cues.
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed.cues)   && parsed.cues.length   > 0) STATE.cues   = parsed.cues;
                if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) STATE.scenes = parsed.scenes;
            } catch (e) {
                console.warn('SLATE CueEditor: could not parse saved cues', e);
            }
        }

        render();
    }

    /* ─────────────────────────────────────────
       RENDER — populate the cue table
    ───────────────────────────────────────── */
    function render() {
        const tbody = document.getElementById('cue-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!STATE.cues.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="5" class="cue-empty">No cues — click <em>Suggest</em> to generate from screenplay, or edit cues.json.</td>`;
            tbody.appendChild(tr);
            return;
        }

        STATE.cues.forEach((cue, idx) => {
            const scene    = _sceneForPage(cue.page);
            const isActive = STATE.currentCue === idx;

            const tr = document.createElement('tr');
            tr.className   = isActive ? 'active' : '';
            tr.dataset.idx = idx;

            // Build cells safely — no innerHTML with user data
            tr.appendChild(_cell(`<span class="c-dot" style="background:${_esc(scene?.color || '#555')};"></span>${cue.page}`));
            tr.appendChild(_cell(_esc(cue.scene || '—')));
            tr.appendChild(_cell(cue.track
                ? _esc(_trackLabel(cue.track))
                : '<span class="tbd">— not set</span>'
            ));
            tr.appendChild(_monoCell(_formatTime(cue.at)));

            const noteCell = _noteCell(cue, idx);
            tr.appendChild(noteCell);

            // Delete button — only visible on hover via CSS
            const delCell = document.createElement('td');
            delCell.className = 'del-td';
            const delBtn = document.createElement('button');
            delBtn.className  = 'cm-del';
            delBtn.textContent = '×';
            delBtn.setAttribute('aria-label', `Delete cue on page ${cue.page}`);
            delBtn.addEventListener('click', e => { e.stopPropagation(); _deleteCue(idx); });
            delCell.appendChild(delBtn);
            tr.appendChild(delCell);

            // Row click → jump to page + audio
            tr.addEventListener('click', e => {
                if (e.target.closest('[data-field="note"]') || e.target.closest('.cm-del')) return;
                if (typeof goToPage === 'function') goToPage(cue.page);
                if (typeof AudioEngine !== 'undefined') AudioEngine.seekToCue(cue.page);
                STATE.currentCue = idx;
                _refreshActiveRow();
            });

            tbody.appendChild(tr);
        });
    }

    /* ─────────────────────────────────────────
       HIGHLIGHT + SCROLL ACTIVE ROW
    ───────────────────────────────────────── */
    function setActive(cueIdx) {
        STATE.currentCue = cueIdx;
        _refreshActiveRow();
        _scrollToActive();
    }

    function _refreshActiveRow() {
        document.querySelectorAll('#cue-tbody tr').forEach((tr, i) => {
            tr.classList.toggle('active', i === STATE.currentCue);
        });
    }

    function _scrollToActive() {
        const tbody = document.getElementById('cue-tbody');
        if (!tbody) return;
        const active = tbody.querySelector('tr.active');
        if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /* ─────────────────────────────────────────
       INLINE NOTE EDITING
    ───────────────────────────────────────── */
    function _noteCell(cue, idx) {
        const td = document.createElement('td');
        td.className = 'note-td';
        td.dataset.field = 'note';
        td.dataset.idx   = idx;
        td.innerHTML = cue.note ? _esc(cue.note) : '<span class="tbd">—</span>';

        td.addEventListener('click', () => _editNote(td, idx));
        return td;
    }

    function _editNote(cell, idx) {
        const current = STATE.cues[idx].note || '';
        cell.innerHTML = '';

        const input = document.createElement('textarea');
        input.value = current;
        input.setAttribute('aria-label', `Note for cue on page ${STATE.cues[idx]?.page ?? idx}`);
        input.style.cssText = `
            background: transparent;
            border: none;
            border-bottom: 1px solid rgba(201,168,76,.3);
            color: rgba(226,221,216,.5);
            font-family: inherit;
            font-size: 9.5px;
            font-style: italic;
            line-height: 1.5;
            resize: none;
            outline: none;
            width: 100%;
            min-height: 36px;
        `;

        input.addEventListener('blur', () => {
            STATE.cues[idx].note = input.value.trim();
            save();
            render();
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.value = current; input.blur(); }
        });

        cell.appendChild(input);
        input.focus();
    }

    /* ─────────────────────────────────────────
       DELETE CUE
    ───────────────────────────────────────── */
    function _deleteCue(idx) {
        STATE.cues.splice(idx, 1);
        if (STATE.currentCue >= STATE.cues.length) STATE.currentCue = null;
        save();
        render();
        _syncCountLabel();
    }

    /* ─────────────────────────────────────────
       INTERPRETER READY HOOK
       Called by interpreter.js when analysis completes.
    ───────────────────────────────────────── */
    function onInterpreterReady(data) {
        const btn = document.getElementById('suggest-btn');
        if (!btn) return;

        if (data.error === 'no-text') {
            btn.dataset.state = 'error';
            btn.setAttribute('title', 'PDF has no text layer — cannot suggest');
            btn.querySelector('.suggest-lbl').textContent = 'No text';
            return;
        }

        const count = (data.suggestedCues || []).length;
        btn.dataset.state = 'ready';
        btn.setAttribute('title', `${count} scenes detected — click to load`);
        btn.querySelector('.suggest-lbl').textContent = `Suggest (${count})`;

        // If the user already clicked Suggest before we were ready, fire now
        if (_pendingSuggest) {
            _pendingSuggest = false;
            suggestCues();
        }
    }

    /* ─────────────────────────────────────────
       SUGGEST CUES — import interpreter stubs
    ───────────────────────────────────────── */
    function suggestCues() {
        const data = STATE.interpreterData;

        if (!data) {
            // Interpreter still running — queue a retry once it finishes
            const btn = document.getElementById('suggest-btn');
            if (btn) { btn.dataset.state = 'waiting'; btn.querySelector('.suggest-lbl').textContent = 'Analyzing…'; }
            _pendingSuggest = true;
            if (typeof showNowPlaying === 'function') showNowPlaying('Analyzing screenplay — will suggest when ready');
            return;
        }
        if (data.error === 'no-text') {
            if (typeof showNowPlaying === 'function') showNowPlaying('PDF has no text layer — cannot suggest cues');
            return;
        }

        const suggested = data.suggestedCues || [];
        if (!suggested.length) {
            if (typeof showNowPlaying === 'function') showNowPlaying('No scenes detected in this PDF');
            return;
        }

        // Deep-copy so edits don't mutate interpreter data
        STATE.cues = suggested.map(c => ({ ...c }));
        STATE.currentCue = null;
        save();
        render();
        _syncCountLabel();

        if (typeof showNowPlaying === 'function') {
            showNowPlaying(`${suggested.length} scene cues loaded`);
        }
    }

    /* ─────────────────────────────────────────
       SAVE to localStorage
    ───────────────────────────────────────── */
    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                cues:   STATE.cues,
                scenes: STATE.scenes,
            }));
        } catch (e) {
            console.warn('SLATE CueEditor: could not save to localStorage', e);
        }
    }

    /* ─────────────────────────────────────────
       EXPORT cues.json
    ───────────────────────────────────────── */
    function exportJSON() {
        const data = JSON.stringify({ scenes: STATE.scenes, cues: STATE.cues }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = 'cues.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    /* ─────────────────────────────────────────
       HELPERS
    ───────────────────────────────────────── */
    function _sceneForPage(pageNum) {
        return STATE.scenes.find(s => pageNum >= s.fromPage && pageNum <= s.toPage) || null;
    }

    function _trackLabel(id) {
        if (!id) return '';
        const meta = (STATE.tracks || []).find(t => t.id === id);
        return meta ? (meta.title || meta.id) : id;
    }

    function _formatTime(seconds) {
        if (seconds == null || seconds === '') return '—';
        const m = Math.floor(seconds / 60);
        const s = Math.round(seconds % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    // Escape HTML for safe innerHTML insertion
    function _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _cell(html) {
        const td = document.createElement('td');
        td.innerHTML = html;
        return td;
    }

    function _monoCell(text) {
        const td = document.createElement('td');
        td.className = 'mono';
        td.textContent = text;
        return td;
    }

    function _syncCountLabel() {
        const el = document.getElementById('cue-count-label');
        if (el) el.textContent = `${STATE.cues.length} cue${STATE.cues.length !== 1 ? 's' : ''}`;
    }

    function _flashStatus(msg) {
        const el = document.querySelector('.cue-zone .panel-lbl');
        if (!el) return;
        const orig = el.textContent;
        el.textContent = msg;
        setTimeout(() => { el.textContent = orig; }, 2200);
    }

    /* Public API */
    return { init, render, setActive, save, exportJSON, suggestCues, onInterpreterReady };

})();
