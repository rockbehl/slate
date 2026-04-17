# SLATE — Feature Tracker

Updated as features ship. See `V3_PLAN.md` for the full v3 roadmap and design decisions.

---

## 🚧 v3.0.0 — In Progress

### Phases 1–2 ✅ Complete

**Phase 1: Line Data Pipeline** — Interpreter now persists full line array in `pages[n].lines[]` with stable IDs, text, type, and coordinates. Added `getLinesForPage(n)` and `diagnoseLines(n)` public API. Cache version → 5.

**Phase 2: HTML Text Renderer** — New `text-renderer.js` renders pages as DOM using existing `.sp-*` CSS classes. Canvas fallback via `?canvas=1` or when interpreter not ready. `goToPage()` now calls `TextRenderer.renderPage(n)` as primary.

### Phases 3–8 🔵 Coming Soon

**Phase 3: Cue Schema Extension** — Extend cues.json: add `line` + `lineSpecific` fields. Migration on load defaults to page-level cues.

**Phase 4: Playback Engine Update** — Rework cue firing: respect Free Read toggle; line-specific cues skip in Free Read mode.

**Phase 5: Line Cue Authoring GUI** — Click a line → `.sp-selected` highlight; press `C` → popover to set timestamp and create cue from that line.

**Phase 6: In-Focus Reader + Free Read Toggle** — Screen mode becomes teleprompter with ~7-line focus lane at 40% viewport. Opacity gradient 1.0 → 0.85 → 0.55 → 0.25 → 0. Free Read toggle in audio bar. Adaptive auto-scroll rate (lines/sec, user-capped).

**Phase 7: Character Color Palette** — Characters assigned stable colors from 12-color desaturated palette; inject CSS custom properties per char; only character names and cue lines colored, dialogue stays black.

**Phase 8: Documentation Alignment** — Update CLAUDE.md, README, FEATURES, CHANGELOG, auditor spec, and memory files to reflect v3 architecture.

---

## ✅ v2.x Archive (canvas era)

### Core Shell — Phases 1–4
- **PDF Engine** (`js/pdf-engine.js`) — PDF.js rendering, retina canvas, debounced resize, loading/error states
- **Audio Engine** (`js/audio-engine.js`) — Howler.js playback, 250ms cue polling, fade in/out, single-track mode, volume control, visual error state when `tracks.json` missing
- **Waveform** (`js/waveform.js`) — Wavesurfer.js v7, muted mirror, procedural fallback bars, scene colour bands w/ hover labels, cue pins (O(1) highlight via `_pinMap`), SoundCloud-style cue markers (`_markerMap`), click-to-seek
- **Compose Mode** — split pane (24–64% drag), container-query-adaptive right pane, editable cue table, page notes, waveform zone
- **Screen Mode** — single-page reader, keyboard nav, fullscreen (F key + button)
- **Mode transition** — CSS scale+fade crossfade with 60ms cinematic delay
- **Fullscreen** — `F` key, `requestFullscreen` API, UI chrome fades on hover

### Infrastructure
- **CSS `@layer`** — explicit cascade: `tokens → base → components → audio-bar → screen → compose`; no `!important`, no specificity patches
- **rAF 60fps progress** — `_rafLoop()` drives progress bar at display refresh rate; 250ms `setInterval` for cue detection only
- **DOM caching** — `_dom` object eliminates repeated `getElementById` in hot paths; includes `volTrack`/`volFill`
- **`_prevHead` memoization** — rAF bar loop touches 0 bars when paused, 2 bars when moving (was full-array scan every frame)
- **Hotkeys.js 3** — keyboard manager; auto-ignores inputs/textareas
- **Container queries** — `.r-pane` adapts at ≤320px (hides Scene/Track columns) and ≤420px (hides interpreter panel)

### Alpine.js Reactive Cue Table
- `<tbody x-data>` with `x-for` template — diffs on update, no full teardown
- `Alpine.store('player')` — `{ currentCue, cues[] }` reactive store
- `:class="{ active: idx === $store.player.currentCue }"` on each row
- `_editing` guard — blocks store push while inline textarea/input/select is open
- Alpine bridge: `_alpineDelete`, `_alpineEditNote`, `_alpineEdit` on public API

### Cue Editor
- Inline note editing (click note cell → textarea, Enter/Escape)
- Inline track assignment (click track cell → `<select>` from `STATE.tracks`)
- Inline timestamp scrub (click Cue In cell → number input, seconds)
- Delete button per row (hover to reveal)
- Empty-state row with instructions
- `suggestCues()` — imports interpreter stubs; `_pendingSuggest` auto-fires when ready
- `onInterpreterReady()` hook — Suggest button turns amber with scene count
- **Fuse.js 7** fuzzy search — `scene`, `track`, `note` fields; threshold 0.35
- Export cues as JSON download
- **Export `.cues` bundle** — JSZip round-trip packaging screenplay + audio + cues

### Screenplay Interpreter (`js/interpreter.js` + `js/interpreter-worker.js`)
- Web Worker — full parse pipeline off main thread; `_analyzeFallback()` for file:// environments
- Text extraction via PDF.js `getTextContent()`
- X-position classifier: scene / character / dialog / parenthetical / transition / action
- `CHAR_BLACKLIST` — filters structural all-caps tokens
- IndexedDB cache (`slate_interpreter` DB); `CACHE_VERSION` 4
- Scanned PDF detection (samples pages 1–3)
- Batched extraction (8 pages/batch) with `setTimeout(0)` yields
- `suggestedCues[]` — one stub per scene, ready to import
- `_joinItems()` — x-gap detection for per-character PDF encoding
- Interpreter panel — scene count, character chips; collapsible via info button

### `.cues` Bundle Format (`js/bundle-loader.js`)
- ZIP container: `manifest.json` + `cues.json` + `tracks.json` + `screenplay.pdf` + `audio/`
- Read path: drag-drop or `?bundle=` param → JSZip unzip → blob: URLs → existing engines unchanged
- Write path: `CueEditor.exportBundle()` → fetches all assets → DEFLATE compress → download
- `AudioEngine._patchTracksFromBundle()` — blob: URL injection bypasses tracks.json fetch
- Drop overlay: full-window, amber, fade-in on dragover

### `cues-creator.html` — Standalone Bundle Creator
- Self-contained HTML tool (no server needed) for building `.cues` bundles from scratch
- PDF drop zone → PDF.js renders page 1 thumbnail, reads page count
- Audio multi-drop → duration via `new Audio()`, track list with delete
- Scenes CRUD — color swatch picker (8 presets), label, page range; auto-seeds 3 acts
- Cue table — inline-editable page, timestamp, track (select), note
- JSZip export → downloads real `.cues` ZIP

### Scenes Editor (`js/scenes-editor.js`)
- Scene CRUD in Compose right pane — color swatch cycling (8 presets), label, page range, delete
- Event delegation (one listener on container, not per-row)
- `syncFromInterpreter()` — seeds scenes from interpreter parse if none defined; page-bounds clamped
- `--error` / `--error-hover` tokens added for destructive action states
- `ScenesEditor.syncFromInterpreter()` wired into `CueEditor.onInterpreterReady`

### Sprint B — Screen Mode Polish Pack

- **Scene-aware ambient tint** — `goToPage()` looks up current scene, sets `--scene-tint` on `<html>`; `color-mix(in srgb, #070707 96%, <scene-color> 4%)` applied to `--bg`; CSS transition crossfades between scenes; "just enough to notice"
- **Scene transition whisper** — page crossing a scene boundary fires `showNowPlaying(scene.label)`, reusing existing whisper infrastructure at zero cost
- **Canvas crossfade on page turn** — `renderPage()` resets canvas `opacity` to `0` before drawing; CSS transition brings it to `1`; no JS animation, one rule in `screen.css`

### Sprint D — Reel Mode MVP

- **`js/reel-engine.js`** — `init()`, `render()`, `highlightCard(sceneIdx)`; scene cards grid built from `STATE.scenes`; each card shows scene color top border, label, page range, cue count, character count, mini progress bar; click → `setMode('screen'); goToPage(scene.fromPage)`
- **`css/reel.css`** — grid layout, card hover/focus states, color border accent, amber highlight on active card
- **Nav button unlocked** — Reel nav button in `index.html` enabled; `R` hotkey registered in `app.js`; `setMode('reel')` follows same pattern as Compose

### Screen Mode — Scrolling Gradient Backdrop

- **`#screen::before` dual radial gradient** — two overlapping radial gradients create a cinematic vignette behind the screenplay page
- **Vertical drift via `--page-pct`** — CSS custom property (0→1, updated on each `goToPage()`) shifts gradient center vertically as you progress through the screenplay
- **Slow breath animation** — 9s `@keyframes` opacity cycle on the pseudo-element; subtle pulse, never distracting
- **Scene-color-aware** — gradient incorporates `--scene-tint` so the ambient color tracks the current act
- **New tokens** — `--page-pct` and `--scene-tint` added to `css/tokens.css` as live state properties

### Design Language Refresh (v2.1.0)
- Font: Inter → **Syne** (geometric, instrument-software quality)
- Transitions: flat `ease` → `cubic-bezier(0.16, 1, 0.3, 1)` expo-out throughout; `--t-reveal` for fades
- Ambient opacity: `.35` → `.26` (sharper quiet/active contrast)
- Micro-transforms: `.ib`, `.nb`, `.ghost-btn` scale on hover/press
- Mode switcher underline slides in from center
- `.float-bar.playing`: amber border corona + shadow when audio active
- Progress fill read-head: scanning glow at leading edge when playing
- Now-playing whisper: slides down from `translateY(-6px)`; opacity CSS-driven (`.visible` class)
- Comment box: `translateY(4px)` → `0` drop-in on open

### Test Suite (`test/index.html`)
- In-browser runner (open via `http://localhost:8000/test/`)
- 50+ assertions: classifier, line grouping, cache key, time formatting, HTML escaping, scene lookup, regressions

---

## 🔨 In Progress

*(Nothing active — v2.1.0 fully shipped. Next sprint below.)*

---

## 🔜 Sprint: Compose → Creator Pivot

**Goal:** Compose mode becomes the single authoring environment. Drop files in, define scenes, set cues, export — without ever leaving `index.html`. `cues-creator.html` becomes a redirect entry point once parity is reached.

### What's missing from Compose (has it in cues-creator.html)

| Feature | cues-creator.html | Compose |
|---------|------------------|---------|
| PDF drag-drop intake | ✅ | ✅ shipped v2.2.0 |
| Audio drag-drop (multi-file) | ✅ | ✅ shipped v2.2.0 |
| Project name input | ✅ | ✅ shipped v2.2.0 |
| Scenes CRUD editor | ✅ | ✅ shipped v2.1.0 |
| Scene color picker (8 swatches) | ✅ | ✅ shipped v2.1.0 |
| `fadeIn` / `fadeOut` cue columns | ✅ | ✅ shipped v2.3.0 |

### ✅ 1. Project Intake Strip (top of right pane, collapses after files loaded) — **shipped v2.2.0**
- New `js/project-intake.js` — PDF drop → `PDFEngine.load(blobUrl)`; audio drop → `AudioEngine._addTrackFromFile(file)`
- Project name input → `STATE.projectName`; persists in `manifest.json` on export
- Collapse state persisted in localStorage
- **New section in `index.html`** — `.intake-strip` at top of `.r-pane`
- **New CSS in `compose.css`** — `.intake-strip`, `.intake-drop`, `.intake-track-list`
- **New method in `audio-engine.js`** — `_addTrackFromFile(file)` → Howl from blob URL → updates `STATE.tracks` → `CueEditor.render()`

### 3. fadeIn / fadeOut Cue Columns
- Two new columns in `<thead>` and Alpine `x-for` template (same inline input pattern as `at-td`)
- `_buildAlpineCues()` adds `_fadeInLabel`, `_fadeOutLabel` fields
- Collapse via container query at narrow widths (same pattern as Scene/Track columns)

### Execution order
1. ~~Scenes editor~~ ✅ shipped v2.1.0
2. Intake strip + `_addTrackFromFile`
3. `fadeIn`/`fadeOut` columns

---

## ✅ Tier 3 — Wavesurfer Regions (shipped v2.3.0)

- WS7 RegionsPlugin loaded from CDN; registered in `Waveform.init()`
- `renderCueMarkers()` uses native regions when plugin + audio duration available; falls back to DOM markers
- Draggable cue pins → `region.on('update-end')` writes `cue.at` back to STATE + `CueEditor.save()`
- `.cue-region` CSS mirrors `.cue-marker` pin appearance (stem, dot, tooltip, active/tbd states)
- Resize handles hidden — regions behave as point markers, not ranges

---

## 🔭 Screen Mode — Roadmap

### Near-term

*(Sprint B items shipped — see Shipped section above.)*

### Long-term (no timeline)

**Multi-page vertical scroll**
- Replace single `#screen-canvas` with virtual-scroll container of lazy-rendered canvases
- `IntersectionObserver` triggers `PDFEngine.renderPage(n)` as each canvas enters viewport
- Audio playhead drives scroll position when playing; user scroll breaks sync
- Requires significant `pdf-engine.js` rewrite — dedicated session
- New module: `js/screen-scroll-engine.js`

**Typography / text mode**
- Render `getTextContent()` output as formatted HTML instead of rasterized canvas
- Crisper at any screen size, selectable text, true dark-mode ink
- Blocked on: interpreter X-threshold accuracy must be near-perfect first

**Ambient audio-reactive glow**
- Web Audio API `AnalyserNode` → amplitude drives vignette glow behind screenplay page
- Purely aesthetic; lowest priority

---

## 🔭 Reel Mode — Architecture & Roadmap

Reel is a **scene-level navigator and visualizer** — not a reader, not an editor. Bird's-eye view of the entire project: all scenes laid out, character presence, cue density, mini-waveform.

### Why it matters
The interpreter already extracts everything needed (`scenes[]`, `characters[]`, `pageMap{}`). Reel is the UI surface that makes that data useful — a table of contents you can hear.

### Data shape (`reel/reel-data.json`)
Produced by `reel/prep-reel.js` (one-time script, entirely derivable from `STATE.interpreterData`):
```json
{
  "scenes": [
    {
      "id": "act1", "label": "ACT I", "fromPage": 1, "toPage": 30, "color": "#5b8db5",
      "characters": ["MAYA", "DR. CHEN"], "cueCount": 8,
      "transitions": ["FADE IN:", "CUT TO:"], "thumbnail": null
    }
  ],
  "characters": [
    { "name": "MAYA", "firstPage": 3, "scenes": ["act1", "act2", "act3"] }
  ]
}
```

### MVP — Scene Cards Grid
```
[ ACT I          ]  [ ACT II         ]  [ ACT III        ]
[ pp 1–30        ]  [ pp 31–70       ]  [ pp 71–92       ]
[ 8 cues · 4 ch  ]  [ 12 cues · 6 ch ]  [ 5 cues · 3 ch  ]
[ ████████░░░░░░ ]  [ ████████████░░ ]  [ █████░░░░░░░░░ ]
  click to enter
```

Each card: scene color top border, label, page range, cue count, character count, mini progress bar.  
Click → `setMode('screen'); goToPage(scene.fromPage)`.

- New module: `js/reel-engine.js` — `init()`, `render()`, `highlightCard(sceneIdx)`
- `#reel` div already exists in `index.html` (locked nav button placeholder)
- `setMode('reel')` follows same pattern as Compose
- New CSS file: `css/reel.css`

### Full vision (no timeline)
**Horizontal timeline layout**
- Scene segments as colored blocks proportional to page count
- Cue markers as vertical ticks below the scene track
- Character presence bars — horizontal per character, showing which scenes they appear in
- Mini waveform (Wavesurfer) synced underneath
- Scrub: click any point → jump to page + seek audio

### Execution order
1. `reel/prep-reel.js` — materialize `reel-data.json` from interpreter
2. ~~`js/reel-engine.js` — scene cards render, click-to-jump~~ ✅ shipped Sprint D
3. ~~Wire `setMode('reel')` in `app.js`, unlock the nav button~~ ✅ shipped Sprint D
4. Full timeline layout — separate session

---

## 🧪 Test Coverage

| Area | Status |
|------|--------|
| Interpreter `_classify` | ✅ 20+ cases |
| Interpreter `_itemsToLines` | ✅ 6 cases incl. 1pt regression |
| Interpreter `_joinItems` | ✅ 5 cases |
| Interpreter `_cacheKey` | ✅ 2 cases |
| CueEditor `_formatTime` | ✅ 7 cases |
| CueEditor `_esc` | ✅ 7 cases |
| CueEditor `_sceneForPage` | ✅ 6 cases |
| Regressions | ✅ 2 cases |
| AudioEngine `_cueForPage` | ❌ not yet |
| AudioEngine `_checkCues` | ❌ not yet |
| Interpreter `_parse` (full) | ❌ needs fixture PDF text |
| Waveform `syncPlayhead` | ❌ browser-only, needs Wavesurfer mock |
| BundleLoader round-trip | ❌ not yet |

---

## 🔒 Design Constraints (don't change)

1. No npm, no bundler, no build step — CDN only
2. Floating audio pill — never full-width
3. Thin SVG stroke icons only
4. Screenplay page is the only heavy element
5. All UI chrome at reduced opacity until hovered/active
