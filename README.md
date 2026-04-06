# SLATE

A private screening room for reading a screenplay while music plays underneath — synced to scenes, page by page.

No frameworks. No build step. Drop in a PDF and an audio file, open a browser.

---

## What it does

SLATE has two modes:

**Screen** — Full-focus reader. One page at a time, nothing else visible. Audio plays underneath. Press `→` / `←` to turn pages, `Space` to play/pause, `F` for fullscreen, `M` to leave a note.

**Compose** — Split workspace. Screenplay on the left, waveform timeline + cue table + page notes on the right. Drag the divider. Click a waveform position to seek. Edit cue notes inline. Export the cue list as JSON.

---

## Setup

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

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `→` / `←` | Next / previous page |
| `Space` | Play / pause |
| `[` / `]` | Previous / next cue |
| `S` | Switch to Screen mode |
| `C` | Switch to Compose mode |
| `F` | Toggle fullscreen |
| `M` | Add a note to the current page |

---

## Cue file reference

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
      "page":    12,
      "scene":   "EXT. ROOFTOP — NIGHT",
      "track":   "your-track-id",
      "at":      94,
      "fadeIn":  1.5,
      "fadeOut": 2.0,
      "note":    "Optional director note."
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `page` | number | 1-indexed page number |
| `scene` | string | Scene heading (display only) |
| `track` | string | ID from `tracks.json`. Empty string = silence |
| `at` | number \| null | Timestamp in seconds. `null` = silence marker |
| `fadeIn` | number | Fade-in duration in seconds |
| `fadeOut` | number | Fade-out duration in seconds |
| `note` | string | Director/editor note, visible in cue table |

---

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

---

## Audio format support

Any format your browser supports: `.wav`, `.mp3`, `.ogg`, `.flac`, `.aac`, `.m4a`, `.opus`, `.webm`. Filenames with spaces and special characters are handled automatically.

---

## Single-track mode

If `tracks.json` contains exactly one entry, that track plays for all cues automatically — no need to set `"track"` on individual cues.

---

*Built for private use. Designed for one screenplay at a time.*
