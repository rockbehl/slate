/* ─────────────────────────────────────────────────
   SLATE — text-renderer.js
   v3 HTML text renderer. Replaces PDF canvas as the
   primary screenplay display.

   Reads classified line data from Interpreter.getLinesForPage()
   and renders it as DOM elements using the existing .sp-* CSS
   classes defined in css/base.css.

   Falls back to PDF canvas if:
     · Interpreter data isn't ready yet (renders while parsing)
     · ?canvas=1 is in the URL (dev/fidelity mode)

   PUBLIC API:
     TextRenderer.renderPage(n)   → render page n in all active wraps
     TextRenderer.isReady(n)      → true if interpreter data exists for page n

   CALLED FROM:
     app.js → goToPage()
     interpreter.js → after analysis completes (re-renders current page)
─────────────────────────────────────────────────────────────────── */

'use strict';

const TextRenderer = (() => {

    // Dev override: ?canvas=1 forces canvas rendering for side-by-side verification
    const _useCanvas = new URLSearchParams(location.search).has('canvas');

    // Interpreter line type → CSS class
    const TYPE_CLASS = {
        scene:         'sp-scene',
        character:     'sp-char',
        dialog:        'sp-dialogue',
        parenthetical: 'sp-paren',
        action:        'sp-action',
        transition:    'sp-trans',
    };

    /* ─────────────────────────────────────────
       BUILD — construct the .page-sheet DOM node
    ───────────────────────────────────────── */
    function _buildSheet(n, lines) {
        const sheet = document.createElement('div');
        sheet.className = 'page-sheet';
        sheet.setAttribute('data-page', n);
        sheet.setAttribute('role', 'document');
        sheet.setAttribute('aria-label', `Screenplay page ${n}`);

        // Page number corner (matches the canvas pg-corner style)
        const corner = document.createElement('span');
        corner.className = 'pg-corner';
        corner.textContent = n;
        sheet.appendChild(corner);

        // One element per classified line
        lines.forEach(line => {
            const el = document.createElement('div');
            el.className = TYPE_CLASS[line.type] || 'sp-action';
            el.dataset.lineId = line.id;
            if (line.char) el.dataset.char = line.char;
            el.textContent = line.text;
            sheet.appendChild(el);
        });

        return sheet;
    }

    /* ─────────────────────────────────────────
       RENDER — inject sheet into a wrap element
    ───────────────────────────────────────── */
    function _renderToWrap(wrapId, n, lines) {
        const wrap = document.getElementById(wrapId);
        if (!wrap) return;
        wrap.innerHTML = '';
        wrap.appendChild(_buildSheet(n, lines));
    }

    /* ─────────────────────────────────────────
       PUBLIC — renderPage(n)
    ───────────────────────────────────────── */
    function renderPage(n) {
        // Dev mode: defer entirely to canvas
        if (_useCanvas) {
            if (typeof PDFEngine !== 'undefined') PDFEngine.renderPage(n);
            return;
        }

        // Get lines from interpreter cache
        const lines = (typeof Interpreter !== 'undefined')
            ? Interpreter.getLinesForPage(n)
            : [];

        if (!lines.length) {
            // Interpreter hasn't parsed this page yet — canvas is the fallback
            if (typeof PDFEngine !== 'undefined') PDFEngine.renderPage(n);
            return;
        }

        _renderToWrap('screen-pdf-wrap',  n, lines);
        _renderToWrap('compose-pdf-wrap', n, lines);
    }

    /* ─────────────────────────────────────────
       PUBLIC — isReady(n)
       Returns true if the interpreter has data for page n.
       Useful for conditional logic in other modules.
    ───────────────────────────────────────── */
    function isReady(n) {
        if (typeof Interpreter === 'undefined') return false;
        return Interpreter.getLinesForPage(n).length > 0;
    }

    return { renderPage, isReady };

})();
