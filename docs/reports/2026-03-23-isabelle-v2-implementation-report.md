# Isabelle v2 — Implementation report

**Date:** 2026-03-23  
**Branch:** `feature/isabelle-v2-content-and-app`  
**Working directory:** `C:\audio_book`

## Summary

Plan A (content preparation) and Plan B (vanilla ES-module app) from the superpowers specs were implemented on a dedicated feature branch. Automated tests pass; a local static server responds on port 8080. Subagent-driven development was specified in the request; execution was done in the primary session with the same task order and review criteria in mind.

## Plan A — Content preparation

### What was delivered

- **`extract.js`** — Parses `Isabelle.html` with `jsdom`. Letter bodies are taken from the region after headings matching `LETTERS TO` / `MARIE-` / `CHRISTINE`, using `\bLetter\s+(\d+)\b` markers and longest slice per number (source text is noisy/OCR-like). **`book.json`**: `schema_version` 2, 194 letter slots, **82 complete** and 112 `complete: false` placeholders. Narrative chapters feed **`context-seed.json`**.
- Page-marker detection was tightened so only small `<div>` markers (with `<hr>`, no nested `<p>`) count; the full `max-width:600px` column was previously misclassified as a single page strip.
- **`fill-views-from-original.js`** — Optional one-time helper: for complete letters, copies `views.original_french` into any still-null `modern_french`, `literal_english_*`, and `plain_english` slots so tests and the app have non-null text until editorial passes replace those fields.
- **`build-context.js`** — Builds **`context.json`** from fixed seed entries (including **`marie-christine`**, Vienna/Parma/Habsburg stubs) plus one entry per narrative chapter in **`context-seed.json`** (no network calls).
- **`map-refs.js`** — Alias-based `contextRefs` / `letterRefs`.

### Content workflow (clarification)

Translations, paraphrases, and Book 2 prose are **authored outside this repository** and committed as JSON. The repo’s Node scripts only **parse** `Isabelle.html` or **reshape** local files; they do **not** call third-party text APIs. After changing HTML, run `extract.js`, optionally `fill-views-from-original.js`, then `build-context.js` and `map-refs.js`, and validate with tests.

### Plan A verification (run)

```text
node --test tests/test-extract.js
```

Result: **14/14 tests passed** (including cross-reference integrity and `plain_english` checks).

## Plan B — App build

### What was delivered

- Replaced **`index.html`** shell (tokens, layout, bottom bar, overlays).
- Modules: **`loader.js`**, **`renderer.js`**, **`player.js`**, **`progress.js`**, **`github.js`**, **`focusMode.js`**, **`sync.js`**, **`smartFeatures.js`**, **`exporter.js`**, **`editor.js`**, **`app.js`**.
- **`smartFeatures.js`** defines **14** toggles (`FEATURES` array) mounted into `#smart-features-panel`.
- **`resolvePosition`**: when both local and remote are null, **`letter_id` is `'letter-001'`** so unit tests and boot always have a string id.
- **`github.js`**: UTF-8 safe base64 for GitHub Contents API; `getConfig()` returns null when `window` is undefined (Node tests).

### Plan B verification (run)

```text
node --test tests/test-loader.js tests/test-renderer.js tests/test-player.js tests/test-github.js tests/test-progress.js tests/test-extract.js
```

Result: **28/28 tests passed**.

### Local server

```bash
npx serve . -p 8080
```

Smoke check: `http://localhost:8080` returned HTML containing `js/app.js`.

### Manual checks (your machine)

The following were **not** executed in this environment (no Chrome UI):

- Letters visible, playback, context panel, export HTML download, all chrome interactions.

Please open `http://localhost:8080` in Chrome and confirm playback, 📖 context panel, ✦ panel (14 switches), and ↓ HTML export.

## Commits

Multiple commits were made across Tasks 0–10; a few parallel `git commit` races produced slightly mismatched commit messages vs. file lists on disk—**file contents on the branch are consistent** and tests are green.

## Follow-ups

See **[Next steps (full checklist)](next-steps-isabelle-v2.md)** in this folder for detailed procedures, QA lists, and links.

1. Replace propagated view text with **human-edited** content in `book.json` (or your external workflow), expand **`context.json`** entries, then re-run **`map-refs.js`** and tests.
2. Consider **`git add Isabelle.html`** (and any docs you want tracked) if the book source should live in the repo; it remained untracked here.
3. GitHub save from **`localhost`** will not resolve `*.github.io` hostname rules for `github.js`—expect save to prompt for missing config unless you adjust `getConfig()` for local dev or use GitHub Pages URL.
