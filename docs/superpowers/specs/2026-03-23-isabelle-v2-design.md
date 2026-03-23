# Isabelle — v2 Full Design Spec
**Date:** 2026-03-23
**Replaces:** `2026-03-22-isabelle-audiobook-design.md`

---

## Overview

A two-book digital reading experience built around the letters of Isabelle de Bourbon-Parma (1741–1763). Book 1 is the letters — frozen, verbatim, preserved. Book 2 is the context — historical commentary on every person, place, and event the letters reference. Both books are independent but synchronise when used together. The interface is a sleek editorial reading app: no web-app aesthetic, icon-only controls, everything collapsible, all controls at the bottom.

Hosted on GitHub Pages. Vanilla JS, no framework, no build step. Works on any device.

---

## Related specifications

| Document | Purpose |
| --- | --- |
| [2026-03-23-executor-voice-sound-translate-for-audiobook.md](./2026-03-23-executor-voice-sound-translate-for-audiobook.md) | Optional scope from `C:\executor`: server TTS (Kokoro / voice clone), UI sound effects, machine-translation API, companion-server integration; phasing and copy-vs-rewrite notes. No in-app AI. |

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
│   ├── smartFeatures.js← all 14 smart features, individually togglable
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
  "schema_version": 2,
  "lastPosition": {
    "letter_id": "letter-001",
    "paragraph_index": 0,
    "scroll_offset": 0,
    "active_view": "plain_english",
    "timestamp": 0
  },
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
      "views": {
        "original_french": "Ma chère Christine, ...",
        "modern_french": "Ma chère Christine, ...",
        "literal_english_old": "My dear Christine, ...",
        "literal_english_modern": "My dear Christine, ...",
        "plain_english": "My dear Christine, ..."
      }
    }
  ]
}
```

**`lastPosition`** is an object (not a number) storing five pieces of state:
- `letter_id` — stable letter ID string (e.g. `"letter-012"`)
- `paragraph_index` — zero-based index within the letter's body paragraphs
- `scroll_offset` — pixel scroll offset within the letter, for sub-paragraph restoration
- `active_view` — one of the view keys listed below (e.g. `"plain_english"`)
- `timestamp` — Unix ms, used for cross-device conflict resolution (more recent wins)

**`defaultView`** persists to `localStorage` only — not written back to `book.json` via the GitHub API. Cross-device sync of the global view preference is intentionally not supported; each device keeps its own preference. The `defaultView` field in `book.json` is the initial default only, read once on first load.

**View keys** — the exact strings used everywhere (schema, `viewMemory`, `active_view`, tab identifiers):

| Key | Tab label | Tooltip |
|---|---|---|
| `original_french` | `vieux fr` | Original Old French |
| `modern_french` | `fr moderne` | Modern French |
| `literal_english_old` | `en littéral` | Literal English of Old French |
| `literal_english_modern` | `en mod fr` | Literal English of Modern French |
| `plain_english` | `anglais` | Plain Modern English |
| `handwriting_style` | `manuscrit` | Handwriting Style |
| `photocopy` | `photocopie` | Original Photocopy |

`handwriting_style` and `photocopy` are **not stored** in `views`. They are rendering modes:
- `handwriting_style` — renders `original_french` text with a cursive font CSS class and aged-paper background
- `photocopy` — renders `images.photocopy` URL as a full-width image on paper background

**`viewMemory`** stores the view key string (e.g. `"original_french"`) for a per-letter override, or `null` to inherit `defaultView`. Only overrides are stored — sparse, not one value per letter. `viewMemory` is **never written to `book.json`** — it lives exclusively in `localStorage` under the key `isabelle-v2-view-memory-{letter_id}`. It is documented here to describe the shape; it does not appear in the `book.json` file or schema.

**`complete: false`** marks letters known to exist but not yet added. Renders as a placeholder in the sidebar.

All IDs are stable and never reassigned.

### context.json

```json
{
  "schema_version": 2,
  "entries": [
    {
      "id": "marie-christine",
      "type": "person",
      "name": "Marie-Christine of Austria",
      "aliases": ["Christine", "Marie Christine", "MC"],
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

**`aliases`** — alternative names and spellings that the renderer scans for when injecting inline context spans. The renderer matches any alias in the letter text to this context entry.

`relatedRefs` contains IDs only. The renderer looks up each ID in the entries array to resolve display name and type. This is intentional — no redundant data storage.

Each `content` paragraph has its own stable `id` for granular export and deep-linking.

---

## Inline Context Span Injection

The `views` text fields are stored as **plain strings** (no HTML markup). The renderer injects inline `<span>` elements at render time using this process:

1. For each letter, build a lookup map: `{ alias_or_name_string → context_entry_id }` from all `contextRefs` entries and their `aliases` arrays in `context.json`
2. Tokenise the letter text into word-boundary segments
3. For each segment, test against the lookup map (case-insensitive, longest-match-first to handle "Marie-Christine" before "Christine")
4. Wrap matches in: `<span class="ctx-ref" data-ref-id="marie-christine" role="button" tabindex="0" aria-label="Context: Marie-Christine of Austria">Christine</span>`
5. Inject result into the DOM — never modify the stored text

This happens at render time only. The stored text in `book.json` is always plain. If the same text contains multiple overlapping matches, longest match wins. Matched spans are only injected for text views (`original_french` through `plain_english`). Not injected in `handwriting_style` or `photocopy` views.

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
└─────────────────────────────────────────────────────────────┘
         ▔▔ ← 6px pull strip (touch target padded to 20px height)
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
         ▔▔ ← pull strip
```

### Collapse behaviour

| Element | Collapse trigger | Restore trigger |
|---|---|---|
| Left sidebar | Tap collapse icon or swipe left | Tap ≡ icon in bottom bar or swipe right from left edge |
| Right context panel | Tap collapse icon or swipe right from right edge | Tap context icon in bottom bar (not ◧ — see Icon Map) |
| Bottom bar | Swipe down on bar or tap pull strip | Swipe up on strip or tap strip |
| Top bar / header | None — no top bar. Title lives in bottom bar row 2 | — |

**Collapsed state:** only the letter text is visible. A 6px accent-coloured strip at the bottom edge remains. The strip's touch target is padded to 20px height. Tap or swipe up to restore. This 20px touch target satisfies the 48px minimum only when combined with the natural reach zone at the bottom of the screen — acceptable for a reveal-strip pattern. A brief onboarding tooltip on first collapse explains the strip.

**`Shift+H`** (desktop): toggles all chrome on/off in one keystroke.

### Icon map (bottom bar)

All icons are icon-only. No borders, no circles, no boxes around icons. Tooltips on hover (desktop), long-press label (mobile).

| Icon | Action | `aria-label` |
|---|---|---|
| ▶ / ⏸ | Play / Pause | "Play" / "Pause" |
| ◼ | Stop | "Stop" |
| ← | Previous paragraph or letter | "Previous" |
| → | Next paragraph or letter | "Next" |
| voice ▾ | Voice selector dropdown | "Select voice" |
| ━━●━━ | Speed slider | "Playback speed" |
| Aa | Font size | "Font size" |
| ◐ | Theme toggle | "Toggle theme" |
| ⊞ | Reading mode / focus | "Reading mode" |
| ↓ | Export | "Export" |
| ✦ | Smart features toggle panel | "Smart features" |
| ≡ | Sidebar toggle | "Navigation" |
| 📖 | Context panel toggle (Book 2) | "Context panel" |
| ♪ | Narrator mode picker | "Narrator mode" |
| ✂ | Sentence Range Copy mode toggle | "Range copy mode" |
| ⋯ | Overflow menu (mobile) | "More options" |
| 🖉 | Editor mode indicator (visible only when unlocked) | "Editor mode active" |

The context panel toggle icon is 📖 (not ◧, which was ambiguous with the narrator context mode icon). The narrator mode icon uses a dedicated picker, not the same icon as the panel toggle.

### Design language
- Icon-only controls. No text labels on buttons.
- No borders, no circles, no boxes around icons.
- Tooltips on hover (desktop), long-press label (mobile).
- Thin lines. Generous whitespace. Typography-led.
- Accent colour for active states and focus rings only.
- Editorial aesthetic — closer to Kindle or iBooks than a web dashboard.
- Minimum touch target 48px on all interactive elements (except pull strip — see above).
- `prefers-contrast: more` — borders increase in weight, accent colour deepens.
- `prefers-reduced-motion` — all transitions and animations disabled.

---

## Letter Display

Each letter renders as a standalone document:

```
  14 November 1760                           Letter 12 of 194

  Ma chère Christine,

       [body text — contextRef matches have dotted underline]

                                         Votre Isabelle
  ─────────────────────────────────────────────────────────
  ← Letter 11                                  Letter 13 →
```

- Date top-left, letter number top-right
- Salutation on its own line
- Body with slight left indent
- Closing right-aligned
- Thin rule + prev/next at bottom

**Single click on a paragraph** within a letter: jumps narrator playback to that paragraph (starts playing from there if playing; sets start point if paused). Focus mode updates immediately. This is the default click behaviour.

**Double-click / long-press** on a paragraph: enters inline edit mode (editor mode must be unlocked).

**Sentence Range Copy mode** is a distinct toggled mode — it is **not activated by a plain click**. The user must first activate range mode via the ✂ icon in the bottom bar (or keyboard shortcut `R`). While range mode is active, the bottom bar shows a banner: *"Click a sentence to set start → click another to set end → copy"*. Single-click-to-jump-playback is suspended in range mode. Pressing `Esc` or tapping ✂ again deactivates range mode and restores click-to-jump. This resolves the interaction conflict between the two single-click behaviours.

**Context link spans:** tagged words/phrases in body text carry a 1px dotted underline in the accent colour. `role="button"`, `tabindex="0"`, `aria-label="Context: [entry name]"`. Keyboard-reachable via `Tab`. `Enter` or `Space` activates. Tapping opens context panel to that entry. If panel already open, smooth scrolls to new entry. Only visible in text views.

**Photocopy view:** renders `images.photocopy` URL in an `<img>` at full width on a paper-toned background. `onerror` handler: if the URL is non-null but the image fails to load, falls back to `original_french` in handwriting font with notice: *"Image could not be loaded — showing transcription."* If `images.photocopy` is `null`, shows `original_french` in handwriting font with: *"Original image not yet added — showing transcription."* Never a blank screen.

**Handwriting-style view:** `original_french` text rendered in a period cursive font (Pinyon Script, Google Fonts) with a light aged-paper background tint. No extra text stored.

**After save:** changes go live on GitHub Pages within a few minutes. A notice in the optimistic feedback line reads: *"Saved. Changes will appear after a short delay — hard-refresh if needed (Ctrl+Shift+R)."*

---

## Format View Switcher

Sits above the letter body, below the date/number header. Seven minimal text tabs. Active state is a 1px underline only — no backgrounds, no borders:

```
  vieux fr   fr moderne   en littéral   en mod fr   anglais   manuscrit   photocopie
      ────
```

Implemented as `role="tablist"` containing `role="tab"` elements. Active tab has `aria-selected="true"`. Tab key moves focus between tabs; Enter/Space activates.

On mobile: a single `<button>` showing the current view label. Tap opens an inline vertical list (`role="listbox"`, `aria-expanded="true"`). Focus moves to the first option on open. Arrow keys move between options. Enter selects. Esc closes and returns focus to the trigger button.

**View memory:** switching view on a specific letter stores the key in `localStorage` under `isabelle-v2-view-memory-{letter_id}`. Global default stored under `isabelle-v2-view-default`. Only overrides stored.

---

## Narrator System

### Four modes

Selected via a single icon in the bottom bar that opens an inline picker (`role="listbox"`):

| Mode | What plays |
|---|---|
| `letters` | Book 1 only — letter text in the active view language |
| `context` | Book 2 only — current context entry |
| `both` | Letters + context, synchronised documentary style |
| `silent` | No narration |

The picker icon is distinct from the context panel toggle. The narrator mode picker opens a small floating list above the bottom bar. Esc closes it.

### `speechSynthesis` rules (apply to all modes)

- `speechSynthesis.cancel()` is called before every `speak()` call to clear any queued utterances and prevent stacking.
- All utterances are created fresh — no utterance is reused.
- A watchdog timer is set after each `speak()` call — for **both** the letter voice and the context voice. If the `end` event has not fired within `max(5000ms, utterance_char_count * 80ms)`, the narrator advances to the next sentence/paragraph as if `end` had fired. This prevents deadlock on platforms where `end` does not reliably fire (notably Chrome on Windows). The same watchdog applies to context snippet utterances in `both` mode.

### `both` mode — documentary behaviour

The letter text is split into sentences **before speaking** using this algorithm:

1. Split the current paragraph's text on sentence boundaries: `/(?<=[.!?…»])\s+(?=[A-ZÀ-Ö«"'])/` (punctuation followed by whitespace and capital/quote)
2. Each sentence becomes a separate `SpeechSynthesisUtterance` for the letter voice
3. After each sentence utterance's `end` event fires (or watchdog triggers), scan the sentence text against the `aliases` lookup map built from `contextRefs`
4. If a match is found **and** that entry has not been spoken in this paragraph yet:
   - Apply configurable pause (default 1.2s, range 0.5s–3s) via `setTimeout`
   - Speak the `short` field of the matched context entry using the context voice
   - After context snippet's `end` event, apply second pause (same duration)
   - Mark the entry as spoken for this paragraph (reset on paragraph advance)
   - Resume with the next letter sentence
5. If no match, proceed immediately to the next sentence
6. Rule: **one context snippet per paragraph maximum** — after the first interjection fires in a paragraph, further contextRef matches in that paragraph are skipped. This prevents stacking regardless of how many refs appear.
7. On paragraph advance: clear the spoken-in-this-paragraph set, cancel any pending watchdog timers.

**Word-level highlighting:** attempted via the `boundary` event on each sentence utterance. If `boundary` fires with `name === "word"`, highlight the word at `charIndex`. Paragraph-level highlight (the entire paragraph element) is the guaranteed baseline and is always active regardless of whether `boundary` fires.

### Context snippet verbosity (in settings)

- `short` — speaks the `short` field only (default)
- `off` — context panel syncs silently, no audio interjection (narrator still reads letters in `both` mode)

### Two voices

- `letter_voice` — reads Book 1. On first load, attempt to pre-select the first available French-language voice from `speechSynthesis.getVoices()` (matches on `lang.startsWith("fr")`). Fallback: first available voice.
- `context_voice` — reads Book 2 interjections. On first load, attempt to pre-select the first available English voice (`lang.startsWith("en")`). Fallback: first available voice.
- Both independently overridable. Voice selector re-populates on `voiceschanged` event.
- The narrator reads whichever **view** is currently active. The view text determines the language the browser synthesises — no separate language setting.

---

## Reading Modes (Focus)

Five modes, selectable from the bottom bar focus icon (⊞):

| Mode ID | Behaviour |
|---|---|
| `off` | All text visible at all times (default) |
| `reveal` | Paragraphs 0 through current permanently visible; ahead hidden |
| `spotlight` | Only current paragraph visible; all others hidden |
| `fade_ahead` | Current fully visible; next 3 at opacity 0.15; rest hidden |
| `page` | One page at a time — see below |

**Page-lock mode (`page`):**
- One page = one letter. Each letter is a discrete page unit — the same unit as the sidebar navigation. There are no sub-letter page breaks.
- The content area is a fixed-height container equal to `window.innerHeight - bottomBarHeight`. `overflow: hidden`.
- Each page's content is placed in a child container. If the child's natural height exceeds the container height, the child is scaled down using `transform: scale(fit_factor)` where `fit_factor = containerHeight / childNaturalHeight`, clamped to a minimum of `0.6`. Below 0.6, the page is not scaled further — it scrolls internally with a thin scrollbar rather than becoming unreadable.
- Navigation: `←` / `→` keys, swipe left/right (mobile), or the skip arrows in the bottom bar.
- Smart Scroll (gravity wells) is automatically disabled when page-lock is active.
- On mobile: each page is a full swipeable card using CSS scroll snapping (`scroll-snap-type: x mandatory`).
- The narrator advances pages automatically during playback.

---

## Smart Features

All **14** features are individually toggleable. A ✦ icon in the bottom bar opens the toggle panel. All states persist to `localStorage` immediately on change. All default to on.

### Toggle panel

```
  Smart Features
  ─────────────────────────────
  ◉  Smart Scroll
  ◉  Peek & Return
  ◉  Sentence Range Copy
  ◉  Keyboard Navigation
  ◉  Truncation Reveal
  ◉  Resumability
  ◉  Optimistic Feedback
  ◉  Undo Navigation
  ◉  Focus States
  ─────────────────────────────
  ◉  Context Sync Indicator
  ◉  Narrator Position Line
  ◉  View Memory Per Letter
  ◉  Missing Letter Indicators
  ◉  Page Lock
```

Each toggle: `role="switch"`, `aria-checked="true|false"`, `aria-label="[feature name]"`. Panel is `role="dialog"`, `aria-label="Smart Features"`. Focus moves to first toggle on open. Esc closes and returns focus to the ✦ button.

### From IT Canonical Vision Document

| Feature | Application |
|---|---|
| **Smart Scroll** | Gravity wells at letter boundaries and chapter headings. Scroll snaps gently to the top of the next letter, never mid-sentence. Automatically disabled when Page Lock mode is active. |
| **Peek & Return** | `Alt`-hold (desktop) or long-press a context link (mobile) previews the context entry without leaving the letter. Release/lift to snap back. Keyboard alternative: `P` key opens peek; `Esc` closes and returns. |
| **Sentence Range Copy** | Activated by ✂ icon in bottom bar or `R` key. While active, click a sentence to set start, click another sentence in the **same letter** to set end. Copy fires. Deactivate with `Esc` or ✂ again. Selection clears on letter navigation. Works on body paragraphs only — not salutation or closing. Also triggers excerpt export. |
| **Keyboard Navigation** | `←` `→` between letters. `C` toggles context panel. `P` peek. `E` enters edit mode if unlocked. `Shift+H` collapses all chrome. `Esc` closes any open panel. Arrow keys usable only when no text input is focused. |
| **Truncation Reveal** | Sidebar letter titles and context entry names truncate with CSS ellipsis. Hover or long-press reveals full text in a `role="tooltip"` element. |
| **Resumability** | On every return, app opens to exact letter, paragraph, scroll offset, and active view from last session. Per-device via `localStorage`. Cross-device: on load, compare `lastPosition.timestamp` from `localStorage` and fetched `book.json`; the more recent timestamp wins. |
| **Optimistic Feedback** | Save, export, and link actions show a brief inline text confirmation below the bottom bar. Fades after 2 seconds. No toast, no modal. `role="status"`, `aria-live="polite"`. |
| **Undo Navigation** | Jumping via search or sidebar shows a subtle undo option for 4 seconds, then disappears silently. `role="status"`, `aria-live="polite"`. |
| **Explicit Focus States** | Every interactive element has a 2px focus ring in the accent colour, `outline-offset: 2px`. Tab order: sidebar → letter → context panel → bottom bar. |

### Project-specific

| Feature | Behaviour |
|---|---|
| **Context Sync Indicator** | When context panel is open and tracking the letter, a single accent dot pulses once on sync. One CSS animation cycle, then `animation: none`. Not a loop. |
| **Narrator Position Line** | A thin (2px) accent line along the top edge of the letter text area. Grows proportionally as the narrator progresses through the letter's sentences. Disappears when narration stops. Not a progress bar — no text, no percentage. |
| **View Memory Per Letter** | Per-letter view override in `localStorage`. Other letters use global default. Sparse storage. |
| **Missing Letter Indicators** | `complete: false` letters render as placeholder cards in sidebar with faint *"not yet added"* label. Visible but not activatable in reader mode. In editor mode: activating opens a blank letter form. |
| **Page Lock** | See Reading Modes section. Toggling this feature off while in page mode switches reading mode to `off`. |

---

## Export

Export icon (↓) in the bottom bar. Opens a minimal panel from the bottom (mobile) or above the bar (desktop). Three selections, then export fires immediately. No confirm button.

**Step 1 — Scope:**
```
this letter    this chapter    all letters    selection    full book
```
`selection` uses the active Sentence Range Copy selection. If no selection is active, `selection` is greyed out.

**Step 2 — View:**
```
vieux fr    fr moderne    en littéral    en mod fr    anglais    all views
```
Only text views appear here. `manuscrit` (handwriting_style) and `photocopie` (photocopy) are rendering modes, not text variants — they have no separate stored text and cannot be exported as text. Exporting while those views are active defaults to `original_french`. `all views` produces all five text versions side by side in a single document.

**Step 3 — Format:**
```
html    print / pdf    plain text
```

- `html` — `Blob` + `URL.createObjectURL` + synthetic `<a download>` click. Self-contained: all CSS inlined, no external dependencies. Readable offline.
- `print / pdf` — opens content in a new window with a clean print stylesheet; triggers `window.print()`. No chrome, no controls, just the letter on the page.
- `plain text` — plain string, same `Blob` download mechanism.

**Error handling:** if `URL.createObjectURL` or `Blob` construction fails (e.g., memory), show in the optimistic feedback line: *"Export failed. Try a smaller selection or reload the page."*

**Digital package** (`all letters` or `full book` + `html`): single self-contained file with all letters, all text views, styled table of contents, jumpable by letter number. Shareable as one file.

---

## Hidden Editor Mode

**Unlock:** `Shift+E` (desktop) or long-press on the letter number element for 800ms (mobile). Long-press on the letter number works on all touch devices including iPad with hardware keyboard (the long-press gesture does not require a software keyboard). On iPad with keyboard, `Shift+E` also works. A faint 🖉 icon appears in the bottom bar when editor mode is active — no other visual change.

### Letter editor

Single click on a paragraph: jumps playback (reader behaviour, unchanged).
Double-click (desktop) or long-press 800ms on paragraph body text (mobile): enters inline edit (`contenteditable`). Playback pauses automatically.

Minimal floating toolbar:
```
B  I  U  [type ▾]  🗑
```
Types: `body` `salutation` `closing` `heading` `quote`

No font pickers, no colour wheels. The design system handles all typography.

### Mapping editor

📖 icon (context panel toggle) in editor mode shows an additional edit overlay inside the context panel.

```
  Letter 12 — 14 Nov 1760
  ─────────────────────────
  Connected to:

  ● Marie-Christine          ✕
  ● Schönbrunn Palace        ✕
  ● Seven Years' War         ✕

  + Add connection
```

- `✕` removes the link
- `+ Add connection` → `role="combobox"` search input, `aria-label="Search context entries"`, `aria-autocomplete="list"`, `aria-expanded="true"` → matching entries appear as `role="option"` items → select to link
- No match: a final `role="option"` item with `aria-label="Create new entry: [typed text]"` reads: *"No match — Create '[typed text]'"*. This option is always the last item in the listbox when no exact match exists.
- Activating the Create option: opens a form (`role="dialog"`, `aria-label="New context entry"`) with fields: name, type (person / place / event / concept / object), short description, body. The `[Create]` button in the form has `aria-label="Create entry"`. Save adds to `context.json` and links to the current letter automatically. Focus returns to the mapping editor on close.

### Adding images

An image slot icon on every letter and every context entry (visible in editor mode). Tap → paste URL or select a local file. Local file: read with `FileReader.readAsDataURL()`, base64-encoded, uploaded via GitHub Contents API (`PUT /repos/{owner}/{repo}/contents/images/{filename}`). File size cap: 512KB enforced client-side before upload — if exceeded, show: *"Image is too large. Please resize to under 512KB before uploading."* The 512KB limit ensures reliable GitHub Contents API behaviour (GitHub's hard limit is 100MB but the API becomes unreliable above ~1MB).

### Saving

Editor uses the same GitHub Contents API save flow:
1. GET `book.json` (or `context.json`) — retrieves SHA and server-side `lastPosition`
2. If GET fails: show *"Could not reach GitHub. Your edits are preserved locally — try again when connected."* Do not proceed to PUT.
3. Merge: use server's `lastPosition` if its timestamp is newer than local, else use local
4. PUT merged file to GitHub API with retrieved SHA
5. Show in optimistic feedback: *"Saved. Changes will appear after a short delay — hard-refresh if needed (Ctrl+Shift+R)."*
6. Token stored in `localStorage`. Token scope required: `public_repo`. Generated at: github.com → Settings → Developer settings → Personal access tokens → Tokens (classic) → New token → select `public_repo` scope only.

If repo is private: save will fail with a 404 or 403. Error message: *"Save failed. Check your GitHub token in Settings. Repo must be set to Public."*

Debounced minimum 60 seconds between auto-saves, or on explicit save tap.

---

## Letter Completeness Check

As part of the extraction and tagging work:
1. `extract.js` identifies and tags all letters present in `Isabelle.html`
2. Cross-references against known historical record of Isabelle de Bourbon-Parma correspondence (194 known letters to Marie-Christine, plus additional letters to other recipients)
3. Letters known to exist but absent from the file are added as `complete: false` placeholder objects with date and recipient where known
4. Completeness report printed to stdout on extraction: total letters found, total placeholders added, any letters with uncertain attribution

---

## Error Handling

| Failure | Behaviour |
|---|---|
| `book.json` fetch fails | *"Could not load book. Check your connection and reload."* Player disabled. |
| `context.json` fetch fails | Context panel shows *"Context unavailable."* Main reading continues normally. |
| `contextRef` ID in `book.json` has no matching entry in `context.json` | Silent skip in sync and narrator. Console warning. No visible error. |
| GitHub API GET fails (before save) | *"Could not reach GitHub. Your edits are preserved locally — try again when connected."* PUT blocked. |
| GitHub API PUT fails — SHA conflict (409 / 422) | *"Save conflict — the file was changed by another session. Your edits are preserved locally. Reload and try again."* |
| GitHub API PUT fails (bad token / 403 / 404) | *"Save failed. Check your GitHub token in Settings. Repo must be set to Public."* |
| GitHub API rate limit | *"Too many saves. Please wait a minute."* |
| `speechSynthesis` unavailable | *"Your browser does not support text-to-speech. Try Chrome or Edge."* Player hidden. |
| No voices loaded | Retry on `voiceschanged`. Fallback: show selector empty with *"No voices available."* |
| View text `null` or missing key | *"This version has not been added yet."* Option to switch to `plain_english`. |
| Photocopy image URL non-null but fails to load | Fall back to `original_french` in handwriting font with: *"Image could not be loaded — showing transcription."* |
| Photocopy `images.photocopy` is `null` | Render `original_french` in handwriting font with: *"Original image not yet added — showing transcription."* |
| Narrator watchdog triggers | Advance to next sentence/paragraph silently. Console warning. |
| Export Blob/createObjectURL fails | *"Export failed. Try a smaller selection or reload the page."* |
| Image upload exceeds 512KB | *"Image is too large. Please resize to under 512KB before uploading."* Upload blocked. |

---

## Accessibility

- All controls: `aria-label`, `aria-pressed` (toggles), `aria-expanded` (panels)
- Context link spans: `role="button"`, `tabindex="0"`, `aria-label="Context: [entry name]"`. Keyboard-reachable via `Tab`. Activated by `Enter` or `Space`.
- Format view switcher (desktop): `role="tablist"` + `role="tab"` per option, `aria-selected`. Tab key moves focus between tabs; Enter/Space activates.
- Format view switcher (mobile): `role="listbox"` picker, `aria-expanded` on trigger, focus moves to first `role="option"` on open, arrow keys navigate, Enter selects, Esc closes and returns focus to trigger.
- Smart features panel: `role="dialog"`, `aria-label="Smart Features"`, focus moves to first toggle on open, Esc closes.
- Narrator mode picker: `role="listbox"`, same keyboard pattern as mobile view switcher.
- Focus mode picker: same pattern.
- Inline pickers (all): Esc always closes and returns focus to trigger. Focus does not trap — Tab moves to next element outside the picker.
- Undo navigation and optimistic feedback: `role="status"`, `aria-live="polite"`.
- Tab order: sidebar → letter (salutation, body paragraphs, context spans, closing, prev/next) → context panel → bottom bar.
- Keyboard-only path for every interaction including Peek (`P` key), collapse all (`Shift+H`), editor unlock (`Shift+E`).
- All images: `alt` text populated or `alt=""` for decorative. Image slots in editor: `alt` field is editable.
- Font size range 14px–28px (2px per step), default 16px, persisted to `localStorage` under `isabelle-v2-font-size`.
- `prefers-contrast: more` — border weights increase, accent colour deepens.
- `prefers-reduced-motion` — all CSS transitions and animations set to `transition: none`, `animation: none`. Narrator position line still advances (no animation), context sync dot does not pulse.

---

## localStorage Key Namespace

All keys are prefixed with `isabelle-v2-` to avoid collision with other apps on the same GitHub Pages origin (`*.github.io`).

| Key | Content |
|---|---|
| `isabelle-v2-position` | Serialised `lastPosition` object |
| `isabelle-v2-view-default` | Global default view key string |
| `isabelle-v2-view-memory-{letter_id}` | Per-letter view override key string |
| `isabelle-v2-font-size` | Number (px) |
| `isabelle-v2-speed` | Number (0.5–2.0) |
| `isabelle-v2-letter-voice` | Voice `name` string |
| `isabelle-v2-context-voice` | Voice `name` string |
| `isabelle-v2-theme` | `"dark"` or `"light"` |
| `isabelle-v2-focus-mode` | Mode ID string |
| `isabelle-v2-github-token` | GitHub PAT string |
| `isabelle-v2-smart-{feature_id}` | `"1"` or `"0"` per feature |
| `isabelle-v2-narrator-mode` | Mode ID string (`letters`, `context`, `both`, `silent`) |

---

## GitHub Pages Compatibility

Everything in this spec is pure client-side vanilla JS. No server, no backend, no build step required. External dependencies:
- Google Fonts: Pinyon Script (handwriting view), JetBrains Mono (UI), Georgia is system font. Loaded via `<link>`.
- GitHub Contents API: save/load — requires user-provided `public_repo`-scoped Personal Access Token.
- `window.speechSynthesis`: browser built-in.

All features degrade gracefully if any dependency is unavailable.

---

## Out of Scope (this version)

- Generating the 5 text format views (authored outside the repo, then stored in `book.json`)
- Writing Book 2 first draft (authored outside the repo; `context.json` is edited or imported by hand)
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
- All 14 smart features toggle on/off and persist to `localStorage`
- Page-lock mode shows exactly one page with no overflow; scales content to fit with minimum 0.6 factor
- Documentary narrator waits for sentence boundary before interjecting context snippet
- Narrator speaks `speechSynthesis.cancel()` before every `speak()` call
- Watchdog timer prevents narrator from deadlocking
- Format view switches instantly; narrator reads the active view language
- Editor mode hidden by default, fully functional when unlocked via `Shift+E` or 800ms long-press
- Export produces clean output at all granularities and formats; error shown on failure
- Cross-device position restore works by most-recent-timestamp rule
- Photocopy fallback shows transcription, never blank screen
- Image load failure falls back to transcription gracefully
- Missing letter placeholders visible in sidebar, not activatable in reader mode
- All controls collapse to a 6px strip — reading surface unobstructed
- Fully keyboard-navigable; every feature reachable without a mouse or touch
- Context link spans keyboard-reachable via Tab, activated by Enter/Space
