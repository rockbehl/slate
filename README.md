# SLATE · v3.0.0-alpha

A private screening room for reading a screenplay while music plays underneath. Built with line-level cue awareness, HTML text rendering, and character color palettes.

No frameworks. No build step. Drop in a PDF and an audio file, open a browser.

---

## What it does

SLATE has three modes:

**Screen** (v3: In-Focus Reader) — Teleprompter-style focus lane showing ~7 lines with adaptive opacity gradient. As you read (or as audio drives), the focus line remains fixed and the page scrolls beneath. Character names are tinted, scene headings are dimmed. Free Read mode lets you pace yourself; Synced mode auto-scrolls with the music. Press `→`/`←` to turn pages, `↓`/`↑` to step lines, `Space` to play/pause, `F` for fullscreen.

**Compose** — Split workspace. Screenplay on the left, waveform timeline + cue table + scene editor + page notes on the right. Drag the divider. Click a cue row to jump; edit notes, track assignments, timestamps, fade-in, and fade-out inline. Click a line in the screenplay to author a cue starting from that line, or press `C` to create. Export the cue list as JSON or as a portable `.cues` bundle.

**Reel** — Bird's-eye scene overview (v2.x feature, works with v3). All scenes as cards showing page range, cue count, and character presence. Click a card to jump to that scene in Screen mode. Active card tracks your current page.

---

## Setup

### Option A — Manual (individual files)

**1. Add your files**

```
assets/screenplay/screenplay.pdf   ← your screenplay
assets/audio/your-track.wav        ← your audio (any format)
```

**2. Register the audio track**

Edit `assets/audio/tracks.json`:

```json
[
  {
    "id":     "your-track-id",
    "file":   "your-track.wav",
    "title":  "Track Title",
    "artist": "Artist Name"
  }
]
```

**3. Edit `cues.json`** — map pages to timestamps:

```json
{
  "scenes": [
    { "id": "act1", "label": "ACT I", "fromPage": 1, "toPage": 30, "color": "#5b8db5" }
  ],
  "cues": [
    {
      "page":    1,
      "scene":   "INT. APARTMENT — DAWN",
      "track":   "your-track-id",
      "at":      0,
      "fadeIn":  2.0,
      "fadeOut": 2.0,
      "note":    "Opens quietly."
    }
  ]
}
```

Set `"track": ""` and `"at": null` for silence markers.

**4. Serve and open**

```bash
cd slate
python3 -m http.server 8000
# open http://localhost:8000
```

> PDF loading requires a local server. Everything else works by opening `index.html` directly.

---

### Option B — `.cues` bundle

A `.cues` file packages everything into one portable ZIP: screenplay, audio, and cues.

**To open a bundle:**
- Drag a `.cues` file onto any SLATE window, or
- Open `http://localhost:8000?bundle=path/to/project.cues`

**To create a bundle:**
- In Compose mode, click the `⊕` button in the cue zone header (next to the JSON export button)
- The bundle downloads as `<project-name>.cues`

> **Note:** WAV files make large bundles (~50–60MB). Converting audio to MP3 reduces bundle size to ~4–8MB.

**Bundle contents:**

```
project-name.cues  (ZIP)
├── manifest.json       ← version, metadata, file pointers
├── cues.json           ← scenes + cue definitions
├── tracks.json         ← audio track metadata
├── screenplay.pdf      ← the screenplay
└── audio/
    └── track.wav/mp3
```

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `→` / `←` | Next / previous page |
| `↓` / `↑` | (In-Focus Reader) Step down / up one line |
| `PageDown` / `PageUp` | Jump to next / previous scene |
| `Space` | Play / pause |
| `[` / `]` | Previous / next cue |
| `S` | Switch to Screen mode |
| `C` | Switch to Compose mode (or, while a line is selected, create a new cue from that line) |
| `R` | Switch to Reel mode |
| `F` | Toggle fullscreen |
| `M` | Add a note to the current page |

---

## Compose mode — inline editing

| Action | How |
|--------|-----|
| Jump to page | Click any cue row |
| Edit note | Click the note cell → type → Enter or click away |
| Change track | Click the track cell → select from dropdown |
| Set timestamp | Click the "Cue In" cell → type seconds → Enter |
| Delete cue | Hover row → click `×` |
| Search cues | Type in the search box (fuzzy: scene, track, note) |
| Suggest cues | Click "Suggest" after the screenplay loads (uses interpreter) |
| Export JSON | Click the ↓ button |
| Export bundle | Click the ⊕ button |

---

## Cue file reference (v3)

```json
{
  "scenes": [
    {
      "id":       "act1",
      "label":    "ACT I",
      "fromPage": 1,
      "toPage":   30,
      "color":    "#5b8db5"
    }
  ],
  "cues": [
    {
      "page":         12,
      "line":         0,
      "lineSpecific": false,
      "track":        "your-track-id",
      "at":           94,
      "fadeIn":       1.5,
      "fadeOut":      2.0,
      "note":         "Optional director note."
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `page` | number | 1-indexed page number |
| `line` | number | 0-indexed line within the page (0 = page-level) |
| `lineSpecific` | boolean | True: fires when line enters focus (Synced) or on page entry (Free Read); False: fires on page entry only. Default false. |
| `track` | string | ID from `tracks.json`. Empty string = silence |
| `at` | number \| null | Timestamp in seconds. `null` = silence marker |
| `fadeIn` | number | Fade-in duration in seconds |
| `fadeOut` | number | Fade-out duration in seconds |
| `note` | string | Director/editor note, visible in cue table |

---

## Rendering mode

By default, SLATE renders screenplays as **HTML text** using the line data from the Interpreter. This enables line-level cue awareness, character color palettes, and the In-Focus Reader in Screen mode.

For side-by-side comparison or if you prefer the original PDF canvas rendering, append `?canvas=1` to the URL to force canvas mode.

## Swapping assets without editing JS

The PDF, cue file, and tracks file paths are all configurable via `<body>` data attributes in `index.html`:

```html
<body
  data-pdf="assets/screenplay/screenplay.pdf"
  data-cues="cues.json"
  data-tracks="assets/audio/tracks.json"
>
```

Change these to point at any files — no JS edits needed.

---

## Dependencies

All loaded via CDN. No install required.

| Library | Version | Used for |
|---------|---------|----------|
| [PDF.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Screenplay rendering |
| [Howler.js](https://howlerjs.com) | 2.2.4 | Audio playback + cue timing |
| [Wavesurfer.js](https://wavesurfer.xyz) | 7.8.2 | Waveform visualization |
| [Fuse.js](https://www.fusejs.io) | 7 | Fuzzy cue search |
| [Hotkeys.js](https://github.com/jaywcjlove/hotkeys-js) | 3 | Keyboard shortcut manager |
| [Alpine.js](https://alpinejs.dev) | 3 | Reactive cue table |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | `.cues` bundle read/write |

---

## Audio format support

Any format your browser supports: `.wav`, `.mp3`, `.ogg`, `.flac`, `.aac`, `.m4a`, `.opus`, `.webm`. Filenames with spaces and special characters are handled automatically.

---

## Single-track mode

If `tracks.json` contains exactly one entry, that track plays for all cues automatically — no need to set `"track"` on individual cues.

---

*Built for private use. Designed for one screenplay at a time.*
