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
    let _pendingSuggest  = false;
    let _prevActiveIdx   = null;   // track last highlighted row to avoid full-scan
    let _fuse            = null;   // Fuse.js instance, rebuilt after each render

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

        _pendingSuggest = false;
        _prevActiveIdx  = null;
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
            tr.appendChild(_trackCell(cue, idx));
            tr.appendChild(_atCell(cue, idx));

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

        // Rebuild Fuse index after every render so search reflects current cues
        if (typeof Fuse !== 'undefined') {
            _fuse = new Fuse(STATE.cues, {
                keys:      ['scene', 'track', 'note'],
                threshold: 0.35,
                ignoreLocation: true,
            });
        }
    }

    /* ─────────────────────────────────────────
       FUZZY SEARCH (Fuse.js)
    ───────────────────────────────────────── */
    function search(query) {
        const tbody = document.getElementById('cue-tbody');
        if (!tbody) return;

        if (!query || !_fuse) {
            // Show everything
            [...tbody.rows].forEach(r => r.style.display = '');
            return;
        }

        const hits = new Set(_fuse.search(query).map(r => r.refIndex));
        [...tbody.rows].forEach((r, i) => {
            r.style.display = hits.has(i) ? '' : 'none';
        });
    }

    /* ─────────────────────────────────────────
       HIGHLIGHT + SCROLL ACTIVE ROW
    ───────────────────────────────────────── */
    function setActive(cueIdx) {
        STATE.currentCue = cueIdx;
        _refreshActiveRow();
        _scrollToActive();
        if (typeof Waveform !== 'undefined') Waveform.highlightCueMarker(cueIdx);
    }

    function _refreshActiveRow() {
        // Only touch the two rows that changed — avoids a full-table scan on every 250ms tick
        const tbody = document.getElementById('cue-tbody');
        if (!tbody) return;
        if (_prevActiveIdx !== null && _prevActiveIdx !== STATE.currentCue) {
            tbody.children[_prevActiveIdx]?.classList.remove('active');
        }
        if (STATE.currentCue !== null) {
            tbody.children[STATE.currentCue]?.classList.add('active');
        }
        _prevActiveIdx = STATE.currentCue;
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
       INLINE TRACK ASSIGNMENT
    ───────────────────────────────────────── */
    function _trackCell(cue, idx) {
        const td = document.createElement('td');
        td.className = 'track-td';
        td.title     = 'Click to change track';
        td.innerHTML = cue.track
            ? _esc(_trackLabel(cue.track))
            : '<span class="tbd">— not set</span>';
        td.addEventListener('click', e => {
            if (e.target.tagName === 'SELECT') return;
            _editTrack(td, idx);
        });
        return td;
    }

    function _editTrack(cell, idx) {
        const current = STATE.cues[idx].track || '';
        cell.innerHTML = '';

        const select = document.createElement('select');
        select.className = 'track-select';

        const emptyOpt = document.createElement('option');
        emptyOpt.value       = '';
        emptyOpt.textContent = '— silence —';
        select.appendChild(emptyOpt);

        (STATE.tracks || []).forEach(t => {
            const opt = document.createElement('option');
            opt.value       = t.id || t.file || '';
            opt.textContent = t.title || t.id || t.file || '';
            select.appendChild(opt);
        });

        // If tracks list is empty but a value exists, add it so it shows
        if (!(STATE.tracks || []).length && current) {
            const opt = document.createElement('option');
            opt.value = current; opt.textContent = current;
            select.appendChild(opt);
        }

        select.value = current;

        const commit = () => {
            STATE.cues[idx].track = select.value;
            save();
            render();
            if (typeof Waveform !== 'undefined') Waveform.renderCueMarkers(STATE.cues, STATE.scenes);
        };

        select.addEventListener('change', commit);
        select.addEventListener('blur',   () => { if (cell.contains(select)) render(); });
        cell.appendChild(select);
        select.focus();
    }

    /* ─────────────────────────────────────────
       INLINE TIMESTAMP (CUE IN) EDITING
    ───────────────────────────────────────── */
    function _atCell(cue, idx) {
        const td = document.createElement('td');
        td.className = 'mono at-td';
        td.title     = 'Click to set cue-in time (seconds)';
        td.textContent = _formatTime(cue.at);
        td.addEventListener('click', () => _editAt(td, idx));
        return td;
    }

    function _editAt(cell, idx) {
        const current = STATE.cues[idx].at ?? 0;
        cell.textContent = '';

        const input = document.createElement('input');
        input.type      = 'number';
        input.className = 'at-input';
        input.value     = current ?? 0;
        input.min       = 0;
        input.step      = 1;
        input.setAttribute('aria-label', 'Cue start time in seconds');

        input.addEventListener('blur', () => {
            const val = parseFloat(input.value);
            STATE.cues[idx].at = isNaN(val) ? null : val;
            save();
            render();
            if (typeof Waveform !== 'undefined') Waveform.renderCueMarkers(STATE.cues, STATE.scenes);
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.value = current ?? 0; input.blur(); }
        });

        cell.appendChild(input);
        input.focus();
        input.select();
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
    function toggleInterpPanel() {
        const panel  = document.getElementById('interp-panel');
        const toggle = document.getElementById('interp-toggle');
        if (!panel) return;
        const isHidden = panel.hidden;
        panel.hidden = !isHidden;
        if (toggle) toggle.classList.toggle('active', !isHidden === false ? false : true);
    }

    function _populateInterpPanel(data) {
        const panel     = document.getElementById('interp-panel');
        const sceneEl   = document.getElementById('interp-scene-count');
        const charCountEl = document.getElementById('interp-char-count');
        const charsEl   = document.getElementById('interp-chars');
        const toggle    = document.getElementById('interp-toggle');
        if (!panel || !sceneEl) return;

        sceneEl.textContent   = `${(data.scenes||[]).length} scenes`;
        charCountEl.textContent = `${(data.characters||[]).length} characters`;

        if (charsEl) {
            charsEl.innerHTML = '';
            (data.characters || []).slice(0, 30).forEach(name => {
                const chip = document.createElement('span');
                chip.className   = 'interp-chip';
                chip.textContent = name;
                charsEl.appendChild(chip);
            });
            if ((data.characters || []).length > 30) {
                const more = document.createElement('span');
                more.className   = 'interp-chip tbd';
                more.textContent = `+${data.characters.length - 30} more`;
                charsEl.appendChild(more);
            }
        }

        if (toggle) toggle.style.display = '';
    }

    function onInterpreterReady(data) {
        if (!data || data.error === 'no-text') {
            _setBtnState('error', 'No text');
            console.warn('SLATE CueEditor: interpreter returned no-text or null', data);
            return;
        }

        const count = (data.suggestedCues || []).length;
        console.log(`SLATE CueEditor: interpreter ready — ${count} cues, ${(data.scenes||[]).length} scenes, ${(data.characters||[]).length} chars`);
        _setBtnState('ready', `Suggest (${count})`);
        _populateInterpPanel(data);

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
        console.log('SLATE CueEditor: suggestCues() called — interpreterData:', data);

        if (!data) {
            _pendingSuggest = true;
            _setBtnState('waiting', 'Analyzing…');
            if (typeof showNowPlaying === 'function') showNowPlaying('Analyzing screenplay — will suggest when ready');
            return;
        }
        if (data.error === 'no-text') {
            _setBtnState('error', 'No text');
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
        _prevActiveIdx = null;
        save();
        render();
        _syncCountLabel();
        _setBtnState('ready', `Suggest (${suggested.length})`);
        if (typeof showNowPlaying === 'function') showNowPlaying(`${suggested.length} scene cues loaded`);
    }

    function _setBtnState(state, label) {
        const btn = document.getElementById('suggest-btn');
        if (!btn) return;
        btn.dataset.state = state;
        const lbl = btn.querySelector('.suggest-lbl');
        if (lbl) lbl.textContent = label;
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

    // Expose internals when running under the test harness — never in normal use
    const _testAPI = (typeof module !== 'undefined' || (typeof __SLATE_TEST__ !== 'undefined' && __SLATE_TEST__))
        ? { _formatTime, _esc, _sceneForPage }
        : null;

    /* Public API */
    return { init, render, search, setActive, save, exportJSON, suggestCues, onInterpreterReady, toggleInterpPanel, _testAPI };

})();
