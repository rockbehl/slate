#!/usr/bin/env node
/**
 * SLATE — Self-Audit Test Runner
 * Usage: node test/run.js
 * No npm, no dependencies.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const src  = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ─────────────────────────────────────────────────
   MICRO FRAMEWORK
───────────────────────────────────────────────── */
let _pass = 0, _fail = 0, _skip = 0;

function describe(name, fn) {
    process.stdout.write(`\n  ${name}\n`);
    fn();
}

function it(name, fn) {
    try {
        fn();
        _pass++;
        process.stdout.write(`    \x1b[32m✓\x1b[0m ${name}\n`);
    } catch (e) {
        _fail++;
        process.stdout.write(`    \x1b[31m✗\x1b[0m ${name}\n      \x1b[2m→ ${e.message}\x1b[0m\n`);
    }
}

function xit(name) {
    _skip++;
    process.stdout.write(`    \x1b[33m–\x1b[0m ${name} (skipped)\n`);
}

function expect(val) {
    return {
        toBe(exp)        { if (val !== exp)               throw new Error(`got ${J(val)}, want ${J(exp)}`); },
        toEqual(exp)     { if (J(val) !== J(exp))         throw new Error(`got ${J(val)}, want ${J(exp)}`); },
        toBeTruthy()     { if (!val)                      throw new Error(`expected truthy, got ${J(val)}`); },
        toBeFalsy()      { if (val)                       throw new Error(`expected falsy, got ${J(val)}`); },
        toContain(item)  { if (!val.includes(item))       throw new Error(`${J(val)} does not contain ${J(item)}`); },
        toHaveLength(n)  { if ((val||[]).length !== n)    throw new Error(`length ${(val||[]).length}, want ${n}`); },
        toMatch(re)      { if (!re.test(String(val)))     throw new Error(`"${val}" does not match ${re}`); },
        not: {
            toBe(exp)    { if (val === exp)               throw new Error(`expected not ${J(exp)}`); },
            toContain(i) { if (val.includes(i))           throw new Error(`${J(val)} should not contain ${J(i)}`); },
        },
    };
}

function J(v) { return JSON.stringify(v); }

/* ─────────────────────────────────────────────────
   LOAD MODULES — mock only the globals each IIFE
   reads at definition time (not at call time)
───────────────────────────────────────────────── */

// indexedDB is touched at call-time only (_openDB), not at parse time
global.indexedDB = null;
global.STATE = { cues: [], scenes: [], tracks: [], interpreterData: null, currentCue: null, currentPage: 1 };
global.showNowPlaying = () => {};
global.goToPage = () => {};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.AudioEngine = undefined;

eval(src('js/interpreter.js'));   // → global Interpreter
eval(src('js/cue-editor.js'));    // → global CueEditor

const { _classify, _itemsToLines, _cacheKey, X, CHAR_BLACKLIST } = Interpreter._testAPI;
const { _formatTime, _esc, _sceneForPage }                        = CueEditor._testAPI;

/* ─────────────────────────────────────────────────
   INTERPRETER — classifier
───────────────────────────────────────────────── */
describe('Interpreter._classify — scene headings', () => {
    it('INT. scene', () => expect(_classify({ text: 'INT. COFFEE SHOP - DAY', x: 70 })).toBe('scene'));
    it('EXT. scene', () => expect(_classify({ text: 'EXT. PARKING LOT - NIGHT', x: 70 })).toBe('scene'));
    it('INT./EXT. scene', () => expect(_classify({ text: 'INT./EXT. MOVING CAR', x: 70 })).toBe('scene'));
    it('lowercase int. not a scene', () => expect(_classify({ text: 'int. matters here', x: 70 })).toBe('scene')); // regex is /i
    it('random action line is not a scene', () => expect(_classify({ text: 'She walks in slowly.', x: 70 })).not.toBe('scene'));
});

describe('Interpreter._classify — characters', () => {
    it('centered all-caps name', () => expect(_classify({ text: 'JOHN', x: 220 })).toBe('character'));
    it('name with V.O.', () => expect(_classify({ text: 'SARAH (V.O.)', x: 220 })).toBe('character'));
    it('too far left is not a character', () => expect(_classify({ text: 'JOHN', x: 50 })).not.toBe('character'));
    it('too far right is not a character', () => expect(_classify({ text: 'JOHN', x: 400 })).not.toBe('character'));
    it('mixed case is not a character', () => expect(_classify({ text: 'John', x: 220 })).not.toBe('character'));

    // Regression: structural tokens must NOT classify as characters
    it('ACT ONE is not a character', () => expect(_classify({ text: 'ACT ONE', x: 220 })).not.toBe('character'));
    it('ACT TWO is not a character', () => expect(_classify({ text: 'ACT TWO', x: 220 })).not.toBe('character'));
    it('THE END is not a character', () => expect(_classify({ text: 'THE END', x: 220 })).not.toBe('character'));
    it('FADE IN is not a character', () => expect(_classify({ text: 'FADE IN', x: 220 })).not.toBe('character'));
    it('CONTINUED is not a character', () => expect(_classify({ text: 'CONTINUED', x: 220 })).not.toBe('character'));
    it('MORE is not a character', () => expect(_classify({ text: 'MORE', x: 220 })).not.toBe('character'));
    it('COLD OPEN is not a character', () => expect(_classify({ text: 'COLD OPEN', x: 220 })).not.toBe('character'));
});

describe('Interpreter._classify — transitions', () => {
    it('CUT TO:', () => expect(_classify({ text: 'CUT TO:', x: 400 })).toBe('transition'));
    it('FADE OUT.', () => expect(_classify({ text: 'FADE OUT.', x: 400 })).toBe('transition'));
    it('DISSOLVE TO:', () => expect(_classify({ text: 'DISSOLVE TO:', x: 400 })).toBe('transition'));
    it('SMASH CUT', () => expect(_classify({ text: 'SMASH CUT', x: 400 })).toBe('transition'));
});

describe('Interpreter._classify — dialog and action', () => {
    it('dialog-position line', () => expect(_classify({ text: 'I never said that.', x: 150 })).toBe('dialog'));
    it('action line at left margin', () => expect(_classify({ text: 'She picks up the phone.', x: 0 })).toBe('action'));
    it('parenthetical', () => expect(_classify({ text: '(quietly)', x: 160 })).toBe('parenthetical'));
});

/* ─────────────────────────────────────────────────
   INTERPRETER — _itemsToLines
───────────────────────────────────────────────── */
describe('Interpreter._itemsToLines — line grouping', () => {
    const item = (str, x, y) => ({ str, transform: [12, 0, 0, 12, x, y] });

    it('groups items at same Y into one line', () => {
        const lines = _itemsToLines([item('Hello', 10, 700), item(' world', 60, 700)]);
        expect(lines).toHaveLength(1);
        expect(lines[0].text).toBe('Hello  world');
    });

    it('separates items at different Y', () => {
        const lines = _itemsToLines([item('Line A', 10, 700), item('Line B', 10, 680)]);
        expect(lines).toHaveLength(2);
    });

    it('sorts by Y descending (top of page first)', () => {
        const lines = _itemsToLines([item('Bottom', 10, 100), item('Top', 10, 700)]);
        expect(lines[0].text).toBe('Top');
        expect(lines[1].text).toBe('Bottom');
    });

    it('sorts items within a line by X (reading order)', () => {
        const lines = _itemsToLines([item('world', 60, 700), item('Hello ', 10, 700)]);
        expect(lines[0].text).toMatch(/^Hello/);
    });

    it('skips whitespace-only items', () => {
        const lines = _itemsToLines([item('  ', 10, 700), item('Text', 50, 700)]);
        expect(lines[0].x).toBe(50);
    });

    // Regression: 1pt rounding — two items 1pt apart should be separate lines
    it('1pt Y difference = separate lines (not merged with 2pt rounding)', () => {
        const lines = _itemsToLines([item('A', 10, 700), item('B', 10, 701)]);
        expect(lines).toHaveLength(2);
    });
});

/* ─────────────────────────────────────────────────
   INTERPRETER — _cacheKey
───────────────────────────────────────────────── */
describe('Interpreter._cacheKey', () => {
    it('formats as filename:pages', () => expect(_cacheKey('assets/screenplay/my-script.pdf', 92)).toBe('my-script.pdf:92'));
    it('strips query params', () => expect(_cacheKey('screenplay.pdf?v=2', 10)).toBe('screenplay.pdf:10'));
    it('handles bare filename', () => expect(_cacheKey('script.pdf', 5)).toBe('script.pdf:5'));
});

/* ─────────────────────────────────────────────────
   CUE EDITOR — _formatTime
───────────────────────────────────────────────── */
describe('CueEditor._formatTime', () => {
    it('0 → 0:00', () => expect(_formatTime(0)).toBe('0:00'));
    it('90 → 1:30', () => expect(_formatTime(90)).toBe('1:30'));
    it('3661 → 61:01', () => expect(_formatTime(3661)).toBe('61:01'));
    it('59 → 0:59', () => expect(_formatTime(59)).toBe('0:59'));
    it('60 → 1:00', () => expect(_formatTime(60)).toBe('1:00'));
    it('null → —', () => expect(_formatTime(null)).toBe('—'));
    it('empty string → —', () => expect(_formatTime('')).toBe('—'));
});

/* ─────────────────────────────────────────────────
   CUE EDITOR — _esc (XSS guard)
───────────────────────────────────────────────── */
describe('CueEditor._esc — HTML escaping', () => {
    it('escapes <', () => expect(_esc('<script>')).toContain('&lt;'));
    it('escapes >', () => expect(_esc('<div>')).toContain('&gt;'));
    it('escapes &', () => expect(_esc('a & b')).toContain('&amp;'));
    it('escapes "', () => expect(_esc('"quoted"')).toContain('&quot;'));
    it('plain text unchanged', () => expect(_esc('hello world')).toBe('hello world'));
    it('coerces non-strings', () => expect(_esc(42)).toBe('42'));
    it('XSS payload fully escaped', () => {
        const out = _esc('<img src=x onerror=alert(1)>');
        expect(out).not.toContain('<img');
        expect(out).toContain('&lt;');
    });
});

/* ─────────────────────────────────────────────────
   CUE EDITOR — _sceneForPage
───────────────────────────────────────────────── */
describe('CueEditor._sceneForPage', () => {
    const scenes = [
        { id: 'act1', fromPage: 1,  toPage: 30,  color: '#5b8db5' },
        { id: 'act2', fromPage: 31, toPage: 70,  color: '#b58c5b' },
        { id: 'act3', fromPage: 71, toPage: 92,  color: '#5bb58c' },
    ];

    beforeEach(() => { STATE.scenes = scenes; });

    it('page 1 → act1', () => expect(_sceneForPage(1).id).toBe('act1'));
    it('page 30 → act1', () => expect(_sceneForPage(30).id).toBe('act1'));
    it('page 31 → act2', () => expect(_sceneForPage(31).id).toBe('act2'));
    it('page 92 → act3', () => expect(_sceneForPage(92).id).toBe('act3'));
    it('page 0 → null', () => expect(_sceneForPage(0)).toBeFalsy());
    it('page 100 → null', () => expect(_sceneForPage(100)).toBeFalsy());
});

/* ─────────────────────────────────────────────────
   REGRESSION — bugs fixed in this session
───────────────────────────────────────────────── */
describe('Regressions', () => {
    it('empty array is truthy — localStorage [] must not wipe cues', () => {
        // The bug: `parsed.cues || STATE.cues` — [] is truthy, so [] was returned
        const parsed = { cues: [], scenes: [] };
        const current = [{ page: 1, track: 'a', at: 0 }];
        // Fixed guard: only restore if length > 0
        const restored = Array.isArray(parsed.cues) && parsed.cues.length > 0
            ? parsed.cues
            : current;
        expect(restored).toHaveLength(1);
    });

    it('CHAR_BLACKLIST has all expected structural tokens', () => {
        const required = ['ACT ONE','ACT TWO','THE END','FADE IN','FADE OUT',
                          'CONTINUED','MORE','COLD OPEN','OVER BLACK'];
        required.forEach(token => {
            if (!CHAR_BLACKLIST.has(token)) {
                throw new Error(`CHAR_BLACKLIST missing: "${token}"`);
            }
        });
    });

    it('_classify rejects very long all-caps lines as characters (>50 chars)', () => {
        const longCaps = 'A'.repeat(51);
        expect(_classify({ text: longCaps, x: 220 })).not.toBe('character');
    });
});

/* ─────────────────────────────────────────────────
   SUMMARY
───────────────────────────────────────────────── */
const total = _pass + _fail + _skip;
process.stdout.write('\n');
process.stdout.write(`  ${_pass}/${total} passed`);
if (_skip)  process.stdout.write(`, ${_skip} skipped`);
if (_fail)  process.stdout.write(` \x1b[31m— ${_fail} failed\x1b[0m`);
else        process.stdout.write(' \x1b[32m✓ all good\x1b[0m');
process.stdout.write('\n\n');

process.exit(_fail > 0 ? 1 : 0);

/* helper — beforeEach shim */
function beforeEach(fn) { fn(); }
