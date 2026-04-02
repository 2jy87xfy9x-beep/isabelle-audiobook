# Phase E — Voice Clone UI + Settings Panel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Isabelle-styled Voice Settings panel (speed, voice select, engine toggle) and a My Voice clone flow (record a sample, build the clone, verify status), wiring to the Phase B backend clone routes and Phase C VoicePlayer.

**Architecture:** `js/voice-settings.js` renders a settings panel as a sliding drawer inside the existing app. It calls `VoicePlayer.saveSettings()` for speed/voice changes, and the Phase B clone endpoints (`/voice/clone/record`, `/voice/clone/build`, `/voice/clone/status`) for the recording flow. No new backend code — Phase B already exposes the clone routes. The recording UI uses the browser `MediaRecorder` API to capture audio. Clone status is polled until ready or error.

**Tech Stack:** Vanilla ES module JS, MediaRecorder API, Fetch API, node:test + node:assert/strict.

**Depends on:** Phase B server (clone routes), Phase C VoicePlayer (`saveSettings`, `getSettings`).

**Design reference:** `docs/superpowers/specs/2026-03-23-isabelle-v2-design.md` — match Isabelle UI style (typography, colours).

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `js/voice-settings.js` | Settings drawer — speed, voice select, engine, clone recording flow |
| Create | `tests/test-voice-settings.js` | Unit tests — settings read/write, clone state machine, poll logic |
| Modify | `js/app.js` | Import VoiceSettingsPanel; wire settings button to open/close drawer |
| Modify | `index.html` | Add settings trigger button; drawer mount point |

---

## Task 1: Write failing tests for voice settings panel

**Files:**
- Create: `tests/test-voice-settings.js`

- [ ] **Step 1: Write the test file**

Create `tests/test-voice-settings.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Mocks ──────────────────────────────────────────────────────────────────
// Tests share mutable module state; run serially (node:test default).
// voice-settings.js imports the real VoicePlayer from ./voice.js, which in
// turn uses localStorage and fetch. We mock both here so no real network calls
// or storage writes occur. We then verify behaviour by inspecting _fetchCalls.

// AudioContext mock (voice.js lazy-creates it; just needs to not throw)
globalThis.AudioContext = function () {
  this.state = 'running';
  this.decodeAudioData = async () => ({});
  this.createBufferSource = () => ({ connect() {}, start() {}, buffer: null, onended: null });
  this.createGain = () => ({ gain: { value: 1 }, connect() {} });
  this.resume = async () => {};
  this.destination = {};
};

// localStorage mock
const _ls = {};
globalThis.localStorage = {
  getItem: (k) => _ls[k] ?? null,
  setItem: (k, v) => { _ls[k] = String(v); },
};

// fetch mock — capture all calls, return stubs
let _fetchCalls = [];
globalThis.fetch = async (url, opts) => {
  _fetchCalls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
  if (url.includes('/voice/clone/status')) {
    return { ok: true, json: async () => ({ status: 'ready' }) };
  }
  if (url.includes('/voice/clone/build')) {
    return { ok: true, json: async () => ({ status: 'building' }) };
  }
  if (url.includes('/voice/clone/record')) {
    return { ok: true, json: async () => ({ status: 'saved' }) };
  }
  if (url.includes('/api/config/voice')) {
    return { ok: true };
  }
  return { ok: false, status: 404 };
};

globalThis.document = {
  getElementById: () => null,
  createElement: (tag) => ({
    tagName: tag, style: {}, className: '', innerHTML: '',
    appendChild: () => {}, remove: () => {}, setAttribute: () => {},
  }),
};
globalThis.window = { __AUDIOBOOK_API__: 'http://localhost:5001' };

// ── Import module under test ───────────────────────────────────────────────
// voice-settings.js imports the real VoicePlayer, which is fine — its
// saveSettings() calls localStorage.setItem and POSTs to /api/config/voice
// (both mocked above). We verify both paths by inspecting _fetchCalls.

const { VoiceSettingsPanel } = await import('../js/voice-settings.js');

// ── Tests ──────────────────────────────────────────────────────────────────

test('setSpeed() POSTs updated speed to /api/config/voice as snake_case', () => {
  _fetchCalls = [];
  VoiceSettingsPanel.setSpeed(1.5);
  const call = _fetchCalls.find(c => c.url.includes('/api/config/voice'));
  assert.ok(call, 'should POST to /api/config/voice');
  assert.ok(Math.abs(call.body.speed - 1.5) < 0.01, 'speed should be 1.5');
});

test('setVoice() POSTs updated active_voice to /api/config/voice', () => {
  _fetchCalls = [];
  VoiceSettingsPanel.setVoice('kokoro_af_sky');
  const call = _fetchCalls.find(c => c.url.includes('/api/config/voice'));
  assert.ok(call, 'should POST to /api/config/voice');
  assert.equal(call.body.active_voice, 'kokoro_af_sky');
});

test('pollCloneStatus() resolves with "ready" when server returns ready', async () => {
  _fetchCalls = [];
  const status = await VoiceSettingsPanel.pollCloneStatus();
  assert.equal(status, 'ready');
  const call = _fetchCalls.find(c => c.url.includes('/voice/clone/status'));
  assert.ok(call, 'should call /voice/clone/status');
});

test('triggerCloneBuild() POSTs to /voice/clone/build', async () => {
  _fetchCalls = [];
  await VoiceSettingsPanel.triggerCloneBuild();
  const call = _fetchCalls.find(c => c.url.includes('/voice/clone/build'));
  assert.ok(call, 'should POST to /voice/clone/build');
});

test('getAvailableVoices() returns list with kokoro voices and my_voice', () => {
  const voices = VoiceSettingsPanel.getAvailableVoices();
  assert.ok(Array.isArray(voices));
  assert.ok(voices.length >= 1);
  assert.ok(voices.some(v => v.id.startsWith('kokoro_')));
  assert.ok(voices.some(v => v.id === 'my_voice'), 'should include my_voice option');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
node --test tests/test-voice-settings.js
```

Expected: `ERR_MODULE_NOT_FOUND` — `../js/voice-settings.js` does not exist.

- [ ] **Step 3: Commit**

```bash
git add tests/test-voice-settings.js
git commit -m "test: add failing VoiceSettingsPanel tests (Phase E)"
```

---

## Task 2: Create `js/voice-settings.js`

**Files:**
- Create: `js/voice-settings.js`

- [ ] **Step 1: Create the module**

```js
// js/voice-settings.js
// VoiceSettingsPanel — voice speed, voice select, My Voice clone flow.
// Depends on VoicePlayer (Phase C) for settings persistence.
// Clone recording uses browser MediaRecorder + Phase B /voice/clone/* routes.

import { VoicePlayer } from './voice.js';

function _apiBase() {
  return (typeof window !== 'undefined' && window.__AUDIOBOOK_API__) || 'http://localhost:5001';
}

// ── Available voices ────────────────────────────────────────────────────────

const _KOKORO_VOICES = [
  { id: 'kokoro_af_heart', label: 'Heart (af)' },
  { id: 'kokoro_af_sky',   label: 'Sky (af)' },
  { id: 'kokoro_af_nova',  label: 'Nova (af)' },
  { id: 'kokoro_am_adam',  label: 'Adam (am)' },
  { id: 'kokoro_bf_emma',  label: 'Emma (bf)' },
  { id: 'kokoro_bm_george', label: 'George (bm)' },
];

const _MY_VOICE = { id: 'my_voice', label: 'My Voice (clone)' };

function getAvailableVoices() {
  return [..._KOKORO_VOICES, _MY_VOICE];
}

// ── Settings API (delegates to VoicePlayer) ────────────────────────────────

function setSpeed(speed) {
  VoicePlayer.saveSettings({ speed: Number(speed) });
}

function setVoice(voiceId) {
  VoicePlayer.saveSettings({ activeVoice: voiceId });
}

// ── Clone backend calls ────────────────────────────────────────────────────

async function uploadRecording(blob) {
  const fd = new FormData();
  fd.append('audio', blob, 'sample.wav');
  const res = await fetch(_apiBase() + '/voice/clone/record', {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error('Upload failed (' + res.status + ')');
  return res.json();
}

async function triggerCloneBuild() {
  const res = await fetch(_apiBase() + '/voice/clone/build', { method: 'POST' });
  if (!res.ok) throw new Error('Build failed (' + res.status + ')');
  return res.json();
}

// Poll until status is 'ready' or 'error'. Resolves with the final status string.
// intervalMs: how often to poll (default 2000ms). timeoutMs: give up after this.
async function pollCloneStatus(intervalMs = 2000, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(_apiBase() + '/voice/clone/status');
    if (!res.ok) throw new Error('Status check failed (' + res.status + ')');
    const data = await res.json();
    if (data.status === 'ready' || data.status === 'error') return data.status;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Clone build timed out');
}

// ── Drawer UI ──────────────────────────────────────────────────────────────

let _drawer = null;
let _recorder = null;
let _recChunks = [];

function _renderDrawer() {
  const s = VoicePlayer.getSettings();
  const voices = getAvailableVoices();

  const voiceOptions = voices.map(v =>
    `<option value="${v.id}"${v.id === s.activeVoice ? ' selected' : ''}>${v.label}</option>`
  ).join('');

  return `
    <div class="vsettings-drawer" id="vsettings-drawer" role="dialog" aria-label="Voice settings">
      <header class="vsettings-header">
        <h2>Voice</h2>
        <button id="vsettings-close" aria-label="Close">×</button>
      </header>

      <section class="vsettings-section">
        <label for="vsettings-voice">Voice</label>
        <select id="vsettings-voice">${voiceOptions}</select>
      </section>

      <section class="vsettings-section">
        <label for="vsettings-speed">Speed <span id="vsettings-speed-val">${s.speed.toFixed(1)}</span>×</label>
        <input type="range" id="vsettings-speed" min="0.5" max="2.0" step="0.1" value="${s.speed}">
      </section>

      <section class="vsettings-section vsettings-clone">
        <h3>My Voice</h3>
        <p class="vsettings-hint">Record a 10–30 s sample to clone your voice (Coqui XTTS v2).</p>
        <div class="vsettings-clone-controls">
          <button id="vsettings-rec-start">Record</button>
          <button id="vsettings-rec-stop" disabled>Stop</button>
          <button id="vsettings-rec-build" disabled>Build clone</button>
          <span id="vsettings-clone-status"></span>
        </div>
      </section>
    </div>`;
}

function _wireDrawer(drawer) {
  // Voice select
  const sel = drawer.querySelector('#vsettings-voice');
  if (sel) sel.addEventListener('change', () => setVoice(sel.value));

  // Speed slider
  const spd = drawer.querySelector('#vsettings-speed');
  const spdVal = drawer.querySelector('#vsettings-speed-val');
  if (spd) spd.addEventListener('input', () => {
    if (spdVal) spdVal.textContent = Number(spd.value).toFixed(1);
    setSpeed(spd.value);
  });

  // Close
  const closeBtn = drawer.querySelector('#vsettings-close');
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

  // Clone recording
  const recStart = drawer.querySelector('#vsettings-rec-start');
  const recStop  = drawer.querySelector('#vsettings-rec-stop');
  const recBuild = drawer.querySelector('#vsettings-rec-build');
  const statusEl = drawer.querySelector('#vsettings-clone-status');

  if (recStart) recStart.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _recChunks = [];
      _recorder = new MediaRecorder(stream);
      _recorder.ondataavailable = (e) => { if (e.data.size > 0) _recChunks.push(e.data); };
      _recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(_recChunks, { type: 'audio/wav' });
        try {
          await uploadRecording(blob);
          if (recBuild) recBuild.disabled = false;
          if (statusEl) statusEl.textContent = 'Sample saved.';
        } catch (e) {
          if (statusEl) statusEl.textContent = 'Upload failed: ' + e.message;
        }
      };
      _recorder.start();
      recStart.disabled = true;
      if (recStop) recStop.disabled = false;
      if (statusEl) statusEl.textContent = 'Recording…';
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Mic access denied.';
    }
  });

  if (recStop) recStop.addEventListener('click', () => {
    if (_recorder && _recorder.state !== 'inactive') _recorder.stop();
    recStop.disabled = true;
    if (recStart) recStart.disabled = false;
  });

  if (recBuild) recBuild.addEventListener('click', async () => {
    recBuild.disabled = true;
    if (statusEl) statusEl.textContent = 'Building…';
    try {
      await triggerCloneBuild();
      if (statusEl) statusEl.textContent = 'Building (may take minutes)…';
      const finalStatus = await pollCloneStatus();
      if (statusEl) statusEl.textContent = finalStatus === 'ready'
        ? 'Clone ready! Select "My Voice" above.'
        : 'Build failed — check server logs.';
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Error: ' + e.message;
      recBuild.disabled = false;
    }
  });
}

function openDrawer() {
  if (_drawer) return;
  const mount = document.getElementById('vsettings-mount');
  if (!mount) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _renderDrawer();
  _drawer = tmp.firstElementChild;
  mount.appendChild(_drawer);
  _wireDrawer(_drawer);
}

function closeDrawer() {
  if (!_drawer) return;
  _drawer.remove();
  _drawer = null;
}

function toggleDrawer() {
  _drawer ? closeDrawer() : openDrawer();
}

export const VoiceSettingsPanel = {
  setSpeed,
  setVoice,
  getAvailableVoices,
  uploadRecording,
  triggerCloneBuild,
  pollCloneStatus,
  openDrawer,
  closeDrawer,
  toggleDrawer,
};
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
node --test tests/test-voice-settings.js
```

Expected: all 5 tests pass (✓).

- [ ] **Step 3: Commit**

```bash
git add js/voice-settings.js
git commit -m "feat: add VoiceSettingsPanel ES module (Phase E)"
```

---

## Task 3: Add drawer mount point and trigger to `index.html`

- [ ] **Step 1: Add mount point and button to `index.html`**

Find the narrator controls area in `index.html` (near `btn-narrator`, `btn-play`). Add:

```html
<!-- Trigger button for voice settings drawer -->
<button id="btn-voice-settings" title="Voice settings" aria-label="Open voice settings">⚙ Voice</button>

<!-- Drawer will be injected here by VoiceSettingsPanel.openDrawer() -->
<div id="vsettings-mount"></div>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add voice settings trigger button and mount point"
```

---

## Task 4: Wire `VoiceSettingsPanel` into `app.js`

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Import VoiceSettingsPanel**

Add after existing imports:

```js
import { VoiceSettingsPanel } from './voice-settings.js';
```

- [ ] **Step 2: Wire the settings button**

Find the section where narrator/translate buttons are wired (around line 1085). Add:

```js
const btnVoiceSettings = document.getElementById('btn-voice-settings');
if (btnVoiceSettings) {
  btnVoiceSettings.addEventListener('click', () => VoiceSettingsPanel.toggleDrawer());
}
```

- [ ] **Step 3: Run all JS tests to confirm no regressions**

Note: `test-sound.js` (Phase A), `test-voice.js` (Phase C), and `test-translate.js` (Phase D) must exist first. Run only those that exist:

```bash
node --test tests/test-player.js tests/test-sound.js tests/test-voice.js tests/test-translate.js tests/test-voice-settings.js tests/test-loader.js
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: wire VoiceSettingsPanel — settings drawer and clone flow (Phase E)"
```

---

## Task 5: Browser smoke-test

- [ ] **Step 1: Start companion server and app**

```bash
# Terminal 1
cd server && python app.py

# Terminal 2
cd C:/audio_book && npx serve . -p 3000
```

- [ ] **Step 2: Open voice settings**

Open `http://localhost:3000`. Click "⚙ Voice". Expected: settings drawer slides open with Voice select, Speed slider, and My Voice clone section.

- [ ] **Step 3: Change speed and verify persistence**

Move the Speed slider to 1.5. Close and reopen the drawer. Expected: slider shows 1.5 (restored from localStorage).

- [ ] **Step 4: Verify voice change syncs to server**

Open DevTools Network tab. Change the Voice select to a different voice. Expected: POST to `http://localhost:5001/api/config/voice` with `active_voice` updated.

- [ ] **Step 5: Record a sample (optional — requires microphone)**

Click Record → speak for 10 s → click Stop → click "Build clone". Expected: status updates from "Recording…" → "Sample saved." → "Building…" → "Clone ready!" (or timeout if Coqui not installed).

---

## Done

Phase E completes the full voice feature set: settings drawer with speed/voice controls, and a My Voice clone workflow wired to the Phase B server backend. All four phases (A → B → C+D → E) together deliver a fully-featured audiobook narration system with sound feedback, Kokoro/browser dual-engine TTS, machine translation, and personal voice cloning.
