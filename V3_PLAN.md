# SLATE v3 — Line-Aware Architecture

> **Status:** 🟡 Planning complete · implementation not started
> **Started:** 2026-04-16
> **Owner:** Ranveer
> **Supersedes:** v2.x canvas-rendered, page-level cue architecture

---

## 📢 For future Claude sessions

**This is the source of truth for SLATE's v3 architectural pivot.** Read this before doing any v3 work.

**When you finish a phase, update this doc:**
1. Flip the phase status from 🔵 → 🟢 (done) or 🟡 (in progress)
2. Check off the phase-level boxes in the **Phase checklist** section
3. Add a line to the **Change log** at the bottom with date, what shipped, and any decisions that drifted from this plan
4. If a decision changes mid-flight, update the relevant section in place AND log the change — do not let this doc go stale

**If you're unsure whether something fits v3:** check the "The intended behavior" and "Design decisions" sections. If it contradicts those, raise it with the user before coding.

---

## Context

A conversation with the musician widened SLATE's scope: instead of one track per page, music now needs to be cue-able per **script line**, with audio-driven auto-scroll and a "Free Read" mode that lets the reader pace themselves while still getting scene-level music underneath.

The current PDF-canvas renderer blocks this. Canvas has no addressable lines, no DOM events, no per-character styling, no accessibility. Most of the groundwork for the pivot already exists:

- `js/interpreter.js` extracts every line from the PDF with `{text, x, y, fontSize}` and classifies it as `scene | character | dialog | parenthetical | action | transition`. It just **discards** lines after scene/character extraction.
- `css/base.css` already defines `.sp-scene`, `.sp-char`, `.sp-dialogue`, `.sp-paren`, `.sp-trans`, `.sp-action`, `.sp-other` — dormant, waiting for DOM consumers.
- `cues.json` + `cue-editor.js` + `audio-engine.js` already carry the cue flow; only the schema extends.

v3 connects existing pieces and layers a line-aware cue system on top.

---

## The intended behavior

**Every cue carries `page` + `line` + `lineSpecific: boolean`.**

| `lineSpecific` | Synced (default) | Free Read |
|---|---|---|
| `true` | Fires when the line enters focus; script auto-scrolls | **Skipped entirely** |
| `false` / absent | Fires when audio hits `at` OR user enters the page manually | Fires when user enters the page manually |

Backward compatible: every existing cue without `line` → treated as `{line: 0, lineSpecific: false}` (page-level).

---

## Design decisions (locked)

1. **Primary renderer** — HTML text (DOM elements using existing `.sp-*` classes). Canvas stays behind `?canvas=1` as a dev/fidelity fallback.
2. **Screen mode** — becomes the **In-Focus Reader** (teleprompter-style focus lane). See visual pitch below.
3. **Compose mode** — keeps full-page layout (authoring needs scene-wide context).
4. **Authoring trigger** — click-to-select a line in Compose, then press `C` or click "Add cue". No shift-click / right-click (conflicts with text selection).
5. **Screen mode is read-only** — no authoring UI surfaces in the In-Focus Reader, preserves the quiet.
6. **Auto-scroll pacing** — adaptive (cue duration ÷ lines spanned), with user-settable max rate cap in localStorage.

---

## Screen mode redesign: The In-Focus Reader

```
    (viewport top — dark fade in)
          INT. APARTMENT — DAWN              ← opacity 0.25

          Rain taps the window.               ← opacity 0.55

                    MAYA                      ← opacity 0.85
          She hasn't moved in hours.

  ▌       Silence. Then — a phone rings.      ← FOCUS (opacity 1.0, amber rule)

          She flinches. Doesn't answer.       ← opacity 0.85

                    SAM (V.O.)                ← opacity 0.55
          Pick up. Please.

          (blackness below — dark fade out)
```

**Frame rules:**
- Shows ~7 lines of context (3 above + focus + 3 below; exact count responds to viewport).
- Focus lane at **~40% from viewport top** (more context below — the reader sees what's coming).
- Opacity gradient from focus: `1.0 → 0.85 → 0.55 → 0.25 → 0`. No borders, no boxes.
- Focus indicator: thin amber vertical rule (`3px × line-height`, `var(--accent)` at ~55%) flush to the left edge of the focus line.
- Character names retain palette tint even when dimmed.
- Scene headings stay bold at 25% opacity (peripheral chapter markers).
- Transitions right-aligned, dimmed further (×0.7).

**Scroll behavior:**
- **Synced:** audio drives scroll. Script translates upward beneath the fixed focus lane at `cueDuration ÷ lineSpan` (capped). Focus lane doesn't move; content does.
- **Free Read:** user scrolls (↓/↑ step one line, `PageDown`/`PageUp` jump scenes, wheel smooth). Focus lane still determines which line is "in focus" for ambient scene tint + page-cue arming.
- `F` toggles fullscreen; gradient extends to screen edges.

---

## Phase checklist

- [x] **Phase 1** — Line data pipeline 🟢
- [x] **Phase 2** — HTML text renderer 🟢
- [ ] **Phase 3** — Cue schema extension 🔵
- [ ] **Phase 4** — Playback engine update 🔵
- [ ] **Phase 5** — Line cue authoring GUI 🔵
- [ ] **Phase 6** — In-Focus Reader + Free Read toggle + auto-scroll pacing 🔵
- [ ] **Phase 7** — Character color palette 🔵
- [ ] **Phase 8** — Documentation + audit alignment 🔵

Legend: 🔵 not started · 🟡 in progress · 🟢 done · 🔴 blocked

---

## Phases (detailed)

### Phase 1 — Line Data Pipeline 🔵
Foundation; no user-visible change.

- Extend `_parse()` in `js/interpreter.js:197` and `js/interpreter-worker.js` to **persist the classified line array** (currently discarded).
- Output shape gains: `pages: { [pageNum]: { lines: [{ id, text, type, x, y, char? }] } }`
- Line IDs: `"p{page}_l{index}"` with content-hash suffix for stability across re-parses.
- IndexedDB cache version → 5.
- New accessor: `Interpreter.getLinesForPage(n)`.
- Dev tool: `Interpreter.diagnoseLines(n)`.

**Files:** `js/interpreter.js:197`, `js/interpreter-worker.js`

### Phase 2 — HTML Text Renderer 🔵
- New `js/text-renderer.js`. Renders a page of lines as DOM into `#screen-pdf-wrap` / `#compose-pdf-wrap`.
- Uses already-defined `.sp-scene`, `.sp-char`, `.sp-dialogue`, `.sp-paren`, `.sp-action`, `.sp-trans` from `css/base.css:105`, inside `.page-sheet` wrapper.
- Each line: `<div class="sp-X" data-line-id="..." data-char="..."></div>`
- Becomes primary call site in `goToPage()` (`js/app.js:145`).
- Canvas render behind `?canvas=1` URL flag.
- Preserves `--page-pct` / `--scene-tint` gradient work in `screen.css`.

**Files:** new `js/text-renderer.js`, edits in `js/app.js`, `js/pdf-engine.js`, `index.html`

### Phase 3 — Cue Schema Extension 🔵
- Add `line: number` and `lineSpecific: boolean` to each cue.
- One-shot migration on load: cues lacking fields get `{line: 0, lineSpecific: false}`.
- Persist unchanged via `CueEditor.save()` → localStorage.

**Files:** `cues.json`, defaults in `js/cue-editor.js:28`

### Phase 4 — Playback Engine Update 🔵
Rework `_checkCues()` at `js/audio-engine.js:192`:

```js
if (STATE.freeRead && cue.lineSpecific) continue;  // Free Read skips line cues
```

- In Free Read: `goToPage()` additionally fires any not-yet-fired page-level cues for that page.
- In Synced: when a line-specific cue fires, the renderer scrolls its `data-line-id` element into the focus lane with a `.sp-active` class.

**Files:** `js/audio-engine.js:192`, `js/app.js:32` (STATE), `js/app.js:145` (goToPage)

### Phase 5 — Line Cue Authoring GUI (Compose only) 🔵
Two complementary paths. Screen mode stays read-only.

**(a) Click-to-select + hotkey in Compose script panel** — new `js/line-cue-editor.js`:
- Click any rendered line → `.sp-selected` (brief amber ring).
- Press `C` or click "Add cue" in floating toolbar → popover anchored to the selected line.
- Popover: Track / Timestamp (defaults to waveform cursor) / Fade In/Out / Note / "Line-specific" toggle (default `true` for this path).
- `Esc` / click-away clears selection.

**(b) Table-centric** — extend `js/cue-editor.js:84` + `index.html:305`:
- New **Line** column between Scene and Track.
- Empty = page-level. Clicking opens a picker that cross-highlights in the script panel.
- "line" chip appears when `lineSpecific: true`.

Waveform markers (`js/waveform.js:248`) get a distinct treatment for line-specific cues (dashed stroke + smaller dot).

**Files:** new `js/line-cue-editor.js`, `js/cue-editor.js`, `js/waveform.js`, `css/compose.css`, `index.html`

### Phase 6 — In-Focus Reader + Free Read Toggle + Scroll Pacing 🔵
- Screen mode renders the focus-lane frame described above (`.focus-frame`, `.focus-lane`, opacity gradient).
- Free Read toggle in audio bar (`SYNCED ⇄ FREE READ` pill).
- Adaptive rAF scroll loop: interpolates script position between current line and next cue's line over cue duration.
- Respects `prefers-reduced-motion`.
- User scroll-rate cap via settings menu, persisted in localStorage.
- Keyboard: `↓`/`↑` step line, `PageDown`/`PageUp` jump scene, `F` fullscreen.

**Files:** `js/app.js` (STATE + keyboard), `js/text-renderer.js` (rAF loop + focus lane), `css/audio-bar.css`, `css/screen.css`, `index.html`

### Phase 7 — Character Color Palette 🔵
- Feed `STATE.interpreterData.characters` through a stable name-hash into a warm desaturated 12-color palette.
- Inject CSS custom properties per character: `--char-MAYA: #...;`
- Rule: `.sp-char[data-char="MAYA"] { color: var(--char-MAYA) }`.
- Only character cue lines are colored (dialogue stays black for readability).
- Optional 7.5: thin left-border stripe on dialogue blocks matching speaker.
- Manual override UI in existing `#interp-chars` panel (Compose).

**Files:** new `js/character-style.js`, `index.html`, `css/base.css`

### Phase 8 — Documentation + Audit Alignment 🔵

| File | What changes |
|---|---|
| `CLAUDE.md` | Phase 1 section ("HTML text renderer"), cue schema, STATE model, file structure, new key files. Link back to this doc. |
| `README.md` | Mode descriptions, cue format, keyboard shortcuts, Free Read section, In-Focus Reader |
| `FEATURES.md` | Add v3 section; move v2.x items under "Shipped — v2.x (archive)" |
| `CHANGELOG.md` | v3.0.0 entry |
| `.claude/agents/slate-spec-auditor.md` | New file list, new STATE shape, new cue schema, Free Read mode, In-Focus Reader, architecture constraints |
| `memory/project_state.md` | Refresh with v3 roadmap |
| `memory/architecture.md` | Module responsibilities refresh |
| `memory/resumption_guide.md` | Rewrite with v3 next steps |
| `memory/project_phase4_reminder.md` | Archive/mark done |
| `reel/prep-reel.js` | Consumes new line array; scene cards become line-range, not page-range |

---

## STATE additions (reference)

```js
STATE.freeRead         // bool, default false
STATE.currentLine      // { page, lineIdx } | null — the line currently in focus
STATE.focusedLineId    // 'p{page}_l{idx}' — for scroll targeting
STATE.autoScrollCap    // number (px/sec), user setting
STATE.selectedLineId   // 'p{page}_l{idx}' | null — Compose only, click-to-select
```

## New / modified CSS classes

```css
.sp-active    /* the line in focus — thin amber left rule + opacity 1.0 */
.sp-selected  /* Compose only — click-to-select highlight for authoring */
.focus-lane   /* the fixed 40%-from-top scroll anchor in Screen mode */
.focus-frame  /* the viewport container with fading gradient above/below */
```

---

## Critical files to modify (with line anchors)

- `js/interpreter.js:197` — `_parse()` persists `pages[n].lines`
- `js/interpreter-worker.js` — mirror
- `js/pdf-engine.js:37` — keep extraction; canvas render behind `?canvas=1`
- `js/app.js:32` — STATE adds `freeRead`, `currentLine`, `focusedLineId`, `autoScrollCap`, `selectedLineId`
- `js/app.js:145` — `goToPage()` calls `TextRenderer.renderPage(n)`; in Free Read fires unfired page cues
- `js/audio-engine.js:192` — `_checkCues()` respects Free Read + `lineSpecific`
- `js/cue-editor.js:87` / `index.html:305` — cue table gains Line column + line chip
- `js/waveform.js:248` — line-specific marker variant
- `cues.json` — all 14 existing cues get `line: 0, lineSpecific: false`
- `index.html:100` — Screen mode focus-frame container

## Reused utilities (do NOT rewrite)

- `Interpreter._classify` — already produces all six line types (`js/interpreter.js:173`)
- `Interpreter._itemsToLines` — already emits `{text, x, y, fontSize}` (`js/interpreter.js:146`)
- `.sp-*` classes — already defined (`css/base.css:105`)
- `CueEditor.save()` — localStorage, unchanged
- `STATE.interpreterData.characters` — feeds character palette
- `Waveform.renderCueMarkers()` — just needs `lineSpecific` branch

---

## Verification checklist

1. `Interpreter.diagnoseLines(1)` returns ≥ 20 classified lines with stable IDs across reloads
2. Screen mode renders HTML text (not canvas); focus lane visible; opacity gradient correct
3. `?canvas=1` still renders the original canvas for cross-check
4. After migration, `STATE.cues[0]` shows `line: 0, lineSpecific: false`
5. **Synced playback:** a `lineSpecific: true` cue on `{page:3, line:12}` adds `.sp-active` to `p3_l12` and scrolls it into the focus lane
6. **Free Read:** toggle on; `↓` steps one line; page-level cues fire on page entry; line-specific cues do NOT fire
7. Click a line in Compose → `.sp-selected` amber ring; press `C` → popover opens anchored to that line; save persists through reload
8. Cue table Line column editable; waveform marker is dashed for line-specific cues
9. Character names render in distinct colors from the palette; dialogue stays black
10. `CLAUDE.md` Phase 1 reads "HTML text renderer"; auditor agent runs clean against updated `slate-spec-auditor.md`; this doc's Phase Checklist is fully checked

---

## Change log

Add one line here every time a phase ships or a decision changes. Format: `YYYY-MM-DD — [PhaseX] what shipped / decided`.

- 2026-04-16 — Plan drafted after conversation with musician. Decisions locked: HTML primary, In-Focus Reader for Screen, click-to-select + `C` for authoring, adaptive scroll with user cap, canvas behind `?canvas=1`.
- 2026-04-16 — Phase 1 complete. `interpreter.js` + `interpreter-worker.js`: `CACHE_VERSION` → 5, `_parse()` now persists full line array in `pages{}`, added `getLinesForPage(n)` + `diagnoseLines(n)` to public API.
- 2026-04-16 — Phase 2 complete. New `js/text-renderer.js`: HTML rendering using existing `.sp-*` CSS classes. Canvas fallback when interpreter not ready or `?canvas=1`. `goToPage()` now calls `TextRenderer.renderPage(n)`. Interpreter re-renders current page on analysis completion.
