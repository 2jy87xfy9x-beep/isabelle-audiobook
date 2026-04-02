# Isabelle Audiobook — Full Roadmap

*April 2, 2026*

---

## Navigation

- [Overview](#overview)
- [Required — Core Build](#required--core-build)
  - [R1 — Sound Effects](#r1--sound-effects-phase-a)
  - [R2 — ElevenLabs Voice Engine](#r2--elevenlabs-voice-engine)
  - [R3 — Cloudflare Worker Proxy](#r3--cloudflare-worker-proxy)
  - [R4 — Translation](#r4--translation)
  - [R5 — Voice Settings UI](#r5--voice-settings-ui)
- [Optional — Enhancements](#optional--enhancements)
  - [O1 — Flair System](#o1--flair-system)
  - [O2 — Character Voice Assignment](#o2--character-voice-assignment)
  - [O3 — Ambient Audio Layer](#o3--ambient-audio-layer)
  - [O4 — Kokoro In-Browser TTS](#o4--kokoro-in-browser-tts-no-server-no-api)
- [From LPAG — Adaptable Modules](#from-lpag--adaptable-modules)
  - [L1 — Snapshot + Signed Record Download](#l1--snapshot--signed-record-download)
  - [L2 — Letter Body Editor + Export](#l2--letter-body-editor--export)
  - [L3 — Pledge + Money Module](#l3--pledge--money-module)
  - [L4 — Check-In + Streak System](#l4--check-in--streak-system)
  - [L5 — D1 Database — Persistent User State](#l5--d1-database--persistent-user-state)
  - [L6 — Token Studio](#l6--token-studio)
  - [L7 — Brief / Onboarding Modal](#l7--brief--onboarding-modal)
- [Architecture Overview](#architecture-overview)
- [Dependency Order](#dependency-order)

---

## Overview

The original five-phase plan (A–E) assumed a local Flask server running Kokoro TTS and Coqui voice cloning. That approach is being replaced with a **serverless-first architecture**: ElevenLabs API for voice cloning and synthesis, a thin Cloudflare Worker to proxy API keys, and direct browser API calls for translation. Several modules from the LPAG project (pledge, signed records, editor, streaks) are directly adaptable here.

**Stack:** Vanilla ES modules · Web Audio API · ElevenLabs API · Cloudflare Worker + D1 · Stripe API

**What was scrapped:**
- Phase B (Flask TTS server) — replaced by ElevenLabs API + Worker proxy
- Phase E (Coqui voice clone UI) — replaced by ElevenLabs instant voice clone
- Phase C (dual-engine browser/Kokoro toggle) — simplified to single ElevenLabs engine
- File System Access API (`showDirectoryPicker`, `requestPermission`) — replaced by `<input type="file">` bundle approach (no permissions required)

---

## Completed — Foundation

### F1 — Single-File Consolidation + Bookshelf Panel

**Status: ✅ Complete** · *April 2, 2026* · See `docs/reports/2026-04-02-single-file-consolidation-report.md`

All 14 JS modules and `landing.html` collapsed into a single `index.html` with one inline `<script type="module">`. The separate landing page is replaced by an in-reader bookshelf panel (📚 in bottom bar).

**Key decisions made:**
- Books loaded via `<input type="file">` — zero browser permissions needed
- Book data stored in IndexedDB as a bundle `{ book, context, fiction }` — no file handles
- Saving = browser download of updated bundle `.json` (user pushes to git manually)
- `data/` folder created for all JSON files; `docs/` reorganised; README rewritten

**Architecture impact on R1–R5:** The inline-script architecture means new feature modules (voice, sound, translate, etc.) will be added as additional `// ── §N NAME ──` sections inside the single `<script type="module">` in `index.html`, rather than separate `js/*.js` files. The roadmap file references below (`js/sound.js`, `js/voice.js`, etc.) reflect intended logical modules — they will live as named sections in the inline script unless the file grows unmanageable, at which point splitting back out is straightforward.

---

## Required — Core Build

---

### R1 — Sound Effects (Phase A)

<details>
<summary><strong>Status:</strong> Not started · <strong>Server required:</strong> No · <strong>Effort:</strong> Small</summary>

#### What it is

Play a brief WAV sound on narration start and another when narration ends. No server, no API.

#### Files to create

| File | Source |
|------|--------|
| `assets/sounds/snd-narration-start.wav` | Copy from `C:\executor\static\sounds\` |
| `assets/sounds/snd-notify-done.wav` | Copy from `C:\executor\static\sounds\` |
| `assets/sounds/snd-notify-error.wav` | Copy from `C:\executor\static\sounds\` |
| `assets/sounds/snd-notify-pause.wav` | Copy from `C:\executor\static\sounds\` |
| `js/sound.js` | New ES module — SoundPlayer |
| `tests/test-sound.js` | node:test unit tests |

#### How it works

`SoundPlayer` is a small ES module wrapping the Web Audio API. It loads all four WAV files on boot via `fetch()` and decodes them into `AudioBuffer` objects. `SoundPlayer.play(id)` fires the buffer through a gain node. Settings (master volume, per-event toggles, enabled flag) persist to `localStorage` under `isabelle-sound-settings`. `app.js` calls `SoundPlayer.notify('narrationEnd')` in the player's `onEnd` callback and `SoundPlayer.play('snd-narration-start')` in the play button handler.

The full implementation is already written in `docs/superpowers/plans/2026-03-24-phase-a-sound-player.md` — this plan can be executed as-is.

</details>

---

### R2 — ElevenLabs Voice Engine

<details>
<summary><strong>Status:</strong> Not started · <strong>Server required:</strong> Worker proxy only · <strong>Effort:</strong> Medium</summary>

#### What it is

Replace the planned Flask/Kokoro TTS server with the ElevenLabs API. The user records or uploads a voice sample, the app creates an ElevenLabs instant voice clone, stores the `voice_id` in `localStorage`, and uses it for all subsequent TTS synthesis.

#### Files to create

| File | Purpose |
|------|---------|
| `js/voice.js` | VoicePlayer ES module — ElevenLabs API calls, Web Audio playback |
| `tests/test-voice.js` | node:test unit tests (fetch mocked) |

#### Key ElevenLabs endpoints used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/v1/voices/add` | Create instant voice clone from audio file |
| `POST` | `/v1/text-to-speech/{voice_id}` | Synthesize speech → returns MP3/WAV bytes |
| `GET` | `/v1/voices` | List available voices |
| `DELETE` | `/v1/voices/{voice_id}` | Delete a cloned voice |

#### Voice creation flow

1. User records audio via `MediaRecorder` or uploads a file via `<input type="file">`
2. App POSTs a `multipart/form-data` request to the Worker proxy → Worker forwards to `/v1/voices/add` with the API key
3. Response contains `voice_id` — stored in `localStorage` under `isabelle-voice-id`
4. All TTS calls from that point use this `voice_id`

#### TTS synthesis flow

For each letter played:
1. `VoicePlayer.narrate(text)` POSTs `{ text, voice_id, voice_settings: { stability, similarity_boost, style } }` to Worker proxy
2. Worker forwards to ElevenLabs, returns audio bytes
3. `app.js` receives bytes, decodes via `AudioContext.decodeAudioData()`, plays via `BufferSource`

#### "Flairs" via ElevenLabs v3

ElevenLabs' latest model (`eleven_multilingual_v3`, `eleven_turbo_v2_5`) supports emotional/style markup in text:
- `<dramatic>` — slower, more weight
- `<whisper>` — soft, intimate
- `<excited>` — faster, higher energy
- `stability` (0–1): lower = more expressive, higher = more consistent
- `style` exaggeration (0–1): amplifies speaking style

These can be mapped to letter categories or user-selectable per-session flair presets.

#### Cost

| Tier | Characters/month | Cost |
|------|-----------------|------|
| Free | ~10,000 | $0 |
| Starter | 30,000 | $5/mo |
| Creator | 100,000 | $22/mo |

A typical letter is 500–2,000 characters. The free tier covers roughly 5–20 letters/month. For a personal app, free is likely sufficient.

#### API key safety

Never hardcode the ElevenLabs API key in browser JS. All calls go through the Cloudflare Worker (see R3). The browser only ever speaks to `https://your-worker.workers.dev/voice/speak` — the real key lives in Worker secrets.

</details>

---

### R3 — Cloudflare Worker Proxy

<details>
<summary><strong>Status:</strong> Not started · <strong>Server required:</strong> Cloudflare edge (not local) · <strong>Effort:</strong> Small</summary>

#### What it is

A thin Cloudflare Worker that proxies browser requests to ElevenLabs (and optionally a translation API) without exposing API keys in client code. Same pattern as the LPAG Worker.

#### Endpoints to implement

| Method | Path | What it does |
|--------|------|-------------|
| `POST` | `/voice/clone` | Forward `multipart/form-data` to ElevenLabs `/v1/voices/add` |
| `POST` | `/voice/speak` | Forward TTS request to `/v1/text-to-speech/{voice_id}`, return audio bytes |
| `GET` | `/voice/list` | Forward to `/v1/voices`, return voice list |
| `DELETE` | `/voice/:id` | Forward to `/v1/voices/{voice_id}` |
| `POST` | `/translate` | Forward to chosen translation API (LibreTranslate / DeepL) |

#### Key implementation details

- Worker reads `ELEVENLABS_API_KEY` from Wrangler secrets — never in source
- CORS headers on all responses — same pattern as LPAG worker
- `OPTIONS` preflight handled
- No D1 required for voice-only operation (D1 is optional, see L5)
- Deploy via `wrangler deploy` — no server, runs on Cloudflare edge globally

#### Files to create

| File | Purpose |
|------|---------|
| `worker/index.js` | Worker router + proxy logic |
| `worker/wrangler.toml` | Cloudflare config |

#### Secrets required before deploy

- `ELEVENLABS_API_KEY`
- `TRANSLATE_API_KEY` (if using a paid translation service)

</details>

---

### R4 — Translation

<details>
<summary><strong>Status:</strong> Not started · <strong>Server required:</strong> Worker proxy only · <strong>Effort:</strong> Small</summary>

#### What it is

A "Translate" button that sends the current letter's paragraphs to a translation API and renders the result as a non-destructive in-memory overlay. Original text is restored via "Close translation". No edits to `book.json`.

#### Files to create

| File | Purpose |
|------|---------|
| `js/translate.js` | TranslatePanel ES module — API call, overlay render, restore |
| `tests/test-translate.js` | node:test unit tests |

#### Translation API options

| API | Free tier | Notes |
|-----|-----------|-------|
| LibreTranslate (public) | Unlimited (rate limited) | No key needed for public instance; can self-host |
| DeepL Free | 500k chars/month | Requires API key → route through Worker |
| Google Translate (unofficial) | Rate limited | Unofficial, may break |
| MyMemory | 5k chars/day | No key needed, slow |

**Recommended:** LibreTranslate public instance for zero setup, or DeepL Free for quality. Both route through the Worker proxy so no key is ever in browser code.

#### How it works

1. User clicks Translate button
2. `TranslatePanel.translateCurrentLetter(paragraphs, containerEl, 'en')` POSTs lines to Worker `/translate`
3. Worker forwards to translation API, returns `{ lines, detected_lang, translated }`
4. Panel replaces container HTML with translated paragraphs + a dismissable banner showing source language
5. "Close translation" button restores original `innerHTML`

The full implementation is written in `docs/superpowers/plans/2026-03-24-phase-d-translate.md` — the only change needed is replacing the Flask route with the Worker proxy endpoint.

</details>

---

### R5 — Voice Settings UI

<details>
<summary><strong>Status:</strong> Not started · <strong>Server required:</strong> No (uses Worker) · <strong>Effort:</strong> Medium</summary>

#### What it is

A sliding settings drawer accessible from a toolbar button. Controls voice selection, speed, stability/style sliders, and the voice clone recording flow.

#### Files to create

| File | Purpose |
|------|---------|
| `js/voice-settings.js` | VoiceSettingsPanel ES module — drawer UI, recording flow, clone management |
| `tests/test-voice-settings.js` | node:test unit tests |

#### UI sections

**Voice select:** Dropdown listing available ElevenLabs voices + any user-cloned voices. Cloned voices show a "Delete" button.

**Speed:** Range slider (0.5–2.0×). Persists to `localStorage` and syncs to future TTS calls.

**Stability / Style:** Two sliders (0–1 each). Lower stability = more expressive. Higher style = more pronounced speaking character. These map to ElevenLabs `voice_settings`.

**My Voice — clone recording flow:**
1. "Record" button → requests mic access via `navigator.mediaDevices.getUserMedia()`
2. Records via `MediaRecorder` for 10–60 seconds
3. "Stop" → uploads blob to Worker `/voice/clone` → gets back `voice_id`
4. Status shows "Clone ready" — voice appears in dropdown
5. Alternatively: "Upload file" → `<input type="file" accept="audio/*">` → same upload flow

**Flair preset:** Optional dropdown — Neutral / Dramatic / Intimate / Excited. Each preset maps to a `{ stability, similarity_boost, style }` config applied to subsequent TTS calls.

</details>

---

## Optional — Enhancements

---

### O1 — Flair System

<details>
<summary><strong>Status:</strong> Optional · <strong>Effort:</strong> Small–Medium</summary>

#### What it is

Per-letter or per-session voice styling presets that change how the narration sounds without changing the text. Stored in `localStorage` and applied at synthesis time.

#### Implementation

A `flairs.js` module exports a small preset map:

```js
export const FLAIRS = {
  neutral:   { stability: 0.5, similarity_boost: 0.8, style: 0.0, speed: 1.0 },
  dramatic:  { stability: 0.2, similarity_boost: 0.9, style: 0.7, speed: 0.85 },
  intimate:  { stability: 0.7, similarity_boost: 0.9, style: 0.2, speed: 0.9 },
  excited:   { stability: 0.3, similarity_boost: 0.7, style: 0.9, speed: 1.2 },
};
```

The active flair is passed to `VoicePlayer.narrate()` as part of the `voice_settings` payload. A small pill selector in the toolbar or voice settings drawer lets the user choose.

For in-text flair markers (advanced): a pre-processing step before synthesis could replace `[dramatic]...[/dramatic]` markers in letter text with ElevenLabs emotion tags, allowing letter authors to embed flairs directly into the source text.

</details>

---

### O2 — Character Voice Assignment

<details>
<summary><strong>Status:</strong> Optional · <strong>Effort:</strong> Medium</summary>

#### What it is

Assign different ElevenLabs voices to different "characters" in a letter — e.g., narration in the user's cloned voice, quoted dialogue in a second voice.

#### Implementation

`book.json` letters already have paragraph arrays. An optional `role` field per paragraph (`"narration"` | `"dialogue"` | `"aside"`) would drive voice selection. A `voice-map.js` module maps roles to `voice_id` values stored in `localStorage`.

The player iterates paragraphs, checks each paragraph's role, looks up the corresponding `voice_id`, and calls `VoicePlayer.narrate(paragraph, voiceId)`.

Voice assignment UI: a small "Characters" section in the voice settings drawer listing roles and letting the user pick a voice for each.

</details>

---

### O3 — Ambient Audio Layer

<details>
<summary><strong>Status:</strong> Optional · <strong>Effort:</strong> Small</summary>

#### What it is

A looping background soundscape (e.g., fireplace, rain, library quiet) that plays under narration at reduced volume. User can enable/disable and set volume independently from narration.

#### Implementation

`SoundPlayer` already manages `AudioContext`. An `ambient.js` module adds a separate gain node for the ambient loop. A small set of looping ambient WAV/MP3 files in `assets/ambient/` are loaded on demand. The ambient layer fades in when narration starts and fades out when it ends, using `AudioParam.linearRampToValueAtTime()`.

No server, no API — just Web Audio API and static audio files.

</details>

---

### O4 — Kokoro In-Browser TTS (no server, no API)

<details>
<summary><strong>Status:</strong> Optional · <strong>Effort:</strong> Medium · <strong>Note:</strong> No voice cloning</summary>

#### What it is

Run Kokoro TTS entirely in the browser using ONNX Runtime Web via the `kokoro-js` npm package. No server, no API key, works offline after first load. Downloads ~80MB of model weights on first visit (cached in browser storage).

#### Tradeoff

This provides high-quality TTS with fixed preset voices — no custom voice cloning. It is a good fallback for users who don't want to use ElevenLabs or set up an API key.

#### Implementation

```js
import { KokoroTTS } from 'kokoro-js';
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-ONNX');
const audio = await tts.generate('Hello, Isabelle.', { voice: 'af_heart' });
audio.save('output.wav');
```

This could sit alongside ElevenLabs as a second engine option — a "Kokoro (offline)" choice in the voice settings drawer for users who want zero API dependency.

</details>

---

## From LPAG — Adaptable Modules

---

### L1 — Snapshot + Signed Record Download

<details>
<summary><strong>Status:</strong> Optional · <strong>Adapted from:</strong> LPAG pledge record + check-in · <strong>Effort:</strong> Small</summary>

#### What it is

A downloadable JSON snapshot of the user's current reading state — which letter they're on, which letters they've read, their voice settings, reading streak, and a tamper-evident HMAC signature. The user can save this file and load it back to restore their exact state on any device.

#### What it captures

```json
{
  "reader": "hash-of-device-fingerprint",
  "snapshot_date": "2026-04-02T14:00:00Z",
  "current_letter": "letter-047",
  "letters_read": ["letter-001", "letter-002", ...],
  "voice_id": "elevenlabs-voice-id",
  "voice_settings": { "stability": 0.5, "style": 0.2, "speed": 1.0 },
  "active_flair": "dramatic",
  "streak": 12,
  "signature": "hmac-sha256-hex"
}
```

#### How HMAC signing works (from LPAG)

LPAG's Worker signs operative records with HMAC-SHA256 using a `SIGNING_SECRET` stored in Worker secrets. The same pattern applies here: the Worker receives the snapshot payload, signs it, returns the signed JSON. On restore, the Worker verifies the signature before accepting the state. This prevents users from manually editing their read-count or streak.

If no Worker is deployed (pure local use), the snapshot can be unsigned — HMAC is only needed if streak/progress has any game mechanic or social value.

#### Files to create / adapt

| File | Purpose |
|------|---------|
| `js/snapshot.js` | `SnapshotManager` — build, download, restore from JSON file |
| Worker endpoint `POST /snapshot/sign` | HMAC-sign the payload (optional) |
| Worker endpoint `POST /snapshot/verify` | Verify signature on restore (optional) |

</details>

---

### L2 — Letter Body Editor + Export

<details>
<summary><strong>Status:</strong> Optional · <strong>Adapted from:</strong> LPAG `lpag-editor.html` · <strong>Effort:</strong> Large</summary>

#### What it is

An editor mode inside the app (or a separate `editor.html`) that lets you edit letter content with `contenteditable` fields, save back to `book.json` via the File System Access API, and export a standalone static `docs/index.html` with all content inlined — no server required to run the exported file.

#### What LPAG proved

The LPAG editor (`lpag-editor.html`) is 1,845 lines — a single HTML file with full CRUD, autosave to localStorage, dirty tracking, File System Access API save/export, and Token Studio. The same pattern works directly for the audiobook:

- `contenteditable` on letter paragraphs, dates, sender/recipient names
- Ctrl+S saves to `book.json` via File System Access API
- Ctrl+E exports a self-contained `docs/index.html` with all letters inlined
- localStorage autosave on every keystroke — restore banner on reload
- Dirty dot in tab title

#### Export details

`buildExportHTML()` inlines:
- All letter data from `book.json`
- All CSS
- Minimal public JS (player, renderer, navigation — no editor code)
- `<script src="voice.js">` and `<script src="sound.js">` for narration

The exported file runs with no server, no build step, no npm. Anyone can open it in a browser.

#### Additional editor features worth porting from LPAG

| Feature | How |
|---------|-----|
| Token Studio | Live CSS variable editing — fonts, colours, spacing |
| Brief / onboarding modal | 8-slide intro carousel with auto-advance |
| Sources explorer | Linked reference material per letter |
| CRUD for letters | Add, delete, reorder letters in the timeline |
| File/attachment state | Lock/unlock supplementary documents |

</details>

---

### L3 — Pledge + Money Module

<details>
<summary><strong>Status:</strong> Optional · <strong>Adapted from:</strong> LPAG `pledge.js` + `worker/index.js` · <strong>Effort:</strong> Medium</summary>

#### What it is

A Stripe-powered pledge/support flow — readers can make a small recurring commitment ($1/week or similar) to support the project, gain "operative" status, and unlock premium features (additional voices, higher ElevenLabs quota, access to locked letters).

#### What LPAG built (directly reusable)

LPAG's `pledge.js` and Worker already implement:
- Stripe Elements card mount
- `POST /create-payment-intent` → Stripe customer + PaymentIntent
- `POST /confirm-pledge` → verifies payment, generates clearance code, stores in D1
- `POST /check-in` → weekly charge, streak increment, returns signed record
- `GET /count` → live supporter count for display in UI
- Record download (signed JSON blob)

The language just needs to change — "pledge" → "support", "operative" → "reader", "clearance code" → "access code".

#### Unlock gates (audiobook-specific)

| Gate | Unlocked by |
|------|------------|
| Additional ElevenLabs voice quota | Active supporter |
| Locked letters / later chapters | Pledge confirmed |
| Custom voice clone feature | Supporter tier |
| High-quality audio export | Supporter tier |

#### Worker changes needed

Add to the existing voice proxy Worker:
- `POST /create-payment-intent` (from LPAG — nearly verbatim)
- `POST /confirm-pledge` (from LPAG — rename fields)
- `POST /check-in` (from LPAG — nearly verbatim)
- `GET /count` (from LPAG — verbatim)

D1 schema addition:
```sql
CREATE TABLE IF NOT EXISTS readers (
  hash        TEXT PRIMARY KEY,
  streak      INTEGER NOT NULL DEFAULT 1,
  last_checkin TEXT NOT NULL,
  stripe_cid  TEXT NOT NULL,
  tier        TEXT NOT NULL DEFAULT 'supporter'
);
```

#### Secrets required

- `STRIPE_SECRET_KEY`
- `SIGNING_SECRET` (for HMAC record signing)

</details>

---

### L4 — Check-In + Streak System

<details>
<summary><strong>Status:</strong> Optional · <strong>Adapted from:</strong> LPAG check-in flow · <strong>Effort:</strong> Small (if L3 is built)</summary>

#### What it is

A weekly reading check-in that increments a streak counter. The reader uploads their signed snapshot file, the Worker verifies the signature, confirms a weekly boundary has passed, increments the streak, and returns a new signed record. Optionally charges a micro-payment for accountability.

#### Without payment (free streak)

Drop the Stripe charge from `handleCheckIn`. Keep the D1 record and HMAC signing. The streak becomes a pure reading accountability tool — no money involved.

#### With payment (accountability pledge)

Verbatim from LPAG: the Worker charges the stored card off-session each week. Streak resets to 1 if a week is missed. The reader's signed record always shows current streak.

#### Display in UI

A small streak indicator in the status bar or footer: `🔥 12-week streak`. Clicking it opens the check-in flow (upload last week's record, get new one back).

</details>

---

### L5 — D1 Database — Persistent User State

<details>
<summary><strong>Status:</strong> Optional · <strong>Adapted from:</strong> LPAG D1 schema · <strong>Effort:</strong> Small</summary>

#### What it is

A Cloudflare D1 database attached to the Worker for persisting reader records, cloned voice IDs, and streak data server-side. Without D1, all state lives in `localStorage` (device-local only). With D1, readers can restore their state from any device using their signed record file.

#### When you need it

- If you want cross-device sync
- If you want the pledge/streak system (L3/L4)
- If you want server-side voice ID storage (so clones survive browser data clearing)

#### When you don't need it

- Single-device personal use
- No pledge/streak system
- `localStorage` + snapshot download is sufficient

#### Schema

```sql
CREATE TABLE IF NOT EXISTS readers (
  hash         TEXT PRIMARY KEY,
  streak       INTEGER NOT NULL DEFAULT 1,
  last_checkin TEXT NOT NULL,
  stripe_cid   TEXT,
  voice_id     TEXT,
  tier         TEXT NOT NULL DEFAULT 'free'
);
```

</details>

---

### L6 — Token Studio

<details>
<summary><strong>Status:</strong> Optional · <strong>Adapted from:</strong> LPAG Token Studio panel · <strong>Effort:</strong> Small</summary>

#### What it is

A floating panel accessible from View → Token Studio that lets you live-edit CSS custom properties (fonts, colours, spacing) and save them to a `tokens.json` file. Changes apply instantly to the rendered UI without reload.

#### Tokens worth exposing

| Token | Purpose |
|-------|---------|
| `color.background` | Page background |
| `color.text.primary` | Main reading text |
| `color.text.muted` | Dates, metadata |
| `color.accent` | Active letter highlight, UI chrome |
| `font.body` | Letter body typeface |
| `font.ui` | Controls, labels |
| `font.size.body` | Reading font size |
| `line.height.body` | Reading line height |

#### How it works (from LPAG)

`applyTokensToCSS()` iterates the token map and calls `document.documentElement.style.setProperty('--token-name', value)`. Token Studio renders a list of inputs — color swatches for colour tokens, text fields for font strings, number inputs for sizes. On change, `updateToken(key, value)` applies the CSS variable and marks dirty. Save writes `tokens.json` via File System Access API.

</details>

---

### L7 — Brief / Onboarding Modal

<details>
<summary><strong>Status:</strong> Optional · <strong>Adapted from:</strong> LPAG brief modal · <strong>Effort:</strong> Small</summary>

#### What it is

An auto-advancing carousel modal shown on first visit (or accessible via a "?" button). Introduces the reader to the collection — who wrote the letters, the historical context, how to use the app, how to set up their voice.

#### How it works (from LPAG)

LPAG's brief modal is 8 slides, auto-advances every 4 seconds, pauses on hover, has prev/next buttons, and can display an uploaded photo per slide. The same component works here with audiobook-appropriate content.

#### Slides suggested for Isabelle

1. Who is Isabelle / collection overview
2. How to navigate letters
3. How to enable narration
4. How to set up your own voice (ElevenLabs clone)
5. Translation feature
6. Reading streaks and snapshots
7. Support the project
8. Begin reading CTA

</details>

---

## Architecture Overview

```
[Browser — index.html, single inline <script type="module">]
    │
    ├── §1  DB ──────────────────────── IDB persistence (✅ complete)
    ├── §3  LOADER ──────────────────── bundle load / IDB fetch (✅ complete)
    ├── §4  RENDERER ────────────────── letter render (✅ complete)
    ├── §5  PLAYER ──────────────────── letter playback (✅ complete)
    ├── §13 BOOKSHELF ───────────────── in-reader book switcher (✅ complete)
    ├── §14 APP ─────────────────────── orchestrator (✅ complete)
    ├── §N  SOUND ───────────────────── SoundPlayer (R1, planned)
    ├── §N  VOICE ───────────────────── VoicePlayer — ElevenLabs (R2, planned)
    ├── §N  TRANSLATE ───────────────── TranslatePanel (R4, planned)
    ├── §N  VOICE-SETTINGS ──────────── settings drawer + clone (R5, planned)
    ├── §N  SNAPSHOT ────────────────── read state snapshot (L1, planned)
    ├── §N  FLAIRS ──────────────────── flair presets (O1, optional)
    └── assets/sounds/*.wav ──────────── sound effects (R1, planned)
    │
    └── POST/GET ──► Cloudflare Worker (R3)
                          │
                          ├── /voice/clone ──► ElevenLabs /v1/voices/add
                          ├── /voice/speak ──► ElevenLabs /v1/text-to-speech
                          ├── /translate ────► LibreTranslate / DeepL
                          ├── /snapshot/sign ─► HMAC sign (optional, L1)
                          ├── /create-payment-intent ─► Stripe (optional, L3)
                          ├── /confirm-pledge ────────► Stripe + D1 (optional, L3)
                          ├── /check-in ──────────────► Stripe + D1 (optional, L4)
                          └── /count ─────────────────► D1 (optional, L5)
```

---

## Dependency Order

```
R1 (sound)          — independent, do first
R3 (Worker proxy)   — must exist before R2 and R4
R2 (ElevenLabs TTS) — requires R3
R4 (translation)    — requires R3
R5 (voice settings) — requires R2

L1 (snapshot)       — independent (unsigned) or requires R3 (signed)
L2 (editor/export)  — independent
L3 (pledge/money)   — requires R3 + Worker + D1 + Stripe
L4 (streak)         — requires L3 (or simplified: just R3 + D1)
L5 (D1)             — required by L3 and L4
L6 (token studio)   — independent
L7 (brief modal)    — independent

O1 (flairs)         — requires R2
O2 (character voices) — requires R2
O3 (ambient audio)  — requires R1 (SoundPlayer)
O4 (Kokoro browser) — independent (no server, no API, no cloning)
```

---

*This document supersedes the five original phase plans (Phase A–E) except Phase A (`2026-03-24-phase-a-sound-player.md`) which can be executed as-is.*
