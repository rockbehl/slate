/* ─────────────────────────────────────────────────
   SLATE — bundle-loader.js
   Reads a .cues ZIP bundle and patches the init chain
   so all engines load assets from in-memory blob URLs.

   Trigger methods:
     1. ?bundle=<path>  query param on page load
     2. Drag-and-drop a .cues file onto the document

   The read path creates blob: URLs for each asset and
   overwrites the <body> data attributes (PATHS source)
   BEFORE DOMContentLoaded fires the normal init chain.
   No changes to PDFEngine, AudioEngine, or CueEditor.
───────────────────────────────────────────────── */

'use strict';

const BundleLoader = (() => {

    /* ─────────────────────────────────────────
       PUBLIC: open a .cues file (ArrayBuffer)
    ───────────────────────────────────────── */
    async function openBuffer(buffer, filename) {
        if (typeof JSZip === 'undefined') {
            console.error('SLATE BundleLoader: JSZip not loaded');
            return;
        }

        let zip;
        try {
            zip = await JSZip.loadAsync(buffer);
        } catch (e) {
            console.error('SLATE BundleLoader: failed to unzip bundle', e);
            _showBundleError('Could not read bundle — file may be corrupt.');
            return;
        }

        // Read manifest
        const manifestFile = zip.file('manifest.json');
        if (!manifestFile) {
            _showBundleError('Bundle is missing manifest.json');
            return;
        }
        let manifest;
        try {
            manifest = JSON.parse(await manifestFile.async('text'));
        } catch (e) {
            _showBundleError('Bundle manifest.json is invalid JSON');
            return;
        }

        console.log(`SLATE BundleLoader: opening "${manifest.name || filename}" v${manifest.version}`);

        // ── PDF ──
        const pdfEntry = zip.file(manifest.pdfFile || 'screenplay.pdf');
        if (!pdfEntry) { _showBundleError('Bundle is missing the screenplay PDF'); return; }
        const pdfBlob   = await pdfEntry.async('blob');
        const pdfBlobUrl = URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' }));

        // ── cues.json ──
        const cuesEntry = zip.file(manifest.cuesFile || 'cues.json');
        let cuesJson = null;
        if (cuesEntry) {
            cuesJson = JSON.parse(await cuesEntry.async('text'));
        }

        // ── tracks.json ──
        const tracksEntry = zip.file(manifest.tracksFile || 'tracks.json');
        let tracks = [];
        if (tracksEntry) {
            tracks = JSON.parse(await tracksEntry.async('text'));
        }

        // ── Audio files → blob URLs ──
        const audioFolder = manifest.audioFolder || 'audio';
        const audioMap = {};  // filename → blob URL
        for (const t of tracks) {
            const audioPath = `${audioFolder}/${t.file}`;
            const audioEntry = zip.file(audioPath);
            if (audioEntry) {
                const audioBlob = await audioEntry.async('blob');
                audioMap[t.file] = URL.createObjectURL(audioBlob);
                console.log(`SLATE BundleLoader: loaded audio "${t.file}"`);
            } else {
                console.warn(`SLATE BundleLoader: audio file not found in bundle: ${audioPath}`);
            }
        }

        // Rewrite track file refs to blob URLs; preserve original filename for format hints
        const patchedTracks = tracks.map(t => ({
            ...t,
            originalFile: t.file,          // kept for audio format detection in AudioEngine
            file: audioMap[t.file] || t.file,
        }));

        // ── Patch PATHS + body data attrs ──
        // PATHS is already set from data attrs; we overwrite the live attrs so
        // app.js reads the patched values when loadCues() + PDFEngine.load() fire.
        document.body.dataset.pdf    = pdfBlobUrl;
        document.body.dataset.tracks = '_bundle_tracks_'; // sentinel — patched below

        // Inject cues + tracks directly into STATE (bypasses the fetch chain)
        _whenReady(() => {
            if (typeof STATE !== 'undefined') {
                if (cuesJson) {
                    STATE.cues   = cuesJson.cues   || [];
                    STATE.scenes = cuesJson.scenes || [];
                }
                STATE.tracks = patchedTracks;
                // Store manifest for export round-trips
                STATE.bundleManifest = manifest;
            }

            if (typeof PATHS !== 'undefined') {
                PATHS.pdf    = pdfBlobUrl;
                PATHS.tracks = '_bundle_tracks_'; // AudioEngine checks STATE.tracks first
            }

            // Signal AudioEngine to skip its own tracks.json fetch and use STATE.tracks
            if (typeof AudioEngine !== 'undefined' && typeof STATE !== 'undefined') {
                AudioEngine._patchTracksFromBundle(STATE.tracks);
            }
        });

        _dismissDropOverlay();
        showNowPlaying && showNowPlaying(`Opened: ${manifest.name || filename}`);
    }

    /* ─────────────────────────────────────────
       ?bundle= query param on page load
    ───────────────────────────────────────── */
    function _checkQueryParam() {
        const params = new URLSearchParams(window.location.search);
        const bundlePath = params.get('bundle');
        if (!bundlePath) return;
        console.log(`SLATE BundleLoader: loading bundle from ?bundle=${bundlePath}`);
        fetch(bundlePath)
            .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
            .then(buf => openBuffer(buf, bundlePath.split('/').pop()))
            .catch(e => _showBundleError(`Could not fetch bundle: ${e.message}`));
    }

    /* ─────────────────────────────────────────
       DRAG-DROP target (whole document)
    ───────────────────────────────────────── */
    function _initDragDrop() {
        const overlay = document.getElementById('bundle-drop-overlay');

        document.addEventListener('dragover', e => {
            const items = [...(e.dataTransfer?.items || [])];
            const hasCues = items.some(i => i.kind === 'file');
            if (!hasCues) return;
            e.preventDefault();
            if (overlay) overlay.classList.add('visible');
        });

        document.addEventListener('dragleave', e => {
            // Only hide if leaving the window entirely
            if (e.relatedTarget == null && overlay) overlay.classList.remove('visible');
        });

        document.addEventListener('drop', async e => {
            e.preventDefault();
            if (overlay) overlay.classList.remove('visible');

            const files = [...(e.dataTransfer?.files || [])];
            const cuesFile = files.find(f => f.name.endsWith('.cues'));
            if (!cuesFile) return;

            const buf = await cuesFile.arrayBuffer();
            await openBuffer(buf, cuesFile.name);
        });
    }

    /* ─────────────────────────────────────────
       HELPERS
    ───────────────────────────────────────── */
    function _whenReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    function _showBundleError(msg) {
        console.error('SLATE BundleLoader:', msg);
        if (typeof showNowPlaying === 'function') showNowPlaying(msg);
    }

    function _dismissDropOverlay() {
        const overlay = document.getElementById('bundle-drop-overlay');
        if (overlay) overlay.classList.remove('visible');
    }

    /* ─────────────────────────────────────────
       BOOT — runs immediately on script load
    ───────────────────────────────────────── */
    (function boot() {
        _checkQueryParam();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _initDragDrop, { once: true });
        } else {
            _initDragDrop();
        }
    })();

    return { openBuffer };

})();
