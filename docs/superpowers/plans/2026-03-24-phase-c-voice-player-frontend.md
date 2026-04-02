# Phase C — VoicePlayer ES Module + Dual-Engine Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port executor's VoicePlayer to an ES module (`js/voice.js`), wire it into `app.js` alongside a "dual-engine" toggle so users can choose browser `speechSynthesis` or server Kokoro TTS per-letter.

**Architecture:** Adapt `C:\executor\static\js\voice.js` (1263-line IIFE) into `js/voice.js` (ES module). Strip executor-specific dependencies (`ExecutorShared`, `#shell` container, chat/selection flows). Parameterise the API base URL via `window.__AUDIOBOOK_API__` (default `http://localhost:5001`). Add a `ttsEngine` setting (`'browser'` | `'server'`) toggled in the existing narrator controls. When engine is `'server'`, the `Player`'s `_speakUtterance` path is replaced by `VoicePlayer.narrate()` calls via a shim in `app.js`.

**Tech Stack:** Vanilla ES modules, Web Audio API, Fetch API, node:test + node:assert/strict.

**Depends on:** Phase B server running at port 5001.

**Scope note:** Phase C of spec `2026-03-23-executor-voice-sound-translate-for-audiobook.md`. Phase E (voice clone UI, settings panel) builds on this.

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `js/voice.js` | VoicePlayer ES module — `read`, `narrate`, `stop`, `toggle`, `getSettings`, `saveSettings` |
| Create | `tests/test-voice.js` | Unit tests — settings, narrate flow, chunked read planning (all mocked) |
| Modify | `js/app.js` | Import VoicePlayer; add `ttsEngine` toggle; shim Player's `_speakUtterance` for server path |

---

## Task 1: Write failing tests for VoicePlayer

**Files:**
- Create: `tests/test-voice.js`

Tests mock `fetch` globally. They do not test actual audio playback (requires a browser) — they verify the fetch strategy, settings persistence, and error handling.

- [ ] **Step 1: Write the failing test file**

Create `tests/test-voice.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Minimal WAV bytes (just enough for arrayBuffer not to throw)
const FAKE_WAV = new Uint8Array([82, 73, 70, 70]).buffer; // "RIFF"

let _fetchCalls = [];
globalThis.fetch = async (url, opts) => {
  _fetchCalls.push({ url, opts });
  if (url.includes('/voice/speak/split')) {
    return {
      ok: true,
      json: async () => ({ chunks: ['Chunk one.', 'Chunk two.'] }),
    };
  }
  if (url.includes('/voice/speak')) {
    return { ok: true, arrayBuffer: async () => FAKE_WAV };
  }
  if (url.includes('/api/config/voice')) {
    return { ok: true };
  }
  return { ok: false, status: 404 };
};

// Web Audio API mock
let _bufferSourcesStarted = 0;
globalThis.AudioContext = function () {
  this.state = 'running';
  this.decodeAudioData = async () => ({ duration: 1.0 });
  this.createBufferSource = () => ({
    buffer: null, connect() {}, start() { _bufferSourcesStarted++; },
    onended: null,
  });
  this.createGain = () => ({ gain: { value: 1 }, connect() {} });
  this.resume = async () => {};
  this.destination = {};
};

// localStorage mock — tests share mutable state; run serially (node:test default).
const _ls = {};
globalThis.localStorage = {
  getItem: (k) => _ls[k] ?? null,
  setItem: (k, v) => { _ls[k] = String(v); },
};

// document mock — voice.js does not need DOM for narrate() path
globalThis.document = { getElementById: () => null };

// ── Import module under test ───────────────────────────────────────────────

const { VoicePlayer } = await import('../js/voice.js');

// ── Tests ──────────────────────────────────────────────────────────────────

test('getSettings returns defaults', () => {
  const s = VoicePlayer.getSettings();
  assert.equal(typeof s.speed, 'number');
  assert.equal(typeof s.activeVoice, 'string');
  assert.ok(s.speed > 0);
});

test('saveSettings persists to localStorage under isabelle-voice-settings', () => {
  VoicePlayer.saveSettings({ speed: 1.5 });
  const raw = localStorage.getItem('isabelle-voice-settings');
  assert.ok(raw !== null);
  assert.equal(JSON.parse(raw).speed, 1.5);
});

test('loadSettings restores speed from localStorage', () => {
  localStorage.setItem('isabelle-voice-settings', JSON.stringify({ speed: 0.8 }));
  VoicePlayer.loadSettings();
  assert.equal(VoicePlayer.getSettings().speed, 0.8);
  VoicePlayer.saveSettings({ speed: 1.0 }); // reset
});

test('narrate() POSTs to /voice/speak and plays via Web Audio', async () => {
  _fetchCalls = [];
  _bufferSourcesStarted = 0;

  // Resolve onended to simulate playback ending
  const origCreate = globalThis.AudioContext.prototype?.createBufferSource;
  let lastSrc = null;
  globalThis.AudioContext = function () {
    this.state = 'running';
    this.decodeAudioData = async (buf) => ({ duration: 1.0, _buf: buf });
    this.createBufferSource = () => {
      lastSrc = {
        buffer: null, connect() {}, onended: null,
        start() {
          _bufferSourcesStarted++;
          // Simulate instant playback end
          Promise.resolve().then(() => { if (this.onended) this.onended(); });
        },
      };
      return lastSrc;
    };
    this.createGain = () => ({ gain: { value: 1 }, connect() {} });
    this.resume = async () => {};
    this.destination = {};
  };

  const done = VoicePlayer.narrate('Hello, Isabelle.');
  await done;

  const speakCall = _fetchCalls.find(c => c.url.includes('/voice/speak'));
  assert.ok(speakCall, 'should POST to /voice/speak');
  const body = JSON.parse(speakCall.opts.body);
  assert.equal(body.text, 'Hello, Isabelle.');
  assert.equal(_bufferSourcesStarted, 1);
});

test('narrate() uses configured activeVoice and speed', async () => {
  VoicePlayer.saveSettings({ activeVoice: 'kokoro_af_sky', speed: 1.3 });
  _fetchCalls = [];
  const done = VoicePlayer.narrate('Test.');
  await done;
  const call = _fetchCalls.find(c => c.url.includes('/voice/speak'));
  const body = JSON.parse(call.opts.body);
  assert.equal(body.voice, 'kokoro_af_sky');
  assert.ok(Math.abs(body.speed - 1.3) < 0.01);
  VoicePlayer.saveSettings({ activeVoice: 'kokoro_af_heart', speed: 1.0 }); // reset
});

test('saveSettings POSTs snake_case to /api/config/voice', () => {
  _fetchCalls = [];
  VoicePlayer.saveSettings({ speed: 1.2, activeVoice: 'kokoro_af_heart' });
  const configCall = _fetchCalls.find(c => c.url.includes('/api/config/voice'));
  assert.ok(configCall, 'should POST to config endpoint');
  const body = JSON.parse(configCall.opts.body);
  assert.ok('active_voice' in body, 'should convert activeVoice → active_voice');
  assert.ok(!('activeVoice' in body), 'should not send camelCase key');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
node --test tests/test-voice.js
```

Expected: `ERR_MODULE_NOT_FOUND` — `../js/voice.js` does not exist yet.

- [ ] **Step 3: Commit test file**

```bash
git add tests/test-voice.js
git commit -m "test: add failing VoicePlayer unit tests (Phase C)"
```

---

## Task 2: Create `js/voice.js`

**Files:**
- Create: `js/voice.js`

Port core of executor's `voice.js` (1263 lines) to an ES module. Scope: `narrate`, `read` (single-chunk only for Phase C; chunked read included), `stop`, `toggle`, `getSettings`, `saveSettings`. **Omit:** `readSelection` (needs `ExecutorShared`), clone panel helpers (Phase E).

- [ ] **Step 1: Create `js/voice.js`**

```js
// js/voice.js
// VoicePlayer — TTS playback via /voice/speak (Phase B server).
// Adapted from C:\executor\static\js\voice.js.
// Changes: ES module; storage key 'isabelle-voice-settings'; base URL via
// window.__AUDIOBOOK_API__; player bar appended to #voice-player-container;
// readSelection() and clone panel removed (Phase E); no ExecutorShared dep.

// ── Config ─────────────────────────────────────────────────────────────────

function _apiBase() {
  return (typeof window !== 'undefined' && window.__AUDIOBOOK_API__) || 'http://localhost:5001';
}

const _STORAGE_KEY = 'isabelle-voice-settings';
const _CHUNKED_THRESHOLD = 450;
const _SPLIT_MAX_CHUNK = 900;
const _MAX_CHARS = 10_000;

const _defaults = {
  speed: 1.0,
  activeVoice: 'kokoro_af_heart',
  waitForNarration: false,
};

// ── State ──────────────────────────────────────────────────────────────────

var _settings = JSON.parse(JSON.stringify(_defaults));
var _audioCtx = null;
var _currentAudio = null;
var _currentBlobUrl = null;
var _readAbort = null;
var _readGen = 0;

// ── Settings ───────────────────────────────────────────────────────────────

function getSettings() { return _settings; }

function loadSettings() {
  try {
    const raw = localStorage.getItem(_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    Object.assign(_settings, parsed);
  } catch (e) {}
}

function saveSettings(patch) {
  if (patch) Object.assign(_settings, patch);
  try { localStorage.setItem(_STORAGE_KEY, JSON.stringify(_settings)); } catch (e) {}
  // Sync to server (fire-and-forget)
  fetch(_apiBase() + '/api/config/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(_toSnake(_settings)),
  }).catch(() => {});
}

function _toSnake(s) {
  return {
    active_voice: s.activeVoice,
    speed: s.speed,
    wait_for_narration: s.waitForNarration,
  };
}

// ── Headless narrate (Web Audio API) ───────────────────────────────────────

function _getAudioCtx() {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
}

function narrate(line) {
  return fetch(_apiBase() + '/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: line, voice: _settings.activeVoice, speed: _settings.speed }),
  })
    .then(function (res) {
      if (!res.ok) throw new Error('voice/speak ' + res.status);
      return res.arrayBuffer();
    })
    .then(function (buf) {
      const ctx = _getAudioCtx();
      return ctx.resume().then(function () { return ctx.decodeAudioData(buf); });
    })
    .then(function (decoded) {
      return new Promise(function (resolve) {
        const ctx = _getAudioCtx();
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = 1.0;
        src.buffer = decoded;
        src.connect(gain);
        gain.connect(ctx.destination);
        src.onended = resolve;
        src.start();
      });
    })
    .catch(function (e) {
      console.warn('VoicePlayer.narrate:', e);
    });
}

// ── Player bar ─────────────────────────────────────────────────────────────

function _bar() { return document.getElementById('voice-player-bar'); }

function _createPlayerBar() {
  if (_bar()) return;
  const container = document.getElementById('voice-player-container');
  if (!container) return;
  const bar = document.createElement('div');
  bar.id = 'voice-player-bar';
  bar.style.display = 'none';
  bar.innerHTML =
    '<button id="vp-play-btn" aria-pressed="false">&#9654;</button>' +
    '<span class="vp-label" id="vp-label"></span>' +
    '<input type="range" id="vp-scrubber" min="0" max="100" step="0.01" value="0">' +
    '<span class="vp-time" id="vp-time">0:00</span>' +
    '<button id="vp-stop-btn">&#9632;</button>';
  container.appendChild(bar);
}

function _showBar(label) {
  const b = _bar();
  if (!b) return;
  b.style.display = 'flex';
  const lbl = document.getElementById('vp-label');
  if (lbl) lbl.textContent = (label || '').slice(0, 48);
}

function _hideBar() {
  const b = _bar();
  if (b) b.style.display = 'none';
}

function _fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

// ── read() — blob URL + <audio> element with player bar ────────────────────

function stop(opts) {
  if (opts && opts.invalidateRead) _readGen++;
  if (_readAbort) { try { _readAbort.abort(); } catch (e) {} _readAbort = null; }
  if (_currentAudio) {
    try { _currentAudio.pause(); } catch (e) {}
    _currentAudio = null;
  }
  if (_currentBlobUrl) {
    URL.revokeObjectURL(_currentBlobUrl);
    _currentBlobUrl = null;
  }
  const btn = document.getElementById('vp-play-btn');
  if (btn) { btn.textContent = '\u25b6'; btn.setAttribute('aria-pressed', 'false'); }
  _hideBar();
}

function toggle() {
  if (!_currentAudio) return;
  if (_currentAudio.paused) {
    _currentAudio.play().catch(() => {});
  } else {
    _currentAudio.pause();
  }
}

function _fetchSpeakBlob(text, ac) {
  return fetch(_apiBase() + '/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text, voice: _settings.activeVoice, speed: _settings.speed }),
    signal: ac ? ac.signal : undefined,
  }).then(function (res) {
    if (!res.ok) return res.json().catch(() => ({})).then(function (d) {
      const err = new Error(d.error || 'HTTP ' + res.status);
      err.code = d.code || 'HTTP_ERROR';
      throw err;
    });
    return res.blob();
  });
}

function read(text, label) {
  text = (text || '').trim();
  if (!text) return Promise.reject({ code: 'NO_TEXT' });
  if (text.length > _MAX_CHARS) text = text.slice(0, _MAX_CHARS);

  stop({ invalidateRead: true });
  const gen = _readGen;
  const ac = new AbortController();
  _readAbort = ac;

  _createPlayerBar();
  _showBar('Synthesising\u2026');

  const chunked = text.length >= _CHUNKED_THRESHOLD;

  function checkGen() {
    if (gen !== _readGen) throw Object.assign(new Error('aborted'), { code: 'ABORTED' });
  }

  if (chunked) {
    return fetch(_apiBase() + '/voice/speak/split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, max_chunk_chars: _SPLIT_MAX_CHUNK }),
      signal: ac.signal,
    })
      .then(function (res) { checkGen(); return res.json(); })
      .then(function (data) {
        checkGen();
        const chunks = data.chunks || [];
        if (!chunks.length) throw Object.assign(new Error('no chunks'), { code: 'SPLIT_EMPTY' });
        return _runChunkedRead(chunks, gen, ac, label);
      });
  }

  return _fetchSpeakBlob(text, ac)
    .then(function (blob) {
      checkGen();
      return _playBlobThenFinish(blob, label, gen);
    });
}

function _playBlobThenFinish(blob, label, gen) {
  return new Promise(function (resolve, reject) {
    if (gen !== _readGen) return reject({ code: 'ABORTED' });
    const url = URL.createObjectURL(blob);
    _currentBlobUrl = url;
    const audio = new Audio(url);
    _currentAudio = audio;
    _showBar(label || '');

    const scrubber = document.getElementById('vp-scrubber');
    const timeEl = document.getElementById('vp-time');
    const playBtn = document.getElementById('vp-play-btn');

    audio.addEventListener('loadedmetadata', function () {
      if (timeEl) timeEl.textContent = _fmtTime(audio.duration);
    });
    audio.addEventListener('timeupdate', function () {
      if (scrubber && audio.duration)
        scrubber.value = (audio.currentTime / audio.duration) * 100;
      if (timeEl)
        timeEl.textContent = _fmtTime(audio.currentTime) + ' / ' + _fmtTime(audio.duration);
    });
    if (scrubber) scrubber.oninput = function () {
      if (audio.duration) audio.currentTime = (scrubber.value / 100) * audio.duration;
    };
    if (playBtn) {
      playBtn.onclick = function () { toggle(); };
      audio.addEventListener('play', function () { playBtn.textContent = '\u23f8'; playBtn.setAttribute('aria-pressed', 'true'); });
      audio.addEventListener('pause', function () { playBtn.textContent = '\u25b6'; playBtn.setAttribute('aria-pressed', 'false'); });
    }
    audio.addEventListener('ended', function () { stop({}); resolve(); });
    audio.addEventListener('error', function () { stop({}); reject(new Error('audio error')); });
    audio.play().then(resolve).catch(reject);
  });
}

function _runChunkedRead(chunks, gen, ac, label) {
  return new Promise(function (resolve, reject) {
    let i = 0;
    function next() {
      if (gen !== _readGen) return reject({ code: 'ABORTED' });
      if (i >= chunks.length) { stop({}); return resolve(); }
      const chunk = chunks[i++];
      _fetchSpeakBlob(chunk, ac).then(function (blob) {
        if (gen !== _readGen) return reject({ code: 'ABORTED' });
        const url = URL.createObjectURL(blob);
        if (_currentBlobUrl) URL.revokeObjectURL(_currentBlobUrl);
        _currentBlobUrl = url;
        if (!_currentAudio) {
          _currentAudio = new Audio(url);
          _showBar(label || '');
        } else {
          _currentAudio.src = url;
          _currentAudio.load();
        }
        _currentAudio.onended = next;
        _currentAudio.play().catch(reject);
      }).catch(reject);
    }
    next();
  });
}

export const VoicePlayer = {
  narrate, read, stop, toggle, getSettings, loadSettings, saveSettings,
};
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
node --test tests/test-voice.js
```

Expected: all 6 tests pass (✓).

- [ ] **Step 3: Commit**

```bash
git add js/voice.js
git commit -m "feat: add VoicePlayer ES module (Phase C port from executor)"
```

---

## Task 3: Add `#voice-player-container` to the app HTML

The player bar needs a mount point. The app shell is in `index.html` (not `Isabelle.html`).

- [ ] **Step 1: Add container div to `index.html`**

Find the element that wraps the narrator controls area in `index.html`. Immediately after the existing narrator controls (search for `btn-play` in `index.html`), add:

```html
<div id="voice-player-container" style="position:sticky;bottom:0;z-index:10;"></div>
```

- [ ] **Step 2: Verify it renders**

Open `http://localhost:3000` in a browser. Inspect the DOM: `document.getElementById('voice-player-container')` should not be `null`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add voice player bar mount point to index.html"
```

---

## Task 4: Wire dual-engine toggle in `app.js`

The app will have a `ttsEngine` setting (`'browser'` | `'server'`). When `'server'`, narration sentences route through `VoicePlayer.narrate()` instead of `speechSynthesis`.

**Strategy:** Add a thin shim inside `app.js` that, when `ttsEngine === 'server'`, overrides how the Player speaks utterances by replacing its internal callback. The Player already exposes `_speakUtterance` calls via `onParagraphAdvance` — instead, we wrap at the sentence level by providing a custom `play()` bridge.

The cleanest integration: when engine is `'server'`, call `player.pause()` on the browser side and use `VoicePlayer.narrate(sentence)` for each sentence in sequence from a small wrapper in `app.js`. This avoids modifying `player.js`.

- [ ] **Step 1: Import VoicePlayer (and `splitSentences`) in `app.js`**

The existing `player.js` import at line 10 is `import { Player } from './player.js'`. Update it to also pull in `splitSentences`, which `narrateWithServer` uses:

```js
import { Player, splitSentences } from './player.js';
```

Then add VoicePlayer after the existing imports (around line 37):

```js
import { VoicePlayer } from './voice.js';
```

- [ ] **Step 2: Add `ttsEngine` state and initialise both players**

After `SoundPlayer.loadSettings(); SoundPlayer.preloadAll();` (line ~138), add:

```js
VoicePlayer.loadSettings();
// ttsEngine: 'browser' | 'server'
let ttsEngine = localStorage.getItem(LS('tts-engine')) || 'browser';
```

- [ ] **Step 3: Add server-narration function**

After the `initPlayer()` function definition (around line 690), add a new function:

```js
async function narrateWithServer(paragraphs) {
  for (const para of paragraphs) {
    if (!player.playing) break;
    const sentences = splitSentences(para.text || para);
    for (const s of sentences) {
      if (!player.playing) break;
      await VoicePlayer.narrate(s);
    }
  }
}
```

- [ ] **Step 4: Wire the engine toggle to the play button**

Find the play button click handler at `js/app.js:1016–1021`. Modify the `else` (play) branch to:

```js
} else {
  refreshPlayerData();
  if (ttsEngine === 'server') {
    player.playing = true;
    player.setMode('silent'); // suppress browser speechSynthesis
    narrateWithServer(player._paragraphs.slice(player._paragraphIndex)).finally(() => {
      player.playing = false;
      player.setMode(narratorModes[narratorModeIndex] || 'letters');
      btnPlay.textContent = '▶';
    });
  } else {
    player.play();
  }
  if (SoundPlayer.getSettings().narrationStart) SoundPlayer.play('snd-narration-start', 'action');
  btnPlay.textContent = '⏸';
}
```

- [ ] **Step 5: Add engine toggle button to UI**

Find the narrator controls section in `index.html` (search for `btn-narrator`). Add a sibling button:

```html
<button id="btn-tts-engine" title="Switch TTS engine">🔊 Browser</button>
```

- [ ] **Step 6: Wire the engine toggle button in `app.js`**

After the `btn-narrator` event listener, add:

```js
const btnEngine = document.getElementById('btn-tts-engine');
if (btnEngine) {
  btnEngine.textContent = ttsEngine === 'server' ? '🔊 Kokoro' : '🔊 Browser';
  btnEngine.addEventListener('click', () => {
    ttsEngine = ttsEngine === 'browser' ? 'server' : 'browser';
    localStorage.setItem(LS('tts-engine'), ttsEngine);
    btnEngine.textContent = ttsEngine === 'server' ? '🔊 Kokoro' : '🔊 Browser';
  });
}
```

- [ ] **Step 7: Run all JS tests to confirm no regressions**

Note: `tests/test-sound.js` is created by Phase A. If Phase A is complete, run:

```bash
node --test tests/test-player.js tests/test-sound.js tests/test-voice.js tests/test-loader.js
```

If Phase A is not yet complete, run without it:

```bash
node --test tests/test-player.js tests/test-voice.js tests/test-loader.js
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add js/app.js index.html
git commit -m "feat: wire VoicePlayer dual-engine toggle — browser/Kokoro (Phase C)"
```

---

## Task 5: Browser smoke-test

- [ ] **Step 1: Start Phase B server and Phase C app**

```bash
# Terminal 1
cd server && python app.py

# Terminal 2
cd C:/audio_book && npx serve . -p 3000
```

- [ ] **Step 2: Open app and switch to Kokoro engine**

Open `http://localhost:3000`. Click the `🔊 Browser` button — it should change to `🔊 Kokoro`.

- [ ] **Step 3: Play a letter**

Select a letter, click ▶. Open DevTools Network tab — verify POST requests to `http://localhost:5001/voice/speak`.

Expected: narration sounds via Kokoro WAV audio (if model installed) or console warning if model absent.

---

## Done

Phase C delivers a dual-engine narration system. `🔊 Browser` keeps existing `speechSynthesis`; `🔊 Kokoro` routes sentences through the Phase B server. Phase D (translate) and Phase E (settings UI + clone) build on this foundation.
