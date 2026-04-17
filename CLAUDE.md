# SLATE — Claude Code Context

> **⚠️ Active architectural pivot — read [`V3_PLAN.md`](./V3_PLAN.md) before starting work.**
> SLATE is pivoting from PDF-canvas + page-level cues to HTML text rendering + line-level cues (In-Focus Reader, Free Read mode, character color palette). The sections below describe the pre-pivot v2.x architecture; they will be updated per Phase 8 of `V3_PLAN.md`. When in doubt, `V3_PLAN.md` is the source of truth.

## What this is
SLATE is a web-based screenplay reader with synchronized audio playback. It is a personal creative tool — not a SaaS product. Think of it as a private screening room where you read a script while music plays underneath, synced to specific scenes.

The project has **three modes** (Screen, Compose, Reel) but **only Screen and Compose are being built right now**. Reel mode infrastructure exists in `/reel/` as a future foundation.

---

## Design philosophy
**"Just enough to notice, just enough to blend in."**

The screenplay is always the hero. Every UI element — the audio player, the mode toggle, the waveform, the cue table — should feel like it's floating. Quiet until needed. The design language is:

- Near-black background (`#070707`)
- Warm amber accent (`#c9a84c`) used sparingly — only for active/important states
- Everything at reduced opacity until hovered or active
- No filled panels, no heavy borders — surfaces are transparent or near-transparent
- The only element with real visual weight is the screenplay page itself (cream paper, drop shadow)
- Floating audio pill at bottom center (not a full-width bar)
- All transport icons are **thin SVG strokes** — never filled, never bold

See `css/tokens.css` for all design tokens.

---

## Current build phase: v3.0.0 — Line-Aware Architecture

v3 is an architectural pivot from PDF-canvas (page-level cues) to HTML text rendering (line-level cues). See `V3_PLAN.md` for the full specification.

### Phase Status (per V3_PLAN.md checklist)

- **Phase 1: Line Data Pipeline** 🟢 DONE
  - `js/interpreter.js` + `js/interpreter-worker.js` now persist full line array in `pages[n].lines`
  - Line structure: `{ id: 'p{page}_l{idx}', text, type, x, y, char? }`
  - Types: `scene | character | dialog | parenthetical | action | transition`
  - New API: `Interpreter.getLinesForPage(n)`, `Interpreter.diagnoseLines(n)`
  - `CACHE_VERSION` → 5

- **Phase 2: HTML Text Renderer** 🟢 DONE
  - New `js/text-renderer.js` renders page lines as DOM using existing `.sp-*` CSS classes
  - Canvas fallback: `?canvas=1` URL param or when interpreter not ready
  - `goToPage()` in `js/app.js` now calls `TextRenderer.renderPage(n)` as primary path
  - Interpreter re-renders current page when analysis completes

- **Phase 3: Cue Schema Extension** 🔵 IN PROGRESS
  - Add `line: number` and `lineSpecific: boolean` to each cue
  - Migration on load: missing fields default to `{line: 0, lineSpecific: false}` (page-level)
  - **File:** `js/cue-editor.js` line 28; `cues.json` schema updated below

- **Phase 4–8:** See `V3_PLAN.md` for full phase breakdown (Playback engine, Line cue authoring, In-Focus Reader, Character palette, Documentation alignment)

---

## File structure

```
slate/
├── CLAUDE.md               ← YOU ARE HERE
├── V3_PLAN.md              ← Source of truth for v3 phases + decisions
├── index.html              ← Entry point, all mode shells
├── cues.json               ← Page + line level cues + scene definitions
│
├── css/
│   ├── tokens.css          ← Design tokens (colours, spacing, fonts)
│   ├── base.css            ← Reset, body, typography, screenplay page, .sp-* classes
│   ├── components.css      ← Shared UI (buttons, badges, nav)
│   ├── audio-bar.css       ← Floating player pill
│   ├── screen.css          ← Screen mode layout
│   └── compose.css         ← Compose mode layout (panels, waveform, cue table)
│
├── js/
│   ├── app.js              ← STATE, mode switching, keyboard shortcuts
│   ├── pdf-engine.js       ← PDF.js wrapper + canvas fallback
│   ├── interpreter.js      ← Screenplay parser: scenes, characters, lines (Web Worker)
│   ├── interpreter-worker.js ← Offthread parse pipeline
│   ├── text-renderer.js    ← HTML DOM renderer (primary, Phase 2)
│   ├── audio-engine.js     ← Howler.js playback + cue polling
│   ├── waveform.js         ← Wavesurfer.js visualization
│   └── cue-editor.js       ← Cue CRUD, inline editing, localStorage save
│
├── assets/
│   ├── screenplay/
│   │   └── screenplay.pdf  ← DROP PDF HERE
│   └── audio/
│       └── (mp3/wav files) ← DROP AUDIO HERE
│
└── reel/
    └── prep-reel.js        ← Phase 5 preprocessing: outputs reel-data.json
```

---

## Dependencies (all CDN, no install needed)

| Library       | Version  | Purpose                        | Phase |
|---------------|----------|--------------------------------|-------|
| PDF.js        | 3.11.174 | Render screenplay PDF          | 1     |
| Howler.js     | 2.2.4    | Audio playback + cue timing    | 2     |
| Wavesurfer.js | 7.8.2    | Real waveform visualization    | 3     |

Fonts: Inter + Geist Mono from Google Fonts (already in index.html).

**No npm. No bundler. No build step.** Open `index.html` in a browser.
To avoid CORS issues with PDF.js loading local files, run a local server:
```bash
cd slate
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## State model (`js/app.js`)

```js
const STATE = {
    // Core
    mode:           'screen',   // 'screen' | 'compose'
    currentPage:    1,          // 1-indexed
    totalPages:     92,         // set by pdf-engine after load
    
    // Audio
    playing:        false,
    progress:       0,          // 0–100
    currentCue:     null,       // index into cues.json
    
    // Data
    cues:           [],         // loaded from cues.json (now with line + lineSpecific)
    scenes:         [],         // loaded from cues.json
    interpreterData: null,      // { scenes, characters, pages: {n: {lines: [...]}}, ... }
    
    // v3 (Phase 3+)
    freeRead:       false,      // toggle: 'Free Read' mode vs. synced playback
    currentLine:    null,       // { page, lineIdx } | null — line in focus
    focusedLineId:  null,       // 'p{page}_l{idx}' — for scroll targeting
    autoScrollCap:  100,        // px/sec, user-settable
    selectedLineId: null,       // Compose only; click-to-select for authoring
};
```

---

## cues.json format (v3)

```json
{
  "scenes": [
    { "id": "act1",  "label": "ACT I",   "fromPage": 1,  "toPage": 30,  "color": "#5b8db5" },
    { "id": "act2",  "label": "ACT II",  "fromPage": 31, "toPage": 70,  "color": "#b58c5b" },
    { "id": "act3",  "label": "ACT III", "fromPage": 71, "toPage": 92,  "color": "#5bb58c" }
  ],
  "cues": [
    {
      "page":         1,
      "line":         0,                  // v3: line index on this page (0 = page-level cue)
      "lineSpecific": false,              // v3: true = fires only when line enters focus; false = fires on page entry
      "track":        "arrival-of-the-birds.mp3",
      "at":           0,
      "fadeIn":       1.5,
      "fadeOut":      2.0,
      "note":         "Silence first. Piano enters slowly. Hold before title card."
    }
  ]
}
```

**v3 cue behavior:**
- `lineSpecific: true` → in Synced mode, fires when that line enters the focus lane; in Free Read, ignored
- `lineSpecific: false` (or absent) → fires when user enters the page, regardless of mode
- Migration: cues lacking `line`/`lineSpecific` get `{line: 0, lineSpecific: false}` on load

---

## Key design decisions (don't change these)

1. **Floating audio bar** — always centered, never full-width, pill shape with backdrop blur
2. **Thin SVG icons only** — no emoji, no icon fonts, no filled shapes for transport controls
3. **Opacity-based hierarchy** — UI chrome at ~35–45% opacity, rises on hover
4. **No panel backgrounds in Compose** — everything transparent/near-transparent except the screenplay page
5. **Resizable split** — the drag handle between script panel and right pane is always present in Compose
6. **Screenplay page is the only heavy element** — cream bg, real drop shadow, Courier New font
7. **Geist Mono for all technical values** — timestamps, page numbers, hex values

---

## How to run

```bash
cd slate
python3 -m http.server 8000
```
Open: http://localhost:8000

Or just open `index.html` directly — everything except PDF loading works without a server.

---

## Contact / context

Built for Ranveer (rb5059@nyu.edu). This is a personal creative project.
Designed and scaffolded in Cowork / Claude. Phase 1 code starts here.
