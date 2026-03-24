# Isabelle — UI Polish: Spec Gap Closure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four spec gaps identified in `docs/reports/next-steps-isabelle-v2.md §7`:
1. **Peek & Return** — implement the context preview overlay (currently an empty handler)
2. **Mobile view switcher** — replace the tab row with a `<select>` at ≤767px
3. **Export scope grey-out** — disable `selection` scope button when no text is selected; align chapter boundaries
4. **Accessibility audit** — aria attributes, tab order, reduced-motion CSS

**Architecture:** All changes are in `index.html`, `js/renderer.js`, `js/app.js`, and CSS within `index.html`. No new files unless warranted. No framework or build step.

**Tech stack:** Vanilla JS (ES modules), CSS custom properties, `node --test` for unit tests.

**Prerequisite:** All prior commits on branch (v2 app, Book 2 tracks, tooltip system, typography).

---

## Task 1: Peek & Return

**Spec (from `2026-03-23-isabelle-v2-design.md` §4.6):**
> `Alt`-hold (desktop) or long-press a `.ctx-ref` (mobile) previews the context entry without leaving the letter. Release/lift to snap back. Keyboard: `P` opens peek; `Esc` closes and returns.

**Current state:** `onPeek: () => {}` in `js/app.js:152`. The `P` key is wired in `initKeyboardNav` but calls the empty handler.

### Files changed
- `js/app.js` — implement `peekContextEntry(refId)`, `closePeek()`; wire `onPeek`, `Alt` on `.ctx-ref`, long-press on `.ctx-ref`
- `index.html` — `#peek-overlay` DOM element + CSS

### Overlay spec

```html
<div id="peek-overlay" role="dialog" aria-modal="true" aria-label="Context peek" hidden>
  <div id="peek-content"></div>
  <button id="peek-close" aria-label="Close peek (Esc)">✕</button>
</div>
```

CSS requirements:
- `position: fixed; inset: 0; z-index: 200` — full-screen backdrop
- Semi-transparent `background: rgba(0,0,0,0.55)` backdrop
- Inner card: `max-width: 600px; margin: auto; padding: 1.5rem; background: var(--bg-overlay)` (or equivalent surface var)
- `opacity` + `transform: translateY` transition (`0.15s ease`)
- `@media (prefers-reduced-motion: reduce)` — skip transition

- [ ] **Step 1.1: Add `#peek-overlay` to `index.html`**

Insert before `</body>`:
```html
<div id="peek-overlay" role="dialog" aria-modal="true" aria-label="Context peek" hidden>
  <div id="peek-content"></div>
  <button id="peek-close" type="button" aria-label="Close peek (Esc)">✕</button>
</div>
```

Add CSS (inside existing `<style>` block):
```css
#peek-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none;
  transition: opacity .15s ease;
}
#peek-overlay:not([hidden]) { opacity: 1; pointer-events: auto; }
#peek-overlay[hidden] { display: none; }
#peek-content {
  background: var(--bg, #1a1a1a); color: var(--text, #eee);
  max-width: 600px; width: 90%; max-height: 70vh;
  overflow-y: auto; padding: 1.5rem; border-radius: 6px;
  transform: translateY(8px);
  transition: transform .15s ease;
}
#peek-overlay:not([hidden]) #peek-content { transform: translateY(0); }
#peek-close {
  position: absolute; top: 1rem; right: 1rem;
  background: none; border: none; color: var(--text, #eee);
  font-size: 1.2rem; cursor: pointer; padding: .25rem .5rem;
}
@media (prefers-reduced-motion: reduce) {
  #peek-overlay, #peek-content { transition: none; }
}
```

- [ ] **Step 1.2: Implement `peekContextEntry` and `closePeek` in `js/app.js`**

```js
function peekContextEntry(refId) {
  if (!isEnabled('peek-return')) return;
  const entry = appState.contextData?.find(e => e.id === refId);
  if (!entry) return;

  const overlay = document.getElementById('peek-overlay');
  const content = document.getElementById('peek-content');
  const track = appState.book2Track || 'contextual';
  const paragraphs = entry[`content_${track}`] || entry.content_contextual || [];
  content.innerHTML = `<h3>${entry.name || refId}</h3>` +
    paragraphs.map(p => `<p>${p.text}</p>`).join('');

  overlay.removeAttribute('hidden');
  overlay.querySelector('#peek-close').focus();

  // Store scroll position to restore on close (return behaviour)
  overlay._returnEl = document.activeElement;
}

function closePeek() {
  const overlay = document.getElementById('peek-overlay');
  overlay.setAttribute('hidden', '');
  overlay._returnEl?.focus();
}
```

Wire up in `init()` (replace empty handler):
```js
onPeek: () => {
  // P key: peek at first ctx-ref in current letter or close if open
  const overlay = document.getElementById('peek-overlay');
  if (!overlay.hasAttribute('hidden')) { closePeek(); return; }
  const firstRef = document.querySelector('#letter-content .ctx-ref');
  if (firstRef) peekContextEntry(firstRef.dataset.refId);
},
```

- [ ] **Step 1.3: Wire Alt-hold on `.ctx-ref` in `wireControls()` in `js/app.js`**

Event delegation on `#letter-content`:
```js
// Alt+click or Alt-keydown on ctx-ref = peek
document.getElementById('letter-content').addEventListener('click', e => {
  if (!e.altKey) return;
  const ref = e.target.closest('.ctx-ref');
  if (ref) { e.preventDefault(); peekContextEntry(ref.dataset.refId); }
});
```

- [ ] **Step 1.4: Wire long-press on `.ctx-ref` (mobile)**

```js
let longPressTimer = null;
document.getElementById('letter-content').addEventListener('pointerdown', e => {
  const ref = e.target.closest('.ctx-ref');
  if (!ref) return;
  longPressTimer = setTimeout(() => peekContextEntry(ref.dataset.refId), 600);
});
document.getElementById('letter-content').addEventListener('pointerup', () => {
  clearTimeout(longPressTimer);
  longPressTimer = null;
});
document.getElementById('letter-content').addEventListener('pointercancel', () => {
  clearTimeout(longPressTimer);
  longPressTimer = null;
});
```

- [ ] **Step 1.5: Close on Esc and close button**

In `wireControls()`:
```js
document.getElementById('peek-close').addEventListener('click', closePeek);
document.addEventListener('escape-pressed', () => {
  const overlay = document.getElementById('peek-overlay');
  if (!overlay.hasAttribute('hidden')) closePeek();
});
```

- [ ] **Step 1.6: Manual verification**

- Load app in browser.
- Click a dotted-underline context span while holding `Alt` → overlay opens with entry content.
- Press `Esc` → overlay closes, focus returns to trigger element.
- Press `P` with no overlay → first context span is peeked.
- Press `P` again → overlay closes.
- Mobile DevTools: long-press a context span ≥600ms → overlay opens.
- `peek-return` toggle off in smart features → `P` and Alt-click do nothing.

---

## Task 2: Mobile View Switcher

**Spec:** At ≤767px, the view tab row is replaced with a single-button + `<select>` picker.

**Current state:** `renderViewSwitcher` in `js/renderer.js` always outputs a `<nav role="tablist">` with 7 buttons, regardless of viewport.

### Strategy

Keep the tablist for desktop. At ≤767px, CSS hides the tablist and shows a `<select>` that is injected alongside it. JS keeps both in sync. No server-side rendering; pure CSS + JS.

### Files changed
- `js/renderer.js` — inject a sibling `<select id="view-select-mobile">` after the tablist
- `index.html` CSS — media query to hide/show the correct control
- `js/app.js` — wire `change` on the select

- [ ] **Step 2.1: Extend `renderViewSwitcher` to also return a `<select>` sibling**

```js
export function renderViewSwitcher(letter, activeView, onSwitch, doc) {
  const wrapper = doc.createElement('div');
  wrapper.className = 'view-switcher-wrap';

  // Desktop tablist (existing code)
  const nav = doc.createElement('nav');
  nav.className = 'view-switcher';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Letter format view');

  // Mobile select
  const sel = doc.createElement('select');
  sel.id = 'view-select-mobile';
  sel.setAttribute('aria-label', 'Letter format view');

  for (const [key, { tab, tip }] of Object.entries(VIEW_LABELS)) {
    // Tablist button (unchanged)
    const btn = doc.createElement('button');
    btn.setAttribute('role', 'tab');
    btn.dataset.view = key;
    btn.textContent = tab;
    btn.dataset.tip = tip;
    btn.setAttribute('aria-selected', key === activeView ? 'true' : 'false');
    if (key === activeView) btn.classList.add('active');
    btn.addEventListener('click', () => onSwitch(key));
    nav.appendChild(btn);

    // Mobile option
    const opt = doc.createElement('option');
    opt.value = key;
    opt.textContent = tab;
    if (key === activeView) opt.selected = true;
    sel.appendChild(opt);
  }

  sel.addEventListener('change', () => onSwitch(sel.value));

  wrapper.appendChild(nav);
  wrapper.appendChild(sel);
  return wrapper;
}
```

Update callers in `js/app.js` to accept the wrapper element (the function previously returned the `<nav>` directly; callers may be using `.querySelector('.view-switcher')` — verify and adjust).

- [ ] **Step 2.2: Add CSS to `index.html`**

```css
.view-switcher-wrap #view-select-mobile { display: none; }

@media (max-width: 767px) {
  .view-switcher-wrap .view-switcher { display: none; }
  .view-switcher-wrap #view-select-mobile {
    display: block;
    width: 100%; padding: .5rem; margin-bottom: .5rem;
    font-family: var(--ui-font); font-size: .85rem;
    background: var(--bg-surface, #222); color: var(--text, #eee);
    border: 1px solid var(--border, #444); border-radius: 4px;
  }
}
```

- [ ] **Step 2.3: Keep select in sync when view changes programmatically**

In `js/app.js`, after any `goToLetter` or `switchView` call, update `#view-select-mobile`:
```js
function syncMobileViewSelect(view) {
  const sel = document.getElementById('view-select-mobile');
  if (sel) sel.value = view;
}
```
Call `syncMobileViewSelect(activeView)` wherever `renderLetterBody` is called or view tabs update.

- [ ] **Step 2.4: Manual verification**

- Open DevTools, set viewport to 375px wide.
- Confirm tab row is hidden, `<select>` is visible.
- Select a different view from the dropdown → letter body text updates.
- Switch back to desktop width → tab row returns, select is hidden.
- Letter re-render (navigate to next letter) → select reflects the new letter's active view.

---

## Task 3: Export Scope Grey-out

**Spec (§7.4 of next-steps):** `selection` scope button is disabled when no text is selected; align `this-chapter` logic with sidebar chapter boundaries.

**Current state:**
- `buildExportPanel` in `js/app.js` renders four scope buttons: `this-letter`, `all-letters`, `selection`, `full-book`. No `this-chapter` button exists. No grey-out on `selection`.
- `exportLetters` in `js/exporter.js` handles `scope === 'selection'` by wrapping `selectionText` — if empty it produces a blank entry.

### Part A: Disable `selection` when nothing is selected

- [ ] **Step 3.1: Wire selection state to the export panel button**

In `buildExportPanel` or in the export panel's `open` toggle handler:
```js
function updateExportPanelState() {
  const selBtn = document.querySelector('[data-scope="selection"]');
  if (!selBtn) return;
  const hasSel = window.getSelection()?.toString().trim().length > 0;
  selBtn.disabled = !hasSel;
  selBtn.setAttribute('aria-disabled', hasSel ? 'false' : 'true');
  if (!hasSel && selBtn.classList.contains('active')) {
    // deselect it, fall back to this-letter
    selBtn.classList.remove('active');
    document.querySelector('[data-scope="this-letter"]')?.classList.add('active');
  }
}
```

Call `updateExportPanelState()` when the export panel opens (`#btn-export` click) and on `selectionchange`:
```js
document.addEventListener('selectionchange', updateExportPanelState);
```

Add CSS for disabled state:
```css
.export-btn:disabled, .export-btn[aria-disabled="true"] {
  opacity: .4; cursor: not-allowed; pointer-events: none;
}
```

### Part B: Add `this-chapter` scope

- [ ] **Step 3.2: Add `this-chapter` button to `buildExportPanel`**

In `buildExportPanel` in `js/app.js`, insert after `this-letter`:
```js
<button type="button" class="export-btn" data-scope="this-chapter">this chapter</button>
```

- [ ] **Step 3.3: Implement `this-chapter` subset in `js/exporter.js`**

The `letters` array passed to `exportLetters` must include the chapter boundary. Pass `chapterLetters` in addition to the current `letters` param:

```js
export function exportLetters({ letters, chapterLetters, scope, view, format, selectionText }) {
  let subset;
  if (scope === 'selection') { ... }
  else if (scope === 'this-letter') { subset = letters.slice(0, 1); }
  else if (scope === 'this-chapter') { subset = chapterLetters || letters.slice(0, 1); }
  else { subset = letters; }
  ...
}
```

In `js/app.js`, compute `chapterLetters` from the sidebar's chapter list when calling `exportLetters`:
```js
// chapterLetters: all complete letters in the same chapter as currentLetter
const chapterLetters = appState.book.letters.filter(l =>
  l.complete && l.chapter === appState.currentLetter.chapter
);
```

(Adjust field name if `book.json` uses a different chapter field — check `loader.js` for the chapter grouping key.)

- [ ] **Step 3.4: Manual verification**

- Open export panel with no text selected → `selection` button is greyed out (disabled).
- Select text in the letter body → open export panel → `selection` button is enabled.
- Click `this-chapter` → export → confirm the HTML contains letters from the same chapter only.

---

## Task 4: Accessibility Audit

**Spec (§7.5 of next-steps):** Verify tab order (sidebar → letter → context → bottom bar), aria on pickers, reduced-motion CSS.

- [ ] **Step 4.1: Run Lighthouse / axe in browser**

1. Serve locally: `npx serve . -p 8080`
2. Open Chrome DevTools → Lighthouse → select "Accessibility" only → run.
3. Record failing issues by selector/element.
4. Repeat with `axe` browser extension if available.

- [ ] **Step 4.2: Fix critical aria issues found in audit**

Common gaps to check (fix any that fail):

| Element | Expected aria | Check |
|---------|--------------|-------|
| `.view-switcher` `<nav>` | `role="tablist"`, each button `role="tab"`, `aria-selected` | Already set in `renderer.js` — confirm attribute updates on switch |
| `#view-select-mobile` | `aria-label="Letter format view"` | Added in Task 2 |
| `#peek-overlay` | `role="dialog"`, `aria-modal="true"`, `aria-label` | Added in Task 1 |
| Track pills (`#context-pane`) | `role="radio"` or `role="button"`, `aria-pressed` | Check `js/app.js` track pill rendering |
| Bottom bar voice `<select>` | `aria-label` with voice type | Verify in `index.html` |
| Letter nav buttons | `aria-label="Previous letter"`, `aria-label="Next letter"` | Check `index.html` |
| Sidebar collapse button | `aria-expanded` reflects state | `js/app.js` `toggleSidebar` |
| `#op-feedback` | `aria-live="polite"` | Already in `smartFeatures.js` — verify DOM |

- [ ] **Step 4.3: Verify tab order**

With keyboard only:
- `Tab` from page load: focus should reach sidebar letter list → letter body → context panel → bottom bar controls.
- `Shift+Tab` reverses order.
- Confirm no keyboard trap (peek overlay should trap focus when open, release on Esc).

Fix any element with `tabindex="-1"` that should be reachable, or `tabindex="0"` on non-interactive elements that should not be.

- [ ] **Step 4.4: Reduced-motion CSS audit**

Search `index.html` for all `transition` and `animation` declarations. Wrap each in a `@media (prefers-reduced-motion: no-preference)` block (or add `reduce` override). Key locations:
- Sidebar slide (`.sidebar`, `.open`, `.closed`)
- Context panel slide
- Bottom bar collapse
- Peek overlay (already handled in Task 1)
- Tooltip fade (`#app-tooltip`)

Pattern:
```css
/* before */
.sidebar { transition: width .2s ease; }

/* after */
@media (prefers-reduced-motion: no-preference) {
  .sidebar { transition: width .2s ease; }
}
```

- [ ] **Step 4.5: Rerun Lighthouse**

After fixes, re-run Lighthouse Accessibility audit. Target score ≥ 90. Record actual score in a commit message or append to this plan.

---

## Task 5: Tests and commit

- [ ] **Step 5.1: Run existing test suite**

```bash
node --test tests/test-loader.js tests/test-renderer.js tests/test-player.js tests/test-github.js tests/test-progress.js tests/test-extract.js
```

Expected: 0 failures. Fix any regressions introduced by renderer changes in Task 2.

- [ ] **Step 5.2: Extend renderer unit tests for mobile select**

In `tests/test-renderer.js`, add a test that `renderViewSwitcher` returns a wrapper containing both a `.view-switcher` nav and a `#view-select-mobile` select with options matching VIEW_LABELS keys.

- [ ] **Step 5.3: Commit**

```bash
git add index.html js/app.js js/renderer.js js/exporter.js
git commit -m "feat: peek overlay, mobile view switcher, export grey-out, a11y fixes"
```

---

## When things fail

| Symptom | What to check |
|---------|----------------|
| Peek overlay opens but content is empty | `appState.contextData` may be undefined at call time — check `loader.js` load order; `contextData` should be the parsed `context.json` array. |
| Mobile select not visible at 375px | Check specificity — `.view-switcher-wrap .view-switcher` rule may not be winning; add `!important` only if needed, or restructure to avoid specificity war. |
| `chapterLetters` is empty | `book.json` letter schema may use `chapter_id` or `chapter` — inspect a letter object to confirm field name. |
| Lighthouse score unchanged | Audit may be targeting a different page URL; confirm you're testing the loaded app, not an empty shell. |
| Renderer unit tests break after wrapper change | Callers in `app.js` may select `.view-switcher` directly — update to `.view-switcher-wrap .view-switcher` or store a reference at call site. |

---

*Created: 2026-03-24. Cross-reference: `docs/reports/next-steps-isabelle-v2.md §7`, `docs/superpowers/specs/2026-03-23-isabelle-v2-design.md §4.6`.*
