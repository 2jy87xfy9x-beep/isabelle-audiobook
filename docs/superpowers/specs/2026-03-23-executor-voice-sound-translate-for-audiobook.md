# Executor voice, sound, and translate — port scope for Isabelle audiobook

**Status:** draft scope / feature inventory  
**Constraint:** no in-app AI (no LLM chat, no embedded agent loops, no “ask the book” features). Server-side machine translation and deterministic TTS are in scope.  
**Source reference repo:** `C:\executor`  
**Target app:** `C:\audio_book` (static reader today; `speechSynthesis` in `js/player.js`)

This document lists **frontend and backend** capabilities that could be added, with **implementation hints** and **copy vs rewrite** guidance. Use the table of contents to jump; nested sections use collapsible blocks for easier reading in viewers that support HTML in Markdown (e.g. GitHub).

---

## Table of contents

- [1. Integration models](#1-integration-models)
- [2. Voice (TTS)](#2-voice-tts)
  - [2.1 Backend (Flask) — synthesis API](#21-backend-flask--synthesis-api)
  - [2.2 Backend — voice clone lifecycle](#22-backend--voice-clone-lifecycle)
  - [2.3 Backend — persisted voice config](#23-backend--persisted-voice-config)
  - [2.4 Frontend — playback and chunking](#24-frontend--playback-and-chunking)
  - [2.5 Frontend — settings UI and clone UI](#25-frontend--settings-ui-and-clone-ui)
  - [2.6 Audiobook-specific wiring](#26-audiobook-specific-wiring)
- [3. Sound (effects and feedback)](#3-sound-effects-and-feedback)
  - [3.1 Frontend — SoundPlayer module](#31-frontend--soundplayer-module)
  - [3.2 Assets](#32-assets)
  - [3.3 Optional backend — OS toast](#33-optional-backend--os-toast)
  - [3.4 Audiobook hook points](#34-audiobook-hook-points)
- [4. Translate](#4-translate)
  - [4.1 Backend — line translation API](#41-backend--line-translation-api)
  - [4.2 Backend — translation utilities](#42-backend--translation-utilities)
  - [4.3 Frontend — translate panel / flows](#43-frontend--translate-panel--flows)
  - [4.4 Content strategy (no in-app AI)](#44-content-strategy-no-in-app-ai)
- [5. Cross-cutting](#5-cross-cutting)
- [6. Suggested phases](#6-suggested-phases)
- [7. Related specs in this folder](#7-related-specs-in-this-folder)

---

## 1. Integration models

<details>
<summary><strong>1.1 Static-only audiobook (current baseline)</strong></summary>

- **Today:** `audio_book` is served as static files; narration uses the browser <code>speechSynthesis</code> API (<code>js/player.js</code>).
- **Executor features** that need a server: Kokoro/Coqui TTS, <code>/api/translate/text</code>, optional <code>/notify/toast</code>.

</details>

<details>
<summary><strong>1.2 Companion server (recommended for fastest port)</strong></summary>

- Run a small Flask (or other) process alongside the static site, either:
  - **Same origin:** reverse proxy <code>/voice/*</code>, <code>/api/translate/*</code> to the companion app; or
  - **Cross-origin:** enable CORS on the companion API and configure a **configurable base URL** in audiobook JS (e.g. <code>window.__AUDIOBOOK_API__</code> or build-time env).
- **Copy-heavy path:** vendor <code>routes/voice.py</code>, <code>media/translator.py</code>, <code>media/langdetect_util.py</code>, and optionally register minimal routes in a thin <code>app.py</code> instead of pulling all of executor.

</details>

<details>
<summary><strong>1.3 Embedded Python in another stack</strong></summary>

- If you later move to FastAPI/Node: **rewrite** the route handlers but **reuse** the pure Python helpers from executor (<code>_split_text_for_speak</code>, <code>translate_lines</code>, Kokoro/Coqui call paths) as libraries or copied modules.

</details>

---

## 2. Voice (TTS)

Executor reference: <code>C:\executor\routes\voice.py</code>, <code>C:\executor\static\js\voice.js</code>, <code>C:\executor\static\css\voice.css</code>, <code>C:\executor\voice_config.json</code>, <code>C:\executor\voices\</code>.

### 2.1 Backend (Flask) — synthesis API

<details>
<summary>Endpoints and behavior</summary>

| Endpoint | Method | Role |
|----------|--------|------|
| <code>/voice/speak</code> | POST JSON <code>{ text, voice?, speed? }</code> | Returns <strong>WAV</strong> bytes (Kokoro path from <code>kokoro_model_path</code> or Coqui XTTS for <code>my_voice</code>). |
| <code>/voice/speak/split</code> | POST JSON <code>{ text, max_chunk_chars? }</code> | Returns JSON plan: <code>chunks[]</code> for long text (sentence/CJK-aware packing). |
| <code>/voice/preview</code> | POST | Same as speak (alias). |

**Limits:** e.g. 10k chars per request; chunk min/max bounds (see <code>VOICE_SPEAK_*</code> constants in <code>voice.py</code>).

**Copy vs rewrite:** **Copy** <code>routes/voice.py</code> wholesale into a minimal Flask app; adjust <code>_REPO_ROOT</code> / paths for audiobook deployment. **Rewrite** only if you drop Flask or change audio format (e.g. stream MP3).

</details>

### 2.2 Backend — voice clone lifecycle

<details>
<summary>Clone routes (<code>my_voice</code>)</summary>

| Endpoint | Role |
|----------|------|
| <code>/voice/clone/record</code> | Multipart upload → saves <code>voices/my_voice/sample.wav</code>. |
| <code>/voice/clone/build</code> | Async “build” thread; marks state ready (Coqui loads lazily on first synthesis). |
| <code>/voice/clone/status</code> | JSON state: idle / building / ready / error. |

**Dependencies:** Coqui TTS XTTS v2, PyTorch, env vars (<code>COQUI_TOS_AGREED</code>, <code>TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD</code>) as in executor.

**Copy vs rewrite:** **Copy** handlers + in-memory <code>_clone_state</code> pattern. **Rewrite** UI flows only if audiobook does not need user-recorded clone.

</details>

### 2.3 Backend — persisted voice config

<details>
<summary><code>/api/config/voice</code> GET/POST</summary>

- Persists <code>voice_config.json</code>: <code>active_voice</code>, <code>speed</code>, <code>kokoro_model_path</code>, flags like <code>chat_tts_enabled</code> (audiobook may ignore chat-specific keys or repurpose).

**Copy vs rewrite:** **Copy** <code>_read_config</code> / <code>_write_config</code> / merge helpers. For a **static-only** mode, omit server and store equivalents in <code>localStorage</code> only (executor’s <code>voice.js</code> already mirrors to server when available).

</details>

### 2.4 Frontend — playback and chunking

<details>
<summary>VoicePlayer (<code>static/js/voice.js</code>)</summary>

**Capabilities:**

- <code>read(text, label)</code>: fetch WAV → blob URL → <code>&lt;audio&gt;</code> with **player bar** (play/pause, scrubber, stop, close).
- **Chunked read:** above ~450 chars, calls <code>/voice/speak/split</code> then sequences multiple <code>/voice/speak</code> requests; progress via custom event <code>voice-read-progress</code>.
- <code>narrate(line)</code>: headless **Web Audio API** decode/play (no bar) — useful for tight integration with sentence-by-sentence flows.
- <code>stop({ invalidateRead })</code>, <code>toggle()</code>, selection shortcut (Alt+Shift+R) depends on <code>ExecutorShared</code> — **not** a straight copy for audiobook.
- Toasts, localStorage key <code>executor-voice-settings</code>, sync POST to <code>/api/config/voice</code>.

**Copy vs rewrite:**

- **Copy** the core: <code>read</code>, chunked pipeline, <code>narrate</code>, <code>_createPlayerBar</code>, WAV fetch error handling.
- **Rewrite:** branding, storage key prefix, mount target (executor uses <code>#shell</code>); remove chat/selection features or replace <code>readSelection</code> with “read current paragraph”.
- **Parameterize** <code>fetch('/voice/speak')</code> base URL for static hosting.

</details>

### 2.5 Frontend — settings UI and clone UI

<details>
<summary>Executor shell controls</summary>

Executor ties sliders, voice select, and clone panel to IDs such as <code>vp-speed</code>, <code>vp-voice-select</code>, <code>vp-clone-btn</code> (see <code>voice.js</code> DOMContentLoaded). **Styles:** <code>static/css/voice.css</code>.

**Copy vs rewrite:**

- **Copy** CSS and HTML partials if you want parity quickly.
- **Rewrite** recommended for audiobook: a single **Audio** panel matching Isabelle UI (see <code>2026-03-23-isabelle-v2-design.md</code>) that calls the same JS API surface.

</details>

### 2.6 Audiobook-specific wiring

<details>
<summary>Replacing or augmenting <code>js/player.js</code></summary>

**Options:**

1. **Dual engine:** User setting “Browser voice” vs “Server voice (Kokoro / My Voice)”. Browser path keeps current <code>SpeechSynthesisUtterance</code> flow; server path feeds sentences/paragraphs into <code>VoicePlayer.narrate</code> or concatenated chunk <code>read</code>.
2. **Server-only:** Replace <code>speechSynthesis</code> with queued WAV playback; align sentence boundaries with existing <code>splitSentences</code> in <code>player.js</code>.
3. **Pre-bake:** Offline pipeline generates per-letter MP3/WAV assets (not executor runtime) — larger scope; only mentioned for completeness.

**No in-app AI:** TTS models are fixed pipelines; no LLM in the loop.

</details>

---

## 3. Sound (effects and feedback)

Executor reference: <code>C:\executor\static\js\sound.js</code>, <code>C:\executor\static\sounds\*.wav</code>.

### 3.1 Frontend — SoundPlayer module

<details>
<summary>API summary</summary>

- Lazy <code>AudioContext</code>; <code>load(id, path)</code>, <code>play(id, type)</code> where <code>type</code> is <code>action</code> vs <code>notification</code> (separate volume sliders).
- <code>notify(eventKey, title, body)</code>: plays mapped sound + optional OS toast via fetch.
- <code>preloadAll()</code> on DOMContentLoaded; settings in <code>localStorage</code> <code>executor-sound-settings</code>.

**Copy vs rewrite:** **Copy** entire IIFE with minimal edits (rename storage key, sound base path). Very self-contained.

</details>

### 3.2 Assets

<details>
<summary>File list (executor)</summary>

Action: <code>snd-run-start</code>, <code>snd-run-complete</code>, <code>snd-run-fail</code>, <code>snd-step-fire</code>, <code>snd-confidence-low</code>, <code>snd-verification-open</code>, <code>snd-record-start</code>, <code>snd-record-stop</code>, <code>snd-task-saved</code>, <code>snd-error</code>, <code>snd-narration-start</code>.  
Notify: <code>snd-notify-done</code>, <code>snd-notify-error</code>, <code>snd-notify-chat</code>, <code>snd-notify-pause</code>.

**Copy vs rewrite:** **Copy** the WAV files you need into <code>audio_book</code> (e.g. <code>assets/sounds/</code>) and trim <code>ACTION_SOUNDS</code> / <code>NOTIFY_SOUNDS</code> arrays to audiobook-relevant events only.

</details>

### 3.3 Optional backend — OS toast

<details>
<summary><code>POST /notify/toast</code></summary>

Executor exposes a JSON endpoint used by <code>SoundPlayer.notify</code> when <code>osToast</code> is enabled. **Audiobook:** likely **omit** unless you run a desktop wrapper; otherwise **rewrite** as no-op or web Notification API with permission prompt.

</details>

### 3.4 Audiobook hook points

<details>
<summary>Suggested events</summary>

- Narration **start** / **paragraph advance** / **end** / **error** (map to <code>snd-narration-start</code>, <code>snd-notify-done</code>, <code>snd-notify-error</code>).
- **Export complete**, **save position**, **sync** (if you add sounds for those UX moments).
- Keep toggles in a small **Sound** section of settings mirroring executor’s notification map pattern.

</details>

---

## 4. Translate

Executor reference: <code>C:\executor\app.py</code> (<code>/api/translate/text</code>), <code>C:\executor\media\translator.py</code>, <code>C:\executor\media\langdetect_util.py</code>, <code>C:\executor\static\js\run\run-translate.js</code>.

### 4.1 Backend — line translation API

<details>
<summary><code>POST /api/translate/text</code></summary>

**Request:** JSON <code>{ lines: string[], target_lang: string }</code> (executor may also accept optional source; see implementation).  
**Response:** <code>{ lines, detected_lang?, translated?: boolean }</code> with batching and graceful degradation inside <code>translate_lines</code>.

**Dependency:** <code>deep-translator</code> (Google backend), plus <code>langdetect</code> for auto source language.

**Copy vs rewrite:** **Copy** <code>translate_lines</code> and the Flask route handler pattern; **do not** copy unrelated executor reporting/analytics unless needed.

</details>

### 4.2 Backend — translation utilities

<details>
<summary><code>media/translator.py</code></summary>

- Sentinel-joined batching, char limits (~4800), oversized line word-chunk strategy, <code>on_batch</code> progress hook for streaming UIs.
- **Copy** module + <code>langdetect_util.py</code> as-is for fastest path.

</details>

### 4.3 Frontend — translate panel / flows

<details>
<summary><code>run-translate.js</code> patterns</summary>

**Features in executor:**

- Panel open/close, source tabs: artifact / upload / text.
- **In-place** translation: walks text nodes in an iframe DOM, posts lines to API, writes back (skips script/style/code/pre).
- **Plain-text** path: strip HTML to lines, translate, show result UI.
- Upload flow for HTML files.

**Audiobook mapping:**

- **Letter body:** treat current letter HTML or paragraph list as “artifact”; either translate **display view** in memory or generate a **new view key** (e.g. <code>translated_en</code>) stored in export JSON — preferable for **deterministic** reading and no destructive edits.
- **Copy vs rewrite:** **Rewrite** UI to Isabelle components; **reuse** the text-node walker or line-extraction logic almost verbatim (plain ES5-style IIFE can be modernized to ES modules incrementally).

</details>

### 4.4 Content strategy (no in-app AI)

<details>
<summary>Offline vs on-demand</summary>

- **On-demand MT** via companion API: no LLM; still requires network and ToS awareness for Google Translate.
- **Editor / build step:** translate views at content preparation time (aligns with existing <code>views</code> on letters); ship static JSON only — **no** translation API in production reader.
- **User rule:** “No in-app AI” — recommend documenting that MT is **machine translation**, not generative chat, if product language matters for compliance.

</details>

---

## 5. Cross-cutting

<details>
<summary>Configuration and deployment</summary>

- **Base URL:** single config for all <code>fetch</code> calls (voice, translate, optional toast).
- **CORS:** if static site and API differ by origin, set Flask-CORS or proxy.
- **Secrets:** translation may need API keys if you move off free <code>deep-translator</code> endpoints; plan env-based config.
- **Tests:** executor has <code>tests/test_voice_chunk_split.py</code>, <code>voice_validation.spec.js</code>, <code>validate_library.py</code> translate smoke — **copy** patterns, not necessarily files.

</details>

<details>
<summary>What not to port (out of scope for this doc)</summary>

- Executor **chat QA**, **agent loop**, **enhance** flows, **artifact engine** — all unrelated to “voice, sound, translate” for audiobook and conflict with **no in-app AI** if interpreted broadly.
- **Media pipeline** (ffmpeg jobs, exporter) unless audiobook later adds audio chapter export.

</details>

---

## 6. Suggested phases

| Phase | Deliverable | Copy-heavy? |
|-------|-------------|-------------|
| **A** | SoundPlayer + subset of WAVs + hooks from narrator | **Yes** (<code>sound.js</code> + assets) |
| **B** | Companion Flask: <code>/voice/speak</code> + <code>/voice/speak/split</code> + minimal config | **Yes** (<code>voice.py</code>) |
| **C** | ES module wrapper around VoicePlayer + audiobook “read aloud” integration | **Partial** (adapt <code>voice.js</code>) |
| **D** | <code>/api/translate/text</code> + translate panel for letters / export | **Partial** (Python yes; JS UI rewrite) |
| **E** | Voice clone + settings parity | **Copy** backend; **rewrite** UI |

---

## 7. Related specs in this folder

Use these for product and UI alignment (same directory: `docs/superpowers/specs/`):

- [2026-03-23-isabelle-v2-design.md](./2026-03-23-isabelle-v2-design.md) — reader UX, views, narrator
- [2026-03-22-isabelle-audiobook-design.md](./2026-03-22-isabelle-audiobook-design.md) — audiobook-oriented design notes

---

*End of document.*
