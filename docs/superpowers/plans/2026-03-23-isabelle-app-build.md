# Isabelle — App Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete v2 Isabelle dual-book web app — letter display, context panel, documentary narrator, 14 smart features, export, hidden editor, GitHub sync — as a vanilla JS ES module app on GitHub Pages.

**Architecture:** All existing js/ files are replaced. `index.html` is rewritten. The app shell loads ES modules. No framework, no build step. `book.json` and `context.json` (produced by content-preparation plan) are fetched at runtime.

**Tech Stack:** Vanilla JS (ES modules), Web Speech API, GitHub Contents API, localStorage, CSS custom properties, `node --test` + jsdom for unit tests

**Prerequisite:** Content preparation plan complete — `book.json` and `context.json` exist with valid data.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `index.html` | **Rewrite** | App shell, all CSS, module entry point |
| `js/loader.js` | **Rewrite** | Fetch both JSON files, resolve position conflict |
| `js/renderer.js` | **Rewrite** | Render letters + context entries, inject ctx spans |
| `js/player.js` | **Rewrite** | Dual-voice narrator, documentary mode, watchdog |
| `js/progress.js` | **Rewrite** | Position tracking, localStorage save |
| `js/focusMode.js` | **Rewrite** | 5 reading modes including page-lock |
| `js/sync.js` | **Create** | Context panel sync logic |
| `js/smartFeatures.js` | **Create** | 14 toggleable smart features |
| `js/exporter.js` | **Create** | Export at all granularities |
| `js/editor.js` | **Rewrite** | Hidden editor, mapping UI |
| `js/github.js` | **Rewrite** | GitHub Contents API, SHA conflict handling |
| `js/app.js` | **Rewrite** | Wire all modules, init |
| `tests/test-loader.js` | **Rewrite** | Loader unit tests |
| `tests/test-renderer.js` | **Create** | Renderer unit tests |
| `tests/test-player.js` | **Create** | Player unit tests |

---

## Task 0: Clean Slate

- [ ] **Step 0.1: Delete all existing JS module content**

The existing files have the v1 paragraph-based model. Truncate them to empty stubs so imports don't break during incremental build:

```bash
cd C:\audio_book
for f in js/loader.js js/renderer.js js/player.js js/progress.js js/focusMode.js js/editor.js js/github.js js/app.js; do printf '// stub\n' > $f; done
```

- [ ] **Step 0.2: Verify Node + jsdom**

```bash
node --version && node -e "import('jsdom').then(m => console.log('jsdom ok'))"
```

Expected: Node v18+, `jsdom ok`

- [ ] **Step 0.3: Commit stubs**

```bash
git add js/
git commit -m "chore: stub all v1 modules for v2 rebuild"
```

---

## Task 1: loader.js

**Files:**
- Rewrite: `js/loader.js`
- Rewrite: `tests/test-loader.js`

- [ ] **Step 1.1: Write failing tests**

```js
// tests/test-loader.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Polyfill fetch for Node
import { readFileSync } from 'fs';

// Test resolvePosition
const { resolvePosition } = await import('../js/loader.js');

test('resolvePosition prefers more recent timestamp', () => {
  const local = { letter_id: 'letter-005', paragraph_index: 2, scroll_offset: 0, active_view: 'plain_english', timestamp: 2000 };
  const remote = { letter_id: 'letter-001', paragraph_index: 0, scroll_offset: 0, active_view: 'plain_english', timestamp: 1000 };
  const result = resolvePosition(local, remote);
  assert.equal(result.letter_id, 'letter-005');
});

test('resolvePosition falls back to remote when local is null', () => {
  const remote = { letter_id: 'letter-003', paragraph_index: 0, scroll_offset: 0, active_view: 'plain_english', timestamp: 500 };
  const result = resolvePosition(null, remote);
  assert.equal(result.letter_id, 'letter-003');
});

test('resolvePosition returns default when both null', () => {
  const result = resolvePosition(null, null);
  assert.equal(typeof result.letter_id, 'string');
});
```

- [ ] **Step 1.2: Run tests — expect fail**

```bash
cd C:\audio_book && node --test tests/test-loader.js
```

Expected: FAIL — `resolvePosition is not exported`

- [ ] **Step 1.3: Write loader.js**

```js
// js/loader.js
const LS_POSITION = 'isabelle-v2-position';

export async function loadData() {
  const [bookRes, ctxRes] = await Promise.all([
    fetch('./book.json'),
    fetch('./context.json')
  ]);
  if (!bookRes.ok) throw new Error('book_fetch_failed');
  const book = await bookRes.json();
  const context = ctxRes.ok ? await ctxRes.json() : { entries: [] };
  return { book, context };
}

export function resolvePosition(local, remote) {
  const fallback = { letter_id: null, paragraph_index: 0, scroll_offset: 0, active_view: 'plain_english', timestamp: 0 };
  if (!local && !remote) return fallback;
  if (!local) return remote;
  if (!remote) return local;
  return local.timestamp >= remote.timestamp ? local : remote;
}

export function loadLocalPosition() {
  try {
    const raw = localStorage.getItem(LS_POSITION);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveLocalPosition(pos) {
  localStorage.setItem(LS_POSITION, JSON.stringify({ ...pos, timestamp: Date.now() }));
}
```

- [ ] **Step 1.4: Run tests — expect pass**

```bash
cd C:\audio_book && node --test tests/test-loader.js
```

Expected: All PASS.

- [ ] **Step 1.5: Commit**

```bash
git add js/loader.js tests/test-loader.js
git commit -m "feat: loader.js — fetch book+context, position conflict resolution"
```

---

## Task 2: renderer.js

**Files:**
- Rewrite: `js/renderer.js`
- Create: `tests/test-renderer.js`

- [ ] **Step 2.1: Write failing tests**

```js
// tests/test-renderer.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildAliasMap, injectContextSpans, renderLetterMeta } from '../js/renderer.js';

test('buildAliasMap returns map from alias to entry id', () => {
  const entries = [{ id: 'marie-christine', name: 'Marie-Christine of Austria', aliases: ['Christine', 'MC'] }];
  const map = buildAliasMap(entries);
  assert.equal(map.get('marie-christine of austria'), 'marie-christine');
  assert.equal(map.get('christine'), 'marie-christine');
});

test('injectContextSpans wraps matched text in span', () => {
  const map = new Map([['christine', 'marie-christine']]);
  const sorted = [['christine', 'marie-christine']];
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  const p = dom.window.document.createElement('p');
  p.textContent = 'I write to Christine today.';
  injectContextSpans(p, sorted, dom.window.document);
  assert.ok(p.innerHTML.includes('data-ref-id="marie-christine"'));
  assert.ok(p.innerHTML.includes('Christine'));
});

test('injectContextSpans does not modify text without matches', () => {
  const sorted = [['napoleon', 'napoleon-i']];
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  const p = dom.window.document.createElement('p');
  p.textContent = 'No named entities here.';
  const before = p.textContent;
  injectContextSpans(p, sorted, dom.window.document);
  assert.equal(p.textContent, before);
});

test('renderLetterMeta returns date and letter number elements', () => {
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  const letter = { letter_number: 12, date_display: '14 November 1760', id: 'letter-012' };
  const meta = renderLetterMeta(letter, dom.window.document);
  assert.ok(meta.querySelector('[data-letter-number]'));
  assert.ok(meta.querySelector('[data-letter-date]'));
});
```

- [ ] **Step 2.2: Run — expect fail**

```bash
cd C:\audio_book && node --test tests/test-renderer.js
```

- [ ] **Step 2.3: Write renderer.js**

```js
// js/renderer.js
const VIEW_LABELS = {
  original_french:       { tab: 'vieux fr',    tip: 'Original Old French' },
  modern_french:         { tab: 'fr moderne',  tip: 'Modern French' },
  literal_english_old:   { tab: 'en littéral', tip: 'Literal English of Old French' },
  literal_english_modern:{ tab: 'en mod fr',   tip: 'Literal English of Modern French' },
  plain_english:         { tab: 'anglais',     tip: 'Plain Modern English' },
  handwriting_style:     { tab: 'manuscrit',   tip: 'Handwriting Style' },
  photocopy:             { tab: 'photocopie',  tip: 'Original Photocopy' },
};
const TEXT_VIEWS = ['original_french','modern_french','literal_english_old','literal_english_modern','plain_english'];

export function buildAliasMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    const names = [entry.name, ...(entry.aliases || [])];
    for (const name of names) map.set(name.toLowerCase(), entry.id);
  }
  return map;
}

export function buildSortedAliases(aliasMap) {
  return [...aliasMap.entries()].sort((a, b) => b[0].length - a[0].length);
}

export function injectContextSpans(el, sortedAliases, doc) {
  // Walk text nodes and wrap matches
  const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  for (const tn of textNodes) {
    const text = tn.nodeValue;
    let html = text;
    let matched = false;
    for (const [alias, id] of sortedAliases) {
      if (alias.length < 4) continue;
      const re = new RegExp(`(?<![\\w-])(${escapeRe(alias)})(?![\\w-])`, 'gi');
      if (re.test(html)) {
        matched = true;
        html = html.replace(re, `<span class="ctx-ref" data-ref-id="${id}" role="button" tabindex="0" aria-label="Context: ${id}">$1</span>`);
      }
    }
    if (matched) {
      const span = doc.createElement('span');
      span.innerHTML = html;
      tn.parentNode.replaceChild(span, tn);
    }
  }
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

export function renderLetterMeta(letter, doc) {
  const div = doc.createElement('div');
  div.className = 'letter-meta';
  div.dataset.letterId = letter.id;
  div.innerHTML = `
    <span data-letter-date class="letter-date">${letter.date_display || ''}</span>
    <span data-letter-number class="letter-number">Letter ${letter.letter_number}</span>
  `;
  return div;
}

export function renderViewSwitcher(letter, activeView, onSwitch, doc) {
  const nav = doc.createElement('nav');
  nav.className = 'view-switcher';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Letter format view');

  for (const [key, { tab, tip }] of Object.entries(VIEW_LABELS)) {
    const btn = doc.createElement('button');
    btn.role = 'tab';
    btn.dataset.view = key;
    btn.textContent = tab;
    btn.title = tip;
    btn.setAttribute('aria-selected', key === activeView ? 'true' : 'false');
    if (key === activeView) btn.classList.add('active');
    btn.onclick = () => onSwitch(key);
    nav.appendChild(btn);
  }
  return nav;
}

export function renderLetterBody(letter, activeView, sortedAliases, doc) {
  const article = doc.createElement('article');
  article.className = 'letter-body';
  article.dataset.letterId = letter.id;

  if (activeView === 'photocopy') {
    renderPhotocopy(letter, article, doc);
    return article;
  }

  const sourceText = activeView === 'handwriting_style'
    ? letter.views.original_french
    : letter.views[activeView];

  if (!sourceText) {
    const notice = doc.createElement('p');
    notice.className = 'view-missing';
    notice.textContent = 'This version has not been added yet.';
    article.appendChild(notice);
    return article;
  }

  if (letter.salutation) {
    const sal = doc.createElement('p');
    sal.className = 'letter-salutation';
    sal.textContent = letter.salutation;
    article.appendChild(sal);
  }

  const paragraphs = sourceText.split(/\n\n+/).filter(Boolean);
  for (let i = 0; i < paragraphs.length; i++) {
    const p = doc.createElement('p');
    p.className = 'letter-paragraph';
    p.dataset.paragraphIndex = i;
    p.textContent = paragraphs[i];
    if (TEXT_VIEWS.includes(activeView) && sortedAliases.length) {
      injectContextSpans(p, sortedAliases, doc);
    }
    if (activeView === 'handwriting_style') p.classList.add('handwriting');
    article.appendChild(p);
  }

  if (letter.closing) {
    const closing = doc.createElement('p');
    closing.className = 'letter-closing';
    closing.textContent = letter.closing;
    article.appendChild(closing);
  }
  return article;
}

function renderPhotocopy(letter, container, doc) {
  if (letter.images.photocopy) {
    const img = doc.createElement('img');
    img.src = letter.images.photocopy;
    img.alt = letter.images.photocopy_alt || `Letter ${letter.letter_number}`;
    img.className = 'photocopy-img';
    img.onerror = () => renderPhotocopyFallback(letter, container, doc);
    container.appendChild(img);
  } else {
    renderPhotocopyFallback(letter, container, doc);
  }
}

function renderPhotocopyFallback(letter, container, doc) {
  container.innerHTML = '';
  container.classList.add('photocopy-fallback');
  const notice = doc.createElement('p');
  notice.className = 'photocopy-notice';
  notice.textContent = letter.images.photocopy
    ? 'Image could not be loaded — showing transcription.'
    : 'Original image not yet added — showing transcription.';
  container.appendChild(notice);
  // Render original_french text in handwriting style
  const text = letter.views.original_french || '';
  text.split(/\n\n+/).filter(Boolean).forEach(para => {
    const p = doc.createElement('p');
    p.className = 'letter-paragraph handwriting';
    p.textContent = para;
    container.appendChild(p);
  });
}

export function renderLetterNav(letter, totalLetters, onPrev, onNext, doc) {
  const nav = doc.createElement('nav');
  nav.className = 'letter-nav';
  const prev = doc.createElement('button');
  prev.className = 'letter-nav-prev';
  prev.setAttribute('aria-label', 'Previous letter');
  prev.textContent = `← Letter ${letter.letter_number - 1}`;
  prev.disabled = letter.letter_number <= 1;
  prev.onclick = onPrev;
  const next = doc.createElement('button');
  next.className = 'letter-nav-next';
  next.setAttribute('aria-label', 'Next letter');
  next.textContent = `Letter ${letter.letter_number + 1} →`;
  next.disabled = letter.letter_number >= totalLetters;
  next.onclick = onNext;
  nav.appendChild(prev);
  nav.appendChild(next);
  return nav;
}
```

- [ ] **Step 2.4: Run tests — expect pass**

```bash
cd C:\audio_book && node --test tests/test-renderer.js
```

- [ ] **Step 2.5: Commit**

```bash
git add js/renderer.js tests/test-renderer.js
git commit -m "feat: renderer.js — letter display, view switcher, context span injection"
```

---

## Task 3: player.js

**Files:**
- Rewrite: `js/player.js`
- Create: `tests/test-player.js`

- [ ] **Step 3.1: Write failing tests**

```js
// tests/test-player.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, buildSentenceContextMap } from '../js/player.js';

test('splitSentences splits on sentence boundaries', () => {
  const text = 'Hello world. This is sentence two. And three!';
  const parts = splitSentences(text);
  assert.ok(parts.length >= 2);
  assert.ok(parts[0].includes('Hello'));
});

test('splitSentences keeps short text as single sentence', () => {
  const text = 'Short.';
  assert.equal(splitSentences(text).length, 1);
});

test('buildSentenceContextMap returns entry IDs for matched sentences', () => {
  const sentences = ['I wrote to Christine today.', 'The weather is fine.'];
  const sortedAliases = [['christine', 'marie-christine']];
  const map = buildSentenceContextMap(sentences, sortedAliases);
  assert.equal(map.get(0), 'marie-christine');
  assert.equal(map.get(1), undefined);
});
```

- [ ] **Step 3.2: Run — expect fail**

```bash
cd C:\audio_book && node --test tests/test-player.js
```

- [ ] **Step 3.3: Write player.js**

```js
// js/player.js
export function splitSentences(text) {
  if (!text) return [];
  const parts = text.split(/(?<=[.!?…»])\s+(?=[A-ZÀ-Ö«"'])/);
  return parts.map(s => s.trim()).filter(Boolean);
}

export function buildSentenceContextMap(sentences, sortedAliases) {
  const map = new Map();
  for (let i = 0; i < sentences.length; i++) {
    const lower = sentences[i].toLowerCase();
    for (const [alias, id] of sortedAliases) {
      if (alias.length >= 4 && lower.includes(alias)) {
        map.set(i, id);
        break; // first match per sentence
      }
    }
  }
  return map;
}

export class Player {
  constructor({ onParagraphAdvance, onWord, onEnd, onContextSnippet }) {
    this.onParagraphAdvance = onParagraphAdvance || (() => {});
    this.onWord = onWord || (() => {});
    this.onEnd = onEnd || (() => {});
    this.onContextSnippet = onContextSnippet || (() => {});
    this.letterVoice = null;
    this.contextVoice = null;
    this.rate = 1;
    this.mode = 'letters'; // letters | context | both | silent
    this.playing = false;
    this._sentences = [];
    this._sentenceIndex = 0;
    this._paragraphIndex = 0;
    this._paragraphs = [];
    this._contextDelay = 1200;
    this._spokenInParagraph = new Set();
    this._sortedAliases = [];
    this._watchdog = null;
    this._contextVerbosity = 'short'; // short | off
    this._contextEntries = {};
  }

  setData({ paragraphs, sortedAliases, contextEntries }) {
    this._paragraphs = paragraphs;
    this._sortedAliases = sortedAliases;
    this._contextEntries = contextEntries; // id → entry
  }

  setRate(r) { this.rate = r; }
  setMode(m) { this.mode = m; }
  setContextDelay(ms) { this._contextDelay = ms; }
  setContextVerbosity(v) { this._contextVerbosity = v; }

  setLetterVoice(voiceURI) {
    const voices = window.speechSynthesis.getVoices();
    this.letterVoice = voices.find(v => v.voiceURI === voiceURI) || null;
  }

  setContextVoice(voiceURI) {
    const voices = window.speechSynthesis.getVoices();
    this.contextVoice = voices.find(v => v.voiceURI === voiceURI) || null;
  }

  autoSelectVoices() {
    const voices = window.speechSynthesis.getVoices();
    this.letterVoice = voices.find(v => v.lang.startsWith('fr')) || voices[0] || null;
    this.contextVoice = voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
  }

  play() {
    if (this.mode === 'silent') return;
    this.playing = true;
    this._speakCurrentParagraph();
  }

  pause() {
    this.playing = false;
    this._clearWatchdog();
    window.speechSynthesis.cancel();
  }

  stop() {
    this.pause();
    this._paragraphIndex = 0;
    this._sentenceIndex = 0;
  }

  skipNext() { this._advanceParagraph(1); }
  skipPrev() { this._advanceParagraph(-1); }

  setIndex(i) {
    this._paragraphIndex = i;
    this._sentenceIndex = 0;
    this._spokenInParagraph.clear();
  }

  _speakCurrentParagraph() {
    const para = this._paragraphs[this._paragraphIndex];
    if (!para) { this.playing = false; this.onEnd(); return; }
    const text = para.text || para;
    this._sentences = splitSentences(text);
    this._sentenceIndex = 0;
    this._spokenInParagraph.clear();
    this._speakSentence();
  }

  _speakSentence() {
    if (!this.playing) return;
    if (this._sentenceIndex >= this._sentences.length) {
      this._advanceParagraph(1);
      return;
    }
    const sentence = this._sentences[this._sentenceIndex];
    this._speakUtterance(sentence, this.letterVoice, () => {
      // After sentence: check for context ref (both mode, first unspoken per paragraph)
      if (this.mode === 'both' && this._contextVerbosity !== 'off') {
        const ctxId = this._findContextRef(sentence);
        if (ctxId && !this._spokenInParagraph.has(ctxId)) {
          this._spokenInParagraph.add(ctxId);
          setTimeout(() => this._speakContextSnippet(ctxId), this._contextDelay);
          return; // _speakContextSnippet resumes sentences
        }
      }
      this._sentenceIndex++;
      this._speakSentence();
    });
  }

  _speakContextSnippet(entryId) {
    if (!this.playing) return;
    const entry = this._contextEntries[entryId];
    if (!entry) { this._sentenceIndex++; this._speakSentence(); return; }
    this.onContextSnippet(entryId);
    this._speakUtterance(entry.short, this.contextVoice, () => {
      setTimeout(() => {
        this._sentenceIndex++;
        this._speakSentence();
      }, this._contextDelay);
    });
  }

  _findContextRef(sentence) {
    const lower = sentence.toLowerCase();
    for (const [alias, id] of this._sortedAliases) {
      if (alias.length >= 4 && lower.includes(alias)) return id;
    }
    return null;
  }

  _speakUtterance(text, voice, onDone) {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    if (voice) utt.voice = voice;
    utt.rate = this.rate;
    utt.onboundary = (e) => {
      if (e.name === 'word') this.onWord(e.charIndex, e.charLength || 1, this._paragraphIndex);
    };
    utt.onend = () => { this._clearWatchdog(); onDone(); };
    utt.onerror = () => { this._clearWatchdog(); onDone(); };

    const watchdogMs = Math.max(5000, text.length * 80);
    this._watchdog = setTimeout(() => {
      console.warn('Player: watchdog triggered for utterance');
      window.speechSynthesis.cancel();
      onDone();
    }, watchdogMs);

    window.speechSynthesis.speak(utt);
  }

  _advanceParagraph(delta) {
    this._paragraphIndex = Math.max(0, Math.min(
      this._paragraphIndex + delta,
      this._paragraphs.length - 1
    ));
    this.onParagraphAdvance(this._paragraphIndex);
    if (this.playing && delta > 0) this._speakCurrentParagraph();
  }

  _clearWatchdog() {
    if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
  }
}
```

- [ ] **Step 3.4: Run tests — expect pass**

```bash
cd C:\audio_book && node --test tests/test-player.js
```

- [ ] **Step 3.5: Commit**

```bash
git add js/player.js tests/test-player.js
git commit -m "feat: player.js — dual-voice narrator, documentary mode, watchdog"
```

---

## Task 4: github.js + progress.js

**Files:**
- Rewrite: `js/github.js`
- Rewrite: `js/progress.js`

- [ ] **Step 4.1: Write github.js**

```js
// js/github.js
const LS_TOKEN = 'isabelle-v2-github-token';

function getConfig() {
  const token = localStorage.getItem(LS_TOKEN);
  const match = window.location.hostname.match(/^([^.]+)\.github\.io$/);
  if (!match) return null;
  const owner = match[1];
  const repo = document.documentElement.dataset.repo || 'isabelle';
  if (!token) return null;
  return { owner, repo, token };
}

export async function fetchFromGitHub(filename) {
  const cfg = getConfig();
  if (!cfg) throw Object.assign(new Error('missing_config'), { code: 'missing_config' });
  const res = await fetch(
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${filename}`,
    { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' } }
  );
  if (res.status === 401 || res.status === 403 || res.status === 404) throw Object.assign(new Error('bad_token'), { code: 'bad_token' });
  if (res.status === 429) throw Object.assign(new Error('rate_limited'), { code: 'rate_limited' });
  if (!res.ok) throw new Error(`github_error_${res.status}`);
  const data = await res.json();
  return { content: JSON.parse(atob(data.content)), sha: data.sha };
}

export async function saveToGitHub(filename, content) {
  const cfg = getConfig();
  if (!cfg) throw Object.assign(new Error('missing_config'), { code: 'missing_config' });

  // GET sha first
  let sha;
  try {
    const current = await fetchFromGitHub(filename);
    sha = current.sha;
  } catch (e) {
    if (e.code === 'missing_config' || e.code === 'bad_token') throw e;
    throw Object.assign(new Error('get_failed'), { code: 'get_failed' });
  }

  const body = JSON.stringify({
    message: `update ${filename}`,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
    sha
  });

  const res = await fetch(
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${filename}`,
    { method: 'PUT', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' }, body }
  );

  if (res.status === 409 || res.status === 422) throw Object.assign(new Error('sha_conflict'), { code: 'sha_conflict' });
  if (res.status === 401 || res.status === 403 || res.status === 404) throw Object.assign(new Error('bad_token'), { code: 'bad_token' });
  if (res.status === 429) throw Object.assign(new Error('rate_limited'), { code: 'rate_limited' });
  if (!res.ok) throw new Error(`github_error_${res.status}`);
}

export function getToken() { return localStorage.getItem(LS_TOKEN) || ''; }
export function setToken(t) { localStorage.setItem(LS_TOKEN, t); }
```

- [ ] **Step 4.2: Write progress.js**

```js
// js/progress.js
import { saveLocalPosition } from './loader.js';
import { saveToGitHub } from './github.js';

const MIN_SYNC_INTERVAL = 60000;
let _syncTimer = null;
let _pendingSync = false;
let _getBookFn = null;

export function initProgress(getBook) {
  _getBookFn = getBook;
}

export function savePosition(pos) {
  saveLocalPosition(pos);
  scheduleSyncPosition();
}

export function cancelSync() {
  if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
  _pendingSync = false;
}

function scheduleSyncPosition() {
  if (_pendingSync) return;
  _pendingSync = true;
  _syncTimer = setTimeout(async () => {
    _pendingSync = false;
    if (!_getBookFn) return;
    const book = _getBookFn();
    try { await saveToGitHub('book.json', book); } catch { /* silent */ }
  }, MIN_SYNC_INTERVAL);
}

export async function forceSyncPosition(book) {
  cancelSync();
  await saveToGitHub('book.json', book);
}
```

- [ ] **Step 4.3: Write tests for github.js and progress.js**

```js
// tests/test-github.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Test error code mapping by simulating the module's throw patterns
test('saveToGitHub throws sha_conflict on 409', async () => {
  // Stub fetch to return 409
  global.fetch = async () => ({ ok: false, status: 409 });
  global.localStorage = { getItem: () => 'fake-token' };
  global.window = { location: { hostname: 'owner.github.io' } };
  global.document = { documentElement: { dataset: {} } };
  const { saveToGitHub } = await import('../js/github.js');
  // The GET will fail first — stub the GET to succeed, PUT to 409
  let callCount = 0;
  global.fetch = async () => {
    callCount++;
    if (callCount === 1) return { ok: true, status: 200, json: async () => ({ content: btoa('{}'), sha: 'abc123' }) };
    return { ok: false, status: 409 };
  };
  global.atob = s => Buffer.from(s, 'base64').toString();
  global.btoa = s => Buffer.from(s).toString('base64');
  try {
    await saveToGitHub('book.json', {});
    assert.fail('Should have thrown');
  } catch (e) {
    assert.equal(e.code, 'sha_conflict');
  }
});

test('saveToGitHub throws bad_token on 401', async () => {
  let callCount = 0;
  global.fetch = async () => {
    callCount++;
    if (callCount === 1) return { ok: true, status: 200, json: async () => ({ content: btoa('{}'), sha: 'abc' }) };
    return { ok: false, status: 401 };
  };
  const { saveToGitHub } = await import('../js/github.js?v=2');
  try {
    await saveToGitHub('book.json', {});
    assert.fail('Should have thrown');
  } catch (e) {
    assert.equal(e.code, 'bad_token');
  }
});
```

```js
// tests/test-progress.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Progress module uses localStorage — stub it
const store = {};
global.localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: k => { delete store[k]; }
};

const { savePosition, cancelSync, loadLocalPosition } = await import('../js/progress.js');
// Override saveToGitHub in loader to no-op for unit test
import('../js/loader.js'); // ensure loader is loaded

test('savePosition writes to localStorage under isabelle-v2-position', () => {
  const pos = { letter_id: 'letter-005', paragraph_index: 1, scroll_offset: 0, active_view: 'plain_english', timestamp: 0 };
  savePosition(pos);
  const raw = store['isabelle-v2-position'];
  assert.ok(raw, 'Position not written to localStorage');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.letter_id, 'letter-005');
  assert.ok(parsed.timestamp > 0, 'Timestamp should be set');
});

test('cancelSync clears pending sync without throwing', () => {
  assert.doesNotThrow(() => cancelSync());
});
```

- [ ] **Step 4.4: Run tests**

```bash
cd C:\audio_book && node --test tests/test-github.js tests/test-progress.js
```

Expected: All pass.

- [ ] **Step 4.5: Commit**

```bash
git add js/github.js js/progress.js tests/test-github.js tests/test-progress.js
git commit -m "feat: github.js (SHA conflict handling) + progress.js + tests"
```

---

## Task 5: focusMode.js + sync.js

- [ ] **Step 5.1: Write focusMode.js**

```js
// js/focusMode.js
let _mode = 'off';
let _currentIndex = 0;
let _paragraphEls = [];

export function initFocusMode(paragraphEls) { _paragraphEls = paragraphEls; }
export function setMode(mode) { _mode = mode; applyMode(_currentIndex); }
export function getMode() { return _mode; }

export function applyMode(index) {
  _currentIndex = index;
  if (_mode === 'off') {
    _paragraphEls.forEach(el => { el.style.opacity = ''; el.style.display = ''; });
    return;
  }
  if (_mode === 'reveal') {
    _paragraphEls.forEach((el, i) => { el.style.display = i <= index ? '' : 'none'; el.style.opacity = ''; });
    return;
  }
  if (_mode === 'spotlight') {
    _paragraphEls.forEach((el, i) => { el.style.display = i === index ? '' : 'none'; el.style.opacity = ''; });
    return;
  }
  if (_mode === 'fade_ahead') {
    _paragraphEls.forEach((el, i) => {
      el.style.display = i <= index + 3 ? '' : 'none';
      el.style.opacity = i === index ? '1' : i <= index + 3 ? '0.15' : '0';
    });
    return;
  }
  if (_mode === 'page') {
    // page-lock is handled by the page-lock manager in smartFeatures.js
    _paragraphEls.forEach(el => { el.style.opacity = ''; el.style.display = ''; });
  }
}
```

- [ ] **Step 5.2: Write sync.js**

```js
// js/sync.js
let _contextPanel = null;
let _contextEntries = {};
let _onEntryActivate = null;

export function initSync({ contextPanel, contextEntries, onEntryActivate }) {
  _contextPanel = contextPanel;
  _contextEntries = contextEntries; // id → entry
  _onEntryActivate = onEntryActivate;
}

export function syncToLetter(letter) {
  if (!_contextPanel || !letter.contextRefs?.length) return;
  const firstRef = letter.contextRefs[0];
  activateEntry(firstRef, { pulse: true });
}

export function activateEntry(entryId, { pulse = false } = {}) {
  if (!_contextPanel || !_contextEntries[entryId]) return;
  if (_onEntryActivate) _onEntryActivate(entryId);
  if (pulse) {
    const dot = document.getElementById('ctx-sync-dot');
    if (dot) { dot.classList.remove('pulse'); void dot.offsetWidth; dot.classList.add('pulse'); }
  }
}
```

- [ ] **Step 5.3: Commit**

```bash
git add js/focusMode.js js/sync.js
git commit -m "feat: focusMode.js (5 modes) + sync.js (context panel sync)"
```

---

## Task 6: smartFeatures.js

- [ ] **Step 6.1: Write smartFeatures.js**

```js
// js/smartFeatures.js
const LS_PREFIX = 'isabelle-v2-smart-';

const FEATURES = [
  { id: 'smart-scroll',       label: 'Smart Scroll' },
  { id: 'peek-return',        label: 'Peek & Return' },
  { id: 'range-copy',         label: 'Sentence Range Copy' },
  { id: 'keyboard-nav',       label: 'Keyboard Navigation' },
  { id: 'truncation-reveal',  label: 'Truncation Reveal' },
  { id: 'resumability',       label: 'Resumability' },
  { id: 'optimistic-feedback',label: 'Optimistic Feedback' },
  { id: 'undo-navigation',    label: 'Undo Navigation' },
  { id: 'focus-states',       label: 'Focus States' },
  { id: 'ctx-sync-indicator', label: 'Context Sync Indicator' },
  { id: 'narrator-position',  label: 'Narrator Position Line' },
  { id: 'view-memory',        label: 'View Memory Per Letter' },
  { id: 'missing-letters',    label: 'Missing Letter Indicators' },
  { id: 'page-lock',          label: 'Page Lock' },
];

export function isEnabled(id) {
  const val = localStorage.getItem(LS_PREFIX + id);
  return val === null ? true : val === '1'; // default on
}

export function setEnabled(id, on) {
  localStorage.setItem(LS_PREFIX + id, on ? '1' : '0');
  document.dispatchEvent(new CustomEvent('smart-feature-changed', { detail: { id, on } }));
}

export function renderTogglePanel(doc) {
  const dialog = doc.createElement('div');
  dialog.id = 'smart-features-panel';
  dialog.role = 'dialog';
  dialog.setAttribute('aria-label', 'Smart Features');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;

  const title = doc.createElement('h2');
  title.textContent = 'Smart Features';
  dialog.appendChild(title);

  for (const feat of FEATURES) {
    const row = doc.createElement('label');
    row.className = 'sf-row';
    const toggle = doc.createElement('button');
    toggle.role = 'switch';
    toggle.setAttribute('aria-checked', isEnabled(feat.id) ? 'true' : 'false');
    toggle.setAttribute('aria-label', feat.label);
    toggle.dataset.featureId = feat.id;
    toggle.className = 'sf-toggle' + (isEnabled(feat.id) ? ' on' : '');
    toggle.onclick = () => {
      const nowOn = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', nowOn ? 'true' : 'false');
      toggle.className = 'sf-toggle' + (nowOn ? ' on' : '');
      setEnabled(feat.id, nowOn);
    };
    const lbl = doc.createElement('span');
    lbl.textContent = feat.label;
    row.appendChild(toggle);
    row.appendChild(lbl);
    dialog.appendChild(row);
  }
  return dialog;
}

// ── Keyboard navigation ────────────────────────────────────────────────────
export function initKeyboardNav({ onPrev, onNext, onToggleContext, onToggleChrome, onPeek, onRangeCopy }) {
  document.addEventListener('keydown', (e) => {
    if (!isEnabled('keyboard-nav')) return;
    const tag = document.activeElement?.tagName;
    if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;
    if (e.target?.isContentEditable) return;

    if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev?.(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onNext?.(); }
    else if (e.key === 'c' || e.key === 'C') onToggleContext?.();
    else if (e.key === 'H' && e.shiftKey) onToggleChrome?.();
    else if (e.key === 'p' || e.key === 'P') onPeek?.();
    else if (e.key === 'r' || e.key === 'R') onRangeCopy?.();
    else if (e.key === 'Escape') document.dispatchEvent(new CustomEvent('escape-pressed'));
  });
}

// ── Optimistic feedback ────────────────────────────────────────────────────
export function showFeedback(msg) {
  if (!isEnabled('optimistic-feedback')) return;
  const el = document.getElementById('op-feedback');
  if (!el) return;
  el.textContent = msg;
  el.setAttribute('aria-live', 'polite');
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2000);
}

// ── Undo navigation ────────────────────────────────────────────────────────
let _undoTimer = null;
export function showUndoNav(label, onUndo) {
  if (!isEnabled('undo-navigation')) return;
  const el = document.getElementById('undo-nav');
  if (!el) return;
  el.textContent = label;
  el.classList.add('visible');
  el.onclick = () => { onUndo?.(); el.classList.remove('visible'); clearTimeout(_undoTimer); };
  clearTimeout(_undoTimer);
  _undoTimer = setTimeout(() => el.classList.remove('visible'), 4000);
}

// ── Narrator position line ─────────────────────────────────────────────────
export function updateNarratorLine(sentenceIndex, totalSentences) {
  if (!isEnabled('narrator-position')) return;
  const line = document.getElementById('narrator-line');
  if (!line) return;
  const pct = totalSentences > 0 ? (sentenceIndex / totalSentences) * 100 : 0;
  line.style.width = `${pct}%`;
  line.style.display = pct > 0 ? 'block' : 'none';
}

// ── Smart scroll gravity ───────────────────────────────────────────────────
export function initSmartScroll(contentEl) {
  if (!isEnabled('smart-scroll')) return;
  let _scrollTimer = null;
  contentEl.addEventListener('scroll', () => {
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(() => snapToNearestAnchor(contentEl), 120);
  });
}

function snapToNearestAnchor(el) {
  if (!isEnabled('smart-scroll')) return;
  const anchors = [...el.querySelectorAll('.letter-body')];
  const scrollTop = el.scrollTop;
  const viewMid = scrollTop + el.clientHeight / 2;
  let closest = null, closestDist = Infinity;
  for (const a of anchors) {
    const dist = Math.abs(a.offsetTop - viewMid);
    if (dist < closestDist) { closestDist = dist; closest = a; }
  }
  if (closest && closestDist < 80) {
    el.scrollTo({ top: closest.offsetTop - 20, behavior: 'smooth' });
  }
}
```

- [ ] **Step 6.2: Commit**

```bash
git add js/smartFeatures.js
git commit -m "feat: smartFeatures.js — 14 toggleable features, keyboard nav, feedback"
```

---

## Task 7: exporter.js

- [ ] **Step 7.1: Write exporter.js**

```js
// js/exporter.js
const TEXT_VIEWS = ['original_french','modern_french','literal_english_old','literal_english_modern','plain_english'];
const VIEW_LABELS = { original_french:'Vieux Français', modern_french:'Français Moderne', literal_english_old:'Anglais Littéral (vieux)', literal_english_modern:'Anglais Littéral (moderne)', plain_english:'Anglais Moderne' };

export function exportLetters({ letters, scope, view, format, selectionText }) {
  let subset;
  if (scope === 'selection') {
    subset = [{ id: 'selection', letter_number: 0, date_display: '', views: { plain_english: selectionText }, contextRefs: [] }];
  } else if (scope === 'this-letter') {
    subset = letters.slice(0, 1);
  } else if (scope === 'this-chapter') {
    subset = letters;
  } else {
    subset = letters;
  }

  const views = view === 'all' ? TEXT_VIEWS : [view];

  if (format === 'plain-text') {
    const text = subset.map(l => views.map(v => l.views[v] || '').join('\n\n---\n\n')).join('\n\n═══\n\n');
    download(text, 'isabelle-letters.txt', 'text/plain');
    return;
  }

  if (format === 'print') {
    const win = window.open('', '_blank');
    win.document.write(buildHtmlDoc(subset, views, true));
    win.document.close();
    win.print();
    return;
  }

  // html
  const html = buildHtmlDoc(subset, views, false);
  download(html, 'isabelle-letters.html', 'text/html');
}

function buildHtmlDoc(letters, views, forPrint) {
  const toc = letters.map(l =>
    `<li><a href="#${l.id}">${l.date_display || ''} — Letter ${l.letter_number}</a></li>`
  ).join('');

  const body = letters.map(l => {
    const sections = views.map(v => {
      const text = l.views?.[v];
      if (!text) return '';
      return `<section class="view-section">
        <h3>${VIEW_LABELS[v] || v}</h3>
        ${text.split(/\n\n+/).map(p => `<p>${p}</p>`).join('')}
      </section>`;
    }).join('');
    return `<article id="${l.id}" class="letter-export">
      <header><time>${l.date_display || ''}</time><span>Letter ${l.letter_number}</span></header>
      ${l.salutation ? `<p class="salutation">${l.salutation}</p>` : ''}
      ${sections}
      ${l.closing ? `<p class="closing">${l.closing}</p>` : ''}
    </article>`;
  }).join('<hr>');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
  <title>Isabelle — Letters</title>
  <style>
    body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;color:#1a1a1a;line-height:1.75}
    header{display:flex;justify-content:space-between;font-size:.8rem;color:#666;margin-bottom:1rem}
    h3{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:#888;margin:1.5rem 0 .5rem}
    .salutation,.closing{font-style:italic}
    .closing{text-align:right;margin-top:1.5rem}
    article{margin-bottom:3rem}
    ${forPrint ? '@media print{hr{display:none}}' : ''}
  </style></head><body>
  <nav><ol>${toc}</ol></nav>
  ${body}
  </body></html>`;
}

function download(content, filename, type) {
  try {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    document.dispatchEvent(new CustomEvent('export-failed'));
  }
}
```

- [ ] **Step 7.2: Commit**

```bash
git add js/exporter.js
git commit -m "feat: exporter.js — html, print, plaintext at all granularities"
```

---

## Task 8: editor.js

- [ ] **Step 8.1: Write editor.js**

```js
// js/editor.js
import { showFeedback } from './smartFeatures.js';

let _unlocked = false;
let _editingEl = null;
let _onPause = null;
let _onSave = null;
const LONG_PRESS_MS = 800;

export function initEditor({ onPause, onSave }) {
  _onPause = onPause;
  _onSave = onSave;
  // Keyboard unlock
  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key === 'E') toggleEditorMode();
  });
}

export function isEditorUnlocked() { return _unlocked; }

function toggleEditorMode() {
  _unlocked = !_unlocked;
  document.body.classList.toggle('editor-mode', _unlocked);
  const indicator = document.getElementById('editor-indicator');
  if (indicator) indicator.style.display = _unlocked ? 'inline' : 'none';
  showFeedback(_unlocked ? 'Editor mode on' : 'Editor mode off');
}

export function attachLongPress(el, callback) {
  let timer = null;
  el.addEventListener('pointerdown', () => { timer = setTimeout(callback, LONG_PRESS_MS); });
  el.addEventListener('pointerup', () => clearTimeout(timer));
  el.addEventListener('pointercancel', () => clearTimeout(timer));
}

export function openInlineEdit(el) {
  if (!_unlocked) return;
  closeInlineEdit();
  _editingEl = el;
  el.contentEditable = 'true';
  el.classList.add('editing');
  _onPause?.();
  showToolbar(el);
}

export function closeInlineEdit() {
  if (!_editingEl) return;
  _editingEl.contentEditable = 'false';
  _editingEl.classList.remove('editing');
  _editingEl = null;
  hideToolbar();
}

function showToolbar(anchorEl) {
  const tb = document.getElementById('inline-toolbar');
  if (!tb) return;
  tb.style.display = 'flex';
  // Position near the element
  const rect = anchorEl.getBoundingClientRect();
  tb.style.top = `${rect.top - 48}px`;
  tb.style.left = `${rect.left}px`;
}

function hideToolbar() {
  const tb = document.getElementById('inline-toolbar');
  if (tb) tb.style.display = 'none';
}

export function applyInlineFormat(command) {
  if (!_editingEl) return;
  _editingEl.focus();
  if (command === 'bold') document.execCommand('bold');
  else if (command === 'italic') document.execCommand('italic');
  else if (command === 'underline') document.execCommand('underline');
}

// ── Mapping editor ─────────────────────────────────────────────────────────
export function renderMappingEditor({ letter, contextEntries, onLink, onUnlink, onCreate }, doc) {
  const panel = doc.createElement('div');
  panel.className = 'mapping-editor';
  panel.setAttribute('aria-label', `Connections for Letter ${letter.letter_number}`);

  const title = doc.createElement('h3');
  title.textContent = `Letter ${letter.letter_number} — ${letter.date_display || ''}`;
  panel.appendChild(title);

  const list = doc.createElement('ul');
  list.className = 'mapping-list';
  for (const refId of letter.contextRefs) {
    const entry = contextEntries[refId];
    if (!entry) continue;
    const li = doc.createElement('li');
    li.textContent = entry.name;
    const remove = doc.createElement('button');
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `Remove link to ${entry.name}`);
    remove.onclick = () => { onUnlink(refId); li.remove(); };
    li.appendChild(remove);
    list.appendChild(li);
  }
  panel.appendChild(list);

  // Add connection
  const addBtn = doc.createElement('button');
  addBtn.className = 'add-connection';
  addBtn.textContent = '+ Add connection';
  addBtn.onclick = () => openConnectionSearch(panel, contextEntries, letter, onLink, onCreate, doc);
  panel.appendChild(addBtn);
  return panel;
}

function openConnectionSearch(panel, contextEntries, letter, onLink, onCreate, doc) {
  const existing = panel.querySelector('.connection-search');
  if (existing) existing.remove();

  const wrap = doc.createElement('div');
  wrap.className = 'connection-search';
  const input = doc.createElement('input');
  input.type = 'search';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', 'Search context entries');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'true');
  const results = doc.createElement('ul');
  results.setAttribute('role', 'listbox');

  input.oninput = () => {
    const q = input.value.toLowerCase();
    results.innerHTML = '';
    const matches = Object.values(contextEntries).filter(e => e.name.toLowerCase().includes(q)).slice(0, 8);
    for (const entry of matches) {
      const li = doc.createElement('li');
      li.role = 'option';
      li.textContent = entry.name;
      li.onclick = () => { onLink(entry.id); wrap.remove(); };
      results.appendChild(li);
    }
    if (q.length >= 2) {
      const create = doc.createElement('li');
      create.role = 'option';
      create.setAttribute('aria-label', `Create new entry: ${input.value}`);
      create.textContent = `No match — Create "${input.value}"`;
      create.onclick = () => onCreate(input.value, wrap);
      results.appendChild(create);
    }
  };

  wrap.appendChild(input);
  wrap.appendChild(results);
  panel.appendChild(wrap);
  input.focus();
}
```

- [ ] **Step 8.2: Commit**

```bash
git add js/editor.js
git commit -m "feat: editor.js — hidden editor mode, inline edit, mapping UI"
```

---

## Task 9: index.html + CSS

**Files:** Rewrite `index.html`

- [ ] **Step 9.1: Write index.html**

This is the full shell. CSS design tokens, layout, and all static markup. JS modules loaded at bottom.

```html
<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Isabelle — Letters</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Pinyon+Script&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    /* ── Tokens ── */
    :root {
      --bg:#09060c; --surf:#0f0a13; --surf2:#140e18;
      --border:rgba(198,123,165,0.14); --border-hi:rgba(198,123,165,0.38);
      --accent:#c67ba5; --accent-bg:rgba(198,123,165,0.10); --accent-dim:rgba(198,123,165,0.28);
      --text:rgba(255,255,255,0.82); --text-m:rgba(255,255,255,0.52); --text-d:rgba(255,255,255,0.28);
      --book-font:Georgia,'Times New Roman',serif;
      --ui-font:'JetBrains Mono',monospace;
      --font-size:16px; --t:0.18s ease;
    }
    [data-theme="light"] {
      --bg:#faf8f5; --surf:#f0ede8; --surf2:#e8e4de;
      --border:rgba(120,60,90,0.14); --border-hi:rgba(120,60,90,0.30);
      --accent:#9b4f7a; --text:rgba(30,20,25,0.85); --text-m:rgba(30,20,25,0.55); --text-d:rgba(30,20,25,0.35);
    }
    /* ── Reset ── */
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{font-size:var(--font-size)}
    :focus-visible{outline:2px solid var(--accent);outline-offset:2px}

    /* ── Layout ── */
    body{background:var(--bg);color:var(--text);font-family:var(--ui-font);height:100vh;display:flex;flex-direction:column;overflow:hidden}
    #app{display:flex;flex:1;overflow:hidden}

    /* ── Sidebar ── */
    #sidebar{width:260px;min-width:260px;background:var(--surf);border-right:1px solid var(--border);display:flex;flex-direction:column;transition:width var(--t),min-width var(--t);overflow:hidden}
    #sidebar.collapsed{width:0;min-width:0}
    #sidebar-nav{flex:1;overflow-y:auto;padding:12px 0}
    .nav-letter{display:block;width:100%;background:none;border:none;text-align:left;padding:6px 16px;color:var(--text-m);font-family:var(--book-font);font-size:.82rem;cursor:pointer;transition:color var(--t),background var(--t)}
    .nav-letter:hover,.nav-letter.active{color:var(--text);background:var(--surf2)}
    .nav-letter.placeholder{opacity:.4;cursor:default}
    .nav-chapter-heading{font-family:var(--ui-font);font-size:.56rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);padding:16px 16px 6px}

    /* ── Main reading area ── */
    #main{flex:1;display:flex;overflow:hidden}
    #letter-pane{flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative}
    #letter-content{flex:1;overflow-y:auto;padding:48px 60px 40px;scrollbar-width:thin;scrollbar-color:var(--border) transparent}

    /* ── Context panel ── */
    #context-pane{width:320px;min-width:320px;background:var(--surf);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;transition:width var(--t),min-width var(--t)}
    #context-pane.collapsed{width:0;min-width:0}
    #context-content{flex:1;overflow-y:auto;padding:24px 20px}

    /* ── Narrator position line ── */
    #narrator-line{position:absolute;top:0;left:0;height:2px;width:0;background:var(--accent);transition:width .3s linear;display:none}

    /* ── Letter typography ── */
    .letter-meta{display:flex;justify-content:space-between;font-size:.72rem;color:var(--text-d);margin-bottom:24px;font-family:var(--ui-font);letter-spacing:.06em}
    .view-switcher{display:flex;gap:20px;margin-bottom:28px;flex-wrap:wrap}
    .view-switcher [role=tab]{background:none;border:none;font-family:var(--ui-font);font-size:.68rem;color:var(--text-d);cursor:pointer;padding:0 0 3px;transition:color var(--t)}
    .view-switcher [role=tab].active{color:var(--accent);border-bottom:1px solid var(--accent)}
    .letter-salutation{font-family:var(--book-font);font-size:var(--font-size);color:var(--text);margin-bottom:16px;font-style:italic}
    .letter-paragraph{font-family:var(--book-font);font-size:var(--font-size);color:var(--text);line-height:1.82;margin-bottom:14px;max-width:640px}
    .letter-paragraph.current{background:var(--accent-bg)}
    .letter-paragraph.handwriting{font-family:'Pinyon Script',cursive;font-size:calc(var(--font-size) * 1.3);background:rgba(245,240,230,0.06);padding:4px 8px}
    .letter-closing{font-family:var(--book-font);font-size:var(--font-size);color:var(--text);text-align:right;margin-top:20px;font-style:italic;max-width:640px}
    .ctx-ref{border-bottom:1px dotted var(--accent);cursor:pointer}
    .ctx-ref:hover{background:var(--accent-bg)}
    .letter-nav{display:flex;justify-content:space-between;margin-top:32px;padding-top:20px;border-top:1px solid var(--border);max-width:640px}
    .letter-nav button{background:none;border:none;color:var(--text-d);font-family:var(--ui-font);font-size:.72rem;cursor:pointer;transition:color var(--t)}
    .letter-nav button:hover:not(:disabled){color:var(--accent)}
    .letter-nav button:disabled{opacity:.25;cursor:default}
    .photocopy-img{max-width:100%;background:rgba(245,240,230,0.04);display:block}
    .photocopy-fallback{background:rgba(245,240,230,0.04);padding:24px}
    .photocopy-notice{font-size:.72rem;color:var(--text-d);margin-bottom:16px;font-family:var(--ui-font)}
    .view-missing{color:var(--text-d);font-family:var(--ui-font);font-size:.8rem;font-style:italic}

    /* ── Page-lock mode ── */
    body.page-mode #letter-content{overflow:hidden;display:flex;scroll-snap-type:x mandatory}
    body.page-mode .letter-page{min-width:100%;scroll-snap-align:start;padding:48px 60px 40px}

    /* ── Bottom bar ── */
    #bottom-bar{background:var(--surf);border-top:1px solid var(--border);padding:10px 20px;display:flex;flex-direction:column;gap:8px;flex-shrink:0;transition:transform var(--t)}
    #bottom-bar.collapsed{transform:translateY(100%)}
    .bar-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
    .bar-icon{background:none;border:none;color:var(--text-m);cursor:pointer;font-size:1rem;padding:6px;transition:color var(--t);line-height:1;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center}
    .bar-icon:hover,.bar-icon.active{color:var(--accent)}
    .speed-slider{width:80px;accent-color:var(--accent)}
    .speed-label{font-size:.68rem;color:var(--text-d);min-width:28px}
    .pull-strip{height:6px;background:var(--accent);cursor:pointer;opacity:.4;flex-shrink:0;transition:opacity var(--t)}
    .pull-strip:hover{opacity:.9}

    /* ── Smart features panel ── */
    #smart-features-panel{position:fixed;bottom:80px;right:20px;background:var(--surf);border:1px solid var(--border);padding:16px 20px;z-index:50;display:none;min-width:220px}
    #smart-features-panel.open{display:block}
    .sf-row{display:flex;align-items:center;gap:10px;padding:5px 0;cursor:pointer}
    .sf-toggle{width:32px;height:18px;background:var(--surf2);border:1px solid var(--border);border-radius:9px;cursor:pointer;position:relative;transition:background var(--t)}
    .sf-toggle.on{background:var(--accent-dim)}

    /* ── Export panel ── */
    #export-panel{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--surf);border:1px solid var(--border);padding:20px 24px;z-index:50;display:none;min-width:280px}
    #export-panel.open{display:block}
    .export-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
    .export-btn{background:none;border:1px solid var(--border);color:var(--text-m);font-family:var(--ui-font);font-size:.62rem;padding:5px 10px;cursor:pointer;transition:all var(--t)}
    .export-btn.active,.export-btn:hover{background:var(--accent-dim);color:var(--text);border-color:var(--accent)}

    /* ── Inline toolbar (editor) ── */
    #inline-toolbar{position:fixed;display:none;gap:6px;background:var(--surf);border:1px solid var(--border);padding:6px 10px;z-index:60}
    #inline-toolbar button{background:none;border:none;color:var(--text-m);cursor:pointer;font-family:var(--ui-font);font-size:.78rem;padding:3px 6px;transition:color var(--t)}
    #inline-toolbar button:hover{color:var(--accent)}

    /* ── Feedback / undo ── */
    #op-feedback{position:fixed;bottom:96px;left:50%;transform:translateX(-50%);font-family:var(--ui-font);font-size:.62rem;color:var(--text-d);opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap}
    #op-feedback.visible{opacity:1}
    #undo-nav{position:fixed;bottom:96px;right:20px;background:var(--surf);border:1px solid var(--border);color:var(--text-m);font-family:var(--ui-font);font-size:.62rem;padding:6px 12px;cursor:pointer;display:none;z-index:50}
    #undo-nav.visible{display:block}

    /* ── Context sync dot ── */
    #ctx-sync-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block;opacity:0;margin-left:6px}
    #ctx-sync-dot.pulse{animation:dot-pulse .4s ease forwards}
    @keyframes dot-pulse{0%{opacity:0}50%{opacity:1}100%{opacity:0}}

    /* ── Range copy mode ── */
    body.range-mode .letter-paragraph{cursor:pointer}
    .range-banner{display:none;position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--surf);border:1px solid var(--accent);color:var(--text-m);font-family:var(--ui-font);font-size:.62rem;padding:8px 16px;z-index:50;white-space:nowrap}
    body.range-mode .range-banner{display:block}

    /* ── Editor mode ── */
    #editor-indicator{display:none;font-size:.56rem;letter-spacing:.1em;color:var(--accent);font-family:var(--ui-font)}
    body.editor-mode #editor-indicator{display:inline}

    /* ── Accessibility ── */
    @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
    @media(prefers-contrast:more){:root{--border:rgba(198,123,165,0.5)}}

    /* ── Mobile ── */
    @media(max-width:767px){
      #sidebar{position:fixed;left:-260px;top:0;bottom:0;z-index:40;transition:left var(--t)}
      #sidebar.open{left:0}
      #context-pane{position:fixed;right:-320px;top:0;bottom:0;z-index:40;transition:right var(--t)}
      #context-pane.open{right:0}
      #letter-content{padding:24px 20px 20px}
      .letter-paragraph{max-width:100%}
      .letter-closing{max-width:100%}
    }

    /* ── Print ── */
    @media print{
      #sidebar,#context-pane,#bottom-bar,.pull-strip,#smart-features-panel,#export-panel,#inline-toolbar{display:none!important}
      body{height:auto;overflow:visible}
      #letter-content{overflow:visible;height:auto;padding:0}
    }
  </style>
</head>
<body>
<div id="app">
  <!-- SIDEBAR -->
  <nav id="sidebar" aria-label="Navigation">
    <div id="sidebar-nav" role="list"></div>
  </nav>

  <!-- MAIN -->
  <div id="main">
    <div id="letter-pane">
      <div id="narrator-line" aria-hidden="true"></div>
      <div id="letter-content" role="main">
        <p id="loading" style="padding:48px 60px;color:var(--text-d);font-size:.9rem">Loading…</p>
      </div>
    </div>

    <!-- CONTEXT PANEL -->
    <aside id="context-pane" class="collapsed" aria-label="Context panel">
      <div id="context-content"></div>
    </aside>
  </div>
</div>

<!-- BOTTOM BAR -->
<div id="bottom-bar">
  <div class="bar-row" id="bar-row-1">
    <button class="bar-icon" id="btn-play" aria-label="Play">▶</button>
    <button class="bar-icon" id="btn-stop" aria-label="Stop">◼</button>
    <button class="bar-icon" id="btn-prev" aria-label="Previous">←</button>
    <button class="bar-icon" id="btn-next" aria-label="Next">→</button>
    <input type="range" class="speed-slider" id="speed-range" min="0.5" max="2" step="0.1" value="1" aria-label="Playback speed">
    <span class="speed-label" id="speed-label">1.0×</span>
    <button class="bar-icon" id="btn-narrator" aria-label="Narrator mode">♪</button>
    <select id="letter-voice-select" aria-label="Select letter voice" style="background:var(--surf2);border:none;color:var(--text-m);font-family:var(--ui-font);font-size:.62rem;padding:4px;max-width:120px"></select>
    <select id="context-voice-select" aria-label="Select context voice" style="background:var(--surf2);border:none;color:var(--text-d);font-family:var(--ui-font);font-size:.62rem;padding:4px;max-width:100px"></select>
    <button class="bar-icon" id="btn-range-copy" aria-label="Range copy mode">✂</button>
    <button class="bar-icon" id="btn-font-dec" aria-label="Decrease font size">A-</button>
    <button class="bar-icon" id="btn-font-inc" aria-label="Increase font size">A+</button>
    <button class="bar-icon" id="btn-theme" aria-label="Toggle theme">◐</button>
    <button class="bar-icon" id="btn-focus" aria-label="Reading mode">⊞</button>
    <button class="bar-icon" id="btn-context" aria-label="Context panel">📖</button>
    <button class="bar-icon" id="btn-sidebar" aria-label="Navigation">≡</button>
    <button class="bar-icon" id="btn-export" aria-label="Export">↓</button>
    <button class="bar-icon" id="btn-smart" aria-label="Smart features">✦</button>
    <button class="bar-icon" id="btn-save" aria-label="Save">💾</button>
    <span id="editor-indicator" aria-label="Editor mode active">🖉</span>
  </div>
  <div id="op-feedback" role="status" aria-live="polite"></div>
  <div id="undo-nav" role="status" aria-live="polite"></div>
</div>
<div class="pull-strip" id="pull-strip" aria-label="Show controls" role="button" tabindex="0"></div>

<!-- OVERLAYS -->
<div class="range-banner" id="range-banner" aria-live="polite">Click a sentence to set start → click another to set end → copy</div>
<div id="ctx-sync-dot" aria-hidden="true"></div>
<div id="smart-features-panel" role="dialog" aria-label="Smart Features"></div>
<div id="export-panel" role="dialog" aria-label="Export"></div>
<div id="inline-toolbar" role="toolbar" aria-label="Format">
  <button onclick="window._editor?.applyInlineFormat('bold')" aria-label="Bold">B</button>
  <button onclick="window._editor?.applyInlineFormat('italic')" aria-label="Italic"><em>I</em></button>
  <button onclick="window._editor?.applyInlineFormat('underline')" aria-label="Underline"><u>U</u></button>
  <button onclick="window._editor?.closeInlineEdit()" aria-label="Close editor">✕</button>
</div>

<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 9.2: Commit**

```bash
git add index.html
git commit -m "feat: index.html shell — full CSS design system, all markup, bottom bar"
```

---

## Task 10: app.js — Wire Everything

- [ ] **Step 10.1: Write app.js**

```js
// js/app.js
import { loadData, resolvePosition, loadLocalPosition, saveLocalPosition } from './loader.js';
import { buildAliasMap, buildSortedAliases, renderLetterMeta, renderViewSwitcher, renderLetterBody, renderLetterNav } from './renderer.js';
import { Player } from './player.js';
import { initProgress, savePosition, cancelSync, forceSyncPosition } from './progress.js';
import { setMode as setFocusMode, applyMode, initFocusMode } from './focusMode.js';
import { initSync, syncToLetter, activateEntry } from './sync.js';
import { initEditor, openInlineEdit, closeInlineEdit, applyInlineFormat, attachLongPress, isEditorUnlocked, renderMappingEditor } from './editor.js';
import { exportLetters } from './exporter.js';
import { renderTogglePanel, initKeyboardNav, showFeedback, showUndoNav, updateNarratorLine, initSmartScroll, isEnabled } from './smartFeatures.js';
import { saveToGitHub, getToken, setToken } from './github.js';

const LS = k => `isabelle-v2-${k}`;

let book = null, context = null;
let letters = [], contextIndex = {};
let currentLetterIdx = 0;
let sortedAliases = [];
let activeView = 'plain_english';
let player = null;
let rangeModeActive = false;
let rangeStart = null;

// ── Boot ───────────────────────────────────────────────────────────────────
async function init() {
  if (!window.speechSynthesis) {
    document.getElementById('loading').textContent =
      'Your browser does not support text-to-speech. Try Chrome or Edge.';
    return;
  }

  let data;
  try { data = await loadData(); }
  catch { document.getElementById('loading').textContent = 'Could not load book. Check your connection and reload.'; return; }

  book = data.book;
  context = data.context;
  letters = book.letters;
  contextIndex = Object.fromEntries((context.entries || []).map(e => [e.id, e]));

  const aliasMap = buildAliasMap(context.entries || []);
  sortedAliases = buildSortedAliases(aliasMap);

  // Restore settings
  activeView = localStorage.getItem(LS('view-default')) || book.defaultView || 'plain_english';
  const savedTheme = localStorage.getItem(LS('theme')) || 'dark';
  document.documentElement.dataset.theme = savedTheme;
  document.documentElement.style.setProperty('--font-size', (localStorage.getItem(LS('font-size')) || '16') + 'px');

  // Restore position
  const localPos = loadLocalPosition();
  const resolvedPos = resolvePosition(localPos, book.lastPosition);
  currentLetterIdx = Math.max(0, letters.findIndex(l => l.id === resolvedPos?.letter_id));
  if (currentLetterIdx < 0) currentLetterIdx = 0;

  // Build sidebar
  buildSidebar();

  // Render initial letter
  renderCurrentLetter();

  document.getElementById('loading').style.display = 'none';

  // Init player
  initPlayer();
  initProgress(() => book);
  initFocusMode([]);
  initSync({ contextPanel: document.getElementById('context-content'), contextEntries: contextIndex, onEntryActivate: renderContextEntry });
  initEditor({ onPause: () => player?.pause(), onSave: () => saveAll() });
  initKeyboardNav({ onPrev: () => goToLetter(currentLetterIdx - 1), onNext: () => goToLetter(currentLetterIdx + 1), onToggleContext: toggleContextPanel, onToggleChrome: toggleChrome, onPeek: () => {}, onRangeCopy: toggleRangeMode });
  initSmartScroll(document.getElementById('letter-content'));

  // Smart features panel
  document.getElementById('smart-features-panel').appendChild(renderTogglePanel(document));

  wireControls();
}

// ── Letter rendering ───────────────────────────────────────────────────────
function renderCurrentLetter() {
  const letter = letters[currentLetterIdx];
  if (!letter) return;
  const container = document.getElementById('letter-content');
  container.innerHTML = '';

  // Per-letter view memory
  const memKey = LS(`view-memory-${letter.id}`);
  const letterView = localStorage.getItem(memKey) || activeView;

  const meta = renderLetterMeta(letter, document);
  // Long-press letter number to unlock editor on mobile
  const numEl = meta.querySelector('[data-letter-number]');
  attachLongPress(numEl, () => document.dispatchEvent(new KeyboardEvent('keydown', { shiftKey: true, key: 'E' })));
  container.appendChild(meta);

  const viewSwitcher = renderViewSwitcher(letter, letterView, (view) => {
    localStorage.setItem(memKey, view);
    renderCurrentLetter();
  }, document);
  container.appendChild(viewSwitcher);

  const body = renderLetterBody(letter, letterView, sortedAliases, document);
  // Wire ctx-ref clicks
  body.querySelectorAll('.ctx-ref').forEach(span => {
    span.addEventListener('click', () => { activateEntry(span.dataset.refId, { pulse: true }); openContextPanel(); renderContextEntry(span.dataset.refId); });
    span.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') span.click(); });
  });
  // Wire paragraph clicks
  body.querySelectorAll('.letter-paragraph').forEach((p, i) => {
    p.addEventListener('click', () => handleParaClick(p, i));
    p.addEventListener('dblclick', () => openInlineEdit(p));
    attachLongPress(p, () => openInlineEdit(p));
  });
  container.appendChild(body);

  const nav = renderLetterNav(letter, letters.length,
    () => goToLetter(currentLetterIdx - 1),
    () => goToLetter(currentLetterIdx + 1), document);
  container.appendChild(nav);

  // Update sidebar active state
  document.querySelectorAll('.nav-letter').forEach((el, i) => el.classList.toggle('active', i === currentLetterIdx));

  // Context sync
  syncToLetter(letter);

  // Save position
  savePosition({ letter_id: letter.id, paragraph_index: 0, scroll_offset: 0, active_view: letterView, timestamp: Date.now() });
}

function goToLetter(idx, { addUndo = true } = {}) {
  const prev = currentLetterIdx;
  currentLetterIdx = Math.max(0, Math.min(idx, letters.length - 1));
  if (addUndo && isEnabled('undo-navigation')) {
    showUndoNav(`← Letter ${prev + 1}`, () => goToLetter(prev, { addUndo: false }));
  }
  renderCurrentLetter();
}

// ── Sidebar ────────────────────────────────────────────────────────────────
function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = '';
  for (const ch of book.chapters) {
    const heading = document.createElement('div');
    heading.className = 'nav-chapter-heading';
    heading.textContent = ch.title;
    nav.appendChild(heading);
    const chLetters = letters.filter(l => l.chapter_id === ch.id);
    chLetters.forEach((letter) => {
      const btn = document.createElement('button');
      btn.className = 'nav-letter' + (letter.complete ? '' : ' placeholder');
      btn.setAttribute('role', 'listitem');
      btn.textContent = letter.date_display
        ? `${letter.letter_number}. ${letter.date_display}`
        : `${letter.letter_number}. — not yet added`;
      if (!letter.complete) btn.disabled = true;
      btn.onclick = () => { goToLetter(letters.indexOf(letter)); closeSidebar(); };
      // Truncation reveal tooltip
      btn.title = btn.textContent;
      nav.appendChild(btn);
    });
  }
}

// ── Context panel ──────────────────────────────────────────────────────────
function openContextPanel() { document.getElementById('context-pane').classList.remove('collapsed'); document.getElementById('context-pane').classList.add('open'); }
function closeContextPanel() { document.getElementById('context-pane').classList.add('collapsed'); document.getElementById('context-pane').classList.remove('open'); }
function toggleContextPanel() {
  const pane = document.getElementById('context-pane');
  if (pane.classList.contains('collapsed')) openContextPanel(); else closeContextPanel();
}

function renderContextEntry(entryId) {
  const entry = contextIndex[entryId];
  if (!entry) return;
  const container = document.getElementById('context-content');
  container.innerHTML = '';
  const h2 = document.createElement('h2');
  h2.style.cssText = 'font-size:.9rem;margin-bottom:8px;color:var(--accent)';
  h2.textContent = entry.name;
  const sub = document.createElement('p');
  sub.style.cssText = 'font-size:.72rem;color:var(--text-d);margin-bottom:16px';
  sub.textContent = entry.short;
  container.appendChild(h2);
  container.appendChild(sub);
  if (entry.images?.length) {
    entry.images.filter(img => img.url).forEach(img => {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = img.url; image.alt = img.alt || '';
      image.style.cssText = 'max-width:100%;margin-bottom:6px';
      const cap = document.createElement('figcaption');
      cap.style.cssText = 'font-size:.62rem;color:var(--text-d)';
      cap.textContent = img.caption || '';
      figure.appendChild(image); figure.appendChild(cap);
      container.appendChild(figure);
    });
  }
  for (const para of (entry.content || [])) {
    const p = document.createElement('p');
    p.style.cssText = 'font-family:var(--book-font);font-size:.88rem;line-height:1.75;color:var(--text-m);margin-bottom:12px';
    p.textContent = para.text;
    container.appendChild(p);
  }
  // Mapping editor (editor mode)
  if (isEditorUnlocked()) {
    const mapEditor = renderMappingEditor({
      letter: letters[currentLetterIdx],
      contextEntries: contextIndex,
      onLink: (id) => { letters[currentLetterIdx].contextRefs.push(id); contextIndex[id].letterRefs.push(letters[currentLetterIdx].id); showFeedback('Connection added'); },
      onUnlink: (id) => { const l = letters[currentLetterIdx]; l.contextRefs = l.contextRefs.filter(r => r !== id); showFeedback('Connection removed'); },
      onCreate: (name, wrap) => { showFeedback(`Creating entry: ${name}`); wrap.remove(); }
    }, document);
    container.appendChild(mapEditor);
  }
}

// ── Player ─────────────────────────────────────────────────────────────────
function initPlayer() {
  const paragraphs = letters.flatMap(l => {
    const text = l.views[activeView] || l.views.plain_english || '';
    return text.split(/\n\n+/).filter(Boolean).map(t => ({ text: t }));
  });

  player = new Player({
    onParagraphAdvance: (idx) => { updateNarratorLine(idx, paragraphs.length); },
    onWord: () => {},
    onEnd: () => { document.getElementById('btn-play').textContent = '▶'; },
    onContextSnippet: (id) => activateEntry(id, { pulse: true })
  });
  player.setData({ paragraphs, sortedAliases, contextEntries: contextIndex });

  function populateVoiceSelectors() {
    const voices = window.speechSynthesis.getVoices();
    const lv = localStorage.getItem(LS('letter-voice')) || '';
    const cv = localStorage.getItem(LS('context-voice')) || '';
    const opts = voices.map(v => `<option value="${v.voiceURI}">${v.name} (${v.lang})</option>`).join('');
    const lvSel = document.getElementById('letter-voice-select');
    const cvSel = document.getElementById('context-voice-select');
    lvSel.innerHTML = opts; cvSel.innerHTML = opts;
    if (lv) lvSel.value = lv; if (cv) cvSel.value = cv;
    player.setLetterVoice(lvSel.value);
    player.setContextVoice(cvSel.value);
    lvSel.onchange = () => { player.setLetterVoice(lvSel.value); localStorage.setItem(LS('letter-voice'), lvSel.value); };
    cvSel.onchange = () => { player.setContextVoice(cvSel.value); localStorage.setItem(LS('context-voice'), cvSel.value); };
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length) populateVoiceSelectors(); else player.autoSelectVoices();
  window.speechSynthesis.addEventListener('voiceschanged', populateVoiceSelectors);
}

// ── Paragraph click (range copy vs jump) ──────────────────────────────────
function handleParaClick(el, paraIdx) {
  if (rangeModeActive) {
    handleRangeClick(el);
  } else {
    player?.setIndex(paraIdx);
    document.querySelectorAll('.letter-paragraph.current').forEach(p => p.classList.remove('current'));
    el.classList.add('current');
  }
}

function toggleRangeMode() {
  rangeModeActive = !rangeModeActive;
  document.body.classList.toggle('range-mode', rangeModeActive);
  rangeStart = null;
  document.querySelectorAll('.rp-start,.rp-end').forEach(el => el.classList.remove('rp-start','rp-end'));
}

function handleRangeClick(el) {
  if (!rangeStart) {
    rangeStart = el;
    el.classList.add('rp-start');
  } else {
    el.classList.add('rp-end');
    const text = [rangeStart.textContent, el.textContent].join(' … ');
    navigator.clipboard.writeText(text).then(() => { showFeedback('Copied'); toggleRangeMode(); });
  }
}

// ── Sidebar + chrome collapse ──────────────────────────────────────────────
function closeSidebar() { document.getElementById('sidebar').classList.add('collapsed'); document.getElementById('sidebar').classList.remove('open'); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('collapsed'); document.getElementById('sidebar').classList.toggle('open'); }
function toggleChrome() { document.getElementById('bottom-bar').classList.toggle('collapsed'); }

// ── Save ───────────────────────────────────────────────────────────────────
async function saveAll() {
  cancelSync();
  const letter = letters[currentLetterIdx];
  book.lastPosition = { letter_id: letter.id, paragraph_index: 0, scroll_offset: 0, active_view: activeView, timestamp: Date.now() };
  try {
    await saveToGitHub('book.json', book);
    await saveToGitHub('context.json', context);
    showFeedback('Saved. Changes will appear after a short delay — hard-refresh if needed (Ctrl+Shift+R).');
  } catch (e) {
    const msgs = { missing_config: 'Enter your GitHub token in settings.', bad_token: 'Save failed. Check token — repo must be Public.', rate_limited: 'Too many saves. Wait a minute.', sha_conflict: 'Save conflict — reload and try again.', get_failed: 'Could not reach GitHub. Try again when connected.' };
    showFeedback(msgs[e.code] || `Save failed: ${e.message}`);
  }
}

// ── Controls ───────────────────────────────────────────────────────────────
function wireControls() {
  document.getElementById('btn-play').onclick = () => { closeInlineEdit(); player.play(); document.getElementById('btn-play').textContent = '⏸'; player.playing ? null : document.getElementById('btn-play').textContent = '▶'; };
  document.getElementById('btn-stop').onclick = () => { player.stop(); document.getElementById('btn-play').textContent = '▶'; };
  document.getElementById('btn-prev').onclick = () => player.skipPrev();
  document.getElementById('btn-next').onclick = () => player.skipNext();
  document.getElementById('btn-sidebar').onclick = toggleSidebar;
  document.getElementById('btn-context').onclick = toggleContextPanel;
  document.getElementById('btn-theme').onclick = () => { const l = document.documentElement.dataset.theme === 'light'; document.documentElement.dataset.theme = l ? 'dark' : 'light'; localStorage.setItem(LS('theme'), l ? 'dark' : 'light'); };
  document.getElementById('btn-save').onclick = saveAll;
  document.getElementById('btn-smart').onclick = () => document.getElementById('smart-features-panel').classList.toggle('open');
  document.getElementById('btn-range-copy').onclick = toggleRangeMode;
  document.getElementById('pull-strip').onclick = () => document.getElementById('bottom-bar').classList.remove('collapsed');
  document.getElementById('pull-strip').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('bottom-bar').classList.remove('collapsed'); });

  let fs = parseInt(localStorage.getItem(LS('font-size')) || '16');
  document.getElementById('btn-font-dec').onclick = () => { fs = Math.max(14, fs - 2); document.documentElement.style.setProperty('--font-size', fs + 'px'); localStorage.setItem(LS('font-size'), fs); };
  document.getElementById('btn-font-inc').onclick = () => { fs = Math.min(28, fs + 2); document.documentElement.style.setProperty('--font-size', fs + 'px'); localStorage.setItem(LS('font-size'), fs); };

  const spd = document.getElementById('speed-range');
  spd.value = localStorage.getItem(LS('speed')) || '1';
  document.getElementById('speed-label').textContent = parseFloat(spd.value).toFixed(1) + '×';
  spd.oninput = () => { player.setRate(parseFloat(spd.value)); document.getElementById('speed-label').textContent = parseFloat(spd.value).toFixed(1) + '×'; localStorage.setItem(LS('speed'), spd.value); };

  // Export panel
  document.getElementById('btn-export').onclick = () => document.getElementById('export-panel').classList.toggle('open');
  buildExportPanel();

  // Focus mode button
  const focusModes = ['off','reveal','spotlight','fade_ahead','page'];
  let fmIdx = focusModes.indexOf(localStorage.getItem(LS('focus-mode')) || 'off');
  document.getElementById('btn-focus').onclick = () => { fmIdx = (fmIdx + 1) % focusModes.length; const m = focusModes[fmIdx]; setFocusMode(m); localStorage.setItem(LS('focus-mode'), m); showFeedback(`Mode: ${m}`); };

  // Escape closes panels
  document.addEventListener('escape-pressed', () => {
    document.getElementById('smart-features-panel').classList.remove('open');
    document.getElementById('export-panel').classList.remove('open');
    closeInlineEdit();
    if (rangeModeActive) toggleRangeMode();
  });
}

function buildExportPanel() {
  const panel = document.getElementById('export-panel');
  panel.innerHTML = `
    <div class="export-row" id="exp-scope">
      <button class="export-btn active" data-scope="this-letter">this letter</button>
      <button class="export-btn" data-scope="all-letters">all letters</button>
      <button class="export-btn" data-scope="selection">selection</button>
      <button class="export-btn" data-scope="full-book">full book</button>
    </div>
    <div class="export-row" id="exp-view">
      <button class="export-btn active" data-view="plain_english">anglais</button>
      <button class="export-btn" data-view="original_french">vieux fr</button>
      <button class="export-btn" data-view="modern_french">fr moderne</button>
      <button class="export-btn" data-view="all">all views</button>
    </div>
    <div class="export-row" id="exp-format">
      <button class="export-btn" data-format="html">html</button>
      <button class="export-btn" data-format="print">print / pdf</button>
      <button class="export-btn" data-format="plain-text">plain text</button>
    </div>
  `;

  let selectedScope = 'this-letter', selectedView = 'plain_english';

  panel.querySelectorAll('[data-scope]').forEach(btn => btn.onclick = () => {
    panel.querySelectorAll('[data-scope]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); selectedScope = btn.dataset.scope;
  });
  panel.querySelectorAll('[data-view]').forEach(btn => btn.onclick = () => {
    panel.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); selectedView = btn.dataset.view;
  });
  panel.querySelectorAll('[data-format]').forEach(btn => btn.onclick = () => {
    const letter = letters[currentLetterIdx];
    const subset = selectedScope === 'this-letter' ? [letter] : letters.filter(l => l.complete);
    exportLetters({ letters: subset, scope: selectedScope, view: selectedView, format: btn.dataset.format, selectionText: window.getSelection()?.toString() || '' });
    panel.classList.remove('open');
    showFeedback('Exported');
  });

  document.addEventListener('export-failed', () => showFeedback('Export failed. Try a smaller selection or reload.'));
}

// ── Boot ───────────────────────────────────────────────────────────────────
window._editor = { applyInlineFormat, closeInlineEdit };
init();
```

- [ ] **Step 10.2: Commit**

```bash
git add js/app.js
git commit -m "feat: app.js — wire all modules, full v2 app entry point"
```

---

## Task 11: Integration Test

- [ ] **Step 11.1: Serve locally and verify**

```bash
cd C:\audio_book && npx serve . -p 8080
```

Open `http://localhost:8080` in Chrome or Edge.

Verify:
- [ ] Book loads — letters appear in sidebar
- [ ] View switcher shows 7 tabs, switching renders different text
- [ ] Play button speaks the letter text
- [ ] Context panel opens via 📖 button
- [ ] Clicking a `.ctx-ref` span opens and scrolls context panel
- [ ] All controls collapse when bottom bar is swiped/clicked down
- [ ] Pull strip restores controls
- [ ] `Shift+H` collapses all chrome
- [ ] `Shift+E` unlocks editor — 🖉 indicator appears
- [ ] Double-click paragraph in editor mode enters inline edit
- [ ] Smart features panel opens via ✦ — all 14 toggles present
- [ ] Export panel opens via ↓ — producing an HTML file
- [ ] `←` / `→` keys navigate letters

- [ ] **Step 11.2: Mobile viewport test**

In Chrome DevTools, toggle device toolbar, select iPhone 14 Pro. Verify:
- [ ] Bottom bar has two rows, not overflowing
- [ ] Sidebar slides in from left
- [ ] Context panel slides in from right (full screen)
- [ ] Touch targets feel natural (no tiny hit areas)

- [ ] **Step 11.3: Run all unit tests**

```bash
cd C:\audio_book && node --test tests/test-loader.js tests/test-renderer.js tests/test-player.js tests/test-extract.js
```

Expected: All pass.

- [ ] **Step 11.4: Final commit**

```bash
git add .
git commit -m "feat: v2 app complete — dual-book, documentary narrator, 14 smart features, export, hidden editor"
```

---

## Completion Criteria

- App loads from GitHub Pages and plays letters in any view
- Context panel syncs with letter contextRefs
- Documentary narrator waits for sentence boundary before interjecting
- All 14 smart features toggle and persist
- Export produces clean HTML, print, and plaintext output
- Hidden editor accessible via `Shift+E` / long-press
- All unit tests pass
- Mobile layout is usable on iPhone and Android viewports
