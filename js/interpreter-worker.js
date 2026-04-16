/* ─────────────────────────────────────────────────
   SLATE — interpreter-worker.js
   Runs inside a Web Worker. Receives { url, numPages }
   via postMessage, parses the PDF off the main thread,
   writes the result to IndexedDB, then postMessages it back.

   Uses the same PDF.js CDN as the main page.
   PDF.js is re-fetched here from the same URL — the
   browser HTTP cache makes this instantaneous.
───────────────────────────────────────────────── */

'use strict';

importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');

// PDF.js needs to know where its own sub-worker lives.
// Workers can spawn sub-workers; this is standard in modern browsers.
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ─────────────────────────────────────────
   CONSTANTS — must stay in sync with interpreter.js
───────────────────────────────────────── */
const DB_NAME      = 'slate_interpreter';
const DB_VERSION   = 1;
const STORE_NAME   = 'results';
const CACHE_VERSION = 5;

const X = {
    SCENE_LEFT_MIN:   55,
    SCENE_LEFT_MAX:   125,
    CHAR_MIN:         180,
    CHAR_MAX:         320,
    PAREN_MIN:        140,
    PAREN_MAX:        210,
    DIALOG_MIN:       115,
    DIALOG_MAX:       200,
    TRANSITION_MIN:   330,
};

const SCENE_RE      = /^(INT\.?|EXT\.?|INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?)\s+/i;
const SCENE_NUM_RE  = /^[A-Z]?\d+[A-Z]?[.\s]+/;
const TRANSITION_RE = /^(FADE\s+IN[:.!]?|FADE\s+OUT[:.!]?|CUT\s+TO:|DISSOLVE\s+TO:|SMASH\s+CUT|MATCH\s+CUT|TITLE\s+CARD:|SUPER\s*:|BACK\s+TO:|CONTINUOUS[.:]?)/i;
const VOICE_RE      = /\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT|MOS|PRE-LAP)\)\s*$/i;

const CHAR_BLACKLIST = new Set([
    'ACT ONE','ACT TWO','ACT THREE','ACT FOUR','ACT FIVE',
    'THE END','FADE IN','FADE OUT','CONTINUED','MORE',
    'OVER BLACK','TITLE CARD','SMASH CUT','CUT TO BLACK',
    'END OF PILOT','END OF EPISODE','COLD OPEN','TAG',
]);

/* ─────────────────────────────────────────
   INDEXEDDB — workers have full IDB access
───────────────────────────────────────── */
let _db = null;

function _openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME);
        req.onsuccess       = e => { _db = e.target.result; resolve(_db); };
        req.onerror         = e => reject(e.target.error);
    });
}

async function _cacheOp(mode, key, value) {
    try {
        const db    = await _openDB();
        const store = db.transaction(STORE_NAME, mode === 'get' ? 'readonly' : 'readwrite')
                        .objectStore(STORE_NAME);
        const req   = mode === 'get' ? store.get(key)
                    : mode === 'set' ? store.put(value, key)
                    :                  store.delete(key);
        return new Promise((resolve, reject) => {
            req.onsuccess = e => resolve(mode === 'get' ? (e.target.result || null) : undefined);
            req.onerror   = e => reject(e.target.error);
        });
    } catch (_) { return null; }
}

function _cacheKey(url, numPages) {
    const filename = url.split('/').pop().split('?')[0];
    return `${filename}:${numPages}`;
}

/* ─────────────────────────────────────────
   TEXT EXTRACTION (verbatim from interpreter.js)
───────────────────────────────────────── */
async function _extractPage(pdfDoc, pageNum) {
    const page    = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();
    return content.items;
}

function _joinItems(sorted) {
    if (sorted.length === 0) return '';
    let result = sorted[0].str;
    for (let i = 1; i < sorted.length; i++) {
        const prev      = sorted[i - 1];
        const curr      = sorted[i];
        const prevRight = prev.transform[4] + Math.abs(prev.width || 0);
        const gap       = curr.transform[4] - prevRight;
        const charWidth = Math.abs(prev.transform[0]) * 0.5;
        result += (gap < charWidth ? '' : ' ') + curr.str;
    }
    return result;
}

function _itemsToLines(items) {
    const byY = new Map();
    for (const item of items) {
        if (!item.str || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y).push(item);
    }
    return [...byY.keys()]
        .sort((a, b) => b - a)
        .map(y => {
            const sorted   = byY.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
            const text     = _joinItems(sorted).replace(/\s+/g, ' ').trim();
            const x        = sorted[0].transform[4];
            const fontSize = Math.abs(sorted[0].transform[0]);
            return { text, x, y, fontSize };
        })
        .filter(l => l.text.length > 0);
}

/* ─────────────────────────────────────────
   CLASSIFIER (verbatim from interpreter.js)
───────────────────────────────────────── */
function _classify(line) {
    const { text, x } = line;
    const t           = text.trim();
    const isAllCaps   = t.length > 1 && t === t.toUpperCase() && /[A-Z]/.test(t);

    const tNoNum = t.replace(SCENE_NUM_RE, '');
    if (SCENE_RE.test(t) || SCENE_RE.test(tNoNum))                     return 'scene';

    if (/^(INT|EXT)\b/i.test(t) && !SCENE_RE.test(t)) {
        console.warn(`SLATE Worker: possible scene heading not matched — "${t}" (x=${Math.round(x)})`);
    }

    if (TRANSITION_RE.test(t))                                         return 'transition';
    if (isAllCaps && x >= X.CHAR_MIN && x <= X.CHAR_MAX && t.length <= 50 && !CHAR_BLACKLIST.has(t)) return 'character';
    if (t.startsWith('(') && x >= X.PAREN_MIN && x <= X.PAREN_MAX)    return 'parenthetical';
    if (x > X.DIALOG_MIN && x <= X.DIALOG_MAX)                        return 'dialog';
    return 'action';
}

/* ─────────────────────────────────────────
   PARSER (verbatim from interpreter.js)
───────────────────────────────────────── */
function _parse(pageLines) {
    const scenes      = [];
    const charSet     = new Set();
    const transitions = [];
    const pageMap     = {};
    const pages       = {};   // v3: full classified line array per page

    let sceneIdx     = 0;
    let currentScene = null;

    for (const { pageNum, lines } of pageLines) {
        const pageChars = new Set();
        pageMap[pageNum] = { sceneId: null, characters: [] };
        pages[pageNum]   = { lines: [] };

        for (const line of lines) {
            const type    = _classify(line);

            // v3: persist every classified line with a stable composite ID
            const lineObj = {
                id:   `p${pageNum}_l${pages[pageNum].lines.length}`,
                text: line.text,
                type,
                x:    line.x,
                y:    line.y,
            };
            if (type === 'character') {
                const cName = line.text.trim().replace(VOICE_RE, '').trim();
                if (cName.length >= 2 && cName.length <= 45) lineObj.char = cName;
            }
            pages[pageNum].lines.push(lineObj);

            if (type === 'scene') {
                const heading  = line.text.trim();
                const typeStr  = heading.match(/^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E\.)/i)?.[1]
                                 ?.replace(/\./g, '') || 'INT';
                const rest     = heading.replace(SCENE_RE, '').trim();
                const dash     = rest.search(/\s[—–-]\s/);
                const location = (dash > -1 ? rest.slice(0, dash) : rest).trim();
                const time     = (dash > -1 ? rest.slice(dash).replace(/^[\s—–-]+/, '') : '').trim();

                sceneIdx++;
                currentScene = {
                    id:        `scene_${String(sceneIdx).padStart(3, '0')}`,
                    heading,
                    type:      typeStr.toUpperCase(),
                    location,
                    time,
                    pageStart: pageNum,
                    pageEnd:   pageNum,
                };
                scenes.push(currentScene);

            } else if (type === 'character') {
                const name = line.text.trim().replace(VOICE_RE, '').trim();
                if (name.length >= 2 && name.length <= 45) {
                    charSet.add(name);
                    pageChars.add(name);
                }

            } else if (type === 'transition') {
                transitions.push({ page: pageNum, text: line.text.trim() });
            }

            if (currentScene) {
                currentScene.pageEnd = Math.max(currentScene.pageEnd, pageNum);
            }
        }

        if (currentScene) pageMap[pageNum].sceneId = currentScene.id;
        pageMap[pageNum].characters = [...pageChars];
    }

    const suggestedCues = scenes.map(s => ({
        page:    s.pageStart,
        scene:   s.heading,
        track:   '',
        at:      0,
        fadeIn:  1.5,
        fadeOut: 1.5,
        note:    'Auto-generated — assign a track to activate',
    }));

    return { scenes, characters: [...charSet].sort(), transitions, pageMap, pages, suggestedCues };
}

/* ─────────────────────────────────────────
   MAIN — message handler
───────────────────────────────────────── */
self.addEventListener('message', async ({ data }) => {
    const { url, numPages } = data;

    const key    = _cacheKey(url, numPages);
    const cached = await _cacheOp('get', key);

    if (cached && cached._v === CACHE_VERSION) {
        console.log(`SLATE Worker: cache hit — "${key}"`);
        self.postMessage({ type: 'result', result: cached });
        return;
    }

    if (cached) {
        console.log(`SLATE Worker: stale cache (v${cached._v ?? 0} → v${CACHE_VERSION}), re-parsing…`);
    }

    console.log(`SLATE Worker: parsing ${numPages} pages…`);

    // Load + open PDF (re-fetch — browser HTTP cache makes this instant on localhost)
    let pdfDoc;
    try {
        pdfDoc = await pdfjsLib.getDocument({ url }).promise;
    } catch (err) {
        self.postMessage({ type: 'error', message: String(err) });
        return;
    }

    // Scanned PDF check
    const samplePages = await Promise.all(
        [1, Math.min(2, numPages), Math.min(3, numPages)]
            .filter((p, i, a) => a.indexOf(p) === i)
            .map(p => _extractPage(pdfDoc, p))
    );
    const sampleCount = samplePages.reduce((n, items) => n + items.filter(i => i.str && i.str.trim()).length, 0);
    console.log(`SLATE Worker: sample text items across pages 1-3 = ${sampleCount}`);

    if (sampleCount < 5) {
        const result = {
            _v: CACHE_VERSION, error: 'no-text',
            source: url.split('/').pop(), parsedAt: new Date().toISOString(),
            totalPages: numPages, scenes: [], characters: [],
            transitions: [], pageMap: {}, suggestedCues: [],
        };
        await _cacheOp('set', key, result);
        self.postMessage({ type: 'result', result });
        return;
    }

    // Extract all pages in batches of 8, yield between batches
    const BATCH     = 8;
    const pageLines = [];

    for (let start = 1; start <= numPages; start += BATCH) {
        const end  = Math.min(start + BATCH - 1, numPages);
        const nums = Array.from({ length: end - start + 1 }, (_, i) => start + i);

        const batch = await Promise.all(
            nums.map(async p => ({
                pageNum: p,
                lines:   _itemsToLines(await _extractPage(pdfDoc, p)),
            }))
        );

        pageLines.push(...batch);
        // Yield to let the event loop breathe
        await new Promise(r => setTimeout(r, 0));

        // Report progress back to main thread
        self.postMessage({ type: 'progress', pct: Math.round((start / numPages) * 100) });
    }

    const parsed = _parse(pageLines);
    const result = {
        _v:         CACHE_VERSION,
        source:     url.split('/').pop(),
        parsedAt:   new Date().toISOString(),
        totalPages: numPages,
        ...parsed,
    };

    await _cacheOp('set', key, result);

    if (parsed.scenes.length === 0) {
        console.warn('SLATE Worker: 0 scenes found after full parse.');
    }

    console.log(
        `SLATE Worker: done — ${parsed.scenes.length} scenes, ` +
        `${parsed.characters.length} characters, ` +
        `${parsed.suggestedCues.length} suggested cues.`
    );

    self.postMessage({ type: 'result', result });
});
