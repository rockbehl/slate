/* ─────────────────────────────────────────────────
   SLATE — interpreter.js
   Screenplay PDF parser + IndexedDB cache.

   Runs once per PDF, non-blocking. Results stored in
   STATE.interpreterData and cached in IndexedDB so
   subsequent loads are instant.

   PUBLIC API:
     Interpreter.analyze(url, pdfDoc)   → parses + caches, sets STATE.interpreterData
     Interpreter.getCache(url)          → retrieve cached result (Promise<result|null>)
     Interpreter.clearCache(url)        → clear one entry
     Interpreter.clearAll()             → nuke entire cache

   CALLED FROM:
     pdf-engine.js → after first page renders

   OUTPUT SHAPE:
     {
       source, parsedAt, totalPages,
       scenes[]       — id, heading, type, location, time, pageStart, pageEnd
       characters[]   — sorted array of character names
       transitions[]  — { page, text }
       pageMap{}      — { [pageNum]: { sceneId, characters[] } }
       suggestedCues[]— one per scene, track:"", at:0 — ready to import
     }
───────────────────────────────────────────────── */

'use strict';

const Interpreter = (() => {

    const DB_NAME    = 'slate_interpreter';
    const DB_VERSION = 1;
    const STORE_NAME = 'results';

    /* ─────────────────────────────────────────
       X-POSITION THRESHOLDS (PDF points, 72pt = 1")
       Standard US Letter screenplay: 612 × 792pt
       These are tunable — log raw lines in dev if
       your PDF uses non-standard margins.
    ───────────────────────────────────────── */
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

    const SCENE_RE      = /^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E\.)\s+/i;
    const TRANSITION_RE = /^(FADE\s+IN[:.!]?|FADE\s+OUT[:.!]?|CUT\s+TO:|DISSOLVE\s+TO:|SMASH\s+CUT|MATCH\s+CUT|TITLE\s+CARD:|SUPER\s*:|BACK\s+TO:|CONTINUOUS[.:]?)/i;
    const VOICE_RE      = /\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT|MOS|PRE-LAP)\)\s*$/i;

    // All-caps lines that look like character names but aren't
    const CHAR_BLACKLIST = new Set([
        'ACT ONE','ACT TWO','ACT THREE','ACT FOUR','ACT FIVE',
        'THE END','FADE IN','FADE OUT','CONTINUED','MORE',
        'OVER BLACK','TITLE CARD','SMASH CUT','CUT TO BLACK',
        'END OF PILOT','END OF EPISODE','COLD OPEN','TAG',
    ]);

    /* ─────────────────────────────────────────
       INDEXEDDB — single shared connection
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

    const _cacheGet = (key)        => _cacheOp('get', key);
    const _cacheSet = (key, value) => _cacheOp('set', key, value);
    const _cacheDel = (key)        => _cacheOp('del', key);

    function _cacheKey(url, numPages) {
        const filename = url.split('/').pop().split('?')[0];
        return `${filename}:${numPages}`;
    }

    /* ─────────────────────────────────────────
       TEXT EXTRACTION — PDF.js page → lines
    ───────────────────────────────────────── */
    async function _extractPage(pdfDoc, pageNum) {
        const page    = await pdfDoc.getPage(pageNum);
        // normalizeWhitespace was removed in PDF.js 3.x; don't pass it
        const content = await page.getTextContent();
        return content.items;
    }

    function _itemsToLines(items) {
        // Group items by Y (rounded to 1pt) to reconstruct split text on the same line
        const byY = new Map();
        for (const item of items) {
            // PDF.js 3.x items array can contain TextMarkedContent objects with no .str
            if (!item.str || !item.str.trim()) continue;
            const y = Math.round(item.transform[5]);
            if (!byY.has(y)) byY.set(y, []);
            byY.get(y).push(item);
        }

        // High Y = top of page in PDF.js coordinate space (origin at bottom-left)
        return [...byY.keys()]
            .sort((a, b) => b - a)
            .map(y => {
                const sorted   = byY.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
                const text     = sorted.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
                const x        = sorted[0].transform[4];
                const fontSize = Math.abs(sorted[0].transform[0]);
                return { text, x, y, fontSize };
            })
            .filter(l => l.text.length > 0);
    }

    /* ─────────────────────────────────────────
       CLASSIFIER — what kind of line is this?
    ───────────────────────────────────────── */
    function _classify(line) {
        const { text, x } = line;
        const t          = text.trim();
        const isAllCaps  = t.length > 1 && t === t.toUpperCase() && /[A-Z]/.test(t);

        if (SCENE_RE.test(t))                                              return 'scene';
        if (TRANSITION_RE.test(t))                                         return 'transition';
        if (isAllCaps && x >= X.CHAR_MIN && x <= X.CHAR_MAX && t.length <= 50 && !CHAR_BLACKLIST.has(t)) return 'character';
        if (t.startsWith('(') && x >= X.PAREN_MIN && x <= X.PAREN_MAX)    return 'parenthetical';
        if (x > X.DIALOG_MIN && x <= X.DIALOG_MAX)                        return 'dialog';
        return 'action';
    }

    /* ─────────────────────────────────────────
       PARSER — build structured data
    ───────────────────────────────────────── */
    function _parse(pageLines) {
        const scenes      = [];
        const charSet     = new Set();
        const transitions = [];
        const pageMap     = {};

        let sceneIdx     = 0;
        let currentScene = null;

        for (const { pageNum, lines } of pageLines) {
            const pageChars = new Set();
            pageMap[pageNum] = { sceneId: null, characters: [] };

            for (const line of lines) {
                const type = _classify(line);

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

                // Extend current scene's page range
                if (currentScene) {
                    currentScene.pageEnd = Math.max(currentScene.pageEnd, pageNum);
                }
            }

            // Assign sceneId to this page (first scene that started on/before this page)
            if (currentScene) pageMap[pageNum].sceneId = currentScene.id;
            pageMap[pageNum].characters = [...pageChars];
        }

        // One suggested cue per scene — track unset, at: 0
        const suggestedCues = scenes.map(s => ({
            page:    s.pageStart,
            scene:   s.heading,
            track:   '',
            at:      0,
            fadeIn:  1.5,
            fadeOut: 1.5,
            note:    'Auto-generated — assign a track to activate',
        }));

        return {
            scenes,
            characters:    [...charSet].sort(),
            transitions,
            pageMap,
            suggestedCues,
        };
    }

    /* ─────────────────────────────────────────
       ANALYZE — main entry point
    ───────────────────────────────────────── */
    async function analyze(url, pdfDoc) {
        if (!pdfDoc) return null;

        const numPages = pdfDoc.numPages;
        const key      = _cacheKey(url, numPages);

        // ── Cache hit — instant return ──
        const cached = await _cacheGet(key);
        if (cached) {
            console.log(`SLATE Interpreter: cache hit — "${key}"`);
            if (typeof STATE !== 'undefined') STATE.interpreterData = cached;
            if (typeof CueEditor !== 'undefined' && typeof CueEditor.onInterpreterReady === 'function') {
                CueEditor.onInterpreterReady(cached);
            }
            return cached;
        }

        console.log(`SLATE Interpreter: parsing ${numPages} pages…`);

        // ── Scanned PDF check — sample pages 1-3 ──
        // Threshold is 5 (not 10) because page 1 is often a sparse title page
        const samplePages = await Promise.all(
            [1, Math.min(2, numPages), Math.min(3, numPages)]
                .filter((p, i, a) => a.indexOf(p) === i)  // dedupe for short docs
                .map(p => _extractPage(pdfDoc, p))
        );
        const sampleCount = samplePages.reduce((n, items) => n + items.filter(i => i.str && i.str.trim()).length, 0);
        console.log(`SLATE Interpreter: sample text items across pages 1-3 = ${sampleCount}`);
        if (sampleCount < 5) {
            const result = {
                error:        'no-text',
                source:       url.split('/').pop(),
                parsedAt:     new Date().toISOString(),
                totalPages:   numPages,
                scenes:       [],
                characters:   [],
                transitions:  [],
                pageMap:      {},
                suggestedCues:[],
            };
            console.warn('SLATE Interpreter: PDF appears to be a scanned image — no extractable text');
            if (typeof STATE !== 'undefined') STATE.interpreterData = result;
            return result;
        }

        // ── Extract text in batches of 8 — yields between batches ──
        const BATCH     = 8;
        const pageLines = [];

        for (let start = 1; start <= numPages; start += BATCH) {
            const end     = Math.min(start + BATCH - 1, numPages);
            const nums    = Array.from({ length: end - start + 1 }, (_, i) => start + i);

            const batchResults = await Promise.all(
                nums.map(async p => ({
                    pageNum: p,
                    lines:   _itemsToLines(await _extractPage(pdfDoc, p)),
                }))
            );

            pageLines.push(...batchResults);
            await new Promise(r => setTimeout(r, 0)); // yield to browser
        }

        // ── Parse ──
        const parsed = _parse(pageLines);
        const result = {
            source:     url.split('/').pop(),
            parsedAt:   new Date().toISOString(),
            totalPages: numPages,
            ...parsed,
        };

        // ── Cache ──
        await _cacheSet(key, result);
        if (parsed.scenes.length === 0) {
            console.warn(
                'SLATE Interpreter: parsed OK but found 0 scenes. ' +
                'Call Interpreter.diagnoseRaw(1) in the console to inspect page 1 ' +
                'with x-coordinates — the X thresholds may need tuning for this PDF.'
            );
        }
        console.log(
            `SLATE Interpreter: done — ${parsed.scenes.length} scenes, ` +
            `${parsed.characters.length} characters, ` +
            `${parsed.suggestedCues.length} suggested cues. Cached as "${key}".`
        );

        if (typeof STATE !== 'undefined') STATE.interpreterData = result;

        // Notify CueEditor so the Suggest button can update its ready state
        if (typeof CueEditor !== 'undefined' && typeof CueEditor.onInterpreterReady === 'function') {
            CueEditor.onInterpreterReady(result);
        }

        return result;
    }

    /* ─────────────────────────────────────────
       PUBLIC CACHE MANAGEMENT
    ───────────────────────────────────────── */
    async function getCache(url) {
        try {
            const db       = await _openDB();
            const filename = url.split('/').pop().split('?')[0] + ':';
            return new Promise((resolve, reject) => {
                const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).openCursor();
                let found = null;
                req.onsuccess = e => {
                    const cursor = e.target.result;
                    if (cursor) {
                        // Collect last match — most recently written entry wins
                        if (String(cursor.key).startsWith(filename)) found = cursor.value;
                        cursor.continue();
                    } else {
                        resolve(found);
                    }
                };
                req.onerror = e => reject(e.target.error);
            });
        } catch (_) { return null; }
    }

    async function clearCache(url) {
        const cached = await getCache(url);
        if (!cached) return;
        await _cacheDel(_cacheKey(url, cached.totalPages));
    }

    async function clearAll() {
        try {
            const db = await _openDB();
            db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear();
        } catch (_) {}
    }

    /* ─────────────────────────────────────────
       DIAGNOSTICS
       Call from browser console while app is running.
    ───────────────────────────────────────── */

    // diagnose() — summary of whatever is in STATE.interpreterData right now
    function diagnose() {
        const d = (typeof STATE !== 'undefined') ? STATE.interpreterData : null;
        if (!d) { console.warn('Interpreter.diagnose(): no data yet — load a PDF first'); return null; }
        if (d.error) { console.error('Interpreter error:', d.error, d); return d; }

        console.group(`SLATE Interpreter — ${d.source} (${d.totalPages} pp)`);
        console.log(`Parsed at: ${d.parsedAt}`);
        console.log(`Scenes (${d.scenes.length}):`, d.scenes.map(s => `p${s.pageStart} ${s.heading}`));
        console.log(`Characters (${d.characters.length}):`, d.characters);
        console.log(`Transitions (${d.transitions.length}):`, d.transitions.map(t => `p${t.page} ${t.text}`));
        console.log(`Suggested cues (${d.suggestedCues.length}):`, d.suggestedCues.map(c => `p${c.page} "${c.scene}"`));
        console.groupEnd();
        return d;
    }

    // diagnoseRaw(pageNum) — extract + classify every line on a page,
    // print with x/y coords so X thresholds can be tuned if needed.
    async function diagnoseRaw(pageNum) {
        pageNum = pageNum || 1;
        const pdfDoc = (typeof PDFEngine !== 'undefined') ? PDFEngine.getPdfDoc() : null;
        if (!pdfDoc) { console.warn('Interpreter.diagnoseRaw(): PDF not loaded'); return; }

        const items = await _extractPage(pdfDoc, pageNum);
        const lines = _itemsToLines(items);

        console.group(`SLATE Interpreter — raw page ${pageNum} (${items.length} items → ${lines.length} lines)`);
        console.log('X thresholds:', X);
        console.log('');
        lines.forEach(l => {
            const type  = _classify(l);
            const xStr  = String(Math.round(l.x)).padStart(4);
            const tStr  = type.padEnd(14);
            const text  = l.text.length > 80 ? l.text.slice(0, 77) + '…' : l.text;
            console.log(`[${tStr}] x=${xStr}  "${text}"`);
        });
        console.groupEnd();
    }

    // Expose internals when running under the test harness — never in normal use
    const _testAPI = (typeof module !== 'undefined' || (typeof __SLATE_TEST__ !== 'undefined' && __SLATE_TEST__))
        ? { _classify, _itemsToLines, _cacheKey, X, SCENE_RE, TRANSITION_RE, CHAR_BLACKLIST }
        : null;

    return { analyze, getCache, clearCache, clearAll, diagnose, diagnoseRaw, _testAPI };

})();
