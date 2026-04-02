# Isabelle — Smart Audiobook

A browser-based audiobook reader with text-to-speech, inline editing, context notes, fiction layers, focus modes, and a bookshelf — all in a single `index.html` file.

## Usage

Open `index.html` directly in Chrome (double-click or drag into browser). No server required.

### Adding a book

Books are stored as JSON bundle files with three sections: `book`, `context`, and `fiction`.

1. Click the bookshelf icon (☰) in the reader
2. Click **+ Add book**
3. Select a `.json` bundle file from your filesystem

The app stores the bundle in the browser's IndexedDB — it persists across sessions on the same machine.

### Saving changes

Click 💾 **Save** to download an updated bundle JSON file. Commit it to your repo with git and push manually when ready.

## File layout

```
index.html          ← entire app (HTML + CSS + JS, single file)
README.md
data/
  isabelle.json     ← book bundle {book, context, fiction}
  context-seed.json ← seed data for context notes
docs/
  reports/          ← session reports
  superpowers/      ← implementation plans
```

## Dev server (optional)

If you want to serve over HTTP (e.g. to test fetch-based book loading):

```
npm install
npm run serve
```

> **Note:** `package.json`, `package-lock.json`, and `node_modules/` are only needed for this dev server. If you don't use it, they are safe to delete.
