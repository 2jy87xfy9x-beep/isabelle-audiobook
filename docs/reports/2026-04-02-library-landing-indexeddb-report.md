# Library Landing Page & IndexedDB Persistence — Implementation Report

*April 2, 2026*

---

## Overview

Replaced the inline folder-picker prompt with a proper library landing page (`landing.html`). Books are remembered across sessions via IndexedDB so after the first pick, opening the app again loads automatically with one permission click — no folder picker shown again.

---

## Files Added / Changed

| File | Change |
|------|--------|
| `landing.html` | New — library entry point |
| `js/landing.js` | New — landing logic (HTTP + file://) |
| `js/db.js` | New — IndexedDB utilities |
| `books.json` | New — HTTP book manifest |
| `js/loader.js` | Updated — handles `?id` (IDB) and `?dir` (HTTP) params, redirects to landing if opened directly |
| `js/app.js` | Updated — redirects to landing on `book_not_found` / `permission_denied` |
| `index.html` | Updated — sidebar title is now a "Back to library" link |

---

## How It Works

### First visit (local, `file://`)

1. Open `landing.html` directly
2. Page shows empty library + `+ Add book` button
3. Click `+ Add book` → `showDirectoryPicker()` → pick the `audio_book` folder
4. Landing reads `book.json` for title/author metadata, saves the `FileSystemDirectoryHandle` to IndexedDB with a stable key
5. Card appears — click it → `requestPermission()` → navigate to `index.html?id=<key>`
6. Reader loads all three JSON files via the stored handle

### Subsequent visits (local, `file://`)

1. Open `landing.html`
2. Stored books appear immediately (sorted by last opened)
3. Click card → browser shows a one-time permission prompt (Chrome remembers after that) → loads instantly
4. No folder picker, no "Click to open" prompt

### If `index.html` is opened directly without `?id`

`loader.js` detects `file://` with no `?id` param and immediately redirects to `landing.html`. The old "Click to open your book folder" fallback is gone.

### GitHub Pages (HTTP readers)

1. Open `landing.html` (or set as GitHub Pages root)
2. `fetch('./books.json')` → book cards rendered
3. Click → `index.html` (single book at root, no `?dir` needed) or `index.html?dir=books/isabelle` for future subdirectory books
4. No IndexedDB involved — handles are a local-only concept

### Multiple books (future)

Add to `books.json`:
```json
{ "id": "book2", "title": "Second Book", "author": "…", "dir": "books/book2" }
```
Place `book.json`, `context.json`, `fiction.json` in `books/book2/`. Landing page picks it up automatically on both HTTP and `file://` (via the Add book picker).

---

## Architecture

```
landing.html
  ├── file://  → IndexedDB → stored FileSystemDirectoryHandles
  │              First use: showDirectoryPicker() → save to IDB
  │              Return:    queryPermission() → click → requestPermission() → load
  └── HTTP    → fetch ./books.json → render cards → index.html?dir=<dir>

index.html?id=<key>   (file://)
  └── loader.js → getBook(id) from IDB → requestPermission() → read files

index.html?dir=<dir>  (HTTP)
  └── loader.js → fetch ${dir}/book.json etc.

index.html (no params, file://)
  └── loader.js → location.replace('landing.html')
```

---

## IndexedDB Schema

Store: `books` in DB `audio-book-library`

```
{ id, handle, title, subtitle, author, lastOpened }
```

`handle` is a `FileSystemDirectoryHandle` — only storable in IndexedDB, not localStorage. Chrome persists it across sessions. Permission must be re-requested on each browser restart (one click, no picker).

---

## Pending

- GitHub Pages root should point to `landing.html`, not `index.html`, once more than one book exists. Currently both work since Isabelle's `index.html` has no `?dir` requirement.
- `landing.html` respects the stored theme preference via `data-theme="dark"` default but does not yet read `localStorage` for the user's chosen theme. Low priority.
