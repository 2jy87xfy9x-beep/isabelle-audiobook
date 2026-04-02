# Single-File Consolidation + Book Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse 14 JS files + 2 HTML files into a single `index.html` with one inline `<script type="module">`, and replace the separate landing page with an in-reader bookshelf panel that auto-loads the most recent book on `file://`.

**Architecture:** All JS sections live as a single `<script type="module">` in `index.html`, ordered so each section's dependencies are defined above it. The bookshelf panel mirrors the existing Smart Features and Export panels (fixed-position, `.open` toggle). `loadData()` detects no-`?id=` on `file://` and either auto-loads the most recent IDB entry or throws a `no_books` sentinel that triggers the panel.

**Tech Stack:** Vanilla JS (ES2022), IndexedDB, Web File System Access API, Web Speech API, Chrome `file://` protocol.

---

## Section order for the inline script

The inline `<script type="module">` must define these sections top-to-bottom (each is a labeled comment block — `// ── §N NAME ─────────`):

| § | Section | Source | Notes |
|---|---------|---------|-------|
| 1 | DB | `js/db.js` | drop `export` keywords |
| 2 | GITHUB | `js/github.js` | drop `export` keywords |
| 3 | LOADER | `js/loader.js` | drop `import`/`export`; replace auto-redirect with new logic (see Task 2) |
| 4 | RENDERER | `js/renderer.js` | no imports; drop `export` keywords |
| 5 | PLAYER | `js/player.js` | no imports; drop `export` keywords |
| 6 | FOCUS MODE | `js/focusMode.js` | no imports; drop `export` keywords |
| 7 | EXPORTER | `js/exporter.js` | no imports; drop `export` keywords |
| 8 | SMART FEATURES | `js/smartFeatures.js` | no imports; drop `export` keywords |
| 9 | EDITOR | `js/editor.js` | imports `showFeedback` from smartFeatures → already in scope above; drop `import`/`export` |
| 10 | SNAPSHOT | `js/snapshot.js` | no imports; drop `export` keywords |
| 11 | PROGRESS | `js/progress.js` | imports `saveLocalPosition` + `saveToGitHub` → in scope; drop `import`/`export` |
| 12 | SYNC | `js/sync.js` | no imports; drop `export` keywords |
| 13 | BOOKSHELF | (new) | lifted from `js/landing.js`; adapted for panel, not page |
| 14 | APP | `js/app.js` | drop all `import` statements; add bookshelf wiring |

---

## Task 1: Add bookshelf panel CSS and HTML to index.html

**Files:**
- Modify: `index.html` (CSS block, HTML body)

- [ ] **Step 1: Add bookshelf panel CSS**

  In `index.html`, append inside the `<style>` block (after the `#export-panel` rules, around line 209):

  ```css
  #bookshelf-panel{position:fixed;bottom:52px;right:20px;background:var(--surf);border:1px solid var(--border);padding:20px 24px;z-index:50;display:none;min-width:300px;max-height:70vh;overflow-y:auto}
  #bookshelf-panel.open{display:block}
  .bs-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
  .bs-title{font-family:var(--ui-font);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
  .bs-add-btn{background:none;border:1px solid var(--border);color:var(--text-m);font-family:var(--ui-font);font-size:.62rem;padding:5px 10px;cursor:pointer;transition:all var(--t)}
  .bs-add-btn:hover{color:var(--text);border-color:var(--accent);background:var(--accent-bg)}
  .bs-card{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer}
  .bs-card:last-child{border-bottom:none}
  .bs-card:hover .bs-card-title{color:var(--accent)}
  .bs-card-info{flex:1;min-width:0}
  .bs-card-title{font-family:var(--book-font);font-size:.88rem;color:var(--text);transition:color var(--t);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bs-card-author{font-family:var(--ui-font);font-size:.62rem;color:var(--text-d);margin-top:2px}
  .bs-card-badge{font-family:var(--ui-font);font-size:.56rem;color:var(--accent);margin-top:4px}
  .bs-card-remove{background:none;border:none;color:var(--text-d);cursor:pointer;font-size:.8rem;padding:2px 4px;transition:color var(--t);flex-shrink:0}
  .bs-card-remove:hover{color:#f55}
  .bs-empty{font-family:var(--ui-font);font-size:.72rem;color:var(--text-d);font-style:italic;text-align:center;padding:16px 0}
  ```

- [ ] **Step 2: Add bookshelf panel HTML**

  In `index.html`, after the `<div id="export-panel" ...></div>` line (currently line 324), add:

  ```html
  <div id="bookshelf-panel" role="dialog" aria-label="Bookshelf" aria-modal="true" tabindex="-1">
    <div class="bs-header">
      <span class="bs-title">Library</span>
      <button type="button" class="bs-add-btn" id="bs-btn-add">+ Add book</button>
    </div>
    <div id="bs-list"></div>
  </div>
  ```

- [ ] **Step 3: Add bookshelf button to the bottom bar**

  In the `#bar-row-1` section, add a bookshelf button just before `#btn-export` (line ~308):

  ```html
  <button type="button" class="bar-icon bar-tip" id="btn-bookshelf" aria-label="Bookshelf" data-tip="Switch book or add a new one">📚</button>
  ```

- [ ] **Step 4: Update sidebar header — remove landing.html link**

  Change line ~259 from:
  ```html
  <a href="landing.html" class="sidebar-head-title bar-tip" id="sidebar-head-label" style="text-decoration:none;cursor:pointer" data-tip="Back to library">Letters</a>
  ```
  To:
  ```html
  <span class="sidebar-head-title" id="sidebar-head-label">Letters</span>
  ```

- [ ] **Step 5: Verify HTML is well-formed**

  Open `index.html` in Chrome (`file://`). The page should still load from its existing `<script src="js/app.js">` (nothing broken yet). The bookshelf button and panel exist but are inert. No console errors about missing elements.

---

## Task 2: Write the inline script (all JS in one `<script type="module">`)

This is the core task. The implementer builds the new script incrementally in a scratch buffer, then swaps it into `index.html` in one final edit.

**Files:**
- Read (source): all 14 `js/*.js` files
- Modify: `index.html` — replace `<script type="module" src="js/app.js"></script>` (last line before `</body>`) with the full inline script

### Preparation

- [ ] **Step 1: Read all source JS files**

  Read in this order (to understand what each exports):
  ```
  js/db.js           (52 lines)
  js/github.js       (99 lines)
  js/loader.js      (103 lines)
  js/renderer.js    (207 lines)
  js/player.js      (224 lines)
  js/focusMode.js    (54 lines)
  js/exporter.js    (122 lines)
  js/smartFeatures.js (260 lines)
  js/editor.js      (170 lines)
  js/snapshot.js     (22 lines)
  js/progress.js     (44 lines)
  js/sync.js         (29 lines)
  js/landing.js     (144 lines)
  js/app.js        (~600 lines)
  ```

### Build the script

- [ ] **Step 2: Build §§1–12 (DB through SYNC)**

  Concatenate sections in order. For each section:
  - Copy the file's content verbatim
  - Remove `export` from function/class/const declarations
  - Remove the entire `import ...` line(s) at the top
  - Wrap in a labeled comment: `// ── §N NAME ────────────────────────────────────────`

  There are no name collisions across files. No other changes needed for §§1–12.

  > **Note on `loader.js` (§3):** Replace the entire `loadData` function with the new version below. Keep `getBookHandle`, `getContextHandle`, `loadFromIDB`, `writeBookToDisk`, `writeContextToDisk`, `resolvePosition`, `loadLocalPosition`, `saveLocalPosition` unchanged (minus import/export tokens).

  New `loadData()`:
  ```js
  async function loadData() {
    const params = new URLSearchParams(location.search);
    if (location.protocol === 'file:') {
      const id = params.get('id');
      if (id) return loadFromIDB(id);
      // No ?id — find the most recently opened book
      const books = await getAllBooks();
      if (books.length === 0)
        throw Object.assign(new Error('no_books'), { code: 'no_books' });
      const recent = books.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))[0];
      history.replaceState(null, '', `?id=${encodeURIComponent(recent.id)}`);
      return loadFromIDB(recent.id);
    }
    // HTTP — fetch from root or named subdirectory
    const dir = params.get('dir');
    const base = dir && dir !== '.' ? `./${dir}` : '.';
    const [bookRes, ctxRes, fictRes] = await Promise.all([
      fetch(`${base}/book.json`),
      fetch(`${base}/context.json`),
      fetch(`${base}/fiction.json`),
    ]);
    if (!bookRes.ok) throw new Error('book_fetch_failed');
    const book    = await bookRes.json();
    const context = ctxRes.ok  ? await ctxRes.json()  : { entries: [] };
    const fiction = fictRes.ok ? await fictRes.json() : { gap_scenes: [], letter_reimaginings: [] };
    return { book, context, fiction };
  }
  ```

- [ ] **Step 3: Build §13 BOOKSHELF**

  Write the BOOKSHELF section fresh (adapted from `landing.js` but as panel logic, not a page):

  ```js
  // ── §13 BOOKSHELF ────────────────────────────────────────────────────────────

  function openBookshelf() {
    document.getElementById('bookshelf-panel').classList.add('open');
    renderBookshelfList();
  }

  function closeBookshelf() {
    document.getElementById('bookshelf-panel').classList.remove('open');
  }

  function toggleBookshelf() {
    const panel = document.getElementById('bookshelf-panel');
    if (panel.classList.contains('open')) closeBookshelf();
    else openBookshelf();
  }

  async function renderBookshelfList() {
    const list = document.getElementById('bs-list');
    list.innerHTML = '';
    const stored = await getAllBooks();
    if (stored.length === 0) {
      const p = document.createElement('p');
      p.className = 'bs-empty';
      p.textContent = 'No books yet — click + Add book to open a folder.';
      list.appendChild(p);
      return;
    }
    for (const entry of stored.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))) {
      let needsPerm = false;
      try {
        const p = await entry.handle.queryPermission({ mode: 'readwrite' });
        needsPerm = p !== 'granted';
      } catch { needsPerm = true; }

      const card = document.createElement('div');
      card.className = 'bs-card';
      card.innerHTML = `
        <div class="bs-card-info">
          <div class="bs-card-title">${bsEsc(entry.title)}</div>
          ${entry.author ? `<div class="bs-card-author">${bsEsc(entry.author)}</div>` : ''}
          ${needsPerm ? '<div class="bs-card-badge">click to allow access</div>' : ''}
        </div>
        <button class="bs-card-remove bar-tip" data-tip="Remove from library" aria-label="Remove">✕</button>
      `;
      card.querySelector('.bs-card-remove').addEventListener('click', async (e) => {
        e.stopPropagation();
        await removeBook(entry.id);
        renderBookshelfList();
      });
      card.addEventListener('click', async () => {
        try {
          const perm = await entry.handle.requestPermission({ mode: 'readwrite' });
          if (perm !== 'granted') return;
        } catch { return; }
        await saveBook({ ...entry, lastOpened: Date.now() });
        location.href = `index.html?id=${encodeURIComponent(entry.id)}`;
      });
      list.appendChild(card);
    }
  }

  async function bsAddBook() {
    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch { return; }
    let title = dirHandle.name, subtitle = '', author = '';
    try {
      const fh = await dirHandle.getFileHandle('book.json');
      const data = JSON.parse(await (await fh.getFile()).text());
      title    = data.title    || title;
      subtitle = data.subtitle || '';
      author   = data.author   || '';
    } catch { /* use dir name */ }
    const id = `book-${Date.now()}`;
    await saveBook({ id, handle: dirHandle, title, subtitle, author, lastOpened: Date.now() });
    renderBookshelfList();
  }

  function bsEsc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function initBookshelf() {
    document.getElementById('btn-bookshelf').addEventListener('click', toggleBookshelf);
    document.getElementById('bs-btn-add').addEventListener('click', bsAddBook);
  }
  ```

- [ ] **Step 4: Build §14 APP**

  Copy `js/app.js` verbatim, then apply these three targeted changes:

  **a) Remove all `import` lines** — there are 11 import statements spanning lines 1–37 of app.js. Remove every line that starts with `import`.

  **b) Update `init()` error handling** — find this block in `init()`:
  ```js
  } catch (e) {
    if (e.message === 'book_not_found' || e.message === 'permission_denied') {
      location.replace('landing.html');
      return;
    }
    document.getElementById('loading').textContent =
      'Could not load book. Check your connection and reload.';
    return;
  ```
  Replace with:
  ```js
  } catch (e) {
    if (e.code === 'no_books') {
      document.getElementById('loading').style.display = 'none';
      openBookshelf();
      return;
    }
    if (e.message === 'book_not_found' || e.message === 'permission_denied') {
      document.getElementById('loading').style.display = 'none';
      openBookshelf();
      return;
    }
    document.getElementById('loading').textContent =
      'Could not load book. Check your connection and reload.';
    return;
  ```

  **c) Call `initBookshelf()` before `loadData()`** — `initBookshelf()` must wire the panel buttons unconditionally, even when `init()` returns early via `no_books` or `permission_denied`. Find the `async function init()` opening and add `initBookshelf()` as the very first statement, before the `if (!window.speechSynthesis)` check:
  ```js
  async function init() {
    initBookshelf();          // ← add this line FIRST
    if (!window.speechSynthesis) {
      ...
  ```

  That's all. The rest of app.js is unchanged.

### Assemble and insert

- [ ] **Step 5: Replace `<script src="js/app.js">` with inline script**

  Find this line near the bottom of `index.html` (line 332):
  ```html
  <script type="module" src="js/app.js"></script>
  ```
  Replace it with:
  ```html
  <script type="module">
  // §§1–14 go here (full assembled script from steps 2–4)
  </script>
  ```

  The full assembled script is the concatenation of §§1–14 in section order, with their comment headers.

---

## Task 3: Smoke-test the result

- [ ] **Step 1: Open `index.html` directly in Chrome (`file://`)**

  **Case A — no books in IDB yet:**
  - Expected: Loading spinner disappears, bookshelf panel opens automatically.
  - Click `+ Add book`, pick a folder with `book.json` → card appears.
  - Click the card → permission prompt → reader loads with the book.

  **Case B — book already in IDB:**
  - Expected: Permission prompt appears if not already granted (Chrome remembers between sessions); reader loads directly with no bookshelf panel shown.

  **Case C — reload while in a book (`?id=` in URL):**
  - Expected: Reader loads directly (same as before).

  **Case D — HTTP (`localhost` or GitHub Pages):**
  - Expected: Reader loads exactly as before (no bookshelf panel triggered).

- [ ] **Step 2: Verify bookshelf panel in reader**

  - Click 📚 in the bottom bar → panel opens.
  - Click a different book card → page reloads into that book.
  - Click ✕ on a card → card removed, list re-renders.
  - Click 📚 again → panel closes.

- [ ] **Step 3: Verify no regressions**

  - All bottom-bar buttons work (play, stop, export, smart features, save, snapshot, restore).
  - Sidebar letter nav, context pane, focus mode, theme toggle all work.
  - No console errors.

---

## Task 4: Delete old files

Only after Tasks 1–3 are confirmed working:

- [ ] **Step 1: Delete all absorbed JS files**

  ```bash
  cd /c/audio_book
  rm js/app.js js/loader.js js/renderer.js js/player.js js/editor.js \
     js/exporter.js js/focusMode.js js/github.js js/smartFeatures.js \
     js/progress.js js/sync.js js/snapshot.js js/db.js js/landing.js
  ```

- [ ] **Step 2: Delete landing.html**

  ```bash
  rm landing.html
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  refactor: consolidate 14 JS modules into single inline index.html

  Drops landing.html and all js/*.js files. Adds in-reader bookshelf panel
  (📚 in bottom bar) that replaces the landing page. On file:// auto-loads
  the most recently opened book; shows panel when library is empty.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Reference: file count before/after

| | Files |
|---|---|
| Before | `landing.html` + `index.html` + 14 `js/*.js` = **16** |
| After | `index.html` = **1** |

Data files (`book.json`, `context.json`, `fiction.json`, `books.json`) are untouched.

---

## Amendment — post-implementation divergences (2026-04-02)

The plan was executed as written, but during smoke-testing the File System Access API approach was replaced entirely. Key differences from the plan:

**Replaced: folder picker + File System Access API → file-input bundle**
- `showDirectoryPicker` / `FileSystemDirectoryHandle` / `requestPermission` / `queryPermission` all removed
- `bsAddBook()` now uses `<input type="file" accept=".json">` — no permissions dialog
- IDB entries store `{ id, bundle: {book, context, fiction}, title, author, lastOpened }` instead of `{ id, handle, ... }`
- `loadFromIDB()` reads bundle data directly from IDB (no file handles)
- `loadData()` on `file://` just reads from IDB — no permission logic needed

**Replaced: GitHub sync → download bundle**
- `§11 PROGRESS` stripped of GitHub sync timer (`scheduleSyncPosition`, `forceSyncPosition`)
- `writeBookToDisk` / `writeContextToDisk` removed; replaced with `downloadBundle(book, context, fiction)`
- `saveAll()` now updates IDB + triggers a browser download of the bundle `.json`
- 💾 button always visible; tooltip updated to reflect download behaviour

**Added: `isabelle.json` bundle**
- One-time conversion script merged `book.json` + `context.json` + `fiction.json` → `isabelle.json`
- This is now the working file; load it via 📚 → + Add book, save via 💾

**Tech stack change:** File System Access API removed from stack. `file://` mode now requires zero browser permissions.
