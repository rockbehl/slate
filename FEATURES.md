# SLATE — Feature Tracker

Active work and upcoming items. Updated as features ship.

---

## ✅ Shipped

### Core Shell — Phases 1–4
- **PDF Engine** (`js/pdf-engine.js`) — PDF.js rendering, retina canvas, debounced resize, loading/error states
- **Audio Engine** (`js/audio-engine.js`) — Howler.js playback, 250ms cue polling, fade in/out, single-track mode
- **Waveform** (`js/waveform.js`) — Wavesurfer.js v7, muted mirror, procedural fallback bars, scene colour bands, cue pins, click-to-seek, SoundCloud-style cue markers (`renderCueMarkers`), O(1) pin/marker highlight via `_pinMap` / `_markerMap`
- **Compose Mode** — split pane (24–64% drag), editable cue table, page notes, waveform zone
- **Screen Mode** — single-page reader, keyboard nav, fullscreen (F key + button)
- **Hover highlight system** — lightweight CSS transitions on all interactive elements
- **Mode transition** — cinematic 60ms crossfade delay
- **Export cues** — JSON download button

### Screenplay Interpreter (`js/interpreter.js`)
- Text extraction via PDF.js `getTextContent()`
- X-position classifier: scene / character / dialog / parenthetical / transition / action
- `CHAR_BLACKLIST` — filters structural all-caps tokens (ACT ONE, THE END, etc.)
- IndexedDB cache (`slate_interpreter` DB, shared connection)
- Scanned PDF detection (samples pages 1–3, ≥10 items threshold)
- Batched extraction (8 pages/batch) with `setTimeout(0)` yields
- `suggestedCues[]` — one stub per scene, ready to import
- Per-character PDF text joining — `_joinItems()` x-gap detection reassembles character-per-item PDFs; `CACHE_VERSION` 4

### Cue Editor rework
- Fixed localStorage empty-array wipe bug (`[] || STATE.cues` → length guard)
- `setActive()` scrolls active row into view
- `_refreshActiveRow()` — only touches prev + next row (was full table scan every 250ms)
- Delete button per row (visible on hover)
- Empty-state row with instructions
- `suggestCues()` — imports interpreter stubs with `_pendingSuggest` auto-fire
- `onInterpreterReady()` hook — Suggest button turns amber with scene count when ready

### Test Suite (`test/index.html`)
- In-browser runner (open via `http://localhost:8000/test/`)
- 50+ assertions covering: classifier, line grouping, cache key, time formatting, HTML escaping, scene lookup, regressions

---

## 🔨 In Progress

### GitHub Push
- Remote: `https://github.com/rockbehl/slate.git`
- **Blocked** — needs authentication (SSH key or PAT)
- All commits are local and ready

### Interpreter ↔ UI wiring
- Button visible — amber when ready, grouped in `.cz-btn-group`
- Per-character encoding fix shipped — real PDFs now parse correctly
- Diagnostics: open browser console, look for `SLATE PDFEngine: handing off to Interpreter…`

---

## 🔜 Up Next

### Cue Editor — Track Assignment
- Inline track selector on each cue row (dropdown from `STATE.tracks`)
- Currently shows track ID only; no way to change it from the UI
- Suggested approach: click track cell → `<select>` with available tracks

### Cue Editor — Timestamp Scrub
- Click "Cue In" cell → inline number input or click-on-waveform to set `at` value
- Currently `at: 0` for all suggested cues; needs manual JSON edit to change

### Interpreter — Result Panel
- Show parsed data somewhere in Compose mode (scene list, character list)
- Possible: collapsible sidebar or tooltip on hover over scene band
- Could drive scene label display on waveform bands (currently from `cues.json` scenes)

### Waveform — Scene Band Labels
- Each coloured band should show scene label on hover
- Currently bands render but have no text

### PDF Engine — Multi-page Scroll (Screen Mode)
- Option to show all pages scrolled vertically instead of one-at-a-time
- Would require switching from single canvas to virtual scroll with lazy rendering

### Phase 5 — Reel Prep
- `reel/prep-reel.js` — one-time script that uses interpreter output to build `reel/reel-data.json`
- Scene-level metadata, character index, page transitions
- Foundation for a future timeline/reel view

---

## 🧪 Test Coverage Gaps

| Area | Status |
|------|--------|
| Interpreter `_classify` | ✅ 20+ cases |
| Interpreter `_itemsToLines` | ✅ 6 cases incl. 1pt regression |
| Interpreter `_joinItems` | ✅ 5 cases (adjacent chars, word gap, mixed, edge cases) |
| Interpreter `_cacheKey` | ✅ 2 cases |
| CueEditor `_formatTime` | ✅ 7 cases |
| CueEditor `_esc` | ✅ 7 cases |
| CueEditor `_sceneForPage` | ✅ 6 cases |
| Regressions | ✅ 2 cases |
| AudioEngine `_cueForPage` | ❌ not yet |
| AudioEngine `_checkCues` | ❌ not yet |
| Interpreter `_parse` (full) | ❌ needs fixture PDF text |
| Waveform `syncPlayhead` | ❌ browser-only, needs Wavesurfer mock |

---

## 🔒 Design Constraints (don't change)

1. No npm, no bundler, no build step — CDN only
2. Floating audio pill — never full-width
3. Thin SVG stroke icons only
4. Screenplay page is the only heavy element
5. All UI chrome at reduced opacity until hovered/active
