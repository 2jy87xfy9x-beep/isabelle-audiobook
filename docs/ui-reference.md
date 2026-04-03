# Isabelle — UI Reference

A living reference for the single-file audiobook reader. Covers every UI surface, its controls, the token and primitive systems, and known pain points.

---

## Contents

- [Architecture overview](#architecture-overview)
- [Layout](#layout)
  - [Sidebar](#sidebar)
  - [Letter pane](#letter-pane)
  - [Context pane](#context-pane)
- [Bottom bar](#bottom-bar)
  - [Playback controls](#playback-controls)
  - [Display controls](#display-controls)
  - [Navigation controls](#navigation-controls)
  - [Toolbar edit mode](#toolbar-edit-mode)
- [Night Sky Library](#night-sky-library)
  - [Star field](#star-field)
  - [Constellation timeline](#constellation-timeline)
- [Studio overlay](#studio-overlay)
  - [Books](#books-section)
  - [Book editor](#book-editor-section)
  - [Tokens](#tokens-section)
  - [Toolbar](#toolbar-section)
  - [Primitives](#primitives-section)
  - [Export](#export-section)
- [Token system](#token-system)
- [Primitives system](#primitives-system)
- [Pain points and known issues](#pain-points-and-known-issues)

---

## Architecture overview

Everything lives in a single `index.html` file. There are no build steps, no bundler, no server-side code. The script block is `<script type="module">` and is divided into numbered sections:

| Section | Name | Responsibility |
|---|---|---|
| §1 | DB | IndexedDB open, CRUD for book bundles |
| §2 | GITHUB | Fetch bundle from GitHub raw URL |
| §3 | LOADER | URL param dispatch (`?id=`), IDB fallback |
| §4 | RENDERER | Letter rendering, view switching, alias linking |
| §5 | PLAYER | TTS via Web Speech API, playback state |
| §6 | FOCUS MODE | Reveal / spotlight / fade-ahead / page-view modes |
| §7 | EXPORTER | HTML, print, plain-text export |
| §8 | SMART FEATURES | Smart scroll, auto-advance, navigation options |
| §9 | EDITOR | Inline contenteditable letter editor |
| §10 | SNAPSHOT | JSON position snapshots (download / restore) |
| §11 | PROGRESS | Reading progress tracking |
| §12 | SYNC | IDB ↔ bundle sync, save-to-IDB |
| §13 | BOOKSHELF | Bookshelf panel, add/switch book |
| §14 | APP | `init()`, wire-up, layout persistence |
| §15 | SKY | Night sky canvas, constellation timeline |
| §16 | TOOLBAR | Bottom bar drag reorder, icon resize/swap |
| §17 | STUDIO | Studio overlay shell, section routing |
| §18 | TOKENS | Token store, CSS var application, sky renderer bridge |
| §19 | AUTHOR | Book CRUD, cover upload, constellation assignment |
| §20 | PRIMITIVES | App-wide and per-book display overrides |

Data is stored in **IndexedDB** (book bundles, letters, context) and **localStorage** (UI state: theme, font size, sidebar width, toolbar config, last position).

---

## Layout

The root `#app` is a horizontal flex row: sidebar · letter pane · context pane. The `#bottom-bar` sits below in a flex column on `<body>`.

```
┌────────────┬──────────────────────┬──────────────────┐
│  #sidebar  │    #letter-pane      │  #context-pane   │
│            │  ┌────────────────┐  │                  │
│  letter    │  │ #letter-content│  │  references,     │
│  list      │  │ (reading area) │  │  context entries │
│            │  └────────────────┘  │                  │
└────────────┴──────────────────────┴──────────────────┘
┌───────────────────────────────────────────────────────┐
│                    #bottom-bar                        │
│  ──── resize gutter ────────────────────────────────  │
│  ▶ ◼ ← → 1.0× ♪ [voice] ✂ A- A+ ◐  …               │
└───────────────────────────────────────────────────────┘
```

Panel widths are controlled by `--sidebar-w` and `--context-w` CSS variables set on `#app`. Resize gutters (`#gutter-sidebar`, `#gutter-context`) drag horizontally and write directly to these variables.

<details>
<summary><strong>Sidebar</strong></summary>

**Element:** `#sidebar`

Displays the ordered list of letters in the current book. Each item shows the letter number, recipient, and date. Clicking navigates to that letter. The active letter is highlighted.

- Toggle: `≡` button (`#btn-sidebar`) or the pull-strip on mobile
- Collapse: sidebar collapse button inside the header
- Width: draggable via `#gutter-sidebar` — persisted to `localStorage`
- On mobile (`≤767px`): slides in as a fixed overlay from the left

**Controls inside sidebar:**
- Letter list items — click to navigate
- Sidebar collapse button — hides the sidebar

</details>

<details>
<summary><strong>Letter pane</strong></summary>

**Element:** `#letter-pane` → `#letter-content`

The main reading area. Renders the current letter in the selected view.

**View modes** (cycled via view tab buttons):
- `plain_english` — modern English rendering
- `original` — original text
- `context` — inline context annotations
- `fiction` — AI gap-fill fiction scenes (if present in bundle)

**Reading focus modes** (cycled via `⊞` button):
- Off — full text visible
- Reveal — text fades in as you scroll
- Spotlight — current paragraph highlighted, rest dimmed
- Fade ahead — paragraphs below cursor are faded
- Page view — paginated, one page at a time

Letter text font is set by `--book-font` (default Georgia). Size by `--font-size` (default 16px).

</details>

<details>
<summary><strong>Context pane</strong></summary>

**Element:** `#context-pane`

Shows reference material, footnotes, and context entries linked from the current letter. Entries are keyed by alias — clicking a highlighted word in the letter jumps to the relevant context entry.

- Toggle: `📖` button (`#btn-context`)
- Width: draggable via `#gutter-context` — persisted to `localStorage`
- On mobile: slides in as a fixed overlay from the right

</details>

---

## Bottom bar

**Element:** `#bottom-bar` — `position:relative; z-index:150`

A single `#bar-row-1` flex row that wraps onto multiple lines when the viewport is narrow. All controls are `bar-icon` buttons (32×32px minimum) except the speed slider, voice selects, and Translate text button.

Tooltips appear on hover for every control via the `bar-tip` class and `data-tip` attribute, rendered by the `#app-tooltip` system.

The resize gutter at the top of the bar is a 5px drag target that sets `--bottom-bar-max-h` on the bar — see [known issues](#pain-points-and-known-issues).

### Playback controls

| Button | ID | Icon | Action |
|---|---|---|---|
| Play / Pause | `btn-play` | ▶ | Start or pause TTS narration |
| Stop | `btn-stop` | ◼ | Stop and reset to paragraph start |
| Previous paragraph | `btn-prev` | ← | Move back one paragraph |
| Next paragraph | `btn-next` | → | Advance one paragraph |
| Speed slider | `speed-range` | — | Set TTS rate 0.5×–2× |
| Narrator mode | `btn-narrator` | ♪ | Cycle: letters only → context snippets → both → silent |
| Letter voice | `letter-voice-select` | — | System TTS voice for letter text |
| Context voice | `context-voice-select` | — | System TTS voice for context snippets |

### Display controls

| Button | ID | Icon | Action |
|---|---|---|---|
| Smaller text | `btn-font-dec` | A- | Decrease font size |
| Larger text | `btn-font-inc` | A+ | Increase font size |
| Theme | `btn-theme` | ◐ | Toggle dark / light theme |
| Translate | `btn-translate` | Translate | Open current letter in Google Translate |
| Reading mode | `btn-focus` | ⊞ | Cycle focus modes (see Letter pane) |
| Range copy | `btn-range-copy` | ✂ | Select start + end paragraph to copy a range |

### Navigation controls

| Button | ID | Icon | Action |
|---|---|---|---|
| Library | `btn-sky-library` | ⌂ | Return to the Night Sky Library |
| Bookshelf | `btn-bookshelf` | 📚 | Open bookshelf panel to switch / add book |
| Context panel | `btn-context` | 📖 | Toggle context pane |
| Navigation | `btn-sidebar` | ≡ | Toggle sidebar |
| Export | `btn-export` | ↓ | Open export panel (HTML / print / plain text) |
| Smart features | `btn-smart` | ✦ | Smart scroll, auto-advance options |
| Save bundle | `btn-save` | 💾 | Download book bundle as `.json` |
| Snapshot | `btn-snapshot` | ⤓ | Download position snapshot |
| Restore | `btn-restore-label` | ⤒ | Restore position from snapshot file |
| Studio | `btn-studio` | ✎ | Open Studio overlay |
| Edit toolbar | `btn-toolbar-edit` | ⚙ | Enter toolbar edit mode |
| Hide bar | `btn-bottom-collapse` | ▽ | Collapse the bottom bar |

### Toolbar edit mode

Activated by `⚙` (`btn-toolbar-edit`). Adds `toolbar-edit-mode` to `<body>`.

- **Drag to reorder**: any `bar-icon` element can be dragged to a new position. Non-icon elements (speed slider, voice selects) stay fixed.
- **Right-click menu**: right-clicking any icon opens a popover with:
  - Size: sm (0.72rem) / md (0.88rem) / lg (1.1rem)
  - Icon: text input to swap the button's display character
  - Visibility: toggle the button hidden/visible
- Config is serialised to `localStorage` via `toolbarSaveConfig()` and re-applied on every load via `toolbarApplyConfig()`.

---

## Night Sky Library

**Element:** `#sky-overlay` — `position:fixed; inset:0; z-index:100`

Shown when there are no books in IDB (initial empty state) or when the `⌂` library button is clicked. The bottom bar remains visible above it at `z-index:150`.

Two canvases:
- `#sky-bg` — static, drawn once on resize; holds background stars and nebula haze
- `#sky-main` — animated via `requestAnimationFrame`; holds constellations and interactive content

### Star field

Hundreds of background stars rendered at random positions with varying radius, opacity, and twinkle phase. Nebula haze is a radial gradient whose colour reads from `--sky-nebula-haze`. Three named constellations float over the star field with glowing star points and connecting lines.

**Constellations:**
- **Through Time** (Eras) — groups books by year/era; hue from `--sky-const-eras-hue`
- **Across the World** (Regions) — groups books by region; hue from `--sky-const-regions-hue`
- **Desire · Exile · Faith** (Themes) — groups books by theme; hue from `--sky-const-themes-hue`

Hovering a constellation brightens it. Clicking triggers a **burst animation** that transitions into the timeline.

### Constellation timeline

A horizontal chronological axis spanning `600 BCE → 2050`. Books are placed as circular nodes alternating above and below the axis by their year.

**Interaction:**
- **Pan**: drag left/right
- **Zoom**: scroll wheel or trackpad pinch — zooms toward the cursor position
- **Hover**: shows book title label above/below the node and a tooltip with full title, author, year, and summary
- **Click**: opens the book via `?id=<bookId>` URL navigation
- **Back button** (`← sky`): reverse-burst animation back to star field
- **Recenter button**: resets pan and zoom to default

Node appearance:
- If a cover image exists: displays the image cropped to a circle
- If no cover: displays a colour gradient derived from `book.cover` hex + two-letter initials

Constellation assignment (which books appear under which constellation) is auto-assigned from book metadata (`year`, `region`, `theme`) and can be manually overridden per-book in the Book Editor section of Studio.

---

## Studio overlay

**Element:** `#studio-overlay` — `position:fixed; inset:0; z-index:110`

Full-screen panel opened by `✎` (`btn-studio`). Six sections accessed via a left-side nav. Content in each section is lazy-rendered on first visit.

### Books section

Lists all books currently in IDB. Each row shows title, author, and year with an "Edit" button that opens the Book Editor for that book. An "Add new book" button creates a blank entry.

### Book editor section

Full authoring form for a single book:

- **Metadata fields**: title, author, year, region, theme, summary
- **Cover image**: file upload (stored as base64 data URL inside the bundle); preview shown inline
- **Constellation assignment**: three toggle chips (Eras / Regions / Themes) showing which constellations the book currently appears in. Clicking a chip toggles the assignment and persists it to `bundle.constellations` in IDB immediately.
- **Letters**: list of existing letters with edit/delete; "Add letter" button with a contenteditable letter editor

### Tokens section

Visual editor for the token store. See [Token system](#token-system).

### Toolbar section

Mirrors toolbar edit mode in a panel form — shows the current icon order, sizes, and visibility. Changes write through to the same localStorage config.

### Primitives section

Visual editor for the primitives system. See [Primitives system](#primitives-system).

### Export section

- **Download bundle**: serialises the full IDB entry (book + letters + context + fiction + constellations) as a `.json` file
- **IDB autosave**: saves current in-memory state back to IDB

---

## Token system

**Module:** `§18 TOKENS`

A flat key/value store that is the single source of truth for both CSS custom properties and the sky canvas renderer. Tokens are stored in `localStorage` as a JSON blob and merged with `TOKEN_DEFAULTS` on every load.

**Applying tokens:** `tokensApply(tokens)` iterates `TOKEN_CSS_MAP` and calls `document.documentElement.style.setProperty(cssVar, value)` for each token. If the sky overlay is active it also calls `_skyDrawBg()` to re-render the background canvas with the new colours.

**Token keys and their CSS variables:**

| Token key | CSS variable | Default |
|---|---|---|
| `color.bg` | `--bg` | `#09060c` |
| `color.surface` | `--surf` | `#0f0a13` |
| `color.surface2` | `--surf2` | `#140e18` |
| `color.accent` | `--accent` | `#c67ba5` |
| `color.text` | `--text` | `rgba(255,255,255,0.82)` |
| `color.text.muted` | `--text-m` | `rgba(255,255,255,0.52)` |
| `color.text.dim` | `--text-d` | `rgba(255,255,255,0.28)` |
| `font.body` | `--book-font` | `Georgia, 'Times New Roman', serif` |
| `font.ui` | `--ui-font` | `'JetBrains Mono', monospace` |
| `font.size.body` | `--font-size` | `16px` |
| `sky.bg` | `--sky-bg` | `#080406` |
| `sky.nebula.haze` | `--sky-nebula-haze` | `rgba(200,90,150,0.055)` |
| `sky.const.eras.hue` | `--sky-const-eras-hue` | `270` |
| `sky.const.regions.hue` | `--sky-const-regions-hue` | `175` |
| `sky.const.themes.hue` | `--sky-const-themes-hue` | `330` |
| `opacity.panel` | `--panel-opacity` | `1` |
| `opacity.icon` | `--icon-opacity` | `1` |

`opacity.panel` is applied to `#bottom-bar`, `#sidebar`, and `#context-pane`.
`opacity.icon` is applied to `.bar-icon` at rest; hover always restores to `opacity:1`.

---

## Primitives system

**Module:** `§20 PRIMITIVES`

App-wide and per-book overrides for display behaviour. Separate from tokens (which control visual style) — primitives control structural behaviour.

App-wide primitives are stored in `localStorage`. Per-book primitives are stored inside the book's IDB bundle and merged at render time via `primitivesResolve(bookId)` (per-book overrides win).

Primitive types:
- **Boolean**: checkbox toggles (e.g. sidebar visible by default, show context inline)
- **String/select**: dropdown options (e.g. default view mode, default focus mode)

Changes in the Primitives Studio section call `primitivesApply()` which triggers a full re-render of the current letter.

---

## Pain points and known issues

<details>
<summary><strong>Bottom bar resize — fundamentally broken (pending fix)</strong></summary>

**Status: known, not yet fixed**

The resize gutter at the top of the bottom bar changes `--bottom-bar-max-h` on the inner `.bar-row` element (setting its `max-height`). But `.bar-row` has `overflow-y:auto`, so reducing max-height just makes the content internally scrollable — the outer `#bottom-bar` div never changes its visual height.

The side panel resize works because `--sidebar-w` is set on `#app` and `#sidebar` uses it directly for its own `width` property. The same pattern needs to be applied to the bottom bar: the variable should set the bar's own height/max-height, not a child's.

Additionally the gutter element has `bar-tip` + `data-tip` attached, which causes the tooltip system to render a second element on hover (the "extra pink line"). The keyboard resize shortcuts (ArrowUp/Down/Enter) in the gutter's `keydown` listener are also surfaced in the tooltip and aria-label and should be removed.

**Planned fix:** Strip the gutter down to a plain drag handle matching the side panel pattern — no `bar-tip`, no keyboard handler, variable targets `#bottom-bar` directly.

</details>

<details>
<summary><strong>Sky timeline — zoom direction and clustering</strong></summary>

**Status: partially fixed**

Zoom now targets the cursor/pinch position (worldX is preserved under the pointer). However, when many books cluster around the same year the nodes still overlap at default zoom. Pan to the cluster area first, then zoom in.

</details>

<details>
<summary><strong>Sky timeline — text labels at low zoom</strong></summary>

**Status: fixed**

Title labels are now only rendered on hover to eliminate overlap clutter. The tooltip provides full book info (title, author, year, summary) on hover. Era marker labels (600 BCE, 0, 500 …) are rendered at 65% opacity, up from 40%.

</details>

<details>
<summary><strong>Editor indicator visibility</strong></summary>

**Status: fixed**

The `🖉` inline editor indicator was always present in the bar at ~12% effective opacity. It is now `display:none` when editor mode is off and fully visible at accent colour when active.

</details>

<details>
<summary><strong>Bottom bar double-line visual on hover</strong></summary>

**Status: partially fixed**

The original `border-top:1px solid var(--border)` on `#bottom-bar` combined with the resize gutter `::after` indicator produced two parallel pink lines. The border-top has been removed and the gutter `::after` now renders as a full-width 1px line at rest that narrows to an accent indicator on hover. A residual second line can still appear from the tooltip being rendered on hover — fully resolved once the `bar-tip` class is stripped from the gutter element.

</details>

<details>
<summary><strong>Opacity control for UI components</strong></summary>

**Status: implemented**

`opacity.panel` and `opacity.icon` tokens are available in Token Studio. Set `opacity.panel` to values like `0.85` for a glass-panel effect on the sidebar, context pane, and bottom bar. Set `opacity.icon` to reduce icon intensity (hover always restores to `opacity:1`).

</details>
