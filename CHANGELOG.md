# CHANGELOG

---

## [Unreleased]

---

## v1.2.0 — Interpreter Hardening
*2026-04-05*

### Fixed
- **Y-axis rounding** — text line grouping now uses 1pt precision instead of 2pt, preventing adjacent lines from merging incorrectly on dense screenplay pages
- **Character false positives** — structural all-caps tokens (`ACT ONE`, `THE END`, `FADE IN`, `CONTINUED`, `MORE`, etc.) are now blacklisted from the character name classifier
- **Scanned PDF detection** — now samples pages 1–3 instead of page 1 only; threshold raised to 10 items across sampled pages for more reliable detection of image-only PDFs
- **Error result shape** — `no-text` error result now includes empty `scenes`, `characters`, `transitions`, `pageMap`, and `suggestedCues` arrays so callers never need to null-check individual fields
- **`pageEnd` tracking** — switched from a conditional assignment to `Math.max()` to correctly handle scenes that span non-sequentially rendered pages
- **`getCache()` cursor** — annotated to clarify last-match-wins behaviour across multiple cache entries for the same filename

---

## v1.1.0 — Screenplay Interpreter (Phase 5 Foundation)
*2026-04-05*

### Added
- `js/interpreter.js` — full screenplay parser that runs non-blocking after the PDF first renders
  - Extracts scenes, characters, transitions, and page mappings from PDF.js text content
  - X-position thresholds tuned to standard US Letter screenplay format (612pt wide)
  - Generates `suggestedCues[]` — one cue stub per scene, ready to import
  - IndexedDB cache (`slate_interpreter` DB) — subsequent loads are instant, keyed by `filename:numPages`
  - Graceful handling of scanned/image PDFs
  - Batched extraction (8 pages per batch) with `setTimeout(0)` yields to keep the UI responsive
- `STATE.interpreterData` — result stored for future UI consumption
- `PDFEngine.getPdfDoc()` — exposes the parsed PDF doc for use by Interpreter

---

## v1.0.0 — Initial Release (Phases 1–4)
*2026-04-05*

### Added
- **Phase 1 — PDF Engine** (`js/pdf-engine.js`): PDF.js rendering, retina canvas scaling, loading/error states, debounced resize
- **Phase 2 — Audio Engine** (`js/audio-engine.js`): Howler.js playback, cue-point polling at 250ms, fade in/out, single-track mode, volume control
- **Phase 3 — Waveform** (`js/waveform.js`): Wavesurfer.js v7 real waveform, muted mirror playhead, procedural fallback bars, click-to-seek, scene colour bands, cue pins
- **Phase 4 — Polish**
  - Fullscreen mode (`F` key, button in screen nav) with CSS backdrop and UI fade
  - Hover highlight system — lightweight CSS transitions on all interactive elements
  - Mode transition cinematic delay (`#compose` 60ms hand-off)
  - Now-playing whisper with debounced fade
  - Export cues as JSON download
  - Error state for missing audio (`t-label[data-error]` red italic)
  - DOM caching (`_dom` object) — eliminates repeated `getElementById` in the 250ms render loop
  - `_lastDurationStr` — total duration string computed once, not every tick
- **Compose mode** — split pane, drag handle (24–64% range), editable cue table, page notes, waveform zone
- **Screen mode** — single-page reader, page navigation, fullscreen-ready
- `cues.json` — 11 cues, 4 acts, silence markers, director notes
- `README.md` — setup guide, keyboard shortcuts, cue file reference, dependency table
- `.gitignore` — excludes audio/PDF assets and `.DS_Store`
