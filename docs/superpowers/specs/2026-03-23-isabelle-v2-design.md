# Isabelle — v2 Full Design Spec
**Date:** 2026-03-23
**Replaces:** `2026-03-22-isabelle-audiobook-design.md`

---

## Overview

A two-book digital experience built around the letters of Isabelle de Bourbon-Parma (1741–1763). Book 1 is the letters — frozen, verbatim, preserved. Book 2 is the context — historical commentary on every person, place, and event the letters reference. Both books are independent but synchronise when used together. The interface is a sleek editorial reading app: no web-app aesthetic, icon-only controls, everything collapsible, all controls at the bottom.

Hosted on GitHub Pages. Vanilla JS, no framework, no build step. Works on any device.

---

## Architecture — Approach B

Two data files with bidirectional inline references. No separate mappings file.

```
C:\audio_book\
├── index.html          ← app shell, all CSS, ES module entry
├── book.json           ← Book 1: letters, chapters, format views
├── context.json        ← Book 2: people, places, events, images
├── extract.js          ← one-time extraction + tagging script
├── js/
│   ├── app.js          ← wires all modules, init on load
│   ├── loader.js       ← fetches book.json + context.json, resolves position conflict
│   ├── renderer.js     ← renders letters and context entries to DOM
│   ├── player.js       ← Web Speech API controller, dual-voice narrator
│   ├── progress.js     ← progress tracking, localStorage position save
│   ├── focusMode.js    ← manages all 5 reading modes incl. page-lock
│   ├── editor.js       ← hidden editor mode, inline editing, mapping UI
│   ├── exporter.js     ← all export formats and granularities
│   ├── smartFeatures.js← all 13 smart features, individually togglable
│   ├── sync.js         ← context panel sync, narrator sync
│   └── github.js       ← GitHub Contents API GET/PUT
└── README.md
```

All modules use ES module `import`/`export`. All interactive elements have stable `id` and `data-*` attributes for the smart ecosystem.

---

## Data Structure

### book.json

```json
{
  "title": "Isabelle",
  "subtitle": "A Collection of Letters",
  "author": "Isabelle de Bourbon-Parma",
  "editor": "Naziyah",
  "lastPosition": 0,
  "lastPositionTimestamp": 0,
  "defaultView": "plain_english",
  "chapters": [
    {
      "id": "ch-letters-marie-christine",
      "title": "Letters to Marie-Christine",
      "letter_ids": ["letter-001", "letter-002"],
      "page_start": 41
    }
  ],
  "letters": [
    {
      "id": "letter-012",
      "letter_number": 12,
      "date_iso": "1760-11-14",
      "date_display": "14 November 1760",
      "recipient": "Marie-Christine",
      "recipient_id": "marie-christine",
      "location": "Vienna",
      "salutation": "Ma chère Christine,",
      "closing": "Votre Isabelle",
      "chapter_id": "ch-letters-marie-christine",
      "page": 47,
      "complete": true,
      "contextRefs": ["marie-christine", "schonbrunn-palace", "seven-years-war"],
      "images": {
        "photocopy": null,
        "photocopy_alt": "Handwritten letter dated 14 November 1760",
        "isabelle_portraits": []
      },
      "viewMemory": null,
      "views": {
        "original_french": "Ma chère Christine, ...",
        "modern_french": "Ma chère Christine, ...",
        "literal_english_old": "My dear Christine, ...",
        "literal_english_modern": "My dear Christine, ...",
        "plain_english": "My dear Christine, ...",
        "handwriting_style": null,
        "photocopy": null
      }
    }
  ]
}
```

**Notes:**
- `handwriting_style` is always `null` in storage — it renders `original_french` with a CSS class. No duplicate text.
- `photocopy` in `views` is always `null` — the renderer uses `images.photocopy` URL instead.
- `complete: false` marks letters known to exist but not yet added. Renders as a placeholder in the sidebar.
- `viewMemory` stores per-letter view override (e.g. `"vieux_fr"`) or `null` to inherit the global default.
- All IDs are stable and never reassigned.

### context.json

```json
{
  "entries": [
    {
      "id": "marie-christine",
      "type": "person",
      "name": "Marie-Christine of Austria",
      "short": "Isabelle's closest friend and confidante, sister-in-law. Nearly all surviving letters are addressed to her.",
      "content": [
        {
          "id": "mc-para-001",
          "text": "Marie-Christine was born on 13 May 1742 in Vienna..."
        }
      ],
      "images": [
        {
          "id": "mc-img-001",
          "url": null,
          "alt": "Portrait of Marie-Christine of Austria, c.1760",
          "caption": "Marie-Christine of Austria"
        }
      ],
      "letterRefs": ["letter-001", "letter-012", "letter-047"],
      "relatedRefs": ["joseph-ii", "vienna-court", "habsburg-family"]
    }
  ]
}
```

**Entry types:** `person` `place` `event` `concept` `object`

Each `content` paragraph has its own stable `id` for granular export and deep-linking.

---

## UI Layout

### Core principle
Progressive disclosure. The reading surface is the only thing that is never hidden. Everything else collapses to nothing.

### Desktop (≥768px)

```
┌──────────┬──────────────────────────────┬───────────────────┐
│          │                              │                   │
│ SIDEBAR  │   BOOK 1 — THE LETTER        │  BOOK 2 — CONTEXT │
│          │                              │  (collapsible)    │
│ Chapters │   vieux fr  fr mod  anglais… │                   │
│ Letters  │   ────                       │  Marie-Christine  │
│ Search   │                              │  ──────────────── │
│          │   14 November 1760  Letter 12│  Born 1742,       │
│          │                              │  Vienna...        │
│          │   Ma chère Christine,        │                   │
│          │                              │  [portrait]       │
│          │   [letter body]              │                   │
│          │                              │                   │
│          │              Votre Isabelle  │                   │
│          │   ────────────────────────── │                   │
│          │   ← Letter 11   Letter 13 →  │                   │
└──────────┴──────────────────────────────┴───────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  ▶  ◼  ←  →   [voice ▾]  ━━●━━ 0.9×  Aa   ◐   ⊞   ↓   ✦  │
│                                                       ▔▔▔▔ │
└─────────────────────────────────────────────────────────────┘
```

### Mobile (<768px)

```
┌─────────────────────┐
│                     │
│  14 Nov 1760  L.12  │
│                     │
│  Ma chère           │
│  Christine,         │
│                     │
│  [letter body]      │
│                     │
│       Votre Isabelle│
│  ───────────────────│
│  ← L.11      L.13 →│
│                     │
├─────────────────────┤
│  ▶  ←  →  ━━●━ 0.9×│
│  ≡  ◧  ⊞  ↓  ✦  ⋯ │
└─────────────────────┘
```

### Collapse behaviour

| Element | Collapse trigger | Restore trigger |
|---|---|---|
| Left sidebar | Tap collapse icon or swipe left | Tap ≡ in bottom bar or swipe right |
| Right context panel | Tap collapse icon or swipe right | Tap ◧ in bottom bar |
| Bottom bar | Swipe down on bar or tap pull strip | Swipe up on strip |
| Top bar / header | None — no top bar. Title lives in bottom bar row 2 | — |

**Collapsed state:** only the letter text is visible. A 4px accent-coloured strip at the bottom edge is the only affordance. Tap or swipe up to restore.

**`Shift+H`** (desktop): toggles all chrome on/off in one keystroke.

### Design language
- Icon-only controls. No text labels on buttons.
- No borders, no circles, no boxes around icons.
- Tooltips on hover (desktop), long-press label (mobile).
- Thin lines. Generous whitespace. Typography-led.
- Accent colour for active states and focus rings only.
- Editorial aesthetic — closer to Kindle or iBooks than a web dashboard.
- Minimum touch target 48px on all interactive elements.
- `prefers-contrast` and `prefers-reduced-motion` respected.

---

## Letter Display

Each letter renders as a standalone document:

```
  14 November 1760                           Letter 12 of 194

  Ma chère Christine,

       [body text with subtle dotted underlines on contextRefs]

                                         Votre Isabelle
  ─────────────────────────────────────────────────────────
  ← Letter 11                                  Letter 13 →
```

- Date top-left, letter number top-right
- Salutation on its own line
- Body with slight left indent
- Closing right-aligned
- Thin rule + prev/next at bottom

**Context link indicators:** tagged words/phrases in the body text carry a 1px dotted underline in the accent colour. Tapping opens the context panel to that entry. If the panel is already open, it scrolls smoothly to the new entry. Only visible in text views (not photocopy or handwriting_style).

**Photocopy view:** renders `images.photocopy` URL at full width on a paper-toned background. If `null`, shows the `original_french` text in handwriting font with: *"Original image not yet added — showing transcription."*

**Handwriting-style view:** `original_french` text rendered in a period cursive font (Pinyon Script or Mrs Saint Delafield, Google Fonts) with a light aged-paper background tint. No extra text stored.

---

## Format View Switcher

Sits above the letter body, below the date/number header. Seven minimal text tabs, active state is an underline only:

```
  vieux fr   fr moderne   en littéral   en mod fr   anglais   manuscrit   photocopie
      ────
```

On mobile: a single label showing the current view. Tap to open an inline vertical list picker. Closes on selection.

**Full labels (tooltip on hover):**

| Key | Tab | Tooltip |
|---|---|---|
| `original_french` | `vieux fr` | Original Old French |
| `modern_french` | `fr moderne` | Modern French |
| `literal_english_old` | `en littéral` | Literal English of Old French |
| `literal_english_modern` | `en mod fr` | Literal English of Modern French |
| `plain_english` | `anglais` | Plain Modern English |
| `handwriting_style` | `manuscrit` | Handwriting Style |
| `photocopy` | `photocopie` | Original Photocopy |

**View memory:** switching view on a specific letter stores that choice in `viewMemory` on the letter object. All other letters use the global default. Only overrides stored — sparse, not one value per letter.

---

## Narrator System

### Four modes

Selected via a single icon in the bottom bar that opens an inline picker:

| Mode | Icon | What plays |
|---|---|---|
| `letters` | ✉ | Book 1 only — letter text in the active view language |
| `context` | ◧ | Book 2 only — current context entry |
| `both` | ⊕ | Letters + context, synchronised documentary style |
| `silent` | ∅ | No narration |

### `both` mode — documentary behaviour

1. Narrator reads the letter at normal pace
2. On reaching a sentence containing a `contextRef`, narrator finishes the sentence — never interrupts mid-sentence
3. Configurable pause (default 1.2s, range 0.5s–3s)
4. Context narrator speaks the `short` field of the context entry — one or two sentences only
5. Second pause
6. Letter narrator resumes
7. Multiple `contextRefs` in one paragraph: only the first unspoken one triggers per paragraph — no stacking

### Two voices

- `letterVoice` — reads Book 1. App attempts to pre-select a French-accented voice on first load.
- `contextVoice` — reads Book 2 interjections. App attempts to pre-select an English voice on first load.
- Both independently overridable from settings.
- Narrator reads the active view. Switching to `fr moderne` reads French. Switching to `plain_english` reads English.

### Context snippet verbosity (in settings)

- `short` — one `short` field sentence (default)
- `off` — context panel syncs silently, no audio interjection

---

## Reading Modes (Focus)

Five modes, selectable from the bottom bar focus icon:

| Mode | Behaviour |
|---|---|
| `off` | All text visible at all times (default) |
| `reveal` | Paragraphs 0 through current permanently visible; ahead hidden |
| `spotlight` | Only current paragraph visible; all others hidden |
| `fade-ahead` | Current fully visible; next 3 at opacity 0.15; rest hidden |
| `page` | One page at a time — no overflow. Content scales to fit viewport. Navigate via ← → or swipe. |

**Page-lock mode:** the content area shows exactly one page. No scrolling within the view. If page content is taller than the viewport, it scales to fit. Narrator advances pages automatically during playback. On mobile: each page is a full swipeable card.

---

## Smart Features

All 13 features are individually toggleable. A ✦ icon in the bottom bar opens the toggle panel. All states persist to `localStorage` immediately. All default to on.

### From IT Canonical Vision Document

| Feature | Application |
|---|---|
| **Smart Scroll** | Gravity wells at letter boundaries and chapter headings. Scroll snaps gently to the top of the next letter, never mid-sentence. Disabled automatically when page-lock is active. |
| **Peek & Return** | Hold `Alt` (desktop) or long-press a context link (mobile) to preview the context entry without leaving the letter. Release to snap back. |
| **Sentence Range Copy** | Click a sentence to set start, click another to set end — copy fires. Works across paragraphs within a letter. Also triggers excerpt export. |
| **Keyboard Navigation** | `←` `→` between letters. `C` toggles context panel. `E` enters edit mode if unlocked. `Shift+H` collapses all chrome. `Esc` closes any open panel. |
| **Truncation Reveal** | Sidebar letter titles and context entry names truncate gracefully. Hover or long-press reveals full text in a tooltip. |
| **Resumability** | Returns to exact letter, scroll position, and active view from last session. Per-device via `localStorage`, cross-device via `book.json` timestamp rule. |
| **Optimistic Feedback** | Save, export, and link actions show a brief inline confirmation — one line of text, fades after 2 seconds. No toast, no modal. |
| **Undo Navigation** | Jumping via search or sidebar shows a subtle undo option for 4 seconds, then disappears silently. |
| **Explicit Focus States** | Every interactive element has a visible focus ring in the accent colour. Tab order: sidebar → letter → context panel → bottom bar. |

### Project-specific

| Feature | Behaviour |
|---|---|
| **Context Sync Indicator** | When context panel is open and tracking the letter, a single accent dot pulses once on sync. One pulse, then still. Not a loop. |
| **Narrator Position Line** | A thin accent line along the top edge of the letter text area. Grows as the narrator progresses through the letter. Disappears when narration stops. |
| **View Memory Per Letter** | Per-letter view override stored in `viewMemory`. Other letters use global default. Sparse storage. |
| **Missing Letter Indicators** | `complete: false` letters render as placeholder cards in sidebar with faint *"not yet added"* label. Navigable in editor mode, not in reader mode. |
| **Photocopy Fallback** | If `photocopy` is `null` and photocopy view selected: renders `original_french` in handwriting font with paper background and notice. Never a blank screen. |

---

## Export

Export icon in the bottom bar. Opens a minimal panel from the bottom (mobile) or above the bar (desktop). Three selections, then export fires immediately.

**Step 1 — Scope:**
```
this letter    this chapter    all letters    selection    full book
```
`selection` uses the active Sentence Range Copy selection.

**Step 2 — View:**
```
vieux fr    fr moderne    en littéral    en mod fr    anglais    manuscrit    all views
```
`all views` produces all versions side by side in a single document.

**Step 3 — Format:**
```
html    print / pdf    plain text
```

- `html` — self-contained styled file, readable offline, no dependencies
- `print / pdf` — browser print with clean print stylesheet (no chrome, no controls)
- `plain text` — stripped, copyable

**Digital package** (`all letters` or `full book` + `html`): single self-contained file with all letters, all views, styled table of contents, jumpable by letter number. Shareable as one file.

---

## Hidden Editor Mode

**Unlock:** `Shift+E` (desktop) or long-press on the letter number (mobile). A faint edit indicator appears in the bottom bar. Not accessible from settings or URL params — discoverable only if you know it exists.

### Letter editor

Double-click (desktop) or long-press (mobile) any paragraph to edit inline (`contenteditable`). Playback pauses automatically.

Minimal floating toolbar:
```
B  I  U  [type ▾]  🗑
```
Types: `body` `salutation` `closing` `heading` `quote`

No font pickers, no colour wheels. The design system handles all typography.

### Mapping editor

A dedicated icon in the bottom bar (editor mode only). Opens the context panel in edit mode.

```
  Letter 12 — 14 Nov 1760
  ─────────────────────────
  Connected to:

  ● Marie-Christine          ✕
  ● Schönbrunn Palace        ✕
  ● Seven Years' War         ✕

  + Add connection
```

- Tap `✕` to remove a link
- Tap `+ Add connection` → search box → matching entries appear → tap to link
- No match: *"No match for 'Leopold II' — Create new entry? [Create]"*
- Creating a new entry: name, type (person / place / event / concept / object), short description, body. Save adds to `context.json` and links to the current letter automatically.

### Adding images

An image slot icon on every letter and every context entry. Tap → paste URL or upload file. Saves to GitHub via the existing API. No rebuild required.

### Saving

Editor uses the same GitHub Contents API save flow as the original spec. GET → merge → PUT with SHA. Debounced minimum 60 seconds, or on explicit save tap.

---

## Letter Completeness Check

As part of the extraction and tagging work:
1. `extract.js` identifies and tags all letters present in `Isabelle.html`
2. Cross-references against known historical record of the Isabelle de Bourbon-Parma correspondence
3. Any letters known to exist but absent from the file are added as `complete: false` placeholder objects with date and recipient where known
4. A completeness report is printed to stdout on extraction: total letters found, total placeholders added, any letters with uncertain attribution

---

## Error Handling

| Failure | Behaviour |
|---|---|
| `book.json` fetch fails | "Could not load book. Check your connection and reload." Player disabled. |
| `context.json` fetch fails | Context panel shows "Context unavailable." Main reading continues normally. |
| GitHub API save fails | "Save failed. Check your GitHub token in Settings. Repo must be Public." Content editable locally. |
| GitHub API rate limit | "Too many saves. Please wait a minute." |
| `speechSynthesis` unavailable | "Your browser does not support text-to-speech. Try Chrome or Edge." Player hidden. |
| No voices loaded | Retry on `voiceschanged` event. Fallback: show voice selector as empty with notice. |
| View text `null` | Show: "This version has not been added yet." with option to switch to `plain_english`. |

---

## Accessibility

- All controls: `aria-label`, `aria-pressed` (toggles), `aria-expanded` (panels)
- Keyboard navigable throughout
- Focus rings visible in accent colour
- Tab order follows reading order
- `Esc` closes any open panel without trapping focus
- All images have `alt` text (populated or placeholder)
- Font size range 14px–28px, persisted
- `prefers-contrast: more` — borders increase in weight
- `prefers-reduced-motion` — all transitions and animations disabled
- Page-lock mode: swipe gestures have keyboard equivalents

---

## GitHub Pages Compatibility

Everything in this spec is pure client-side vanilla JS. No server, no backend, no build step required. The only external dependencies are:
- Google Fonts (2 font families, loaded via `<link>`)
- GitHub Contents API (for save/load — requires user-provided token)
- `window.speechSynthesis` (browser built-in)

All features degrade gracefully if any dependency is unavailable.

---

## Out of Scope (this version)

- Generating the 7 format views (done once by Claude, stored in book.json)
- Writing Book 2 first draft (done by Claude as part of extraction/tagging work)
- Mobile native app
- Multi-user / collaboration
- Full-text search across all letters (can be added later)
- Audio file generation (MP3s)
- Authentication

---

## Success Criteria

- App loads and plays on Chrome/Edge desktop and mobile
- Both books read independently and in sync
- All 5 reading modes work correctly during playback and manual navigation
- All 13 smart features toggle on/off and persist
- Page-lock mode shows exactly one page with no overflow
- Documentary narrator waits for sentence boundary before interjecting context
- Format view switches instantly, narrator reads the active view language
- Editor mode hidden by default, fully functional when unlocked
- Export produces clean output at all granularities and formats
- Cross-device position restore works by most-recent-timestamp rule
- Photocopy fallback shows transcription, never blank screen
- Missing letter placeholders visible in sidebar
- All controls collapse to a 4px strip — reading surface unobstructed
- Fully accessible via keyboard alone
