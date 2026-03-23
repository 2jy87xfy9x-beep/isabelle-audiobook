# Isabelle v2 — Next steps

**Purpose:** Actionable follow-ups after the v2 content + app implementation. Use the [table of contents](#table-of-contents) to jump to a section. Collapsible blocks use `<details>` / `<summary>` (supported in GitHub, VS Code Markdown preview, and many viewers).

**Related:** [Implementation report (2026-03-23)](reports/2026-03-23-isabelle-v2-implementation-report.md) · [Design spec](superpowers/specs/2026-03-23-isabelle-v2-design.md) · Branch `feature/isabelle-v2-content-and-app`

---

## Table of contents

| Area | Jump |
|------|------|
| Overview | [§1 Priority overview](#1-priority-overview) |
| Content & data | [§2 Regenerate book and context with API](#2-regenerate-book-and-context-with-api) |
| Quality & extraction | [§3 Improve letter and context quality](#3-improve-letter-and-context-quality) |
| App verification | [§4 Manual QA in the browser](#4-manual-qa-in-the-browser) |
| GitHub Pages & save | [§5 Deploy and GitHub sync](#5-deploy-and-github-sync) |
| Tests & CI | [§6 Automation and regression](#6-automation-and-regression) |
| Product gaps | [§7 Spec gaps and polish](#7-spec-gaps-and-polish) |
| Reference | [§8 Commands and file map](#8-commands-and-file-map) |

---

## 1. Priority overview

Do these in order if you want production-quality text and a shippable site.

1. **Set API credentials** and re-run content scripts ([§2](#2-regenerate-book-and-context-with-api)).
2. **Run the manual browser checklist** ([§4](#4-manual-qa-in-the-browser)).
3. **Configure GitHub Pages** and PAT for save ([§5](#5-deploy-and-github-sync)).
4. **Track remaining spec polish** as you discover issues ([§7](#7-spec-gaps-and-polish)).

<details>
<summary><strong>Expand: Risk register (what breaks if skipped)</strong></summary>

| If you skip… | Risk |
|--------------|------|
| API regeneration | All “translations” may be identical copies of noisy source text; readers see no real `plain_english` / French variants. |
| `map-refs.js` after new context | Stale or empty `contextRefs` / `letterRefs`; context panel and narrator “both” mode underuse Book 2. |
| Browser QA | Speech synthesis, mobile layout, export download, and keyboard flows may fail only in real Chrome/Edge. |
| GitHub config | Save button errors; `getConfig()` expects `*.github.io` hostname + token ([§5.2](#52-github-save-and-localhost)). |

</details>

---

## 2. Regenerate book and context with API

Goal: Replace offline copies with Claude-generated views and richer `context.json`, then refresh cross-references.

<details>
<summary><strong>2.1 Prerequisites</strong></summary>

- **Node.js 18+** — verify: `node --version`
- **Working directory:** `C:\audio_book` (or your clone root)
- **Anthropic API key** — create at [Anthropic Console](https://console.anthropic.com/) (account required)
- **Optional:** `ANTHROPIC_MODEL` if your org uses a fixed model id (default in repo: `claude-sonnet-4-20250514`)

</details>

<details>
<summary><strong>2.2 Set environment variables (Windows)</strong></summary>

**Session only (PowerShell):**

```powershell
cd C:\audio_book
$env:ANTHROPIC_API_KEY = "sk-ant-api03-..."
# optional:
$env:ANTHROPIC_MODEL = "claude-sonnet-4-20250514"
```

**Persistent `.env` (not committed — already in `.gitignore`):**

Create `C:\audio_book\.env`:

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
# ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

Scripts `generate-views.js` and `build-context.js` load `.env` if present (simple `ANTHROPIC_API_KEY=` line parser).

</details>

<details>
<summary><strong>2.3 Run pipeline (full sequence)</strong></summary>

```powershell
cd C:\audio_book

# If HTML changed — rebuild book + seed only:
node extract.js

# Generate 4 views per complete letter (batched writes to book.json):
node generate-views.js

# Rebuild context entries from seed + API entity extraction:
node build-context.js

# Re-scan aliases → contextRefs / letterRefs:
node map-refs.js

# Validate:
node --test tests/test-extract.js
```

**Expected:** `tests/test-extract.js` exits 0; no complete letter missing `plain_english`; cross-reference tests pass.

**Resumability:** `generate-views.js` skips letters that already have `plain_english`. If the run stops mid-batch, re-run the same command.

**Cost note:** 82+ complete letters × one API call each (plus `build-context.js`) will incur API usage; monitor usage in the Anthropic console.

</details>

<details>
<summary><strong>2.4 When things fail</strong></summary>

| Symptom | What to check |
|---------|----------------|
| `ANTHROPIC_API_KEY not set` | Env var or `.env` line; restart terminal after editing system env. |
| JSON parse error in `generate-views.js` | Model returned markdown fences or prose; re-run for failed IDs or tighten the prompt in `generate-views.js`. |
| `401` / `403` from API | Key validity, billing, model access. |
| Tests fail after `map-refs.js` | A `contextRefs` id not in `context.json` — fix entries or aliases in `map-refs.js` (min alias length 4). |

</details>

---

## 3. Improve letter and context quality

<details>
<summary><strong>3.1 Extraction (`extract.js`) — source truth</strong></summary>

Current logic (summary):

- Letter region: first `<h2>` matching `LETTERS TO` / `MARIE-` / `CHRISTINE`, then all following `<p>` until end of column.
- Letter boundaries: `\bLetter\s+(\d+)\b` in merged blob; longest slice wins per number.
- **112** slots are `complete: false` because no slice was found for those numbers (or text too short).

**Improvements to consider:**

- Tune `Letter` regex if your export uses different markers (`Lettre`, `L. 12`, etc.).
- Merge or split paragraphs if letters are merged incorrectly.
- Map **page numbers** from page-marker `<div>` elements into `letter.page` (currently often `null`).
- Add **recipient** diversity if letters to non–Marie-Christine appear in HTML with different headings.

After any `extract.js` change: `node extract.js` → regenerate views → `map-refs.js` → run tests.

</details>

<details>
<summary><strong>3.2 Context (`build-context.js`) — Book 2 depth</strong></summary>

Offline mode produced **stub** entries (places, concepts, chapter titles). With the API:

- Review **`context.json`** for duplicate `id` values after slugify (`build-context.js` dedupes).
- Fill **`content`** paragraphs for key people (Marie-Christine, Joseph II, etc.) per [design spec](superpowers/specs/2026-03-23-isabelle-v2-design.md).
- Add **`aliases`** that actually appear in letter text so `map-refs.js` and the in-app renderer agree.
- Add **`relatedRefs`** for cross-links in the context panel.

Re-run **`node map-refs.js`** after editing `context.json` manually so `letterRefs` stay consistent (or extend the script to be one-way only from book → context).

</details>

<details>
<summary><strong>3.3 Version control for large JSON</strong></summary>

`book.json` is large. Options:

- Commit generated artifacts on a **content** branch and merge to `main` when QA passes.
- Use **Git LFS** if clones become slow.
- Keep **`Isabelle.html`** in the repo if it is the canonical import (currently may be untracked — add if desired).

</details>

---

## 4. Manual QA in the browser

<details>
<summary><strong>4.1 Serve locally</strong></summary>

```powershell
cd C:\audio_book
npx serve . -p 8080
```

Open: [http://localhost:8080](http://localhost:8080)

Use **Chrome or Edge** (Web Speech API behavior matches the spec targets).

</details>

<details>
<summary><strong>4.2 Core reading checklist</strong></summary>

- [ ] Sidebar lists chapters and letters; **placeholder** letters look disabled.
- [ ] Selecting a complete letter shows **meta** (date, letter number) and **view tabs** (vieux fr, fr moderne, …).
- [ ] Switching tabs changes visible text; **per-letter view** persists after reload (`localStorage` keys `isabelle-v2-view-memory-*`).
- [ ] **Previous / next** letter buttons and **← / →** keys (when not in an input) change letters.
- [ ] **▶ / ⏸** speaks text; **speed** slider affects rate; **♪** cycles narrator modes (`letters` / `context` / `both` / `silent`).
- [ ] **📖** opens/closes context panel; clicking a **dotted underline** span opens the right entry.
- [ ] **✦** opens smart features; count **14** switches; toggles persist after reload.
- [ ] **↓** export: choose scope/view/format; **HTML** downloads a file; open offline to confirm self-contained output.
- [ ] **Bottom bar** can collapse; **pull strip** restores it; **Shift+H** toggles chrome (keyboard nav feature must be on).

</details>

<details>
<summary><strong>4.3 Editor and advanced</strong></summary>

- [ ] **Shift+E** (or long-press letter number) enables editor; **🖉** appears.
- [ ] Double-click / long-press paragraph opens **inline edit**; toolbar works.
- [ ] **✂** range mode: banner shows; two clicks copy; **Esc** exits.
- [ ] **⊞** cycles focus modes; **page** mode toggles `body.page-mode` (layout sanity on narrow viewports).

</details>

<details>
<summary><strong>4.4 Mobile viewport (DevTools)</strong></summary>

- [ ] Sidebar slides from left (**≡**); context from right (**📖**).
- [ ] Touch targets ≥ 44px where spec requires (pull strip is the documented exception).
- [ ] No impossible overflow on the bottom bar (wrap acceptable).

</details>

---

## 5. Deploy and GitHub sync

<details>
<summary><strong>5.1 GitHub Pages</strong></summary>

1. Push branch `feature/isabelle-v2-content-and-app` (or merge to `main`).
2. Repository **Settings → Pages**: source = branch + `/ (root)` or `/docs` if you move assets.
3. Wait for build; site URL will be `https://<user>.github.io/<repo>/` (or custom domain).

Ensure these paths resolve from site root:

- `book.json`, `context.json`
- `js/app.js` and siblings
- `index.html`

</details>

<details>
<summary><strong>5.2 GitHub save and localhost</strong></summary>

`js/github.js` **`getConfig()`** expects:

- Hostname like **`something.github.io`** (extracts owner from subdomain).
- **`localStorage`** token under `isabelle-v2-github-token` (set via your own settings UI if you add one; **Save** currently calls API when token exists).

On **`localhost`**, `getConfig()` returns **`null`** → save shows a config-related message. **Next step options:**

- Add a **dev override** (e.g. `?dev_repo=owner/repo` or `data-repo` + `data-github-dev` on `<html>`) — *small feature work*.
- Or test save only on the **deployed** GitHub Pages URL.

Token requirements (from spec): classic PAT with **`public_repo`** (or appropriate scope for a public repo).

</details>

<details>
<summary><strong>5.3 Merge strategy</strong></summary>

- Open a PR from `feature/isabelle-v2-content-and-app` → `main`.
- Confirm **CI** (if you add it) runs `node --test …`.
- After merge, tag a release if you version the book JSON for readers.

</details>

---

## 6. Automation and regression

<details>
<summary><strong>6.1 Command bundle</strong></summary>

```powershell
cd C:\audio_book
node --test tests/test-loader.js tests/test-renderer.js tests/test-player.js tests/test-github.js tests/test-progress.js tests/test-extract.js
```

Add to **CI** (GitHub Actions, etc.): checkout → `npm ci` → command above (Node 20 LTS recommended).

</details>

<details>
<summary><strong>6.2 Optional new tests</strong></summary>

- **Exporter:** JSDOM + stub `URL.createObjectURL` / `document.createElement('a')` to assert HTML contains `<article>` and escaped text.
- **App bootstrap:** Playwright smoke: load page, wait for sidebar letter button, no console error.
- **Golden file:** Hash of a tiny fixture `book.json` slice for renderer output.

</details>

---

## 7. Spec gaps and polish

Cross-check with [2026-03-23-isabelle-v2-design.md](superpowers/specs/2026-03-23-isabelle-v2-design.md).

<details>
<summary><strong>7.1 Narrator “both” mode</strong></summary>

Spec: one context snippet per paragraph, sentence split regex, watchdog on utterances. **Verify** on Windows Chrome that `end` events fire; watchdog should recover if not.

**Next step:** Add logging toggle or dev flag to trace sentence index vs. context interjections.

</details>

<details>
<summary><strong>7.2 Peek & Return (Alt / P / long-press)</strong></summary>

`smartFeatures.js` registers **Peek** in keyboard nav with an empty handler in `app.js`. **Next step:** Implement preview overlay per spec (Alt-hold, long-press on `.ctx-ref`, `P` / `Esc`).

</details>

<details>
<summary><strong>7.3 Mobile view switcher</strong></summary>

Spec: single button + listbox. Current UI may use desktop tab row at all widths. **Next step:** Media-query branch in `renderer.js` / `app.js` for `<768px` picker.

</details>

<details>
<summary><strong>7.4 Export scopes</strong></summary>

Confirm **this chapter** and **selection** grey-out rules match spec when selection is empty. Align `exportLetters` subset logic with sidebar chapter boundaries.

</details>

<details>
<summary><strong>7.5 Accessibility audit</strong></summary>

Run **axe** or Lighthouse on `index.html`; verify **tab order** (sidebar → letter → context → bottom bar), **aria** on pickers, and **reduced motion** CSS.

</details>

---

## 8. Commands and file map

<details>
<summary><strong>8.1 One-line reference</strong></summary>

| Action | Command |
|--------|---------|
| Extract HTML → JSON | `node extract.js` |
| Generate views (API) | `node generate-views.js` |
| Build context (API) | `node build-context.js` |
| Map refs | `node map-refs.js` |
| All unit tests | `node --test tests/test-loader.js tests/test-renderer.js tests/test-player.js tests/test-github.js tests/test-progress.js tests/test-extract.js` |
| Serve | `npx serve . -p 8080` |

</details>

<details>
<summary><strong>8.2 Key files</strong></summary>

| Path | Role |
|------|------|
| `Isabelle.html` | Source manuscript (ensure tracked if canonical) |
| `extract.js` | HTML → `book.json`, `context-seed.json` |
| `generate-views.js` | API → fills `views.*` on `book.json` |
| `build-context.js` | `context-seed.json` + API → `context.json` |
| `map-refs.js` | Sync `contextRefs` / `letterRefs` |
| `book.json` / `context.json` | Runtime data for the app |
| `index.html` | Shell + CSS |
| `js/app.js` | Wiring |
| `tests/test-extract.js` | Schema + integrity + `plain_english` |

</details>

<details>
<summary><strong>8.3 Documentation links (repo-relative)</strong></summary>

- [Implementation report](reports/2026-03-23-isabelle-v2-implementation-report.md)
- [Design spec](superpowers/specs/2026-03-23-isabelle-v2-design.md)
- [Content preparation plan](superpowers/plans/2026-03-23-isabelle-content-preparation.md)
- [App build plan](superpowers/plans/2026-03-23-isabelle-app-build.md)

</details>

---

*Last updated: 2026-03-23. Update this file when you complete phases (e.g. strike checklist items or add dated “Done” notes).*
