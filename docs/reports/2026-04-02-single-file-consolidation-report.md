# Single-File Consolidation + Bookshelf Panel — Implementation Report

*April 2, 2026*

---

## Overview

Collapsed 14 JS modules and a separate `landing.html` into a single self-contained `index.html`. Replaced the File System Access API folder-picker approach with a zero-permission file-input bundle model. Added an in-reader bookshelf panel to replace the separate library landing page.

The result: the entire app is one file. Opening `index.html` is all that is required.

---

## What Changed

### Files deleted

| File | Why |
|------|-----|
| `js/app.js` | Inlined as §14 APP |
| `js/loader.js` | Inlined as §3 LOADER |
| `js/renderer.js` | Inlined as §4 RENDERER |
| `js/player.js` | Inlined as §5 PLAYER |
| `js/editor.js` | Inlined as §9 EDITOR |
| `js/exporter.js` | Inlined as §7 EXPORTER |
| `js/focusMode.js` | Inlined as §6 FOCUS MODE |
| `js/github.js` | Inlined as §2 GITHUB (stub) |
| `js/smartFeatures.js` | Inlined as §8 SMART FEATURES |
| `js/progress.js` | Inlined as §11 PROGRESS (stub) |
| `js/sync.js` | Inlined as §12 SYNC |
| `js/snapshot.js` | Inlined as §10 SNAPSHOT |
| `js/db.js` | Inlined as §1 DB |
| `js/landing.js` | Replaced by §13 BOOKSHELF |
| `landing.html` | Replaced by in-reader bookshelf panel |

### Files created / moved

| File | Change |
|------|--------|
| `data/isabelle.json` | New — working bundle `{book, context, fiction}` merged from three separate files |
| `data/book.json` | Moved from root |
| `data/context.json` | Moved from root |
| `data/fiction.json` | Moved from root |
| `data/context-seed.json` | Moved from root |
| `docs/reports/Isabelle.html` | Moved from root |
| `docs/Screenshot 2026-04-02 115851.png` | Moved from root |

### Files modified

| File | Change |
|------|--------|
| `index.html` | All CSS, HTML, and JS consolidated here; bookshelf panel added |
| `README.md` | Rewritten — reflects local-only workflow, no GitHub Pages, no extract.js |

---

## Architecture — Inline Script Sections

The single `<script type="module">` in `index.html` is structured as named sections:

| § | Name | Notes |
|---|------|-------|
| 1 | DB | `openDB`, `saveBook`, `getBook`, `getAllBooks`, `removeBook` — IDB stores `{id, bundle, title, author, lastOpened}` |
| 2 | GITHUB | Stubbed (no active use) |
| 3 | LOADER | `loadData()`, `loadFromIDB()`, `downloadBundle()`, position helpers |
| 4 | RENDERER | Letter rendering, paragraph rendering, tooltip system |
| 5 | PLAYER | Web Speech API playback |
| 6 | FOCUS MODE | `setFocusMode()`, `getFocusMode()` (renamed from `setMode`/`getMode` to avoid collision with app.js) |
| 7 | EXPORTER | `EXPORT_TEXT_VIEWS`, `EXPORT_VIEW_LABELS` (renamed to avoid collision with renderer) |
| 8 | SMART FEATURES | Context pane, fiction layer, `showFeedback()` |
| 9 | EDITOR | Paragraph editing, Ctrl+S wiring |
| 10 | SNAPSHOT | Snapshot download + restore |
| 11 | PROGRESS | Stubs only — `initProgress()`, `savePosition()`, `cancelSync()` |
| 12 | SYNC | Sync stubs |
| 13 | BOOKSHELF | In-reader book switcher panel |
| 14 | APP | Orchestrator — `init()`, `saveAll()`, all event wiring |

---

## Key Design Decisions

### 1. File-input bundle instead of folder picker

The original plan used `showDirectoryPicker()` + `FileSystemDirectoryHandle` to pick a book folder. This was removed because:

- Chrome on `file://` requires a user gesture to call `requestPermission()`, blocking auto-load on page reload
- Each browser session required a fresh permission grant — the "remembered" permission from a previous session required a new page load + user gesture to re-activate
- The UX (two dialogs, one for folder picker, one for permission) was friction without benefit for a single-user local app

**Replacement:** `<input type="file" accept=".json">` — no permission API, no dialog chains, works on `file://` with zero restrictions.

### 2. Bundle JSON `{ book, context, fiction }`

Instead of three separate JSON files loaded via fetch (which fails on `file://`), all book data is stored as a single bundle:

```json
{
  "book":    { "title": "...", "author": "...", "letters": [...] },
  "context": { "entries": [...] },
  "fiction": { "gap_scenes": [...], "letter_reimaginings": [...] }
}
```

The bundle is what gets loaded, stored in IDB, and downloaded when saving.

### 3. IndexedDB stores data, not file handles

IDB entries: `{ id, bundle: {book, context, fiction}, title, author, lastOpened }`.

No file handles stored. On `file://`, `loadFromIDB(id)` simply reads the bundle from IDB — no permission check, no file system access.

### 4. Saving = browser download

`downloadBundle(book, context, fiction)` creates a Blob and triggers a browser download. The user saves the file and pushes to git manually. No GitHub API, no token, no sync timer.

`saveAll()` in §14 APP: updates IDB + calls `downloadBundle()`.

### 5. Three-way panel mutual exclusion

Bookshelf, Smart Features, and Export panels are mutually exclusive. Opening any one closes the other two. This was missing in the initial implementation and added as a fix.

---

## Bookshelf Panel

The 📚 button in the bottom bar opens a fixed-position panel.

**Add book flow:**
1. Click `+ Add book`
2. File picker opens (`<input type="file" accept=".json">`)
3. User selects a bundle `.json`
4. Bundle parsed; stored in IDB with `id = "book-${Date.now()}"`
5. Card appears in the bookshelf list

**Switch book flow:**
1. Click a card → page navigates to `index.html?id=<bookId>`
2. `loadData()` reads `?id` from URL, calls `loadFromIDB(id)`
3. Book renders

**No books flow:**
- On `file://` with no `?id` and no IDB entries → `loadData()` throws `{ code: 'no_books' }`
- `init()` catch block hides the loading spinner and calls `openBookshelf()`
- User adds first book via the panel

---

## Name Collisions Resolved

Two name collisions were found and fixed during inlining:

| Original name | Used in | Renamed to |
|---|---|---|
| `TEXT_VIEWS` | `renderer.js` and `exporter.js` | Exporter version → `EXPORT_TEXT_VIEWS` |
| `VIEW_LABELS` | `renderer.js` and `exporter.js` | Exporter version → `EXPORT_VIEW_LABELS` |
| `setMode` / `getMode` | `focusMode.js` and `app.js` (alias) | focusMode version → `setFocusMode` / `getFocusMode` |

---

## Commits

| Hash | Description |
|------|-------------|
| `057a952` | feat: add bookshelf panel HTML/CSS and sidebar header update |
| `683b6cd` | fix: add #bookshelf-panel to print media query |
| `92a8b29` | refactor: inline all 14 JS modules into single index.html script |
| `824ccd0` | fix: complete three-way mutual exclusion between bookshelf/smart/export panels |
| `40e6baf` | fix: add close button to bookshelf panel |
| `91f75d6` | fix: use queryPermission on auto-load to avoid gesture requirement |
| `72644f8` | fix: use queryPermission in loadFromIDB — requestPermission needs user gesture |
| `1f4cafe` | refactor: replace folder/permission model with file-input bundle approach |
| `e4e5da7` | docs: add post-implementation amendment to consolidation plan |
| `849fda7` | refactor: delete all absorbed JS modules and landing.html |
| `9b28996` | refactor: move data JSON files into data/ folder |
| `dd15dab` | chore: update README and reorganise loose root files |

---

## Before / After

| | Before | After |
|---|---|---|
| JS files | 14 × `js/*.js` | 0 (all inline) |
| HTML files | `index.html` + `landing.html` | `index.html` only |
| Permissions required | `readwrite` on book folder each session | None |
| Book loading | `showDirectoryPicker()` + fetch | `<input type="file">` + IDB |
| Saving | GitHub API push | Browser download + manual git |
| Data files | 3 separate JSONs at root | 1 bundle JSON in `data/` |
| Root files | Loose HTML, JSON, PNG at root | Moved to `docs/` and `data/` |
