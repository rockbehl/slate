# SLATE — Feature Tracker

Active work and upcoming items. Updated as features ship.

---

## ✅ Shipped

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
- **DOM caching** — `_dom` object eliminates repeated `getElementById` in hot paths
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

### Test Suite (`test/index.html`)
- In-browser runner (open via `http://localhost:8000/test/`)
- 50+ assertions: classifier, line grouping, cache key, time formatting, HTML escaping, scene lookup, regressions

---

## 🔨 In Progress

### GitHub Push
- Remote: `https://github.com/rockbehl/slate.git`
- **Blocked** — needs authentication (SSH key or PAT)
- All commits local and ready

---

## 🔜 Up Next

### Wavesurfer Regions Plugin (Tier 3)
- Replace hand-rolled `.cue-marker` + `.s-band` DOM with Wavesurfer v7 native Regions
- Draggable cue markers → update `cue.at` live on drag end
- CDN: `https://unpkg.com/wavesurfer.js@7/dist/plugins/regions.min.js`
- **Requires real audio** (needs duration from Wavesurfer `ready` event)
- Real audio is present (`assets/audio/Teri Aisi Sazaa 0.2.wav`) — this is unblocked

### Phase 5 — Reel Prep
- `reel/prep-reel.js` — one-time script using interpreter output → `reel/reel-data.json`
- Scene-level metadata, character index, page transition timing

### PDF Engine — Multi-page Scroll (Screen Mode)
- All pages scrolled vertically instead of one-at-a-time
- Requires switching from single `<canvas>` to virtual scroll with lazy-rendered canvases
- Significant `pdf-engine.js` rewrite

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
