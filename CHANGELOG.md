# CHANGELOG

---

## v3.0.0-alpha.1 — Phase 1: Line Data Pipeline
*2026-04-16*

### Added
- **Line data persistence** — `js/interpreter.js` + `js/interpreter-worker.js` now parse and store full line array alongside scene/character extraction. Each line: `{ id: "p{page}_l{idx}", text, type, x, y, char? }`. Line types: `scene | character | dialog | parenthetical | action | transition`.
- **New Interpreter API** — `getLinesForPage(n)` returns classified lines for a page; `diagnoseLines(n)` logs them to console for debugging.
- **Cache version bump** — `CACHE_VERSION` → 5 to invalidate old v2 results.

---

## v3.0.0-alpha.2 — Phase 2: HTML Text Renderer
*2026-04-16*

### Added
- **`js/text-renderer.js`** — New module renders screenplay pages as DOM using existing `.sp-scene`, `.sp-char`, `.sp-dialogue`, `.sp-paren`, `.sp-action`, `.sp-trans` CSS classes from `css/base.css`.
- **TextRenderer.renderPage(n)** — becomes primary render path called from `goToPage()` in `js/app.js:145`.
- **Canvas fallback** — `?canvas=1` URL parameter forces original PDF canvas rendering; also triggered if interpreter not ready.
- **Interpreter auto-refresh** — when interpreter finishes analyzing, it calls `TextRenderer.renderPage(STATE.currentPage)` to update Screen mode mid-session.

---

## v3.0.0-alpha.3 — BugBash: Audio Retry + Error Surface
*2026-04-16*

### Fixed
- **Howler retry spam** — `audio-engine.js` now calls `howl.unload()` on loader error to prevent indefinite retry loop.
- **Error surfacing** — Missing audio files now display warning in waveform label and now-playing whisper: "⚠ missing: filename".

---

## v3.0.0-alpha.4 — Phase 3: Cue Schema Extension (incoming)
*2026-04-16 (planned)*

### To ship
- **`line` + `lineSpecific` fields** — each cue gains line index and behavior toggle.
- **Migration on load** — cues lacking these fields default to `{line: 0, lineSpecific: false}` (page-level, backward compatible).
- **Persist via localStorage** — `CueEditor.save()` unchanged; schema migration is auto.

---

## v2.0.0 — .cues Bundle Format + Phase 4 Complete + Alpine.js
*2026-04-08*

### Added
- **`.cues` bundle format** (`js/bundle-loader.js`) — ZIP project container that packages screenplay PDF, audio files, `cues.json`, and `tracks.json` into a single portable file. Drag a `.cues` file onto SLATE to open it; all engines load from in-memory blob URLs with zero filesystem access. Inspired by `.sketch`/`.fcpbundle` project containers.
  - `manifest.json` inside the ZIP stores version, name, timestamps, and file pointers
  - `?bundle=<path>` query param also opens a remote bundle on page load
  - Full-window drag-drop overlay with amber "Drop .cues bundle to open" prompt
- **`CueEditor.exportBundle()`** — async write path; fetches all assets (PDF + audio + cues), packs via JSZip with DEFLATE compression, downloads as `<project-name>.cues`
- **`AudioEngine._patchTracksFromBundle(tracks)`** — allows bundle-loader to inject pre-fetched blob: URL tracks directly, bypassing the `tracks.json` HTTP fetch
- **JSZip 3.10.1** CDN added (35KB) — the only new dependency this version
- **Export `.cues` button** in the cue zone header (alongside existing export JSON button), with title tooltip explaining bundle contents
- **Alpine.js reactive cue table** (`index.html`, `js/cue-editor.js`, `js/app.js`) — `<tbody>` now uses `x-for` + `Alpine.store('player')` instead of full innerHTML teardown on every edit. O(1) active-row updates via `:class` binding; `_editing` guard prevents store push while inline inputs are open
- **Interpreter Web Worker** (`js/interpreter-worker.js`) — all PDF parsing moved off the main thread. Worker receives `{url, numPages}`, runs full `_extractPage → _joinItems → _classify → _parse` pipeline, writes IndexedDB, postMessages result back. Main thread becomes a thin shell; `_analyzeFallback()` for file:// protocol environments
- **CSS `@layer` architecture** — cascade fully explicit: `@layer tokens, base, components, audio-bar, screen, compose`. Eliminates all specificity overrides. `--vol-fill` token added; last `!important` removed
- **Inline track assignment** — click any track cell in the cue table → `<select>` populated from `STATE.tracks`. Commits on change, cancels on blur
- **Inline timestamp scrub** — click any "Cue In" cell → `<input type="number">`. Enter commits, Escape cancels, redraws waveform markers on commit
- **Scene band labels** — each waveform scene band shows its label (e.g. "ACT II") on hover; Geist Mono, positioned bottom-left, fades in with CSS
- **Interpreter panel** — collapsible panel in the waveform zone showing scene count, character count, and character chips (max 30 + "+N more"). Toggled by info button in `.z-hdr`. Hidden until interpreter fires
- **Fuse.js 7** fuzzy search over cue scene/track/note fields — search input in cue zone header, threshold 0.35, `ignoreLocation: true`
- **Hotkeys.js 3** keyboard manager — replaces raw `keydown` switch; auto-ignores inputs/textareas. All shortcuts unchanged externally

### Changed
- **rAF 60fps progress bar** — `_tick()` (250ms) now only calls `_checkCues()`; separate `_rafLoop()` using `requestAnimationFrame` drives `renderProgress()` at display refresh rate
- **`CueEditor.render()`** — Alpine fast path pushes enriched cue array (with `_color`, `_trackLabel`, `_timeLabel`, `_idx` fields) to `Alpine.store('player').cues`; DOM teardown runs only as fallback when Alpine is unavailable
- **`CueEditor.setActive()`** — updates `Alpine.store('player').currentCue` in addition to STATE; `_refreshActiveRow()` skipped when Alpine is managing the table
- **Audio error state** — visual error overlay added to `#wave-box` when `tracks.json` fails to load (`.audio-error::after` CSS); previously only a label text change

### Infrastructure
- **Container queries** — `.r-pane` gets `container-type: inline-size`; Scene + Track columns auto-hide at ≤320px; interpreter panel hides at ≤420px. Zero JS. Chrome 105+, Firefox 110+, Safari 16+
- **`PATHS` configurable** — `bundle-loader.js` patches `document.body` data attributes before the init chain runs, making all asset paths swappable without touching JS

---

## v1.3.0 — Waveform Cue Markers + Interpreter Encoding Fix
*2026-04-06*

### Added
- **SoundCloud-style cue markers** (`js/waveform.js`) — scene-colored dot + 1px vertical line on the waveform body, positioned by audio timestamp (falls back to page-based position when no duration is known). Hover tooltip shows track name, page, and director note. Silence cues render faded.
- `Waveform.renderCueMarkers(cues, scenes)` — builds and caches all marker elements into `_markerMap` (cueIdx → element); called on Wavesurfer `ready` and from `app.js` after `loadCues()`
- `Waveform.highlightCueMarker(idx)` — O(1) active-state toggle; called by `CueEditor.setActive()` so waveform marker and cue table row always move together
- `_joinItems()` in `js/interpreter.js` — x-gap detection for per-character PDF encoding: if the gap between consecutive text items is less than half a character-width, they are joined without a space, preventing `"B O R I N G"` output from character-per-item PDFs

### Changed
- **`CueEditor.setActive()`** — now calls `Waveform.highlightCueMarker(cueIdx)` after updating the table row
- **`Waveform.renderPins()` / `highlightPin()`** — pin highlight is now O(1) using a cached `_pinMap` (page → element); previously called `querySelectorAll('.pin')` on every 250ms render tick
- **`CACHE_VERSION`** bumped to 4 — auto-invalidates stale IndexedDB results from before the `_joinItems` fix

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
