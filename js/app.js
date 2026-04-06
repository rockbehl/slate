/* ─────────────────────────────────────────────────
   SLATE — app.js
   Central state, mode switching, keyboard shortcuts,
   page navigation, drag handle, progress rendering.
───────────────────────────────────────────────── */

'use strict';

/* ═══════════════════════════════════════════════
   PATHS — read from <body> data attributes so any
   PDF, cue set, or audio folder can be swapped
   without touching JS.
═══════════════════════════════════════════════ */
const PATHS = {
    pdf:    document.body.dataset.pdf    || 'assets/screenplay/screenplay.pdf',
    cues:   document.body.dataset.cues   || 'cues.json',
    tracks: document.body.dataset.tracks || 'assets/audio/tracks.json',
};

// Derived once — used in updatePageLabels()
const _pdfFilename = PATHS.pdf.split('/').pop();

/* ═══════════════════════════════════════════════
   CACHED DOM REFS — queried once at DOMContentLoaded,
   used in the 250ms render loop.
═══════════════════════════════════════════════ */
let _dom = {};

/* ═══════════════════════════════════════════════
   STATE — single source of truth
═══════════════════════════════════════════════ */
const STATE = {
    mode:        'screen',  // 'screen' | 'compose'
    currentPage: 1,         // 1-indexed
    totalPages:  null,      // set by pdf-engine after load; null until then
    playing:     false,
    progress:    0,         // 0–100 (audio progress %)
    currentCue:      null,  // index into STATE.cues
    cues:            [],    // loaded from cues.json → cues[]
    scenes:          [],    // loaded from cues.json → scenes[]
    tracks:          [],    // loaded from tracks.json by AudioEngine
    interpreterData: null,  // set by Interpreter.analyze() after PDF is parsed
};

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    // Cache hot-path DOM elements once
    _dom = {
        pFill:   document.getElementById('p-fill'),
        pTrack:  document.getElementById('p-track'),
        curT:    document.getElementById('cur-t'),
        totalT:  document.getElementById('total-t'),
        ph:      document.getElementById('ph'),
        waveBox: document.getElementById('wave-box'),
        barRow:  document.getElementById('bar-row'),
        np:      document.getElementById('np'),
        tLabel:  document.getElementById('t-label'),
    };

    loadCues();
    initDragHandle();
    initKeyboard();
    initVolumeSlider();
    updatePageLabels();
    Waveform.buildProcedural();
    Comments.init();

    PDFEngine.load(PATHS.pdf);
});

/* ═══════════════════════════════════════════════
   CUE DATA — load from cues.json path
═══════════════════════════════════════════════ */
function loadCues() {
    fetch(PATHS.cues)
        .then(r => r.json())
        .then(async data => {
            STATE.cues   = data.cues   || [];
            STATE.scenes = data.scenes || [];

            // Await AudioEngine so STATE.tracks is populated before Waveform.init()
            // Catch separately so an AudioEngine failure doesn't swallow the cues error path
            await AudioEngine.init(STATE.cues, PATHS.tracks).catch(e => console.warn('SLATE AudioEngine init error:', e));

            CueEditor.init();
            Waveform.init();
            Waveform.renderPins(STATE.cues);
            Waveform.renderBands(STATE.scenes);
            Waveform.renderCueMarkers(STATE.cues, STATE.scenes);

            const countLabel = document.getElementById('cue-count-label');
            if (countLabel) countLabel.textContent = `${STATE.cues.length} cues`;
        })
        .catch(() => {
            console.warn('SLATE: could not load cues — using empty cue list');
            const countLabel = document.getElementById('cue-count-label');
            if (countLabel) countLabel.textContent = '0 cues';
        });
}

/* ═══════════════════════════════════════════════
   MODE SWITCHING
═══════════════════════════════════════════════ */
function setMode(m) {
    STATE.mode = m;

    document.getElementById('screen').classList.toggle('off', m !== 'screen');
    document.getElementById('compose').classList.toggle('on',  m === 'compose');

    const msS = document.getElementById('ms-s');
    const msC = document.getElementById('ms-c');
    msS.classList.toggle('active', m === 'screen');
    msC.classList.toggle('active', m === 'compose');
    msS.setAttribute('aria-pressed', m === 'screen');
    msC.setAttribute('aria-pressed', m === 'compose');

    if (m === 'compose') Waveform.rebuild();
}

window.setMode = setMode;

/* ═══════════════════════════════════════════════
   PAGE NAVIGATION
═══════════════════════════════════════════════ */
function goToPage(pageNum) {
    const total = STATE.totalPages || 1;
    const n = Math.max(1, Math.min(total, pageNum));
    STATE.currentPage = n;
    updatePageLabels();

    PDFEngine.renderPage(n);
    Waveform.highlightPin(n);
    Comments.syncIndicator();
}

function pg(delta) {
    goToPage(STATE.currentPage + delta);
}

window.pg = pg;

function updatePageLabels() {
    const n = STATE.currentPage;
    const t = STATE.totalPages;
    const tLabel = t != null ? t : '—';

    const ssLbl  = document.getElementById('ss-lbl');
    const cpLbl  = document.getElementById('cp-lbl');
    const pgTag  = document.getElementById('pg-tag');
    const metaPp = document.getElementById('compose-meta-pp');

    if (ssLbl)  { ssLbl.textContent  = `${n} / ${tLabel}`; ssLbl.setAttribute('aria-label', `Page ${n} of ${tLabel}`); }
    if (cpLbl)  { cpLbl.textContent  = `P. ${n} / ${tLabel}`; cpLbl.setAttribute('aria-label', `Page ${n} of ${tLabel}`); }
    if (pgTag)  { pgTag.textContent  = `P.${n}`; pgTag.setAttribute('aria-label', `Page ${n}`); }
    if (metaPp && t != null) metaPp.textContent = `${_pdfFilename} · ${t} pp`;
    if (_dom.pTrack) _dom.pTrack.setAttribute('aria-valuenow', Math.round(STATE.progress));
    // Pin highlight handled by Waveform.highlightPin() — no duplicate scan needed
}

/* ═══════════════════════════════════════════════
   CUE NAVIGATION — skip prev / next
═══════════════════════════════════════════════ */
function prevCue() {
    const cues = STATE.cues;
    if (!cues.length) return;
    let idx = 0;
    for (let i = cues.length - 1; i >= 0; i--) {
        if (cues[i].page < STATE.currentPage) { idx = i; break; }
    }
    goToPage(cues[idx].page);
    AudioEngine.seekToCue(cues[idx].page);
}

function nextCue() {
    const cues = STATE.cues;
    if (!cues.length) return;
    let idx = cues.length - 1;
    for (let i = 0; i < cues.length; i++) {
        if (cues[i].page > STATE.currentPage) { idx = i; break; }
    }
    goToPage(cues[idx].page);
    AudioEngine.seekToCue(cues[idx].page);
}

window.prevCue = prevCue;
window.nextCue = nextCue;

/* ═══════════════════════════════════════════════
   AUDIO PLAYBACK
═══════════════════════════════════════════════ */
function togglePlay() {
    AudioEngine.toggle();
    STATE.playing = AudioEngine.isPlaying();

    const playBtn = document.getElementById('play-btn');
    const iPlay   = document.getElementById('i-play');
    const iPause  = document.getElementById('i-pause');

    if (iPlay)   iPlay.style.display  = STATE.playing ? 'none' : '';
    if (iPause)  iPause.style.display = STATE.playing ? '' : 'none';
    if (playBtn) {
        playBtn.setAttribute('aria-pressed', STATE.playing);
        playBtn.setAttribute('aria-label', STATE.playing ? 'Pause' : 'Play');
    }
}

window.togglePlay = togglePlay;

// Tracks last written duration string — avoids reformatting every tick
let _lastDurationStr = '';

function renderProgress() {
    const { pFill, pTrack, curT, totalT, ph, waveBox, barRow } = _dom;

    if (pFill)  pFill.style.width = STATE.progress + '%';
    if (pTrack) pTrack.setAttribute('aria-valuenow', Math.round(STATE.progress));
    if (ph)     ph.style.left = STATE.progress + '%';

    const duration   = AudioEngine.getDuration();
    const elapsedRaw = duration > 0 ? (STATE.progress / 100) * duration : 0;
    const elapsed    = Math.round(elapsedRaw);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    if (curT) curT.textContent = `${m}:${String(s).padStart(2, '0')}`;

    // Only reformat total duration when it first becomes available
    if (totalT && duration > 0 && !_lastDurationStr) {
        const dm = Math.floor(duration / 60);
        const ds = Math.floor(duration % 60);
        _lastDurationStr = `${dm}:${String(ds).padStart(2, '0')}`;
        totalT.textContent = _lastDurationStr;
    }

    // Sync Wavesurfer playhead (no-op if waveform not loaded)
    Waveform.syncPlayhead(elapsedRaw);

    // Only colour procedural bars when the real waveform is not active
    if (!waveBox || !waveBox.classList.contains('ws-active')) {
        const bars = barRow ? barRow.children : [];
        const head = Math.round((STATE.progress / 100) * bars.length);
        for (let i = 0; i < bars.length; i++) {
            const b = bars[i];
            b.classList.remove('played', 'head');
            if (i < head - 1)        b.classList.add('played');
            else if (i === head - 1) b.classList.add('head');
        }
    }
}

window.renderProgress = renderProgress;

function scrub(e) {
    const track = document.getElementById('p-track');
    if (!track) return;
    const r = track.getBoundingClientRect();
    STATE.progress = Math.max(0, Math.min(((e.clientX - r.left) / r.width) * 100, 99));
    renderProgress();
    AudioEngine.seekTo(STATE.progress);
}

window.scrub = scrub;

/* ═══════════════════════════════════════════════
   NOW PLAYING WHISPER
═══════════════════════════════════════════════ */
let _npTimer = null;
function showNowPlaying(text) {
    const el = _dom.np || document.getElementById('np');
    if (!el) return;
    if (text) {
        el.textContent = text;
        const label = _dom.tLabel || document.getElementById('t-label');
        if (label && !label.dataset.error) label.textContent = text;
    }
    el.style.opacity = '1';
    clearTimeout(_npTimer);
    _npTimer = setTimeout(() => { el.style.opacity = '0'; }, 2400);
}

window.showNowPlaying = showNowPlaying;

/* ═══════════════════════════════════════════════
   VOLUME SLIDER
═══════════════════════════════════════════════ */
function initVolumeSlider() {
    const track = document.querySelector('.vol-track');
    const fill  = document.querySelector('.vol-fill');
    if (!track || !fill) return;

    const DEFAULT_VOL = 0.85;
    fill.style.width = (DEFAULT_VOL * 100) + '%';
    track.setAttribute('aria-valuenow', Math.round(DEFAULT_VOL * 100));

    track.addEventListener('click', e => {
        const r = track.getBoundingClientRect();
        const v = Math.max(0, Math.min((e.clientX - r.left) / r.width, 1));
        fill.style.width = (v * 100) + '%';
        track.setAttribute('aria-valuenow', Math.round(v * 100));
        AudioEngine.setVolume(v);
    });
}

/* ═══════════════════════════════════════════════
   DRAG HANDLE
═══════════════════════════════════════════════ */
function initDragHandle() {
    const handle = document.getElementById('d-handle');
    const panel  = document.getElementById('s-panel');
    const body   = document.getElementById('c-body');
    if (!handle || !panel || !body) return;

    let active = false, startX = 0, startW = 0;

    handle.addEventListener('mousedown', e => {
        active  = true;
        startX  = e.clientX;
        startW  = panel.offsetWidth;
        handle.classList.add('dragging');
        document.body.style.cursor     = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
        if (!active) return;
        const total   = body.offsetWidth;
        const clamped = Math.max(total * 0.24, Math.min(total * 0.64, startW + (e.clientX - startX)));
        panel.style.width = clamped + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!active) return;
        active = false;
        handle.classList.remove('dragging');
        document.body.style.cursor     = '';
        document.body.style.userSelect = '';
        Waveform.rebuild();
        PDFEngine.renderPage(STATE.currentPage);
    });
}

/* ═══════════════════════════════════════════════
   FULLSCREEN
═══════════════════════════════════════════════ */
function toggleFullscreen() {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    try {
        if (isFs) {
            (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
            const el = document.documentElement;
            (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        }
    } catch (e) {
        console.warn('SLATE: fullscreen request denied', e);
    }
}

function _syncFullscreenState() {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('fullscreen', isFs);
    const btn = document.getElementById('fs-btn');
    if (btn) btn.setAttribute('aria-label', isFs ? 'Exit fullscreen' : 'Enter fullscreen');

    // Viewport dimensions changed — redraw PDF canvas and waveform at new size
    PDFEngine.renderPage(STATE.currentPage);
    Waveform.rebuild();
}

document.addEventListener('fullscreenchange',       _syncFullscreenState);
document.addEventListener('webkitfullscreenchange', _syncFullscreenState);

window.toggleFullscreen = toggleFullscreen;

/* ═══════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════ */
function initKeyboard() {
    document.addEventListener('keydown', e => {
        // Don't intercept when typing in any editable element
        if (e.target.tagName === 'INPUT'    ||
            e.target.tagName === 'TEXTAREA' ||
            e.target.isContentEditable) return;

        switch (e.key) {
            case 'ArrowRight': pg(1);              break;
            case 'ArrowLeft':  pg(-1);             break;
            case ' ':          e.preventDefault(); togglePlay(); break;
            case 'm': case 'M': Comments.capture(); break;
            case 's': case 'S': setMode('screen');     break;
            case 'c': case 'C': setMode('compose');    break;
            case 'f': case 'F': e.preventDefault(); toggleFullscreen(); break;
        }
    });
}
