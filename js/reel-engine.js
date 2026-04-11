/* ─────────────────────────────────────────────────
   SLATE — Reel Mode Engine
   Bird's-eye grid of scenes. Click a card → Screen
   mode, page jumps to scene start.
   Sprint E: character presence chips + active card
   tracking as you navigate in Screen mode.
───────────────────────────────────────────────── */

'use strict';

const ReelEngine = (() => {

    let _cards     = new Map();   // sceneIdx → card element
    let _prevIdx   = -1;          // last highlighted card index

    /* ─── Public API ─────────────────────────────── */

    function init() {
        // No setup needed — render() is called by setMode('reel')
    }

    function render() {
        const grid = document.getElementById('reel-grid');
        if (!grid) return;

        _cards.clear();
        _prevIdx = -1;

        if (!STATE.scenes.length) {
            grid.innerHTML = '<p class="reel-empty">No scenes — add them in Compose.</p>';
            return;
        }

        grid.innerHTML = '';
        STATE.scenes.forEach((s, idx) => {
            const cueCount = STATE.cues.filter(
                c => c.page >= s.fromPage && c.page <= s.toPage
            ).length;
            const pageSpan = s.toPage - s.fromPage + 1;
            const fillPct  = ((pageSpan / (STATE.totalPages || 1)) * 100).toFixed(1);

            // Character chips — sourced from interpreter if available
            const chipsHtml = _buildChipsHtml(s);

            const card = document.createElement('div');
            card.className = 'scene-card';
            card.style.setProperty('--card-color', s.color || '#555');
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-label',
                `${_esc(s.label)}, pages ${s.fromPage}–${s.toPage}, ${cueCount} cue${cueCount !== 1 ? 's' : ''}`
            );

            card.innerHTML = `
                <div class="sc-label">${_esc(s.label)}</div>
                <div class="sc-pages">pp ${s.fromPage}–${s.toPage}</div>
                <div class="sc-meta">${cueCount} cue${cueCount !== 1 ? 's' : ''} &middot; ${pageSpan} pp</div>
                ${chipsHtml}
                <div class="sc-bar"><div class="sc-bar-fill" style="width:${fillPct}%"></div></div>`;

            const _jump = () => { setMode('screen'); goToPage(s.fromPage); };
            card.addEventListener('click', _jump);
            card.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _jump(); }
            });

            _cards.set(idx, card);
            grid.appendChild(card);
        });

        // Highlight the card matching the current page immediately on render
        _updateHighlight(STATE.currentPage);
    }

    // Called from goToPage() when Reel mode is active
    function highlightCard(sceneIdx) {
        if (sceneIdx === _prevIdx) return;

        const prev = _cards.get(_prevIdx);
        if (prev) prev.classList.remove('active');

        const next = _cards.get(sceneIdx);
        if (next) {
            next.classList.add('active');
            next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }

        _prevIdx = sceneIdx;
    }

    /* ─── Private ────────────────────────────────── */

    function _updateHighlight(page) {
        const idx = STATE.scenes.findIndex(s => page >= s.fromPage && page <= s.toPage);
        if (idx !== -1) highlightCard(idx);
    }

    function _buildChipsHtml(scene) {
        const data = STATE.interpreterData;
        if (!data || !Array.isArray(data.characters) || !data.characters.length) return '';

        // Match characters to this scene by page range
        const chars = data.characters.filter(c => {
            if (Array.isArray(c.scenes) && c.scenes.length) {
                return c.scenes.includes(scene.id);
            }
            // Fallback: first appearance falls within scene page range
            return c.firstPage >= scene.fromPage && c.firstPage <= scene.toPage;
        });

        if (!chars.length) return '';

        const MAX = 4;
        const shown = chars.slice(0, MAX);
        const extra = chars.length - MAX;

        const chips = shown.map(c =>
            `<span class="sc-char">${_esc(c.name || c.id || '')}</span>`
        ).join('');

        const more = extra > 0
            ? `<span class="sc-char sc-char-more">+${extra}</span>`
            : '';

        return `<div class="sc-chars">${chips}${more}</div>`;
    }

    function _esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    }

    return { init, render, highlightCard };
})();
