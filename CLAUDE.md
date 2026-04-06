# SLATE — Claude Code Context

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

## Current build phase: Phase 1 → Phase 2

### ✅ Done (design/mockup phase)
- Design language locked (Palette A: Film Archive)
- Mockup v3 completed — see `mockup-v3.html` in the parent directory
- Project scaffolded — this is where you are now

### 🔨 Phase 1 — Core Shell (START HERE)
Goal: Load the real screenplay PDF and render it page-by-page in Screen mode.

**Tasks:**
1. Integrate **PDF.js** (CDN: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`)
2. Replace the dummy HTML screenplay content in `index.html` with a PDF canvas renderer
3. The PDF should live at `assets/screenplay/screenplay.pdf`
4. Page navigation (arrow keys, on-screen nav buttons) advances the canvas
5. The screenplay canvas should be scrollable within the `.screen-scroll` container
6. Match the existing visual style: cream page, centered, drop shadow, page number in corner
7. Screen mode should be fullscreen-ready (no layout breaks)

**Key file:** `js/pdf-engine.js` — all PDF.js logic goes here. See stubs.

### 🔜 Phase 2 — Audio Engine
Goal: Real audio playback with cue-point syncing.

**Tasks:**
1. Integrate **Howler.js** (CDN: `https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js`)
2. Load audio files from `assets/audio/`
3. Wire the floating audio bar (play/pause, scrub, volume) to real playback
4. Implement the cue engine: read `cues.json`, fire page-advance events when timestamps hit
5. "Now playing" whisper fades in when a new cue starts
6. Auto-advance is optional (toggleable)

**Key file:** `js/audio-engine.js` — all Howler.js logic goes here. See stubs.

### 🔜 Phase 3 — Compose Mode
Goal: Split-pane workspace with real waveform, editable cue table, notes.

**Tasks:**
1. Integrate **Wavesurfer.js** (CDN: `https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/7.8.2/wavesurfer.min.js`)
2. Render the real audio waveform in `.wave-box`
3. Page marker pins on the waveform at each cue point
4. Scene colour bands behind the waveform (defined in `cues.json` → `scenes[]`)
5. Clicking the waveform scrubs both audio and page position
6. Cue table rows are editable inline (click a note field to edit)
7. "Add Cue" button opens an inline form: page number, track, timestamp, note
8. Changes save to `cues.json` (or localStorage as a fallback)

**Key file:** `js/waveform.js` and `js/cue-editor.js` — see stubs.

### 🔜 Phase 4 — Polish
- Mode transition animations (panels slide/crossfade)
- Fullscreen mode (`F` key)
- Export cues as JSON download
- Error states (missing PDF, missing audio)
- Loading state while PDF.js initialises

### 🔜 Phase 5 — Reel Foundation
- `reel/prep-reel.js` preprocesses the PDF into structured scene JSON
- One-time script, run manually
- Output: `reel/reel-data.json`

---

## File structure

```
slate/
├── CLAUDE.md               ← YOU ARE HERE
├── index.html              ← Entry point, all mode shells
├── cues.json               ← The brain: page↔audio mappings + scene data
│
├── css/
│   ├── tokens.css          ← Design tokens (colours, spacing, fonts)
│   ├── base.css            ← Reset, body, typography, screenplay page
│   ├── components.css      ← Shared UI (buttons, badges, nav)
│   ├── audio-bar.css       ← Floating player pill
│   ├── screen.css          ← Screen mode layout
│   └── compose.css         ← Compose mode layout (panels, waveform, cue table)
│
├── js/
│   ├── app.js              ← State, mode switching, keyboard shortcuts
│   ├── pdf-engine.js       ← PDF.js wrapper — Phase 1
│   ├── audio-engine.js     ← Howler.js + cue system — Phase 2
│   ├── waveform.js         ← Wavesurfer.js — Phase 3
│   └── cue-editor.js       ← Cue add/edit/delete/notes — Phase 3
│
├── assets/
│   ├── screenplay/
│   │   └── screenplay.pdf  ← DROP PDF HERE
│   └── audio/
│       └── (mp3/wav files) ← DROP AUDIO HERE
│
└── reel/
    └── prep-reel.js        ← Phase 5 preprocessing script (stub)
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
    mode:       'screen',   // 'screen' | 'compose'
    currentPage: 1,         // 1-indexed
    totalPages:  92,        // set by pdf-engine after load
    playing:     false,
    progress:    0,         // 0–100
    currentCue:  null,      // index into cues.json
    cues:        [],        // loaded from cues.json
    scenes:      [],        // loaded from cues.json
};
```

---

## cues.json format

```json
{
  "scenes": [
    { "id": "act1",  "label": "ACT I",   "fromPage": 1,  "toPage": 30,  "color": "#5b8db5" },
    { "id": "act2",  "label": "ACT II",  "fromPage": 31, "toPage": 70,  "color": "#b58c5b" },
    { "id": "act3",  "label": "ACT III", "fromPage": 71, "toPage": 92,  "color": "#5bb58c" }
  ],
  "cues": [
    {
      "page":    1,
      "track":   "arrival-of-the-birds.mp3",
      "at":      0,
      "fadeIn":  1.5,
      "fadeOut": 2.0,
      "note":    "Silence first. Piano enters slowly. Hold before title card."
    }
  ]
}
```

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
