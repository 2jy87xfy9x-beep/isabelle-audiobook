# Isabelle v2 — Next steps

**Purpose:** Actionable follow-ups after the v2 content + app implementation. Use the [table of contents](#table-of-contents) to jump to a section. Collapsible blocks use `<details>` / `<summary>` (supported in GitHub, VS Code Markdown preview, and many viewers).

**Related:** [Implementation report (2026-03-23)](2026-03-23-isabelle-v2-implementation-report.md) · [Design spec](../superpowers/specs/2026-03-23-isabelle-v2-design.md) · Branch `feature/isabelle-v2-content-and-app`

**Path:** `C:\audio_book\docs\reports\next-steps-isabelle-v2.md`

---

## Considerations (branch, serve, local tree)

<details>
<summary><strong>Expand: Are you on the right branch? Why the app might still misbehave</strong></summary>

### Branch

In **`C:\audio_book`**, you are on **`feature/isabelle-v2-content-and-app`** (not **`main`**).

Latest commit (verify with `git log -1 --oneline`): **`d7d5347`** — *docs: move next-steps to docs/reports and fix relative links*.

- If “correct” means the Isabelle v2 feature work, you are on the branch that matches that.
- If you expected the stable **`main`** line only, you are not on `main`.

### Which folder `serve` uses

`npx serve .` serves **the current directory** of that terminal. If another window is **`next-step`**, **`single-sh`**, or a different clone, that is a **different** tree than `C:\audio_book`, even if the UI looks similar.

### Local working tree

`git status` may show many modified and untracked files (`index.html`, `js/app.js`, deleted `generate-views.js`, etc.). What you see in the browser is **this working tree**, not necessarily a clean snapshot of the branch tip.

### “Nothing works” vs. what loads

If letter text and view tabs render, the static shell is working. If **playback, translate, save**, or similar fail, those are more likely **JavaScript/runtime or data** issues than “wrong branch” alone.

**Practical check:** In the terminal where you run `serve`, confirm **`cd`** is your intended repo root (e.g. `C:\audio_book`) and **`git branch --show-current`** matches the branch you expect.

</details>

---

## Table of contents

| Area | Jump |
|------|------|
| Debugging | [Considerations (branch, serve, local tree)](#considerations-branch-serve-local-tree) |
| Implementation | [Implementation snapshot](#implementation-snapshot) |
| Overview | [§1 Priority overview](#1-priority-overview) |
| Content & data | [§2 Book and context pipeline (no embedded APIs)](#2-book-and-context-pipeline-no-embedded-apis) |
| Quality & extraction | [§3 Improve letter and context quality](#3-improve-letter-and-context-quality) |
| App verification | [§4 Manual QA in the browser](#4-manual-qa-in-the-browser) |
| GitHub Pages & save | [§5 Deploy and GitHub sync](#5-deploy-and-github-sync) |
| Tests & CI | [§6 Automation and regression](#6-automation-and-regression) |
| Product gaps | [§7 Spec gaps and polish](#7-spec-gaps-and-polish) |
| Reference | [§8 Commands and file map](#8-commands-and-file-map) |

---

## Implementation snapshot

<details>
<summary><strong>Expand: What’s implemented (pipeline + app)</strong></summary>

**Authoritative write-up:** [Implementation report (2026-03-23)](2026-03-23-isabelle-v2-implementation-report.md).

**Content pipeline (Plan A)**

- **`extract.js`** — `Isabelle.html` → `book.json` + `context-seed.json` (jsdom; letter boundaries via `Letter N` markers; chapter/narrative seed).
- **`fill-views-from-original.js`** — Optional: copy `original_french` into null view fields until editorial text exists.
- **`build-context.js`** — Offline build of **`context.json`** from seed + fixed stubs.
- **`map-refs.js`** — Alias-driven **`contextRefs`** / **`letterRefs`**.
- **Verification:** `node --test tests/test-extract.js` (and full suite listed in [§8.1](#81-one-line-reference)).

**Reader app (Plan B)**

- **`index.html`** — Shell, layout CSS, bottom bar, overlays.
- **`js/`** — `loader.js`, `renderer.js`, `player.js`, `progress.js`, `github.js`, `focusMode.js`, `sync.js`, `smartFeatures.js` (14 toggles), `exporter.js`, `editor.js`, `app.js` (wiring).
- **`resolvePosition`** — Default `letter_id` when no saved position (`letter-001`).
- **`github.js`** — Contents API helpers; `getConfig()` null when `window` is undefined (Node tests).

**Layout & browser behavior (post-report polish)**

- Document **`translate="no"`** + **`notranslate`** meta so Edge/Chrome do not auto-prompt “Translate this page”; a **Translate** control sends visible letter text to Google Translate in a new tab.
- **Resizable** sidebar and context panel (drag gutters); widths stored in `localStorage` (`isabelle-v2-sidebar-w`, `isabelle-v2-context-w`).
- **Collapsible** bottom bar (**▽** + **Shift+H** + thin pull strip when hidden); state in `isabelle-v2-bottom-collapsed`. Collapse uses flex-safe CSS (`min-height: 0`, collapsed `flex: 0 0 0`, `max-height: 0`) so the bar actually disappears in a column flex layout.
- **Sidebar chrome:** header row with **⟨** (`#btn-sidebar-collapse`) hides the letter list on desktop; when the sidebar is collapsed, a **10px accent strip** (`#sidebar-reveal`, left edge of `#app`) restores it. **Mobile (≤767px):** only the **`.open`** class slides the drawer; **`.collapsed` no longer forces width 0** on the fixed sidebar so it does not fight the drawer.
- **Bottom bar height:** drag handle on the top edge of the bar (`#bottom-bar-resize`); CSS variable **`--bottom-bar-max-h`** (default 400px) caps **`.bar-row`** scroll height; persisted as **`isabelle-v2-bottom-bar-max-h`**. **↑/↓** on the focused handle nudges height; **Enter** clears the override.
- **TTS voice dropdowns** (`#letter-voice-select`, `#context-voice-select`): Chromium often returns an empty `speechSynthesis.getVoices()` list until late; **`populateVoiceSelectors()`** in **`js/app.js`** shows **“Loading voices…”**, listens for **`voiceschanged`**, and **retries at 0 / 80 / 250 / 700 / 2000 ms**. Saved URIs in **`isabelle-v2-letter-voice`** / **`isabelle-v2-context-voice`**; **`change`** handlers bound once via **`addEventListener`**.
- **Tooltips:** bottom bar (and pull strip / sidebar reveal / sidebar collapse) use **`data-tip`** + **`::before`/`::after`** in **`index.html`** (themed bubble, **`pointer-events: none`** on pseudos). Voice **`<select>`** elements sit in **`.bar-tip-wrap-select`** spans so the tip can anchor on hover/focus.
- **Bottom bar click-through fix:** **`#op-feedback`** and **`#undo-nav`** are **`position: fixed`** and were moved **out of `#bottom-bar`** (they are now body siblings between the bar and **`#pull-strip`**). Keeping them inside a parent with **`overflow-y: auto`** made fixed positioning relative to the scrollport and could block hits on the toolbar. Scrolling now applies to **`.bar-row`** only; **`#bottom-bar`** uses **`overflow: visible`** and **`z-index: 30`**.
- **Thinner** scrollbars on letter, nav, and context panes.
- Exported HTML from **`exporter.js`** uses the same **notranslate** hints.

<details>
<summary><strong>Expand: File-level map for the above UI</strong></summary>

| Area | Where |
|------|--------|
| Shell, layout CSS, bottom bar DOM, tooltip rules, sidebar head / reveal strip | `index.html` |
| `populateVoiceSelectors`, retries, `initBottomBarResize`, `toggleSidebar` / `closeSidebar` / `openSidebar` / `syncSidebarRevealFocus`, `isMobileLayout`, optional chaining on sidebar nodes | `js/app.js` |
| TTS playback, `autoSelectVoices`, `setLetterVoice` / `setContextVoice` | `js/player.js` |

</details>

**Local run**

```powershell
cd C:\audio_book
npx serve . -p 8080
```

Open the URL the CLI prints (another port if 8080 is in use).

</details>

---

## 1. Priority overview

Do these in order if you want production-quality text and a shippable site.

1. **Run the content pipeline** and replace placeholder view text with editorial output ([§2](#2-book-and-context-pipeline-no-embedded-apis)).
2. **Run the manual browser checklist** ([§4](#4-manual-qa-in-the-browser)).
3. **Configure GitHub Pages** and PAT for save ([§5](#5-deploy-and-github-sync)).
4. **Track remaining spec polish** as you discover issues ([§7](#7-spec-gaps-and-polish)).

<details>
<summary><strong>Expand: Risk register (what breaks if skipped)</strong></summary>

| If you skip… | Risk |
|--------------|------|
| Skipping editorial views | `fill-views-from-original.js` only duplicates `original_french`; readers never see distinct modern French or plain English until you author them externally. |
| `map-refs.js` after new context | Stale or empty `contextRefs` / `letterRefs`; context panel and narrator “both” mode underuse Book 2. |
| Browser QA | Speech synthesis, mobile layout, export download, and keyboard flows may fail only in real Chrome/Edge. |
| GitHub config | Save button errors; `getConfig()` expects `*.github.io` hostname + token ([§5.2](#52-github-save-and-localhost)). |

</details>

---

## 2. Book and context pipeline (no embedded APIs)

Goal: Rebuild `book.json` / `context-seed.json` from HTML when the manuscript changes, optionally propagate placeholder view text, rebuild **`context.json`** offline, refresh cross-references, then **author real translations and Book 2 prose outside the repo** (any editor or toolchain you use) and commit the updated JSON.

<details>
<summary><strong>2.1 Prerequisites</strong></summary>

- **Node.js 18+** — verify: `node --version`
- **Working directory:** `C:\audio_book` (or your clone root)
- **Dependencies:** `npm install` (provides `jsdom` for `extract.js`)

This repository does **not** read API keys for text generation; there is nothing to configure for “remote models.”

</details>

<details>
<summary><strong>2.2 Run pipeline (full sequence)</strong></summary>

```powershell
cd C:\audio_book

# If Isabelle.html changed — rebuild book + narrative seed:
node extract.js

# Optional: copy original_french into any still-null view fields (prototyping only):
node fill-views-from-original.js

# Build context.json from context-seed.json + fixed stubs (offline):
node build-context.js

# Re-scan aliases → contextRefs / letterRefs:
node map-refs.js

# Validate:
node --test tests/test-extract.js
```

**Expected:** `tests/test-extract.js` exits 0; no complete letter missing `plain_english` after propagation or hand edit; cross-reference tests pass.

**Outside-repo work:** Replace duplicated `views.*` strings with human translations; expand `context.json` entries (`content`, `aliases`, `relatedRefs`). Re-run **`node map-refs.js`** after alias or entry changes so `letterRefs` stay aligned.

</details>

<details>
<summary><strong>2.3 When things fail</strong></summary>

| Symptom | What to check |
|---------|----------------|
| `Cannot find module 'jsdom'` | Run `npm install` from repo root. |
| Tests fail after `extract.js` | Letter detection or HTML structure changed — adjust `extract.js`, re-run pipeline. |
| Tests fail after `map-refs.js` | A `contextRefs` id not in `context.json` — fix entries or aliases in `map-refs.js` (min alias length 4). |
| `plain_english` still source noise | Expected until editorial pass; `fill-views-from-original.js` does not create new wording. |

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

After any `extract.js` change: `node extract.js` → optional `fill-views-from-original.js` → hand-edit or import views → `build-context.js` → `map-refs.js` → run tests.

</details>

<details>
<summary><strong>3.2 Context (`build-context.js`) — Book 2 depth</strong></summary>

The script produces **stub** entries (places, concepts, chapter titles). Editorial next steps:

- Review **`context.json`** for duplicate `id` values after slugify (`build-context.js` skips collisions).
- Fill **`content`** paragraphs for key people (Marie-Christine, Joseph II, etc.) per [design spec](../superpowers/specs/2026-03-23-isabelle-v2-design.md).
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
- [ ] **Letter / context voice** dropdowns list system voices (may show “Loading voices…” briefly); changing voice affects the next utterance.
- [ ] **📖** opens/closes context panel; clicking a **dotted underline** span opens the right entry.
- [ ] **✦** opens smart features; count **14** switches; toggles persist after reload.
- [ ] **↓** export: choose scope/view/format; **HTML** downloads a file; open offline to confirm self-contained output.
- [ ] **Bottom bar** can collapse; **pull strip** restores it; **Shift+H** toggles chrome (keyboard nav feature must be on).
- [ ] **Sidebar ⟨** hides the list; **left accent strip** (when collapsed on desktop) or **≡** restores it; no dead clicks on bottom bar icons (fixed overlays / overflow — see [Implementation snapshot](#implementation-snapshot)).
- [ ] **Resize handle** above the bottom bar changes max height; bar row scrolls if controls wrap; **Enter** on focused handle resets height.

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

Cross-check with [2026-03-23-isabelle-v2-design.md](../superpowers/specs/2026-03-23-isabelle-v2-design.md).

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
| Propagate views from `original_french` | `node fill-views-from-original.js` |
| Build context (offline) | `node build-context.js` |
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
| `fill-views-from-original.js` | Copies `original_french` into null `views.*` (optional) |
| `build-context.js` | `context-seed.json` + stubs → `context.json` (offline) |
| `map-refs.js` | Sync `contextRefs` / `letterRefs` |
| `book.json` / `context.json` | Runtime data for the app |
| `index.html` | Shell + CSS |
| `js/app.js` | Wiring |
| `tests/test-extract.js` | Schema + integrity + `plain_english` |

</details>

<details>
<summary><strong>8.3 Documentation links (repo-relative)</strong></summary>

- [Implementation report](2026-03-23-isabelle-v2-implementation-report.md)
- [Design spec](../superpowers/specs/2026-03-23-isabelle-v2-design.md)
- [Content preparation plan](../superpowers/plans/2026-03-23-isabelle-content-preparation.md)
- [App build plan](../superpowers/plans/2026-03-23-isabelle-app-build.md)

</details>

---

*Last updated: 2026-03-23 (implementation snapshot + QA checklist: UI chrome, TTS voices, bottom bar hit-testing). Update this file when you complete phases (e.g. strike checklist items or add dated “Done” notes).*
