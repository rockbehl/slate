/* ─────────────────────────────────────────────────
   SLATE — pdf-engine.js
   Phase 1: Wraps PDF.js to render the screenplay PDF.

   HOW TO USE (from app.js):
     PDFEngine.load('assets/screenplay/screenplay.pdf')

   DEPENDENCIES:
     PDF.js 3.11.174 (loaded via CDN in index.html)

   RENDER TARGETS:
     Screen mode  → #screen-pdf-wrap   (.screen-scroll > .pdf-canvas-wrap)
     Compose mode → #compose-pdf-wrap  (.sp-scroll > .pdf-canvas-wrap)

   RENDERING:
     - Each canvas measures its container and scales the PDF to fill it
     - Renders at window.devicePixelRatio for crisp Retina output
     - Pre-fills cream background before PDF.js paints
     - Debounced re-render on window resize
───────────────────────────────────────────────── */

'use strict';

const PDFEngine = (() => {

    const WORKER_SRC   = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const MAX_SCREEN_W = 600;   // CSS px cap for Screen mode (screenplay readable width)

    let _pdfDoc      = null;
    let _rendering   = false;
    let _pendingPage = null;   // queued page if a render was in-flight
    let _resizeTimer = null;

    /* ─────────────────────────────────────────
       LOAD — fetch and parse the PDF
    ───────────────────────────────────────── */
    async function load(url) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;

        try {
            _showLoading();
            _pdfDoc = await pdfjsLib.getDocument(url).promise;

            if (!_pdfDoc.numPages || _pdfDoc.numPages < 1) {
                throw new Error('PDF has no pages');
            }

            STATE.totalPages  = _pdfDoc.numPages;
            STATE.currentPage = 1;

            if (typeof updatePageLabels === 'function') updatePageLabels();

            await renderPage(1);
        } catch (err) {
            console.error('SLATE PDFEngine: failed to load PDF', err);
            _showError('Could not load screenplay.pdf — check assets/screenplay/ folder');
        }
    }

    /* ─────────────────────────────────────────
       RENDER — draw a page to both canvases
    ───────────────────────────────────────── */
    async function renderPage(pageNum) {
        if (!_pdfDoc) return;
        if (_rendering) { _pendingPage = pageNum; return; }
        _rendering = true;

        try {
            const page = await _pdfDoc.getPage(pageNum);

            await Promise.all([
                _renderToCanvas(page, 'screen-pdf-wrap',  'screen-canvas',  MAX_SCREEN_W),
                _renderToCanvas(page, 'compose-pdf-wrap', 'compose-canvas', Infinity),
            ]);
        } finally {
            _rendering = false;
            if (_pendingPage !== null) {
                const next = _pendingPage;
                _pendingPage = null;
                renderPage(next);
            }
        }
    }

    /* ─────────────────────────────────────────
       INTERNAL — render one canvas
    ───────────────────────────────────────── */
    async function _renderToCanvas(page, wrapId, canvasId, maxCssWidth) {
        const wrap = document.getElementById(wrapId);
        if (!wrap) return;

        const dpr = window.devicePixelRatio || 1;

        // Horizontal padding consumed by the scroll container
        const hPad    = wrapId === 'screen-pdf-wrap' ? 40 : 28;
        const cssWidth = Math.min(Math.max(wrap.clientWidth - hPad, 100), maxCssWidth);

        // Scale = target CSS width / natural page width × dpr
        // This gives a viewport whose physical pixel dimensions are cssWidth×dpr wide
        const unscaled = page.getViewport({ scale: 1 });
        const scale    = (cssWidth / unscaled.width) * dpr;
        const viewport = page.getViewport({ scale });

        // Get or create canvas
        let canvas = document.getElementById(canvasId);
        if (!canvas) {
            canvas    = document.createElement('canvas');
            canvas.id = canvasId;
            wrap.innerHTML = '';
            wrap.appendChild(canvas);
        }

        // Physical pixel dimensions (what the GPU sees)
        canvas.width  = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);

        // CSS display size (device-independent pixels)
        canvas.style.width  = cssWidth + 'px';
        canvas.style.height = Math.round(viewport.height / dpr) + 'px';

        const ctx = canvas.getContext('2d');

        // Cream pre-fill — paints the page color before PDF.js draws
        // so there's no white flash or transparent artifact on load
        ctx.fillStyle = '#faf8f4';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
    }

    /* ─────────────────────────────────────────
       RESIZE — re-render at new container width
    ───────────────────────────────────────── */
    window.addEventListener('resize', () => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => {
            if (_pdfDoc && typeof STATE !== 'undefined') {
                renderPage(STATE.currentPage);
            }
        }, 180);
    });

    /* Loading / error states */
    function _showLoading() {
        ['screen-pdf-wrap', 'compose-pdf-wrap'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="state-loading"><div class="spinner"></div><span>Loading screenplay…</span></div>';
        });
    }

    function _showError(msg) {
        ['screen-pdf-wrap', 'compose-pdf-wrap'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const div = document.createElement('div');
            div.className = 'state-error';
            div.textContent = msg;
            el.innerHTML = '';
            el.appendChild(div);
        });
    }

    return { load, renderPage };

})();
