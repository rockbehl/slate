/* ─────────────────────────────────────────────────
   SLATE — cue-editor.js
   Phase 3: Renders and manages the cue table in Compose mode.

   FEATURES:
     - Render cue rows from STATE.cues + STATE.scenes
     - Highlight the active cue (currently playing)
     - Click a row to jump to that page + audio position
     - Inline note editing (click note cell to edit)
     - Add Cue button → inline form
     - Delete cue (hover row to reveal delete icon)
     - Save changes to localStorage (no backend needed)
     - Export cues.json button (downloads the current cue list)
───────────────────────────────────────────────── */

'use strict';

const CueEditor = (() => {

    const STORAGE_KEY = 'slate_cues';

    /* ─────────────────────────────────────────
       INIT — call after cues + scenes loaded
    ───────────────────────────────────────── */
    function init() {
        // Try restoring saved cues from localStorage
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                STATE.cues   = parsed.cues   || STATE.cues;
                STATE.scenes = parsed.scenes || STATE.scenes;
            } catch (e) {
                console.warn('SLATE CueEditor: could not parse saved cues', e);
            }
        }

        render();
        _bindAddButton();
    }

    /* ─────────────────────────────────────────
       RENDER — populate the cue table
    ───────────────────────────────────────── */
    function render() {
        const tbody = document.getElementById('cue-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        STATE.cues.forEach((cue, idx) => {
            const scene = _sceneForPage(cue.page);
            const isActive = STATE.currentCue === idx;

            const tr = document.createElement('tr');
            tr.className = isActive ? 'active' : '';
            tr.dataset.idx = idx;

            tr.innerHTML = `
                <td>
                    <span class="c-dot" style="background:${scene?.color || '#555'};"></span>${cue.page}
                </td>
                <td>${cue.scene || '—'}</td>
                <td>${cue.track ? _trackLabel(cue.track) : '<span class="tbd">— not set</span>'}</td>
                <td class="mono">${_formatTime(cue.at)}</td>
                <td class="note-td" data-field="note" data-idx="${idx}">${cue.note || '<span class="tbd">—</span>'}</td>
            `;

            // Click row → jump to page + audio position
            tr.addEventListener('click', e => {
                // Don't jump if they're clicking the note to edit
                if (e.target.dataset.field === 'note') return;
                if (typeof goToPage === 'function') goToPage(cue.page);
                if (typeof AudioEngine !== 'undefined') AudioEngine.seekToCue(cue.page);
                STATE.currentCue = idx;
                _refreshActiveRow();
            });

            // Note cell: click to edit inline
            const noteCell = tr.querySelector('[data-field="note"]');
            noteCell.addEventListener('click', () => _editNote(noteCell, idx));

            tbody.appendChild(tr);
        });
    }

    /* ─────────────────────────────────────────
       HIGHLIGHT ACTIVE ROW
    ───────────────────────────────────────── */
    function setActive(cueIdx) {
        STATE.currentCue = cueIdx;
        _refreshActiveRow();
    }

    function _refreshActiveRow() {
        document.querySelectorAll('#cue-tbody tr').forEach((tr, i) => {
            tr.classList.toggle('active', i === STATE.currentCue);
        });
    }

    /* ─────────────────────────────────────────
       INLINE NOTE EDITING
    ───────────────────────────────────────── */
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
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                input.blur();
            }
            if (e.key === 'Escape') {
                input.value = current;
                input.blur();
            }
        });

        cell.appendChild(input);
        input.focus();
    }

    /* ─────────────────────────────────────────
       ADD CUE
    ───────────────────────────────────────── */
    function _bindAddButton() {
        // Add Cue button intentionally removed from UI — cues are managed via cues.json
    }

    function addCue() {
        const newCue = {
            page:  STATE.currentPage,
            track: '',
            at:    0,
            note:  '',
        };
        STATE.cues.push(newCue);
        // Sort by page
        STATE.cues.sort((a, b) => a.page - b.page);
        save();
        render();

        // Scroll to new row
        const tbody = document.getElementById('cue-tbody');
        if (tbody) tbody.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
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
        if (!id) return null;
        const meta = (STATE.tracks || []).find(t => t.id === id);
        return meta ? (meta.title || meta.id) : id;
    }

    function _formatTime(seconds) {
        if (seconds == null || seconds === '') return '—';
        const m = Math.floor(seconds / 60);
        const s = Math.round(seconds % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    /* Public API */
    return { init, render, setActive, addCue, save, exportJSON };

})();

/*
   ─────────────────────────────────────────────
   TODO Phase 3 — wire up in app.js:

   In loadCues().then():
     CueEditor.init();

   In AudioEngine._checkCues() when a cue fires:
     CueEditor.setActive(i);

   Add export button to index.html toolbar:
     <button class="ghost-btn" onclick="CueEditor.exportJSON()">Export JSON</button>
   ─────────────────────────────────────────────
*/
