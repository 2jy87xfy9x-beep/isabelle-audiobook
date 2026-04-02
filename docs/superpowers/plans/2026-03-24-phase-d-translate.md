# Phase D — Translation API + Letter Translate Panel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add machine-translation (MT) of letter bodies: a Flask `/api/translate/text` route on the Phase B server, and a "Translate" button in the letter UI that calls it and renders a translated view in-memory without modifying stored data.

**Architecture:** Copy `C:\executor\media\translator.py` and `C:\executor\media\langdetect_util.py` into `server/media/`. Add a thin `server/routes/translate.py` Blueprint and register it in `server/app.py`. On the frontend, `js/translate.js` walks the rendered letter paragraphs, posts them to the API, and replaces the displayed text in a temporary overlay — no destructive edits to `book.json` or any view. A "Close translation" button restores the original. No LLM — pure MT via Google Translate (free tier via `deep-translator`).

**Tech Stack:** Python — `deep-translator`, `langdetect` (optional). Vanilla ES module JS. pytest + node:test.

**Depends on:** Phase B server (`server/app.py` and `server/routes/`) must exist.

**No in-app AI:** MT is deterministic machine translation, not generative. Document this if the product requires compliance language.

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Copy+adapt | `server/media/translator.py` | `translate_lines()` — sentinel batching, char limits, progress hook |
| Copy | `server/media/langdetect_util.py` | `detect_language()`, `lang_name()` |
| Create | `server/routes/translate.py` | `/api/translate/text` Blueprint |
| Modify | `server/app.py` | Register translate Blueprint |
| Modify | `server/requirements.txt` | Add `deep-translator`, `langdetect` |
| Create | `server/tests/test_translate_routes.py` | pytest — route tests (translation mocked) |
| Create | `js/translate.js` | `TranslatePanel` ES module — API call, overlay, restore |
| Modify | `js/app.js` | Import TranslatePanel; wire Translate button |
| Modify | `index.html` | Add Translate button and overlay container |
| Create | `tests/test-translate.js` | node:test — TranslatePanel unit tests |

---

## Task 1: Copy Python translation utilities

**Files:**
- Create: `server/media/translator.py`
- Create: `server/media/langdetect_util.py`

- [ ] **Step 1: Copy source files from executor**

```bash
cp "C:/executor/media/translator.py"       server/media/translator.py
cp "C:/executor/media/langdetect_util.py"  server/media/langdetect_util.py
```

- [ ] **Step 2: Strip executor-specific reporter calls from `translator.py`**

Open `server/media/translator.py`. Remove any `import` of `tools.relay` or `reporter` and any `reporter.capture()` call. The file should contain only `translate_lines`, `_batch_translate`, `_translate_batch`, `_translate_oversized`, `_norm_lang`, and the constants `_SENTINEL` and `_MAX_CHARS`.

- [ ] **Step 3: Add dependencies to `server/requirements.txt`**

```
deep-translator>=1.11
langdetect>=1.0.9
```

- [ ] **Step 4: Install**

```bash
cd server && pip install deep-translator langdetect
```

- [ ] **Step 5: Smoke-test the utilities**

```bash
cd server && python -c "
from media.translator import translate_lines
lines, lang = translate_lines(['Bonjour le monde.'], target_lang='en')
print(lang, lines)
"
```

Expected: `fr ['Hello world.']` (or similar — depends on Google Translate).

- [ ] **Step 6: Commit**

```bash
git add server/media/translator.py server/media/langdetect_util.py server/requirements.txt
git commit -m "feat: copy translator + langdetect utilities from executor (Phase D)"
```

---

## Task 2: Write failing translate route tests

**Files:**
- Create: `server/tests/test_translate_routes.py`

- [ ] **Step 1: Write the test file**

Create `server/tests/test_translate_routes.py`:

```python
import json
import pytest
from unittest.mock import patch

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_translate_returns_translated_lines(client):
    with patch("routes.translate.translate_lines",
               return_value=(["Hello world."], "fr")):
        res = client.post("/api/translate/text",
                          json={"lines": ["Bonjour le monde."], "target_lang": "en"})
    assert res.status_code == 200
    body = json.loads(res.data)
    assert body["lines"] == ["Hello world."]
    assert body["detected_lang"] == "fr"
    assert body["translated"] is True


def test_translate_sets_translated_false_when_same_lang(client):
    with patch("routes.translate.translate_lines",
               return_value=(["Bonjour."], "fr")):
        res = client.post("/api/translate/text",
                          json={"lines": ["Bonjour."], "target_lang": "fr"})
    assert res.status_code == 200
    body = json.loads(res.data)
    # If detected == target, translated should be False
    assert body["translated"] is False


def test_translate_rejects_missing_lines(client):
    res = client.post("/api/translate/text", json={"target_lang": "en"})
    assert res.status_code == 400


def test_translate_accepts_newline_separated_string(client):
    with patch("routes.translate.translate_lines",
               return_value=(["Hello.", "World."], "fr")):
        res = client.post("/api/translate/text",
                          json={"lines": "Bonjour.\nMonde.", "target_lang": "en"})
    assert res.status_code == 200
    body = json.loads(res.data)
    assert len(body["lines"]) == 2


def test_translate_target_lang_defaults_to_english(client):
    captured = {}
    def mock_translate(lines, source_lang="auto", target_lang="en", on_batch=None):
        captured["target_lang"] = target_lang
        return (lines, "fr")
    with patch("routes.translate.translate_lines", side_effect=mock_translate):
        client.post("/api/translate/text", json={"lines": ["Test."]})
    assert captured["target_lang"] == "en"
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd server && python -m pytest tests/test_translate_routes.py -v
```

Expected: `ImportError` — `routes.translate` does not exist.

- [ ] **Step 3: Commit**

```bash
git add server/tests/test_translate_routes.py
git commit -m "test: add failing translate route tests (Phase D)"
```

---

## Task 3: Create `server/routes/translate.py` and register it

**Files:**
- Create: `server/routes/translate.py`
- Modify: `server/app.py`

- [ ] **Step 1: Create `server/routes/translate.py`**

```python
# server/routes/translate.py
import logging
from flask import Blueprint, jsonify, request
from media.translator import translate_lines

log = logging.getLogger(__name__)
translate_bp = Blueprint("translate", __name__)


@translate_bp.post("/api/translate/text")
def api_translate_text():
    body = request.get_json(silent=True) or {}
    raw = body.get("lines")
    if not raw:
        return jsonify(error="no text provided"), 400

    # Accept either a list or a newline-separated string
    if isinstance(raw, str):
        lines = [l for l in raw.split("\n") if l.strip()]
    else:
        lines = [str(l) for l in raw if str(l).strip()]

    if not lines:
        return jsonify(error="no text provided"), 400

    target_lang = body.get("target_lang") or "en"

    try:
        translated, detected = translate_lines(
            lines, source_lang="auto", target_lang=target_lang
        )
        was_translated = detected != target_lang
        return jsonify(lines=translated, detected_lang=detected, translated=was_translated)
    except Exception as e:
        log.error("translate error: %s", e)
        return jsonify(error=str(e)), 500
```

- [ ] **Step 2: Register the Blueprint in `server/app.py`**

Find the imports in `server/app.py` and add:

```python
from routes.translate import translate_bp
```

Then in `create_app()`, after `app.register_blueprint(voice_bp)`, add:

```python
app.register_blueprint(translate_bp)
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd server && python -m pytest tests/test_translate_routes.py tests/test_voice_routes.py -v
```

Expected: all tests pass (✓).

- [ ] **Step 4: Commit**

```bash
git add server/routes/translate.py server/app.py
git commit -m "feat: add /api/translate/text route (Phase D)"
```

---

## Task 4: Write failing frontend translate tests

**Files:**
- Create: `tests/test-translate.js`

- [ ] **Step 1: Write the test file**

Create `tests/test-translate.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Mocks ──────────────────────────────────────────────────────────────────

let _lastFetchBody = null;
globalThis.fetch = async (url, opts) => {
  _lastFetchBody = opts?.body ? JSON.parse(opts.body) : null;
  if (url.includes('/api/translate/text')) {
    return {
      ok: true,
      json: async () => ({
        lines: ['Hello, world.'],
        detected_lang: 'fr',
        translated: true,
      }),
    };
  }
  return { ok: false, status: 404 };
};

globalThis.document = {
  getElementById: () => null,
  createElement: (tag) => ({
    tagName: tag,
    style: {},
    className: '',
    innerHTML: '',
    children: [],
    appendChild: () => {},
    remove: () => {},
  }),
};
globalThis.window = { __AUDIOBOOK_API__: 'http://localhost:5001' };

// ── Import module under test ───────────────────────────────────────────────

const { TranslatePanel } = await import('../js/translate.js');

// ── Tests ──────────────────────────────────────────────────────────────────

test('translateLines() sends lines array to /api/translate/text', async () => {
  _lastFetchBody = null;
  const result = await TranslatePanel.translateLines(['Bonjour le monde.'], 'en');
  assert.ok(_lastFetchBody, 'should have made a fetch call');
  assert.deepEqual(_lastFetchBody.lines, ['Bonjour le monde.']);
  assert.equal(_lastFetchBody.target_lang, 'en');
});

test('translateLines() returns translated lines and detected lang', async () => {
  const result = await TranslatePanel.translateLines(['Bonjour.'], 'en');
  assert.deepEqual(result.lines, ['Hello, world.']);
  assert.equal(result.detected_lang, 'fr');
  assert.equal(result.translated, true);
});

test('translateLines() defaults target_lang to "en"', async () => {
  _lastFetchBody = null;
  await TranslatePanel.translateLines(['Test.']);
  assert.equal(_lastFetchBody.target_lang, 'en');
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
node --test tests/test-translate.js
```

Expected: `ERR_MODULE_NOT_FOUND` — `../js/translate.js` does not exist.

- [ ] **Step 3: Commit**

```bash
git add tests/test-translate.js
git commit -m "test: add failing TranslatePanel unit tests (Phase D)"
```

---

## Task 5: Create `js/translate.js`

**Files:**
- Create: `js/translate.js`

- [ ] **Step 1: Create the module**

```js
// js/translate.js
// TranslatePanel — machine-translate the current letter body in-memory.
// Calls POST /api/translate/text on the Phase B companion server.
// No destructive edits: creates a temporary overlay, restored by closeTranslation().

function _apiBase() {
  return (typeof window !== 'undefined' && window.__AUDIOBOOK_API__) || 'http://localhost:5001';
}

// Post lines to the translation API. Returns { lines, detected_lang, translated }.
async function translateLines(lines, targetLang = 'en') {
  const res = await fetch(_apiBase() + '/api/translate/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines, target_lang: targetLang }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Translate failed (' + res.status + ')');
  }
  return res.json();
}

// ── Overlay (DOM) ──────────────────────────────────────────────────────────

let _overlay = null;
let _originalBody = null;

// Translate the current letter body rendered in `bodyContainerId`.
// paragraphs: string[] — the paragraph texts to translate (from player/renderer data).
// containerEl: HTMLElement — the rendered letter body container.
async function translateCurrentLetter(paragraphs, containerEl, targetLang = 'en') {
  if (!paragraphs || !paragraphs.length) return;

  // Show loading state
  if (containerEl) containerEl.setAttribute('aria-busy', 'true');

  let result;
  try {
    result = await translateLines(paragraphs, targetLang);
  } finally {
    if (containerEl) containerEl.removeAttribute('aria-busy');
  }

  if (!result.translated) return; // source == target, nothing to do

  // Save original HTML and build overlay
  _originalBody = containerEl ? containerEl.innerHTML : null;
  const overlay = document.createElement('div');
  overlay.id = 'translate-overlay';
  overlay.className = 'translate-overlay';
  overlay.innerHTML = result.lines
    .map((l) => '<p class="letter-paragraph translated">' + _esc(l) + '</p>')
    .join('');

  const banner = document.createElement('div');
  banner.className = 'translate-banner';
  banner.textContent =
    'Machine translation from ' + result.detected_lang + ' \u2192 ' + targetLang +
    '. ';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close translation';
  closeBtn.addEventListener('click', closeTranslation);
  banner.appendChild(closeBtn);
  overlay.prepend(banner);

  _overlay = overlay;

  if (containerEl) {
    containerEl.innerHTML = '';
    containerEl.appendChild(overlay);
  }
}

function _esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function closeTranslation() {
  const containerEl = _overlay && _overlay.parentElement;
  if (containerEl && _originalBody !== null) {
    containerEl.innerHTML = _originalBody;
  }
  _overlay = null;
  _originalBody = null;
}

function isTranslating() {
  return _overlay !== null;
}

export const TranslatePanel = {
  translateLines,
  translateCurrentLetter,
  closeTranslation,
  isTranslating,
};
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
node --test tests/test-translate.js
```

Expected: all 3 tests pass (✓).

- [ ] **Step 3: Commit**

```bash
git add js/translate.js
git commit -m "feat: add TranslatePanel ES module (Phase D)"
```

---

## Task 6: Wire TranslatePanel into `app.js`

**Files:**
- Modify: `js/app.js`
- Modify: `index.html`

- [ ] **Step 1: Add Translate button to `index.html`**

Find the letter nav control area (near `btn-narrator`, `btn-play`). Add:

```html
<button id="btn-translate" title="Machine-translate this letter">Translate</button>
```

- [ ] **Step 2: Import TranslatePanel in `app.js`**

Add after existing imports:

```js
import { TranslatePanel } from './translate.js';
```

- [ ] **Step 3: Wire the Translate button in `app.js`**

Find the section where narrator controls are wired (around line 1085, after `btn-narrator` listener). Add:

```js
const btnTranslate = document.getElementById('btn-translate');
if (btnTranslate) {
  btnTranslate.addEventListener('click', async () => {
    if (TranslatePanel.isTranslating()) {
      TranslatePanel.closeTranslation();
      btnTranslate.textContent = 'Translate';
      return;
    }
    const letter = currentLetter();
    if (!letter) return;
    const vk = letterViewKey(letter);
    const text = paragraphSourceForPlayer(letter, vk);
    const paras = text.split(/\n\n+/).filter(Boolean);
    const bodyEl = document.querySelector('article.letter-body') || document.querySelector('.letter-body');
    btnTranslate.textContent = 'Translating…';
    btnTranslate.disabled = true;
    try {
      await TranslatePanel.translateCurrentLetter(paras, bodyEl, 'en');
      btnTranslate.textContent = 'Close translation';
    } catch (e) {
      console.error('Translation failed:', e);
      btnTranslate.textContent = 'Translate';
    } finally {
      btnTranslate.disabled = false;
    }
  });
}
```

**Note:** The selector `article.letter-body` matches the `<article class="letter-body">` element that `renderer.js` renders (CSS class, not ID). The fallback `.letter-body` covers any future structural changes.

- [ ] **Step 4: Run all JS tests**

Note: `test-sound.js` is created by Phase A, `test-voice.js` by Phase C. Run only those that exist:

```bash
node --test tests/test-player.js tests/test-sound.js tests/test-voice.js tests/test-translate.js tests/test-loader.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/app.js index.html
git commit -m "feat: wire Translate button — in-memory MT overlay (Phase D)"
```

---

## Task 7: Smoke-test translation end-to-end

- [ ] **Step 1: Start the companion server**

```bash
cd server && python app.py
```

- [ ] **Step 2: Test the API directly**

```bash
curl -s -X POST http://localhost:5001/api/translate/text \
  -H "Content-Type: application/json" \
  -d '{"lines": ["Bonjour le monde."], "target_lang": "en"}' | python -m json.tool
```

Expected: `{"detected_lang": "fr", "lines": ["Hello world."], "translated": true}`

- [ ] **Step 3: Test in-browser**

Open `http://localhost:3000`, select a French letter, click Translate. Expected: paragraphs replaced with English translation, MT banner visible at top with "Close translation" button.

- [ ] **Step 4: Verify "Close translation" restores original**

Click "Close translation". Expected: original French text restored.

---

## Done

Phase D delivers on-demand machine translation of any letter body with a non-destructive in-memory overlay. The Google Translate ToS applies — document that this is MT, not generative AI, if compliance language matters.
