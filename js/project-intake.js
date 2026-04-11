/* ─────────────────────────────────────────────────
   SLATE — Project Intake
   PDF + audio drag-drop intake for Compose mode.
   Lets users load files directly without needing
   files pre-placed in assets/.
───────────────────────────────────────────────── */

'use strict';

const ProjectIntake = (() => {

    const LS_COLLAPSED = 'slate_intake_collapsed';
    const LS_NAME      = 'slate_project_name';

    /* ── Init ── */
    function init() {
        _restoreCollapsed();
        _restoreName();
        _bindPdfDrop();
        _bindAudioDrop();
        _bindNameInput();
        _bindCollapseBtn();
        _syncPdfZone();
    }

    /* ── Collapse / expand ── */
    function collapse(force) {
        const strip = document.getElementById('intake-strip');
        if (!strip) return;
        const zones = document.getElementById('intake-zones');
        const btn   = document.getElementById('intake-collapse');
        const isCollapsed = force !== undefined ? force : !strip.classList.contains('collapsed');
        strip.classList.toggle('collapsed', isCollapsed);
        if (zones) zones.style.display = isCollapsed ? 'none' : '';
        if (btn)   btn.textContent     = isCollapsed ? '↓' : '↑';
        _lsSet(LS_COLLAPSED, isCollapsed ? '1' : '0');
    }

    /* ── Internal ── */

    function _restoreCollapsed() {
        const val = localStorage.getItem(LS_COLLAPSED);
        if (val === '1') collapse(true);
    }

    function _restoreName() {
        const saved = localStorage.getItem(LS_NAME);
        if (!saved) return;
        const input = document.getElementById('project-name');
        if (input) input.value = saved;
        if (typeof STATE !== 'undefined') STATE.projectName = saved;
    }

    function _lsSet(key, value) {
        try { localStorage.setItem(key, value); }
        catch (e) { console.warn('SLATE: localStorage write failed —', e.message); }
    }

    function _bindNameInput() {
        const input = document.getElementById('project-name');
        if (!input) return;
        input.addEventListener('input', () => {
            const v = input.value.trim();
            if (typeof STATE !== 'undefined') STATE.projectName = v;
            _lsSet(LS_NAME, v);
        });
    }

    function _bindCollapseBtn() {
        const btn = document.getElementById('intake-collapse');
        if (btn) btn.addEventListener('click', () => collapse());
    }

    function _syncPdfZone() {
        // Hide PDF drop zone once a PDF is already loaded
        if (typeof STATE !== 'undefined' && STATE.totalPages) {
            _hidePdfZone();
        }
    }

    function _hidePdfZone() {
        const zone = document.getElementById('intake-pdf-drop');
        if (zone) zone.style.display = 'none';
    }

    /* ── PDF drop ── */
    function _bindPdfDrop() {
        const zone = document.getElementById('intake-pdf-drop');
        if (!zone) return;
        _makeDrop(zone, ['application/pdf'], files => {
            const file = files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            if (typeof PDFEngine !== 'undefined') {
                PDFEngine.load(url);  // PDFEngine.load() owns the hide
            }
        });
    }

    /* ── Audio drop ── */
    function _bindAudioDrop() {
        const zone = document.getElementById('intake-audio-drop');
        if (!zone) return;
        const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/x-wav'];
        _makeDrop(zone, AUDIO_TYPES, files => {
            files.forEach(f => {
                const track = AudioEngine._addTrackFromFile(f);
                _renderTrackPill(track, f);
            });
        });
    }

    function _renderTrackPill(track, file) {
        const list = document.getElementById('intake-track-list');
        if (!list) return;

        // Avoid duplicates
        const existing = list.querySelector(`[data-id="${CSS.escape(track.id)}"]`);
        if (existing) return;

        // Derive duration asynchronously
        const pill  = document.createElement('div');
        pill.className      = 'track-pill';
        pill.dataset.id     = track.id;

        const nameEl = document.createElement('span');
        nameEl.className    = 'track-pill-name';
        nameEl.textContent  = track.title;

        const durEl  = document.createElement('span');
        durEl.className     = 'track-pill-dur';
        durEl.textContent   = '…';

        const del    = document.createElement('button');
        del.className       = 'track-pill-del';
        del.setAttribute('aria-label', `Remove ${track.title}`);
        del.textContent     = '×';
        del.addEventListener('click', () => {
            pill.remove();
        });

        pill.append(nameEl, durEl, del);
        list.appendChild(pill);

        // Fill in duration once the blob URL resolves
        const tmpAudio = new Audio(track.file);
        tmpAudio.addEventListener('loadedmetadata', () => {
            const s = Math.round(tmpAudio.duration);
            durEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        });
        tmpAudio.addEventListener('error', () => { durEl.textContent = '—'; });
    }

    /* ── Generic drop helper ── */
    function _makeDrop(el, types, onFiles) {
        el.addEventListener('dragover', e => {
            e.preventDefault();
            const hasMatch = [...(e.dataTransfer.items || [])].some(
                item => !types.length || types.some(t => item.type === t || item.type.startsWith('audio/'))
            );
            if (hasMatch || types.includes('application/pdf')) el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', e => {
            e.preventDefault();
            el.classList.remove('drag-over');
            const files = [...(e.dataTransfer.files || [])].filter(
                f => !types.length || types.some(t => f.type === t || f.type.startsWith('audio/')) || f.name.endsWith('.pdf')
            );
            if (files.length) onFiles(files);
        });
        // Also allow click-to-pick
        el.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type   = 'file';
            input.accept = types.includes('application/pdf') ? '.pdf' : 'audio/*';
            input.multiple = !types.includes('application/pdf');
            input.addEventListener('change', () => {
                if (input.files.length) onFiles([...input.files]);
            });
            input.click();
        });
    }

    return { init, collapse };

})();
