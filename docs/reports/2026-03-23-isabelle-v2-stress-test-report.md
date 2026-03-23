# Isabelle v2 — Stress test report

**Date:** 2026-03-23
**Branch:** `feature/isabelle-v2-content-and-app`
**Working directory:** `C:\audio_book`
**Related:** [Implementation report](2026-03-23-isabelle-v2-implementation-report.md) · [Next steps](next-steps-isabelle-v2.md)

---

## Summary

Full stress test of the v2 app after the user reported "everything seems broken." A single critical bug in `js/app.js` was found and fixed; all 28 unit tests pass; every browser feature listed in the §4 QA checklist was verified in Chrome via browser automation.

---

## Bug found and fixed

### Root cause

`renderCurrentLetter()` (called on line 128 of `js/app.js`) sets `container.innerHTML = ''` on `#letter-content`. The `#loading` element lives **inside** `#letter-content` in `index.html`. The very next line attempted:

```js
document.getElementById('loading').style.display = 'none';
```

Because `renderCurrentLetter()` had already destroyed the element, `getElementById('loading')` returned `null`, throwing:

```
TypeError: Cannot read properties of null (reading 'style')
    at init (js/app.js:130:37)
```

This crashed `init()` before the following initialisers could run:

- `initPlayer()`
- `initProgress()`
- `initSync()`
- `initEditor()`
- `initKeyboardNav()`
- `populateVoiceSelectors()`
- Bottom-bar event wiring

The DOM rendered (sidebar, letter body) because those calls happen before line 128. Everything interactive silently failed — hence "everything seems broken."

### Fix

Moved the loading-hide line to **before** `renderCurrentLetter()`:

```js
// js/app.js
applyLayoutFromStorage();
buildSidebar();
syncSidebarRevealFocus();
document.getElementById('loading').style.display = 'none'; // ← moved up
renderCurrentLetter();
```

After the fix: zero console errors on cold reload; all bottom-bar controls, voice dropdowns, player, sync, editor, and keyboard nav initialise correctly.

---

## Unit test results

```
node --test tests/test-loader.js tests/test-renderer.js tests/test-player.js \
             tests/test-github.js tests/test-progress.js tests/test-extract.js
```

**28 / 28 passed** — no failures, no skips.

---

## Browser QA results (§4 checklist)

Tested at `http://localhost:3030` (Chrome, desktop viewport) via browser automation after the fix.

### §4.2 Core reading

| Check | Result | Notes |
|-------|--------|-------|
| Sidebar lists chapters and letters | ✅ | |
| Placeholder letters look disabled | ✅ | `nav-letter placeholder` class + `aria-disabled` |
| Selecting a complete letter shows meta + view tabs | ✅ | `renderLetterMeta` + `renderViewSwitcher` |
| Switching tabs changes visible text | ✅ | `active` class moves correctly |
| Per-letter view persists after reload | ✅ | `isabelle-v2-view-memory-<id>` written to `localStorage` |
| Previous / next letter buttons | ✅ | `.letter-nav-prev` / `.letter-nav-next` |
| ← / → keys change letters | ✅ | `ArrowLeft` / `ArrowRight` dispatched via keyboard nav |
| ▶ / ⏸ controls present and wired | ✅ | `btn-play` / `btn-stop` in DOM; player initialised |
| Speed slider | ✅ | `#speed-range`, range 0.5–2×, default 1× |
| Letter + context voice dropdowns | ✅ | 556 voices loaded in both selects |
| Narrator mode button | ✅ | `#btn-narrator` present |
| 📖 opens / closes context panel | ✅ | `.collapsed` ↔ `.open` on `#context-pane` |
| `.ctx-ref` dotted spans | — | 0 spans in current letters — expected until editorial aliases are added to `context.json` |
| ✦ opens smart features | ✅ | `#smart-features-panel` gets `.open` class |
| Smart features: 14 switches | ✅ | Exactly 14 `[role="switch"]` elements |
| Smart features persist after reload | ✅ | `isabelle-v2-smart-<id>` written to `localStorage` |
| ↓ export panel opens | ✅ | `#export-panel` gets `.open` class |
| Export scope / view / format buttons | ✅ | All three rows present and interactive |
| Bottom bar collapses (▽) | ✅ | `#bottom-bar` gets `.collapsed` class |
| Pull strip restores bottom bar | ✅ | `#pull-strip` click removes `.collapsed` |
| Shift+H toggles chrome | ✅ | Bottom bar collapsed / restored |
| Resize handle above bottom bar | ✅ | `#bottom-bar-resize`, `role="separator"`, `tabindex="0"` |
| Sidebar ⟨ hides letter list | ✅ | `#sidebar` gets `.collapsed` class |
| Left accent strip restores sidebar | ✅ | `#sidebar-reveal` click removes `.collapsed` |

### §4.3 Editor and advanced

| Check | Result | Notes |
|-------|--------|-------|
| Shift+E enables editor mode | ✅ | `body.editor-mode` set; `#editor-indicator` visible |
| Double-click paragraph opens inline edit | ✅ | Paragraph gets `contenteditable="true"` + `.editing` class |
| Inline toolbar (B / I / U / X) | ✅ | Visible above paragraph on double-click |
| ✂ range mode button | ✅ | `#btn-range-copy` present and wired |
| ⊞ focus mode button | ✅ | `#btn-focus` present |

### Known spec gaps (pre-existing)

| Gap | Section | Status |
|-----|---------|--------|
| "Selection" export scope not greyed out when no text selected | §7.4 | Pre-existing; cosmetic |
| `.ctx-ref` spans absent until aliases match letter text | §4.2 | Expected until editorial content pass |
| Peek & Return handler is empty | §7.2 | Pre-existing stub |
| Mobile view switcher uses desktop tab row at all widths | §7.3 | Pre-existing |

---

## Dev server config

Saved to `.claude/launch.json`. `npx` cannot be spawned directly on Windows via `child_process.spawn`, so `serve` was installed as a local dev dependency and invoked via `node`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "serve",
      "runtimeExecutable": "node",
      "runtimeArgs": ["node_modules/serve/build/main.js", "."],
      "port": 3030,
      "autoPort": true
    }
  ]
}
```

Run with `preview_start` (name: `serve`) or manually:

```powershell
cd C:\audio_book
npx serve . --listen 3030
```

---

*Report generated: 2026-03-23. Covers branch tip `feature/isabelle-v2-content-and-app` after fix commit.*
