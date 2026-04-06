/* ─────────────────────────────────────────────────
   SLATE — waveform.js
   Phase 3: Wavesurfer.js integration for Compose mode.

   DEPENDENCIES:
     Wavesurfer.js 7.8.2 (CDN in index.html)
     CDN: https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/7.8.2/wavesurfer.min.js

   RENDER TARGET: #wave-box  (.wave-box in compose.css)

   WHAT THIS DOES:
     - Renders the real audio waveform from the currently loaded track
     - Colours the played portion in amber, unplayed in ghost white
     - Places page marker pins along the top of the waveform
     - Paints scene colour bands behind the bars
     - Clicking the waveform scrubs both audio and screenplay page
     - Playhead moves in real time during playback

   NOTE:
     In Phase 1/2, the waveform bars are generated procedurally (CSS/JS).
     In Phase 3, replace buildWaveform() with Wavesurfer.init() below.
───────────────────────────────────────────────── */

'use strict';

const Waveform = (() => {

    let _ws         = null; // WaveSurfer instance
    let _markerMap  = new Map(); // cueIdx → .cue-marker element (for O(1) highlight)
    let _pinMap     = new Map(); // page    → .pin element      (avoids querySelectorAll)

    /* ─────────────────────────────────────────
       INIT — called once after AudioEngine resolves
       (STATE.tracks is guaranteed populated)
    ───────────────────────────────────────── */
    function init() {
        const container = document.getElementById('wave-box');
        if (!container || typeof WaveSurfer === 'undefined') {
            buildProcedural();
            return;
        }

        // Resolve track id → actual filename via STATE.tracks
        const trackId   = STATE.cues[0]?.track || null;
        const trackMeta = (STATE.tracks || []).find(t => t.id === trackId)
                       || (STATE.tracks || [])[0];   // fallback: first available

        if (!trackMeta || !trackMeta.file) {
            buildProcedural();
            return;
        }

        const src = trackMeta.file.startsWith('http') || trackMeta.file.startsWith('/')
            ? trackMeta.file
            : `assets/audio/${encodeURIComponent(trackMeta.file)}`;

        _ws = WaveSurfer.create({
            container:     '#wave-box',
            waveColor:     'rgba(255,255,255,.12)',
            progressColor: 'rgba(201,168,76,.5)',
            cursorColor:   '#c9a84c',
            cursorWidth:   1,
            barWidth:      2.5,
            barGap:        1.5,
            barRadius:     2,
            height:        'auto',
            normalize:     true,
            interact:      true,
            hideScrollbar: true,
        });

        _ws.load(src);

        // Mute immediately and again on ready — Howler owns actual audio output
        _ws.setVolume(0);
        _ws.on('ready', () => {
            _ws.setVolume(0);
            renderCueMarkers(STATE.cues, STATE.scenes);
        });

        // User clicks waveform → seek AudioEngine (v7 'interaction' event, not v6 'seek')
        // setTime() does NOT fire 'interaction', so no feedback loop
        _ws.on('interaction', newTime => {
            const dur = AudioEngine.getDuration();
            if (dur > 0) {
                STATE.progress = (newTime / dur) * 100;
                AudioEngine.seekTo(STATE.progress);
                if (typeof renderProgress === 'function') renderProgress();
            }
        });

        // Mark container — CSS rule hides procedural .bar-row
        container.classList.add('ws-active');
    }

    /* ─────────────────────────────────────────
       PAGE MARKER PINS
       Call after cues are loaded (Phase 3)
    ───────────────────────────────────────── */
    function renderPins(cues) {
        const row = document.getElementById('pin-row');
        if (!row || !STATE.totalPages) return;
        row.innerHTML = '';
        _pinMap = new Map();

        cues.forEach(cue => {
            const pct = (cue.page / STATE.totalPages) * 100;
            const pin = document.createElement('div');
            pin.className = 'pin' + (cue.page === STATE.currentPage ? ' cur' : '');
            pin.style.left = pct + '%';
            pin.textContent = 'P.' + cue.page;
            pin.addEventListener('click', () => {
                if (typeof goToPage === 'function') goToPage(cue.page);
            });
            row.appendChild(pin);
            _pinMap.set(cue.page, pin);
        });
    }

    /* ─────────────────────────────────────────
       SCENE BANDS
       Call after scenes are loaded (Phase 3)
    ───────────────────────────────────────── */
    function renderBands(scenes) {
        const box = document.getElementById('wave-box');
        if (!box || !STATE.totalPages) return;

        // Remove existing bands
        box.querySelectorAll('.s-band').forEach(el => el.remove());

        scenes.forEach(scene => {
            const left  = ((scene.fromPage - 1) / STATE.totalPages) * 100;
            const width = ((scene.toPage - scene.fromPage + 1) / STATE.totalPages) * 100;

            const band = document.createElement('div');
            band.className = 's-band';
            band.style.left       = left + '%';
            band.style.width      = width + '%';
            band.style.background = scene.color;
            box.appendChild(band);
        });
    }

    /* ─────────────────────────────────────────
       HIGHLIGHT CURRENT PIN
    ───────────────────────────────────────── */
    // O(1) — uses cached _pinMap instead of querySelectorAll every 250ms tick
    let _prevPinPage = null;
    function highlightPin(pageNum) {
        if (_prevPinPage !== null && _prevPinPage !== pageNum) {
            _pinMap.get(_prevPinPage)?.classList.remove('cur');
        }
        _pinMap.get(pageNum)?.classList.add('cur');
        _prevPinPage = pageNum;
    }

    /* ─────────────────────────────────────────
       SOUNDCLOUD-STYLE CUE MARKERS
       Positioned on the waveform body by audio timestamp.
       Falls back to page-based position when no audio duration is known.
    ───────────────────────────────────────── */
    function renderCueMarkers(cues, scenes) {
        const box = document.getElementById('wave-box');
        if (!box || !cues || !cues.length) return;

        box.querySelectorAll('.cue-marker').forEach(el => el.remove());
        _markerMap = new Map();

        const totalDuration = (typeof AudioEngine !== 'undefined') ? AudioEngine.getDuration() : 0;
        const useTime = totalDuration > 0;

        // Build page→scene color lookup
        const sceneColor = page => {
            const s = (scenes || []).find(s => page >= s.fromPage && page <= s.toPage);
            return s ? s.color : 'rgba(201,168,76,0.7)';
        };

        cues.forEach((cue, idx) => {
            const pct = useTime
                ? Math.max(0, Math.min(100, (cue.at / totalDuration) * 100))
                : Math.max(0, Math.min(100, (cue.page / (STATE.totalPages || 92)) * 100));

            const color   = sceneColor(cue.page);
            const marker  = document.createElement('div');
            marker.className = 'cue-marker';
            if (pct > 75) marker.classList.add('tip-left');
            else if (pct < 25) marker.classList.add('tip-right');
            if (!cue.track) marker.classList.add('tbd');
            marker.dataset.idx = idx;
            marker.style.left  = pct + '%';
            marker.style.setProperty('--mc', color);

            // Tooltip
            const tip = document.createElement('div');
            tip.className = 'cue-tip';

            const trackEl = document.createElement('span');
            trackEl.className = 'ct-track';
            trackEl.textContent = cue.track || 'No track';

            const metaEl = document.createElement('span');
            metaEl.className = 'ct-meta';
            metaEl.textContent = `P.${cue.page}` + (useTime && cue.at ? `  ${_fmtSec(cue.at)}` : '');

            tip.appendChild(trackEl);
            tip.appendChild(metaEl);

            if (cue.note) {
                const noteEl = document.createElement('span');
                noteEl.className = 'ct-note';
                noteEl.textContent = cue.note;
                tip.appendChild(noteEl);
            }

            marker.appendChild(tip);

            marker.addEventListener('click', () => {
                if (typeof goToPage === 'function') goToPage(cue.page);
                if (useTime && typeof AudioEngine !== 'undefined') {
                    AudioEngine.seekTo((cue.at / totalDuration) * 100);
                    if (typeof renderProgress === 'function') renderProgress();
                }
            });

            box.appendChild(marker);
            _markerMap.set(idx, marker);
        });
    }

    // Highlight the active cue marker — called from CueEditor.setActive()
    let _prevMarkerIdx = null;
    function highlightCueMarker(idx) {
        if (_prevMarkerIdx !== null && _prevMarkerIdx !== idx) {
            _markerMap.get(_prevMarkerIdx)?.classList.remove('active');
        }
        if (idx !== null) _markerMap.get(idx)?.classList.add('active');
        _prevMarkerIdx = idx;
    }

    function _fmtSec(s) {
        const m = Math.floor(s / 60);
        return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    }

    /* ─────────────────────────────────────────
       SYNC PLAYHEAD — called by renderProgress()
       Moves Wavesurfer's cursor to match AudioEngine.
       setTime() does NOT fire 'interaction', so no loop.
    ───────────────────────────────────────── */
    function syncPlayhead(seconds) {
        if (_ws) _ws.setTime(seconds);
    }

    /* ─────────────────────────────────────────
       REBUILD — call after panel resize
    ───────────────────────────────────────── */
    function rebuild() {
        if (_ws) {
            // Wavesurfer v7 removed redraw() — zooming to current level forces re-render
            try { _ws.zoom(_ws.options.minPxPerSec ?? 0); } catch (_) {}
        } else {
            buildProcedural();
        }
    }

    /* ─────────────────────────────────────────
       PROCEDURAL BARS (Phase 1/2 placeholder)
       Generates convincing-looking bars without real audio.
       Will be replaced by Wavesurfer in Phase 3.
    ───────────────────────────────────────── */
    function buildProcedural() {
        const box = document.getElementById('wave-box');
        const row = document.getElementById('bar-row');
        if (!box || !row) return;

        const W     = box.offsetWidth - 16;
        const count = Math.max(1, Math.floor(W / 4));
        row.innerHTML = '';

        for (let i = 0; i < count; i++) {
            const p = i / count;
            let h;
            if      (p < .07) h = 4  + p * 350;
            else if (p < .28) h = 22 + Math.random() * 42;
            else if (p < .58) h = 40 + Math.random() * 44;
            else if (p < .74) h = 50 + Math.random() * 34;
            else              h = 12 + Math.random() * 36;
            h = Math.min(Math.max(h + (Math.random() - .5) * 10, 3), 96);

            const bar = document.createElement('div');
            bar.className = 'w-bar';
            bar.style.height = h + '%';
            row.appendChild(bar);
        }

        // Colour bars up to current progress
        if (typeof renderProgress === 'function') renderProgress();
    }

    /* Public API */
    return { init, renderPins, renderBands, renderCueMarkers, highlightCueMarker, highlightPin, syncPlayhead, rebuild, buildProcedural };

})();

