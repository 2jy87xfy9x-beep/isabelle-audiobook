# Phase A — SoundPlayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port executor's SoundPlayer to audio_book as an ES module, copy 4 audiobook-relevant WAV assets, and wire narration lifecycle hooks (start / end) in `app.js`.

**Architecture:** Adapt `C:\executor\static\js\sound.js` (IIFE) into `js/sound.js` (ES module export). Trim to audiobook-only events. Import in `app.js` and call at `Player` callback sites (`onEnd`, play button click). No server required — osToast stays a no-op. `narrationError` hook deferred: `Player` class does not expose an `onError` callback; adding one is Phase B+ scope.

**Tech Stack:** Vanilla ES modules, Web Audio API, node:test + node:assert/strict (same pattern as existing tests).

**Scope note:** This is Phase A of spec `2026-03-23-executor-voice-sound-translate-for-audiobook.md`. Phases B/C (Flask TTS + VoicePlayer), D (Translate), and E (Voice clone UI) are separate plans.

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `assets/sounds/snd-narration-start.wav` | Played on narration play start |
| Create | `assets/sounds/snd-notify-done.wav` | Played on narration end |
| Create | `assets/sounds/snd-notify-error.wav` | Played on narration error |
| Create | `assets/sounds/snd-notify-pause.wav` | Available for future pause hook |
| Create | `js/sound.js` | SoundPlayer ES module (adapted from executor) |
| Create | `tests/test-sound.js` | Unit tests for SoundPlayer |
| Modify | `js/app.js` | Import SoundPlayer; call at narration hooks |

---

## Task 1: Copy WAV assets

**Files:**
- Create: `assets/sounds/snd-narration-start.wav`
- Create: `assets/sounds/snd-notify-done.wav`
- Create: `assets/sounds/snd-notify-error.wav`
- Create: `assets/sounds/snd-notify-pause.wav`

- [ ] **Step 1: Create the sounds directory**

```bash
mkdir -p assets/sounds
```

- [ ] **Step 2: Copy the four WAV files from executor**

```bash
cp "C:/executor/static/sounds/snd-narration-start.wav" assets/sounds/
cp "C:/executor/static/sounds/snd-notify-done.wav"     assets/sounds/
cp "C:/executor/static/sounds/snd-notify-error.wav"    assets/sounds/
cp "C:/executor/static/sounds/snd-notify-pause.wav"    assets/sounds/
```

- [ ] **Step 3: Verify files exist**

```bash
ls assets/sounds/
```

Expected output: four `.wav` files listed.

- [ ] **Step 4: Commit**

```bash
git add assets/sounds/
git commit -m "feat: add audiobook sound assets (4 WAV files)"
```

---

## Task 2: Write failing tests for SoundPlayer

**Files:**
- Create: `tests/test-sound.js`

- [ ] **Step 1: Write the failing test file**

Create `tests/test-sound.js`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// ── Web Audio API mocks ────────────────────────────────────────────────────

let _srcStartCount = 0;

globalThis.AudioContext = function () {
  this.state = 'running';
  this.decodeAudioData = async (_buf) => ({ _decoded: true });
  this.createBufferSource = () => {
    const src = {
      buffer: null,
      _gain: null,
      connect(g) { this._gain = g; },
      start() { _srcStartCount++; },
    };
    return src;
  };
  this.createGain = () => {
    const g = { gain: { value: 1 }, connect() {} };
    return g;
  };
  this.resume = async () => {};
};

// ── localStorage mock ──────────────────────────────────────────────────────

const _lsStore = {};
globalThis.localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(_lsStore, k) ? _lsStore[k] : null; },
  setItem(k, v) { _lsStore[k] = String(v); },
  removeItem(k) { delete _lsStore[k]; },
};

// ── fetch mock (fire-and-forget calls should not throw) ────────────────────

globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });

// ── DOMContentLoaded must not auto-fire during import ─────────────────────
// sound.js does NOT register DOMContentLoaded — app.js calls init manually.

// ── Shared mutable state note ──────────────────────────────────────────────
// SoundPlayer is a singleton with module-level _settings. Tests run serially
// (node:test default). Each test that mutates settings resets them at the end
// or passes full notification objects so defaults are not silently inherited.

// ── Import the module under test ───────────────────────────────────────────

const { SoundPlayer } = await import('../js/sound.js');

// ── Tests ──────────────────────────────────────────────────────────────────

test('getSettings returns defaults with enabled true', () => {
  const s = SoundPlayer.getSettings();
  assert.equal(s.enabled, true);
  assert.equal(typeof s.masterVolume, 'number');
  assert.ok(s.masterVolume > 0 && s.masterVolume <= 100);
});

test('saveSettings persists to localStorage under isabelle-sound-settings', () => {
  SoundPlayer.saveSettings({ masterVolume: 42 });
  const raw = localStorage.getItem('isabelle-sound-settings');
  assert.ok(raw !== null, 'key not found in localStorage');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.masterVolume, 42);
});

test('loadSettings restores masterVolume from localStorage', () => {
  localStorage.setItem('isabelle-sound-settings', JSON.stringify({ masterVolume: 77 }));
  SoundPlayer.loadSettings();
  assert.equal(SoundPlayer.getSettings().masterVolume, 77);
});

test('loadSettings deep-merges notifications without dropping defaults', () => {
  localStorage.setItem('isabelle-sound-settings', JSON.stringify({
    notifications: { narrationEnd: false }
  }));
  SoundPlayer.loadSettings();
  const n = SoundPlayer.getSettings().notifications;
  assert.equal(n.narrationEnd, false, 'narrationEnd should be overridden');
  assert.equal(typeof n.narrationError, 'boolean', 'narrationError should still exist');
});

test('play does nothing when enabled is false', () => {
  SoundPlayer.saveSettings({ enabled: false });
  const before = _srcStartCount;
  SoundPlayer.play('snd-narration-start', 'action');
  assert.equal(_srcStartCount, before, 'no source should have started');
  SoundPlayer.saveSettings({ enabled: true }); // reset for subsequent tests
});

test('notify does nothing when notification type is disabled', () => {
  // Pass full notifications object to avoid inheriting previous test's partial state.
  SoundPlayer.saveSettings({ notifications: { narrationEnd: false, narrationError: true } });
  const before = _srcStartCount;
  SoundPlayer.notify('narrationEnd');
  assert.equal(_srcStartCount, before, 'disabled notification should not play');
  // Reset to defaults for subsequent tests.
  SoundPlayer.saveSettings({ notifications: { narrationEnd: true, narrationError: true } });
});

test('notify calls play for enabled notification type (sound must be loaded first)', async () => {
  // Load the sound buffer manually so play() has something to play
  await SoundPlayer.load('snd-notify-done', '/assets/sounds/snd-notify-done.wav');
  SoundPlayer.saveSettings({ enabled: true, notifications: { narrationEnd: true } });
  const before = _srcStartCount;
  SoundPlayer.notify('narrationEnd');
  assert.equal(_srcStartCount, before + 1, 'enabled notification should play once');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/test-sound.js
```

Expected: `ERR_MODULE_NOT_FOUND` — `../js/sound.js` does not exist yet.

- [ ] **Step 3: Commit the test file**

```bash
git add tests/test-sound.js
git commit -m "test: add failing SoundPlayer unit tests"
```

---

## Task 3: Create `js/sound.js`

**Files:**
- Create: `js/sound.js`

- [ ] **Step 1: Create the ES module**

Create `js/sound.js`:

```js
// js/sound.js
// SoundPlayer — Web Audio API playback for narration sounds.
// Adapted from C:\executor\static\js\sound.js.
// Changes from source: ES module export; audiobook event set only;
// storage key 'isabelle-sound-settings'; sound path 'assets/sounds/';
// osToast removed (no companion server in Phase A).

var _ctx = null;
var _sounds = {};

var _defaults = {
  enabled: true,
  masterVolume: 60,
  notificationVolume: 80,
  narrationStart: true,
  notifications: {
    narrationEnd: true,
    narrationError: true,
  }
};

var _settings = _deepClone(_defaults);

function _deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function _getCtx() {
  if (!_ctx) _ctx = new AudioContext();
  return _ctx;
}

// Load a single sound file. Missing files are silently skipped.
function load(id, path) {
  return fetch(path)
    .then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.arrayBuffer();
    })
    .then(function (buf) {
      return _getCtx().decodeAudioData(buf);
    })
    .then(function (decoded) {
      _sounds[id] = decoded;
    })
    .catch(function (e) {
      console.warn('SoundPlayer: could not load ' + id + ' (' + path + '):', e);
    });
}

// Play a sound. type: 'action' (masterVolume) or 'notification'.
function play(id, type) {
  if (!_settings.enabled) return;
  if (!_sounds[id]) return;
  var ctx = _getCtx();
  var doPlay = function () {
    var src = ctx.createBufferSource();
    var gain = ctx.createGain();
    var vol = (type === 'notification' ? _settings.notificationVolume : _settings.masterVolume) / 100;
    gain.gain.value = vol;
    src.buffer = _sounds[id];
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  };
  if (ctx.state === 'suspended') {
    ctx.resume().then(doPlay).catch(function () {});
  } else {
    doPlay();
  }
}

// Fire a notification sound for an event key.
// eventKey: 'narrationEnd' | 'narrationError'
function notify(eventKey) {
  if (!_settings.notifications[eventKey]) return;
  var soundId = _notificationSound(eventKey);
  play(soundId, 'notification');
}

function _notificationSound(eventKey) {
  if (eventKey === 'narrationError') return 'snd-notify-error';
  return 'snd-notify-done';
}

function loadSettings() {
  try {
    var raw = localStorage.getItem('isabelle-sound-settings');
    if (!raw) return;
    var parsed = JSON.parse(raw);
    Object.keys(parsed).forEach(function (k) {
      if (k !== 'notifications') _settings[k] = parsed[k];
    });
    if (parsed.notifications) {
      _settings.notifications = Object.assign(
        _deepClone(_defaults.notifications),
        parsed.notifications
      );
    }
  } catch (e) {}
}

function saveSettings(patch) {
  if (patch) {
    Object.keys(patch).forEach(function (k) {
      if (k !== 'notifications') {
        _settings[k] = patch[k];
      } else {
        _settings.notifications = Object.assign(
          _deepClone(_defaults.notifications),
          patch.notifications
        );
      }
    });
  }
  try {
    localStorage.setItem('isabelle-sound-settings', JSON.stringify(_settings));
  } catch (e) {}
}

function getSettings() { return _settings; }

var ACTION_SOUNDS = ['snd-narration-start'];
var NOTIFY_SOUNDS = ['snd-notify-done', 'snd-notify-error', 'snd-notify-pause'];

// Call from app.js after DOMContentLoaded (not auto-called — avoids test side effects).
function preloadAll() {
  return Promise.all(
    ACTION_SOUNDS.concat(NOTIFY_SOUNDS).map(function (id) {
      return load(id, '/assets/sounds/' + id + '.wav');
    })
  );
}

export const SoundPlayer = {
  load, play, notify, loadSettings, saveSettings, getSettings, preloadAll,
};
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
node --test tests/test-sound.js
```

Expected: all 7 tests pass (✓).

- [ ] **Step 3: Commit**

```bash
git add js/sound.js
git commit -m "feat: add SoundPlayer ES module (Phase A port from executor)"
```

---

## Task 4: Wire SoundPlayer into `app.js`

**Files:**
- Modify: `js/app.js` (import at top; calls in `initPlayer` and play button handler)

The existing `initPlayer` function is at `js/app.js:598`. The play-button click handler is at line 1011–1021. The `onEnd` callback is at line 610.

- [ ] **Step 1: Add import at top of `app.js`**

Find the last import line at the top of `js/app.js` (currently ending around line 37) and add:

```js
import { SoundPlayer } from './sound.js';
```

- [ ] **Step 2: Initialize SoundPlayer inside `init()`**

`initPlayer()` is called at `js/app.js:136` inside the `async function init()`. Add the two lines immediately after that call:

```js
// js/app.js:136 — existing:
initPlayer();
// add directly after:
SoundPlayer.loadSettings();
SoundPlayer.preloadAll();
```

- [ ] **Step 3: Wire narration-start sound**

The play button handler is at `js/app.js:1017–1019`. The `else` branch (when player is not playing) contains `player.play()` at line 1018. Add the sound call immediately after:

```js
// existing (lines 1016–1019):
} else {
  refreshPlayerData();
  player.play();
  btnPlay.textContent = '⏸';
}
```

Change to:

```js
} else {
  refreshPlayerData();
  player.play();
  if (SoundPlayer.getSettings().narrationStart) SoundPlayer.play('snd-narration-start', 'action');
  btnPlay.textContent = '⏸';
}
```

- [ ] **Step 4: Wire narration-end sound**

Find the `onEnd` callback in `initPlayer` (line 610–612):

```js
// existing:
onEnd: () => {
  document.getElementById('btn-play').textContent = '▶';
},
```

Add notify call:

```js
onEnd: () => {
  document.getElementById('btn-play').textContent = '▶';
  SoundPlayer.notify('narrationEnd');
},
```

- [ ] **Step 5: Run existing tests to confirm no regression**

```bash
node --test tests/test-player.js tests/test-sound.js tests/test-loader.js
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat: wire SoundPlayer hooks — narration start/end (Phase A)"
```

---

## Task 5: Smoke-test in browser

- [ ] **Step 1: Start the dev server**

```bash
npx serve . -p 3000
```

- [ ] **Step 2: Open the app and play a letter**

Open `http://localhost:3000` → select a letter → click the play (▶) button.

Expected: a brief sound plays on start; another sound plays when narration finishes.

- [ ] **Step 3: Open DevTools console**

Confirm no errors such as `Failed to load resource: 404` for any `assets/sounds/` file.

---

## Done

Phase A delivers a working SoundPlayer wired to the narrator with no server dependency. When complete, raise a PR or continue to Plan B (Flask TTS companion + VoicePlayer integration).
