/* ─────────────────────────────────────────────────
   SLATE — scenes-editor.js
   Scene CRUD editor for Compose mode.
   Manages STATE.scenes, syncs Waveform bands on
   every mutation, and persists via CueEditor.save().
───────────────────────────────────────────────── */

'use strict';

const ScenesEditor = (() => {
    const SWATCHES = [
        '#5b8db5', // blue
        '#b58c5b', // amber
        '#8b5bb5', // purple
        '#5bb58c', // green
        '#b55b5b', // red
        '#a3a3a3', // silver
        '#c9a84c', // gold
        '#5b7db5', // steel
    ];

    let _rows = null; // cached DOM ref, set on init

    /* ── Public: init ── */
    function init() {
        _rows = document.getElementById('scene-rows');
        _bindDelegated();
        render();
    }

    /* ── Public: render ── */
    function render() {
        if (!_rows) return;

        _rows.innerHTML = '';
        STATE.scenes.forEach((s, i) => {
            const safeColor = _isValidColor(s.color) ? s.color : '#555';
            const row = document.createElement('div');
            row.className = 'scene-row';
            row.dataset.i = i;
            row.innerHTML = `
                <div class="scene-color" data-i="${i}" style="background:${safeColor}" title="Cycle color"></div>
                <input class="scene-input" type="text" value="${_esc(s.label)}" data-i="${i}" data-field="label" placeholder="Scene name" spellcheck="false">
                <div class="scene-pages">
                    pp
                    <input class="scene-page-input" type="number" value="${s.fromPage}" min="1" data-i="${i}" data-field="fromPage">
                    –
                    <input class="scene-page-input" type="number" value="${s.toPage}" min="1" data-i="${i}" data-field="toPage">
                </div>
                <button class="scene-del ghost-btn" data-i="${i}" aria-label="Delete scene">×</button>
            `;
            _rows.appendChild(row);
        });
    }

    /* ── Public: addScene ── */
    function addScene() {
        STATE.scenes.push({
            id:       'scene_' + Date.now(),
            label:    'Scene ' + (STATE.scenes.length + 1),
            fromPage: STATE.currentPage || 1,
            toPage:   STATE.totalPages  || 1,
            color:    SWATCHES[STATE.scenes.length % SWATCHES.length],
        });
        _flush();
    }

    /* ── Public: deleteScene ── */
    function deleteScene(i) {
        STATE.scenes.splice(i, 1);
        _flush();
    }

    /* ── Public: syncFromInterpreter ──
       Seeds STATE.scenes from interpreter output only when the
       user has not yet defined any scenes. Interpreter scenes have
       pageStart/pageEnd and screenplay headings — convert to SLATE
       scene format and cap at 8 scenes.
    */
    function syncFromInterpreter(interpScenes) {
        if (!Array.isArray(interpScenes) || interpScenes.length === 0) return;
        if (STATE.scenes.length > 0) return; // don't overwrite user-defined scenes

        const total = STATE.totalPages || 1;
        STATE.scenes = interpScenes.slice(0, 8).map((s, i) => {
            let from = Math.max(1, Math.min(s.pageStart || s.fromPage || 1, total));
            let to   = Math.max(1, Math.min(s.pageEnd   || s.toPage   || total, total));
            if (from > to) [from, to] = [to, from];
            return {
                id:       s.id      || ('scene_' + i),
                label:    s.heading || s.label || ('Scene ' + (i + 1)),
                fromPage: from,
                toPage:   to,
                color:    SWATCHES[i % SWATCHES.length],
            };
        });

        _flush();
    }

    /* ── Private ── */

    function _flush() {
        render();
        Waveform.renderBands(STATE.scenes);
        Waveform.renderCueMarkers(STATE.cues, STATE.scenes);
        CueEditor.save();
    }

    /* Event delegation — bind once on the container, not per-row */
    function _bindDelegated() {
        if (!_rows) return;

        // Clicks: swatch cycle + delete
        _rows.addEventListener('click', e => {
            const swatch = e.target.closest('.scene-color');
            const del    = e.target.closest('.scene-del');

            if (swatch) {
                const i   = +swatch.dataset.i;
                const cur = SWATCHES.indexOf(STATE.scenes[i]?.color);
                STATE.scenes[i].color = SWATCHES[(cur + 1) % SWATCHES.length];
                _flush();
            } else if (del) {
                deleteScene(+del.dataset.i);
            }
        });

        // Label edits
        _rows.addEventListener('change', e => {
            const input  = e.target.closest('.scene-input');
            const pInput = e.target.closest('.scene-page-input');

            if (input) {
                const i = +input.dataset.i;
                if (STATE.scenes[i]) {
                    STATE.scenes[i].label = input.value;
                    _flush();
                }
            } else if (pInput) {
                const i     = +pInput.dataset.i;
                const field = pInput.dataset.field;
                const total = STATE.totalPages || 1;
                const v     = Math.max(1, Math.min(parseInt(pInput.value) || 1, total));
                if (STATE.scenes[i]) {
                    STATE.scenes[i][field] = v;
                    _flush();
                }
            }
        });
    }

    function _isValidColor(str) {
        return typeof str === 'string' &&
            (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(str) || /^rgba?\(/.test(str));
    }

    function _esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    return { init, render, addScene, deleteScene, syncFromInterpreter };
})();
