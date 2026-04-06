/* ─────────────────────────────────────────────────
   SLATE — audio-engine.js
   Howler.js wrapper with track discovery + cue system.

   TRACK SETUP:
     1. Drop audio files (any filename) into assets/audio/
     2. Register them in assets/audio/tracks.json — one entry per file.
        The `id` is what cues.json references; `file` is the actual filename.

   SINGLE-TRACK MODE:
     If tracks.json contains exactly one entry, it plays for everything —
     no need to set `track` on any cue.

   CUE FIRING:
     Polls every 250ms. When playback crosses a cue's `at` timestamp:
       - Updates STATE.currentCue
       - Calls goToPage() if auto-advance is on
       - Fires showNowPlaying() with the track's display title
───────────────────────────────────────────────── */

'use strict';

const AudioEngine = (() => {

    let _cues        = [];
    let _sounds      = {};    // { id: { howl: Howl, meta: {...} } }
    let _current     = null;  // active Howl instance
    let _currentId   = null;  // id key of _current
    let _defaultId   = null;  // set when only one track is loaded
    let _poll        = null;
    let _autoAdvance = true;
    let _lastCueFired = -1;

    const POLL_MS = 250;

    /* ─────────────────────────────────────────
       INIT — fetch tracks.json, build Howl instances
    ───────────────────────────────────────── */
    async function init(cues, tracksPath) {
        _cues = cues;
        const url = tracksPath || 'assets/audio/tracks.json';

        let tracks = [];
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(res.status);
            tracks = await res.json();
        } catch (e) {
            console.warn(`SLATE AudioEngine: could not load ${url} — no audio will play`);
            const label = document.getElementById('t-label');
            if (label) { label.textContent = 'no audio'; label.dataset.error = '1'; }
            return;
        }

        // Expose track metadata globally for other modules (CueEditor display, Waveform)
        if (typeof STATE !== 'undefined') STATE.tracks = tracks;

        tracks.forEach(t => {
            if (!t.id || !t.file) return;

            // Detect the base path — support both relative and absolute file paths
            const src = t.file.startsWith('http') || t.file.startsWith('/')
                ? t.file
                : `assets/audio/${encodeURIComponent(t.file)}`;

            // Derive format from extension for Howler's format hint
            const ext = t.file.split('.').pop().toLowerCase();

            _sounds[t.id] = {
                howl: new Howl({
                    src:         [src],
                    format:      [ext],
                    html5:       true,
                    volume:      0.85,
                    onloaderror: (_, err) => console.warn(`SLATE: failed to load "${t.file}"`, err),
                }),
                meta: t,
            };
        });

        // Single-track mode: one file covers everything
        const ids = Object.keys(_sounds);
        if (ids.length === 1) _defaultId = ids[0];
    }

    /* ─────────────────────────────────────────
       PLAY / PAUSE / TOGGLE
    ───────────────────────────────────────── */
    function play() {
        if (!_current) {
            const id = _idForPage(STATE.currentPage);
            if (!id) return;
            _current   = _sounds[id].howl;
            _currentId = id;
        }
        _current.play();
        _startPoll();
        _fireShowNowPlaying();
    }

    function pause() {
        if (_current) _current.pause();
        _stopPoll();
    }

    function toggle() {
        if (_current && _current.playing()) pause();
        else play();
    }

    /* ─────────────────────────────────────────
       SEEK
    ───────────────────────────────────────── */
    function seekTo(progressPct) {
        if (!_current) return;
        const dur = _current.duration();
        if (!dur) return;
        _lastCueFired = -1;   // allow cues to re-fire after a manual seek
        _current.seek(dur * (progressPct / 100));
    }

    function seekToCue(pageNum) {
        const cue = _cueForPage(pageNum);
        // Don't use a cue with null at as a seek target
        const validCue = (cue && cue.at !== null) ? cue : null;
        const id  = (validCue && validCue.track) ? validCue.track : _defaultId;
        if (!id || !_sounds[id]) return;

        const howl = _sounds[id].howl;

        if (_current && _current !== howl) {
            const fadeMs = (validCue && validCue.fadeOut) ? validCue.fadeOut * 1000 : 1500;
            _current.fade(_current.volume(), 0, fadeMs);
        }

        _current   = howl;
        _currentId = id;
        _lastCueFired = -1;   // reset so cues can fire again from new position
        _current.seek(validCue ? validCue.at : 0);

        if (!_current.playing()) {
            _current.play();
            _startPoll();
        }
        _fireShowNowPlaying();
    }

    /* ─────────────────────────────────────────
       VOLUME / AUTO-ADVANCE / DURATION
    ───────────────────────────────────────── */
    function setVolume(v)         { Howler.volume(v); }
    function setAutoAdvance(bool) { _autoAdvance = bool; }
    function isPlaying()          { return !!(_current && _current.playing()); }
    function getDuration()        { return _current ? (_current.duration() || 0) : 0; }

    /* ─────────────────────────────────────────
       POLL — progress + cue firing
    ───────────────────────────────────────── */
    function _startPoll() {
        if (_poll) return;
        _poll = setInterval(_tick, POLL_MS);
    }

    function _stopPoll() {
        if (_poll) { clearInterval(_poll); _poll = null; }
    }

    function _tick() {
        if (!_current || !_current.playing()) return;

        const seek = _current.seek() || 0;
        const dur  = _current.duration() || 1;

        STATE.progress = (seek / dur) * 100;
        if (typeof renderProgress === 'function') renderProgress();

        _checkCues(seek);
    }

    function _checkCues(seek) {
        for (let i = 0; i < _cues.length; i++) {
            const cue   = _cues[i];
            const cueId = cue.track || _defaultId;

            if (
                cueId === _currentId &&
                cue.at !== null &&
                seek >= cue.at &&
                i !== _lastCueFired
            ) {
                _lastCueFired    = i;
                STATE.currentCue = i;

                if (_autoAdvance && typeof goToPage === 'function') goToPage(cue.page);
                if (typeof CueEditor !== 'undefined') CueEditor.setActive(i);
                _fireShowNowPlaying();
            }
        }
    }

    /* ─────────────────────────────────────────
       HELPERS
    ───────────────────────────────────────── */
    function _cueForPage(pageNum) {
        let best = null;
        for (const cue of _cues) {
            if (cue.page <= pageNum) best = cue;
        }
        return best;
    }

    function _idForPage(pageNum) {
        const cue = _cueForPage(pageNum);
        if (cue && cue.track) return cue.track;
        return _defaultId;
    }

    function _fireShowNowPlaying() {
        if (!_currentId || !_sounds[_currentId]) return;
        const { title, artist, id } = _sounds[_currentId].meta;
        const label = title ? (artist ? `${title} — ${artist}` : title) : id;
        if (typeof showNowPlaying === 'function') showNowPlaying(label);
        const wfLabel = document.getElementById('waveform-track-label');
        if (wfLabel) wfLabel.textContent = label;
    }

    /* Public API */
    return { init, play, pause, toggle, seekTo, seekToCue, setVolume, setAutoAdvance, isPlaying, getDuration };

})();
