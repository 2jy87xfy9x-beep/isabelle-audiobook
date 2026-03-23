# Isabelle Smart Audiobook — Design Spec
**Date:** 2026-03-22
**Source file:** `C:\audio_book\Isabelle.html`

---

## Overview

Convert `Isabelle.html` (a 225KB draft of a book about Isabelle de Bourbon-Parma, ~231 pages) into a GitHub Pages-hosted smart audiobook web app accessible from any device. Uses browser Web Speech API for audio. Book content lives in a separate `book.json` file for fast loading and clean editing.

### Content authoring (clarification)

Translation, paraphrase, and biographical expansion are **authored outside this repository** (human editors, CAT tools, or any external workflow you choose). The repo holds **static JSON** (`book.json`, `context.json`) and **optional one-time Node.js helpers** (`extract.js`, etc.) that **do not** call third-party text-generation APIs. Nothing in the app runtime depends on remote automated text services.

---

## File Structure

```
isabelle-audiobook/           ← GitHub repo root
├── index.html                ← App shell: UI, player, editor, all JS/CSS
├── book.json                 ← Book content: paragraphs + formatting metadata
├── extract.js                ← One-time Node.js extraction script
└── README.md                 ← Setup instructions (see GitHub Setup section)
```

### book.json schema

```json
{
  "title": "Isabelle",
  "author": "Naziyah",
  "lastPosition": 0,
  "lastPositionTimestamp": 0,
  "paragraphs": [
    {
      "id": 1,
      "text": "Bourbon-Parma (1741-1763)...",
      "type": "normal",
      "style": {
        "fontFamily": null,
        "color": null,
        "marginLeft": null,
        "indent": null,
        "bold": false,
        "italic": false,
        "underline": false
      }
    }
  ]
}
```

**`lastPosition`**: zero-based index into the `paragraphs` array (not the `id` field). Represents the paragraph the user last read.

**`lastPositionTimestamp`**: Unix timestamp (ms) of the last time `lastPosition` was written. Used to resolve conflicts — the more recent timestamp wins, not the larger position value. This allows a user to intentionally go back to re-read without being pushed forward on reload.

**Paragraph `id` values**: assigned once during extraction (1-based, sequential). IDs are never reassigned even if paragraphs are edited, so position restoration remains stable.

**Paragraph types and rendering**:
| Type | HTML element | Notes |
|---|---|---|
| `normal` | `<p>` | Default body text |
| `heading` | `<h2>` | Section heading |
| `chapter-title` | `<h1>` | Chapter title, larger |
| `quote` | `<blockquote>` | Indented quote styling |

---

## Source Extraction (extract.js)

A one-time Node.js script (`node extract.js`, requires Node.js 18+) that:
1. Reads `Isabelle.html`
2. Strips all page-marker divider elements
3. Strips embedded reading-speed percentage markers from prose text (regex: `/\bLeaming reading speed \d+%|\b\d+ minute[s]? left in chapter \d+%/g` and similar patterns found in the source)
4. Splits remaining text on paragraph boundaries into an array of paragraph objects
5. Assigns stable sequential `id` values starting at 1
6. Writes `book.json`
7. Prints to stdout: `✓ Extracted N paragraphs to book.json` where N is the count

**Validation**: after running, the user should verify that `book.json` contains a reasonable paragraph count (expected: ~500–2000 paragraphs from 231 pages of prose). If the count is 0 or suspiciously small, the script failed silently and the HTML structure should be inspected manually.

**Failure behavior**: if `Isabelle.html` cannot be read, the script exits with a non-zero code and prints an error message.

---

## Architecture

```
index.html
├── CSS               — dark/light theme, focus mode styles, typography
├── HTML shell        — toolbar, player controls, content area
└── JavaScript
    ├── loader        — fetches ./book.json relative to origin
    ├── renderer      — renders paragraphs to DOM with formatting
    ├── player        — Web Speech API controller
    ├── editor        — inline editing, formatting toolbar
    ├── focusMode     — manages paragraph visibility states
    ├── progress      — progress bar, position tracking
    └── github        — GitHub API save/load (reads token from localStorage)
```

All logic is vanilla JS (no frameworks). No build step required.

**Fetching `book.json`**: the app fetches `./book.json` relative to its own origin. On GitHub Pages this resolves correctly without any user configuration.

---

## Features

### Playback
- Play / pause / stop buttons
- Speed control slider: 0.5x – 2x (default 1x)
- Voice selector: populated from `window.speechSynthesis.getVoices()`. The selector listens for the `voiceschanged` event and re-populates when it fires (required for Chromium where voices load asynchronously).
- Skip forward / back by one paragraph
- Auto-scroll: currently-reading paragraph scrolls into view
- Current paragraph highlighted (paragraph-level) while being read. Word-level highlighting via the `boundary` event is attempted as best-effort — not reliably fired by all browser/OS/voice combinations (notably absent in Safari). Paragraph-level highlight is the guaranteed baseline.
- Before each `speak()` call, `speechSynthesis.cancel()` must be called first to clear any queued utterances and prevent stacking.

### Progress
- Full-book progress bar (current paragraph index / total paragraphs)
- Reading position saved to `localStorage` immediately on each paragraph advance (includes timestamp)
- Position synced to GitHub on a debounced interval of minimum 60 seconds, or when the user explicitly clicks Save — never on every paragraph to avoid API rate limits
- **Cross-device position conflict resolution**: on load, the app compares `lastPositionTimestamp` from both `localStorage` and the fetched `book.json`. The value with the **more recent timestamp** wins. This ensures that if a user deliberately navigates backward to re-read, that choice is respected.

### Interaction Model (click behavior)
- **Single click on a paragraph**: jumps playback to that paragraph (starts playing from there if already playing; sets start point if paused). Does NOT enter edit mode. Focus mode updates immediately to treat the clicked paragraph as current.
- **Double-click on a paragraph**: enters inline edit mode for that paragraph. Playback pauses automatically when edit mode is entered.
- Edit mode and playback are mutually exclusive: starting playback exits any active edit mode.

### Editing
- Double-click any paragraph to enter edit mode (contenteditable). Playback pauses.
- Floating formatting toolbar appears:
  - Bold, italic, underline
  - Text color picker
  - Font family dropdown — options: Serif (Georgia), Sans-serif (system-ui), Monospace (JetBrains Mono)
  - Left margin / indent controls (3 presets: none / medium / large)
  - Paragraph type selector: Normal, Heading, Chapter Title, Quote
- **Save button**: GETs the current `book.json` SHA and `lastPosition` from GitHub API, merges local edits with the server's `lastPosition` (using timestamp-based conflict resolution), then PUTs the updated `book.json` to the GitHub Contents API (`PUT /repos/{owner}/{repo}/contents/book.json`). The SHA from the GET is required by GitHub to prevent blind overwrites. Note: if the repo is accidentally set to private, saves will fail — the error message will indicate to check the token and repo visibility.
- Changes go live on GitHub Pages usually within a few minutes of save. Users should hard-refresh (Ctrl+Shift+R / Cmd+Shift+R) after waiting if changes don't appear.

### Reading Comfort
- Font size +/- buttons: 2px per press, range 12px–24px, default 16px
- Light / dark mode toggle (dark is default, matching original styling)

### Focus Modes (3 selectable, toggled via toolbar button)
- **Off** — all text visible at all times (default)
- **Mode 1: Reveal** — paragraphs at indexes 0 through current are permanently visible; paragraphs ahead are hidden. When the user single-clicks to jump to paragraph N, all paragraphs from 0 to N become visible immediately (the entire read history up to that point is revealed, not just the clicked one).
- **Mode 2: Spotlight** — only the current paragraph is visible; all others hidden
- **Mode 3: Fade-ahead** — current paragraph fully visible; next 3 paragraphs at opacity 0.15; everything else hidden

**Focus mode during manual navigation**: single-clicking any paragraph updates the focus mode state immediately to treat that paragraph as current, regardless of whether playback is active.

All settings (font size, speed, voice, focus mode, theme, GitHub token) saved to `localStorage` immediately on change.

---

## Data Flow

```
App load
  → fetch ./book.json
  → render paragraphs to DOM with formatting
  → restore position: compare timestamps from localStorage and book.json, use more recent
  → listen for voiceschanged, populate voice selector

Play
  → speechSynthesis.cancel() to clear queue
  → SpeechSynthesisUtterance for current paragraph
  → on boundary event (best-effort): highlight word
  → on end: advance to next paragraph, update progress bar, apply focus mode
  → save position + timestamp to localStorage immediately
  → sync position to GitHub (debounced, min 60s interval)

Edit & Save
  → double-click paragraph → pause playback → enter contenteditable
  → user edits text and/or formatting
  → clicks Save
  → read GitHub token from localStorage
  → GET book.json from GitHub API (retrieves SHA + current lastPosition + lastPositionTimestamp)
  → merge: use server's lastPosition if its timestamp is newer than local, else use local
  → PUT merged book.json to GitHub API with retrieved SHA
  → show confirmation; token never leaves the browser

Settings changes → localStorage immediately
```

---

## Error Handling

| Failure | User-facing behavior |
|---|---|
| `book.json` fetch fails | Show: "Could not load book. Check your internet connection and reload." Disable player. |
| GitHub API save fails (bad token) | Show: "Save failed. Check your GitHub token in Settings. Also check that your repo is set to Public." Content editable locally but not saved. |
| GitHub API rate limit hit | Show: "Too many saves. Please wait a minute and try again." |
| `speechSynthesis` not available | Show: "Your browser does not support text-to-speech. Try Chrome or Edge." Hide player controls. |

---

## GitHub Setup (user-facing, step by step)

1. Create a free GitHub account at github.com
2. Create a new **public** repository named `isabelle-audiobook` (important: must be Public, not Private)
3. Run `node extract.js` to generate `book.json`, verify the output message shows a reasonable paragraph count
4. Upload `index.html`, `book.json`, and (optionally) `extract.js` to the repository
5. Go to **Settings → Pages**, set Source to **Deploy from a branch**, branch `main`, folder **`/ (root)`**, click Save
6. Wait a few minutes, then open the Pages URL shown in the Pages settings panel. Hard-refresh (Ctrl+Shift+R) if needed.
7. In the app, click the **Settings** icon and paste your GitHub Personal Access Token. Generate one at: github.com → Settings → Developer settings → Personal access tokens → Tokens (classic) → New token → select **`public_repo`** scope only.
8. Token is saved in your browser — repeat step 7 on each new device you use.

---

## Out of Scope

- Authentication / multi-user
- Generating audio files (MP3s)
- Mobile native app
- Collaboration / comments
- Full-text search (can be added later)

---

## Success Criteria

- App loads and plays the book on Chrome/Edge (desktop and mobile)
- Edits made on one device appear on another after saving and waiting a few minutes
- All 3 focus modes work correctly during both playback and manual navigation
- Mode 1 (Reveal) reveals all paragraphs up to the clicked/read point, not just the current one
- Formatting (bold, italic, underline, color, font, type, indent) persists after save and reload
- Reading position is restored by most-recent-timestamp rule after closing and reopening on any device
- `speechSynthesis.cancel()` is called before every `speak()` to prevent utterance stacking
- Error messages are shown for all defined failure cases
