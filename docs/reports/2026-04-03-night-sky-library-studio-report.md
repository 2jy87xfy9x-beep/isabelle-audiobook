# Night Sky Library + Studio — Implementation Report

**Date:** 2026-04-03
**Branch:** `feature/night-sky-library-studio`
**PR:** [isabelle-audiobook#2](https://github.com/2jy87xfy9x-beep/isabelle-audiobook/pull/2)
**Status:** Open — awaiting review

---

## Summary

Six new `§` sections added to `index.html` (no new files). Adds a full animated sky library, a studio authoring panel, a configurable toolbar, a token design system, book authoring with cover upload, and app-wide/per-book display primitives. Post-merge follow-up commits fixed five UX issues raised during review.

---

## Changes by commit

### `d417433` — feat: Night Sky Library + Studio — all 6 stages

All six stages implemented in a single commit to the feature branch.

<details>
<summary><strong>§15 SKY — Night Sky Library canvas</strong></summary>

**What was added:**
- `#sky-overlay` with two canvases (`#sky-bg` static, `#sky-main` animated rAF loop)
- `#sky-hud` with constellation pills, back button, recenter button, tooltip
- `SKY_BOOKS` — 12 canonical seed books
- `SKY_CONSTELLATIONS` — 3 constellations (Eras / Regions / Themes) with star positions, line paths, and `bookIds`
- Background renderer: hundreds of randomised stars + nebula haze radial gradient; reads `--sky-bg` and `--sky-nebula-haze` CSS vars
- Animated star twinkle and constellation glow via `requestAnimationFrame`
- Burst animation: click a constellation → burst transition → horizontal timeline
- Timeline: chronological axis `600 BCE → 2050`, book nodes alternating above/below, pan (drag) and zoom (scroll/pinch) with lerp smoothing
- Hit-testing for constellation hover and book node hover (inverts pan/zoom transform)
- Book node render: cover image (if loaded) or colour gradient + initials
- `initSkyLibrary()` — loads books from IDB, merges with seed data, reads constellation overrides from `bundle.constellations`, starts the animation loop
- `closeSky(animated)` — instant or reverse-burst close

**Key architectural decision:** Sky background is on a separate canvas drawn once (`skyResize()`); only the interactive layer redraws every frame. Keeps animation smooth on low-end devices.

</details>

<details>
<summary><strong>§16 TOOLBAR — Bottom bar edit mode</strong></summary>

**What was added:**
- `TOOLBAR_DEFAULTS` — ordered array of 20 entries (id, icon, label, size, visible) covering every bar element
- `toolbarLoadConfig()` / `toolbarSaveConfig()` — localStorage serialisation
- `toolbarApplyConfig(config)` — reorders only `.bar-icon` elements in `#bar-row-1`; non-icon spans (speed slider, voice selects) are left in place
- `_toolbarInitDrag()` — HTML5 drag API; `dragstart`, `dragover`, `drop` on the row
- `_toolbarShowIconMenu(btn)` — right-click popover with size / icon character / visibility controls
- `initToolbar()` — loads config and attaches drag listeners

</details>

<details>
<summary><strong>§17 STUDIO — Studio overlay shell</strong></summary>

**What was added:**
- `#studio-overlay` full-screen panel, `z-index:110`
- Left nav with six items: Books, Book Editor, Tokens, Toolbar, Primitives, Export
- `openStudio(section)` / `closeStudio()` / `studioShowSection(id)`
- Lazy render: each section's content is rendered the first time it becomes active
- `initStudio()` — wires nav, close button, `#btn-studio` click

</details>

<details>
<summary><strong>§18 TOKENS — Token design system</strong></summary>

**What was added:**
- `TOKEN_DEFAULTS` — 15 token keys covering colours, fonts, sky parameters
- `TOKEN_CSS_MAP` — maps each key to a CSS custom property name
- `tokensLoad()` / `tokensSave()` — localStorage persistence with `tokensMergeWithDefaults()`
- `tokensApply(tokens)` — sets CSS vars on `:root` and calls `_skyDrawBg()` if sky is active
- `renderTokenStudio()` — renders a live editing UI in the Tokens section (colour swatches for colour tokens, text inputs for others, reset buttons per token)
- `initTokens()` — called from `init()`, applies saved tokens on load

</details>

<details>
<summary><strong>§19 AUTHOR — Book authoring</strong></summary>

**What was added:**
- `renderStudioBooksList()` — lists IDB books with Edit buttons
- `authorNewBook()` — creates blank bundle and opens editor
- `authorOpenBookEditor(bookId)` — populates form fields from IDB entry
- Metadata fields: title, author, year, region, theme, summary
- Cover upload via `<input type="file">` → FileReader → base64 stored in `bundle.book.cover`
- `_authorConstellationField()` — three toggle chips; clicking persists `bundle.constellations` object to IDB immediately so changes appear in the sky on next open
- `_authorLettersSection()` / `_authorLettersList()` — letter list + contenteditable editor
- `renderStudioExport()` — bundle download and IDB autosave buttons

</details>

<details>
<summary><strong>§20 PRIMITIVES — Display override system</strong></summary>

**What was added:**
- `PRIMITIVES_APP_DEFAULTS` — app-wide defaults (sidebar visible, default view, default focus mode, etc.)
- `primitivesLoadApp()` / `primitivesSaveApp()` — localStorage
- `primitivesLoadBook(bookId)` / `primitivesSaveBook(bookId)` — IDB bundle
- `primitivesResolve(bookId)` — merges app defaults ← app overrides ← book overrides
- `primitivesApply(resolved)` — applies to DOM and triggers re-render
- `renderPrimitivesStudio()` — tab UI (App / Book), boolean checkboxes, string selects
- `initPrimitives()` — called from `init()`, applies saved app primitives on load

</details>

**Supporting changes in this commit:**
- `#bottom-bar` `z-index` raised from `30` to `150` so the bar stays above both overlays
- `init()` patched: `initTokens()`, `initPrimitives()`, `initToolbar()`, `initStudio()` added; `no_books` catch now calls `initSkyLibrary()` instead of `openBookshelf()`

---

### `cbd68d7` — feat: add ⌂ Library button to return to Night Sky Library

**Problem:** Once a book was open there was no UI path back to the sky library short of clearing IDB.

**Fix:**
- Added `<button id="btn-sky-library">⌂</button>` to `#bar-row-1`, positioned before `#btn-bookshelf`
- Added `{ id:'btn-sky-library', icon:'⌂', label:'Library', size:'md', visible:true }` to `TOOLBAR_DEFAULTS`
- Wired `addEventListener('click', initSkyLibrary)` in `initBookshelf()`

---

### `4fb13b1` — fix: zoom-to-cursor, text overlap, resize bar, editor indicator, opacity tokens

Five distinct UX issues addressed:

<details>
<summary><strong>1. Sky zoom targets cursor</strong></summary>

**Problem:** Scroll/pinch always zoomed toward the horizontal centre. Zooming into a cluster of books near one end of the timeline caused the view to drift away from the area of interest.

**Fix in `_skyOnWheel`:** Capture `worldX = (mouseX - _skyPanX) / _skyZoom` before updating zoom. Then compute new `_skyTargetPanX = mouseX - worldX * _skyTargetZoom`. The world coordinate under the cursor is preserved across the zoom transition.

</details>

<details>
<summary><strong>2. Timeline title label overlap</strong></summary>

**Problem:** Every book node rendered its title as 9–11px canvas text above/below the node regardless of zoom level. At default zoom with many books clustered around recent centuries the labels overlapped into an unreadable mass.

**Fix in `_skyDrawTimeline`:** Title labels are now only rendered when `isH` (the node is hovered). The tooltip (`#sky-tooltip`) already shows full info on hover so no information is lost. Era marker text opacity raised from `0.4` → `0.65` and lightness from `70%` → `80%` for better readability.

</details>

<details>
<summary><strong>3. Bottom bar resize — partial improvement</strong></summary>

**Problem (original):** Default `--bottom-bar-max-h` was `400px` with content at ~72px. The user would need to drag ~328px downward before any visual change occurred. Minimum was `96px` — above the content height — meaning the bar could never be visually shrunk.

**Partial fix:** Default lowered to `80px`, minimum lowered to `36px`. This makes the drag immediately responsive.

**Remaining fundamental issue (not yet fixed):** The variable targets `.bar-row`'s `max-height` (inner element), while `.bar-row` has `overflow-y:auto`. Reducing max-height makes the inner content scroll rather than visually shrinking the bottom bar. The fix requires targeting `#bottom-bar` itself, mirroring the side panel approach. See [pain points](#pain-points) in the UI reference.

</details>

<details>
<summary><strong>4. Double pink line on hover / border conflict</strong></summary>

**Problem:** `#bottom-bar` had `border-top:1px solid var(--border)` plus the resize gutter `::after` produced a 2px accent-coloured indicator on hover. The two were 4–6px apart and both turned pink on hover — a visual double-bar.

**Fix:** Removed `border-top` from `#bottom-bar`. Changed gutter `::after` resting state to `left:0; right:0; top:0; height:1px` (full-width 1px line, replacing the border). On hover it transitions to the narrow accent indicator at `left:20%; right:20%; top:50%`.

**Residual:** The gutter element still has `bar-tip` + `data-tip`, so the tooltip system still renders a floating element near the gutter on hover. This will be fully resolved when `bar-tip` is stripped during the bottom-bar resize rewrite.

</details>

<details>
<summary><strong>5. Editor indicator not visible</strong></summary>

**Problem:** `#editor-indicator` had `display:inline` always, `color:var(--text-d)` (~28% white), and `opacity:0.45` — net effective opacity of ~12%. It occupied bar space but was essentially invisible.

**Fix:** Changed to `display:none!important` by default (needed `!important` because `#bottom-bar .bar-tip` has higher specificity and sets `display:inline-flex`). Active state (`body.editor-mode #editor-indicator`) sets `display:inline!important` at accent colour.

</details>

<details>
<summary><strong>6. Opacity tokens</strong></summary>

**Added to TOKEN_DEFAULTS and TOKEN_CSS_MAP:**
- `opacity.panel` → `--panel-opacity` (default `1`) — applied to `#bottom-bar`, `#sidebar`, `#context-pane`
- `opacity.icon` → `--icon-opacity` (default `1`) — applied to `.bar-icon`; hover always overrides to `opacity:1`

Both are editable in Token Studio with live preview.

</details>

---

## Known remaining issues

| Issue | Area | Status |
|---|---|---|
| Bottom bar resize doesn't change bar height | `§14 APP` / `initBottomBarResize` | Pending — needs rewrite targeting `#bottom-bar` directly |
| Tooltip appears on gutter hover (extra line) | Bottom bar gutter CSS / HTML | Pending — remove `bar-tip` + `data-tip` from gutter element |
| Gutter keyboard shortcuts surfaced unnecessarily | `initBottomBarResize` keydown handler | Pending — strip keyboard handler from bottom bar gutter |

---

## Files changed

| File | Change type |
|---|---|
| `index.html` | +1129 lines — all new §15–§20 code, CSS, HTML, and init wiring |
| `.claude/launch.json` | Added `serve-worktree` configuration for preview server |
