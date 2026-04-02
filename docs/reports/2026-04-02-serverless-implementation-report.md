# Serverless Architecture — Implementation Report

*April 2, 2026*

---

## Overview

Replaced the fetch-based data loading (broken under `file://`) with File System Access API for local use, added snapshot download/restore for end users, wired Ctrl+S disk save, and hid the GitHub save button from users who have no token. No server required in any scenario.

**Stack:** Vanilla ES modules · File System Access API · Blob download

---

## Files Changed

| File | Change |
|------|--------|
| `js/loader.js` | Added `file://` detection, `loadFromDisk()` via `showDirectoryPicker()`, `writeBookToDisk()`, `writeContextToDisk()` |
| `js/editor.js` | Wired Ctrl+S to call `onSave` callback |
| `js/app.js` | Added `lettersRead` Set, disk-save path in `saveAll()`, snapshot wiring, conditional save button |
| `js/snapshot.js` | New — `downloadSnapshot()` and `restoreFromFile()` |
| `index.html` | Added `#btn-snapshot` (⤓) and `#btn-restore-label`/`#restore-input` (⤒) to bottom bar |

---

## How It Works

### Local editing (`file://`)

1. Author opens `index.html` directly in Chrome — no server needed
2. Loading screen shows "Click to open your book folder…"
3. One click → `showDirectoryPicker()` → user picks the `audio_book` folder
4. `loader.js` reads `book.json`, `context.json`, `fiction.json` from that folder automatically
5. **Ctrl+S** writes the in-memory `book` and `context` objects back to those same files on disk
6. **💾 button** saves to GitHub via API (author only — requires stored token)

### GitHub Pages (end users)

1. Author pushes repo to GitHub — GitHub Pages serves `index.html`, `book.json`, `context.json`, `fiction.json` over HTTP
2. `loader.js` detects HTTP → uses `fetch()` as before — works fine
3. **💾 button** is hidden automatically: `location.protocol !== 'file:'` and no stored token → `display:none`
4. Inline editor (Shift+E, double-click) still works — edits are local to the browser session only

### Snapshot (end users)

**Save place (⤓):**
- Downloads `isabelle-snapshot.json` containing `{ letter_id, paragraph_index, active_view, letters_read[], timestamp }`
- `letters_read` is a Set of every letter ID the user has navigated to — accumulated across the session

**Restore place (⤒):**
- User uploads their saved `isabelle-snapshot.json`
- App reads it, adds any `letters_read` IDs to the current Set, navigates to `letter_id`
- Works across visits — if new letters have been added since the snapshot was saved, they appear ahead of the restored position automatically

---

## Architecture

```
Author (file://)
  └── showDirectoryPicker() → reads book.json, context.json, fiction.json
  └── Ctrl+S → writeBookToDisk() → overwrites book.json on disk
  └── git push → GitHub Pages updated

End user (https://username.github.io/...)
  └── fetch() loads book.json, context.json, fiction.json over HTTP
  └── ⤓ downloads isabelle-snapshot.json
  └── ⤒ uploads snapshot → navigate to saved position
  └── 💾 button hidden (no token)
  └── Inline editor available (local only, no save path)
```

---

## Decisions

**`showDirectoryPicker()` over multiple `showOpenFilePicker()` calls** — one prompt picks the whole folder; `book.json`, `context.json`, and `fiction.json` are read automatically if present. Context and fiction are silently skipped if missing.

**`lettersRead` as a Set on `window` scope** — accumulated per session, merged on snapshot restore. No server, no persistence beyond the downloaded file.

**Save button hidden by token check, not by hostname** — works correctly in any hosting environment, not just GitHub Pages. Author keeps the button as long as they have a token stored.

**Ctrl+S routes by protocol** — `file://` → disk write; HTTP → GitHub API. Author gets the same shortcut in both modes.

---

## Pending

- `context.json` write on Ctrl+S is a no-op if the user did not open a folder that contained `context.json` (handle is null — fails silently). This is correct behaviour.
- GitHub Pages must be configured to serve from the repo root (not `docs/` subfolder) since `book.json` and `js/` are at root level.
