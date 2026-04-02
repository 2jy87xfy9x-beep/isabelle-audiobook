# Phase B — Flask TTS Companion Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a minimal Flask server at `server/` exposing `/voice/speak`, `/voice/speak/split`, and `/api/config/voice` so the audiobook can use Kokoro TTS instead of browser `speechSynthesis`.

**Architecture:** Copy `C:\executor\routes\voice.py` into `server/routes/voice.py`, strip executor-only telemetry, adjust file paths. Wrap in a thin `server/app.py` with Flask-CORS enabled. Synthesis functions lazy-import Kokoro/Coqui so the server starts even when ML models are absent. Voice clone routes (`/voice/clone/*`) are included in `voice.py` but are Phase E scope — they are not wired to any UI here.

**Tech Stack:** Python 3.11+, Flask, flask-cors, kokoro (for Kokoro TTS), soundfile, numpy. Coqui (XTTS v2) optional — only needed for `my_voice` clone. pytest for server tests.

**Scope note:** Phase B of spec `2026-03-23-executor-voice-sound-translate-for-audiobook.md`. Phase C (frontend VoicePlayer) and Phase D (translate) depend on this server. Phase E (clone UI) depends on Phase B + Phase C.

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `server/app.py` | Flask factory, CORS config, register blueprints, entry point |
| Create | `server/routes/__init__.py` | Empty package marker |
| Create | `server/routes/voice.py` | Voice synthesis + config routes (adapted from executor) |
| Create | `server/voice_config.json` | Default voice config (seed file) |
| Create | `server/voices/` | Placeholder dir for Kokoro model `.pt` files |
| Create | `server/requirements.txt` | Python dependencies |
| Create | `server/tests/__init__.py` | Empty package marker |
| Create | `server/tests/test_voice_routes.py` | pytest — route integration tests (synthesis mocked) |

---

## Task 1: Create server scaffold

**Files:**
- Create: `server/app.py`
- Create: `server/routes/__init__.py`
- Create: `server/voice_config.json`
- Create: `server/requirements.txt`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p server/routes server/voices server/tests server/media
touch server/routes/__init__.py server/tests/__init__.py server/media/__init__.py
```

- [ ] **Step 2: Create `server/requirements.txt`**

```
flask>=3.0
flask-cors>=4.0
soundfile>=0.12
numpy>=1.26
kokoro>=0.9
# Optional — only for 'my_voice' clone:
# TTS>=0.22
# torch>=2.0
```

- [ ] **Step 3: Create `server/voice_config.json`**

```json
{
  "active_voice": "kokoro_af_heart",
  "speed": 1.0,
  "kokoro_model_path": "voices/kokoro/af_heart.pt",
  "chat_tts_enabled": false,
  "chat_autoplay": false,
  "wait_for_narration": false
}
```

- [ ] **Step 4: Create `server/app.py`**

```python
# server/app.py
import os
from pathlib import Path
from flask import Flask
from flask_cors import CORS

from routes.voice import voice_bp


def create_app() -> Flask:
    app = Flask(__name__)
    # Allow the static audiobook origin. Restrict to specific origin in production.
    CORS(app, origins="*", supports_credentials=False)
    app.register_blueprint(voice_bp)
    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    create_app().run(host="0.0.0.0", port=port, debug=True,
                     use_reloader=False, threaded=True)
```

- [ ] **Step 5: Install dependencies**

```bash
cd server && pip install -r requirements.txt
```

(If Kokoro is not yet installed, the install may error on `kokoro`; that is expected — voice synthesis will fail at runtime but tests will still pass via mocks.)

- [ ] **Step 6: Commit scaffold**

```bash
git add server/
git commit -m "feat: add server/ scaffold — Flask TTS companion (Phase B)"
```

---

## Task 2: Write failing tests for voice routes

**Files:**
- Create: `server/tests/test_voice_routes.py`

The tests mock the `_build_voice_wav` synthesis function so the Flask routes can be tested without Kokoro installed.

- [ ] **Step 1: Write the test file**

Create `server/tests/test_voice_routes.py`:

```python
import json
import pytest
from unittest.mock import patch, MagicMock

# Add server/ to sys.path so imports work when run from repo root.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


# ── /voice/speak ───────────────────────────────────────────────────────────

def test_speak_returns_wav_bytes(client):
    fake_wav = b"RIFF\x00\x00\x00\x00WAVEfmt "  # minimal WAV header stub
    with patch("routes.voice._build_voice_wav", return_value=fake_wav):
        res = client.post("/voice/speak",
                          json={"text": "Hello, Isabelle."})
    assert res.status_code == 200
    assert res.content_type == "audio/wav"
    assert res.data == fake_wav


def test_speak_rejects_missing_text(client):
    res = client.post("/voice/speak", json={})
    assert res.status_code == 400


def test_speak_rejects_oversized_text(client):
    res = client.post("/voice/speak", json={"text": "x" * 10_001})
    assert res.status_code == 400


def test_speak_passes_voice_and_speed(client):
    fake_wav = b"WAV"
    with patch("routes.voice._build_voice_wav", return_value=fake_wav) as mock_bvw:
        client.post("/voice/speak",
                    json={"text": "Test.", "voice": "kokoro_af_heart", "speed": 1.2})
    args, kwargs = mock_bvw.call_args
    assert args[1] == "kokoro_af_heart"
    assert abs(args[2] - 1.2) < 0.01


# ── /voice/speak/split ─────────────────────────────────────────────────────

def test_speak_split_returns_chunks(client):
    res = client.post("/voice/speak/split",
                      json={"text": "Hello world. This is a longer piece of text. " * 20})
    assert res.status_code == 200
    body = json.loads(res.data)
    assert "chunks" in body
    assert isinstance(body["chunks"], list)
    assert len(body["chunks"]) >= 1
    # Every chunk must be non-empty
    assert all(c.strip() for c in body["chunks"])


def test_speak_split_short_text_is_single_chunk(client):
    res = client.post("/voice/speak/split", json={"text": "Short."})
    assert res.status_code == 200
    body = json.loads(res.data)
    assert len(body["chunks"]) == 1


def test_speak_split_rejects_missing_text(client):
    res = client.post("/voice/speak/split", json={})
    assert res.status_code == 400


# ── /api/config/voice ──────────────────────────────────────────────────────

def test_config_get_returns_json(client):
    res = client.get("/api/config/voice")
    assert res.status_code == 200
    body = json.loads(res.data)
    assert "active_voice" in body
    assert "speed" in body


def test_config_post_merges_patch(client, tmp_path, monkeypatch):
    # Point config path to a temp file so tests don't clobber voice_config.json.
    cfg_file = tmp_path / "voice_config.json"
    cfg_file.write_text(json.dumps({"active_voice": "kokoro_af_heart", "speed": 1.0}))
    monkeypatch.setattr("routes.voice._VOICE_CONFIG_PATH", cfg_file)

    res = client.post("/api/config/voice", json={"speed": 1.5})
    assert res.status_code == 200
    body = json.loads(res.data)
    assert abs(body["speed"] - 1.5) < 0.01
    # Other keys survive the patch
    assert body["active_voice"] == "kokoro_af_heart"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && python -m pytest tests/test_voice_routes.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — `routes.voice` does not exist yet.

- [ ] **Step 3: Commit the test file**

```bash
git add server/tests/test_voice_routes.py
git commit -m "test: add failing voice route tests (Phase B)"
```

---

## Task 3: Create `server/routes/voice.py`

**Files:**
- Create: `server/routes/voice.py`

This is an adaptation of `C:\executor\routes\voice.py`. Key changes:
- Remove `from tools.relay.flask_reporter import reporter` and all `reporter.capture()` calls.
- Change `_VOICE_CONFIG_PATH` to a path relative to `server/`.
- Change `_VOICES_DIR` to a path relative to `server/`.
- Register as a Flask Blueprint instead of attaching to app directly.
- Keep all synthesis functions, constants, and split logic verbatim.

- [ ] **Step 1: Create `server/routes/voice.py`**

```python
# server/routes/voice.py
# Adapted from C:\executor\routes\voice.py.
# Changes: Blueprint registration; paths relative to server/; reporter removed.
import json
import logging
import re
import tempfile
import threading
import warnings
from contextlib import contextmanager
from pathlib import Path

from flask import Blueprint, Response, jsonify, request

log = logging.getLogger(__name__)

voice_bp = Blueprint("voice", __name__)

# ── Paths ──────────────────────────────────────────────────────────────────
_SERVER_DIR = Path(__file__).parent.parent
_VOICE_CONFIG_PATH = _SERVER_DIR / "voice_config.json"
_VOICES_DIR = _SERVER_DIR / "voices"

# ── Constants ──────────────────────────────────────────────────────────────
VOICE_SPEAK_MAX_CHARS = 10_000
VOICE_SPEAK_CHUNK_TARGET_DEFAULT = 900
VOICE_SPEAK_CHUNK_MIN = 200
VOICE_SPEAK_CHUNK_MAX = 4_000
_TTS_CHUNK_BOUNDARY = re.compile(
    r"(?<=[.!?\u3002\uff01\uff1f])\s+|\n\s*\n+", flags=re.UNICODE
)

_DEFAULT_CONFIG = {
    "active_voice": "kokoro_af_heart",
    "speed": 1.0,
    "kokoro_model_path": "voices/kokoro/af_heart.pt",
    "chat_tts_enabled": False,
    "chat_autoplay": False,
    "wait_for_narration": False,
}

# ── Custom exceptions ──────────────────────────────────────────────────────
class MyVoiceSynthesisError(Exception):
    pass

# ── Config helpers ─────────────────────────────────────────────────────────

def _deep_merge(base: dict, patch: dict) -> dict:
    result = dict(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(result.get(k), dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def _read_config() -> dict:
    try:
        raw = _VOICE_CONFIG_PATH.read_text(encoding="utf-8")
        return _deep_merge(_DEFAULT_CONFIG, json.loads(raw))
    except Exception:
        return dict(_DEFAULT_CONFIG)


def _write_config(cfg: dict) -> None:
    _VOICE_CONFIG_PATH.write_text(
        json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8"
    )

# ── Thread-safety for clone state ─────────────────────────────────────────
_clone_lock = threading.Lock()
_clone_state: dict = {"status": "idle", "error": None}
_coqui_lock = threading.Lock()
_coqui_tts = None

# ── Synthesis helpers ──────────────────────────────────────────────────────

@contextmanager
def _suppress_noisy_kokoro_torch_warnings():
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=FutureWarning, message=".*weight_norm.*")
        warnings.filterwarnings("ignore", category=UserWarning, message=".*Dropout.*")
        yield


def _synthesise_kokoro(text: str, model_path: str, speed: float) -> bytes:
    try:
        from kokoro import KPipeline  # type: ignore
        import numpy as np
        import soundfile as sf
        import io
    except ImportError as e:
        raise ImportError(f"Kokoro not installed: {e}. pip install kokoro soundfile numpy") from e

    abs_path = _VOICES_DIR / Path(model_path).name if not Path(model_path).is_absolute() else Path(model_path)
    with _suppress_noisy_kokoro_torch_warnings():
        pipeline = KPipeline(repo_id="hexgrad/Kokoro-82M", lang_code="a")
    samples = []
    for _, _, audio in pipeline(text, voice=str(abs_path), speed=speed, split_pattern=None):
        samples.append(audio)
    import numpy as np
    audio_np = np.concatenate(samples) if samples else np.zeros(0, dtype=np.float32)
    buf = io.BytesIO()
    import soundfile as sf
    sf.write(buf, audio_np, 24_000, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _get_coqui_tts():
    global _coqui_tts
    with _coqui_lock:
        if _coqui_tts is None:
            import os
            os.environ.setdefault("COQUI_TOS_AGREED", "1")
            os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")
            from TTS.api import TTS  # type: ignore
            _coqui_tts = TTS(
                model_name="tts_models/multilingual/multi-dataset/xtts_v2",
                gpu=False,
                progress_bar=False,
            )
    return _coqui_tts


def _synthesise_coqui(text: str, speaker_wav_path: str, speed: float) -> bytes:
    import tempfile, io, soundfile as sf  # type: ignore
    tts = _get_coqui_tts()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        tts.tts_to_file(text=text, speaker_wav=speaker_wav_path,
                        language="en", file_path=tmp_path)
        data, sr = sf.read(tmp_path)
        buf = io.BytesIO()
        sf.write(buf, data, sr, format="WAV", subtype="PCM_16")
        return buf.getvalue()
    except Exception as e:
        raise MyVoiceSynthesisError(str(e)) from e
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _build_voice_wav(text: str, voice: str | None, speed: float | None, cfg: dict) -> bytes:
    voice = voice or cfg.get("active_voice", "kokoro_af_heart")
    speed = speed if speed is not None else float(cfg.get("speed", 1.0))
    if voice == "my_voice":
        sample = _VOICES_DIR / "my_voice" / "sample.wav"
        if not sample.exists():
            raise MyVoiceSynthesisError("my_voice sample not found — record and build clone first")
        return _synthesise_coqui(text, str(sample), speed)
    model_path = cfg.get("kokoro_model_path", "voices/kokoro/af_heart.pt")
    return _synthesise_kokoro(text, model_path, speed)

# ── Text splitting ─────────────────────────────────────────────────────────

def _split_text_for_speak(text: str, max_chunk: int = VOICE_SPEAK_CHUNK_TARGET_DEFAULT) -> list[str]:
    max_chunk = max(VOICE_SPEAK_CHUNK_MIN, min(max_chunk, VOICE_SPEAK_CHUNK_MAX))
    spans = _TTS_CHUNK_BOUNDARY.split(text)
    chunks, current = [], ""
    for span in spans:
        span = span.strip()
        if not span:
            continue
        if len(span) > max_chunk:
            # Hard-split oversized span at word boundaries
            words, word_buf = span.split(), ""
            for w in words:
                if len(word_buf) + len(w) + 1 > max_chunk and word_buf:
                    if current:
                        chunks.append(current.strip())
                        current = ""
                    chunks.append(word_buf.strip())
                    word_buf = w
                else:
                    word_buf = (word_buf + " " + w).strip()
            if word_buf:
                span = word_buf
            else:
                continue
        if len(current) + len(span) + 1 <= max_chunk:
            current = (current + " " + span).strip()
        else:
            if current:
                chunks.append(current)
            current = span
    if current:
        chunks.append(current)
    return chunks or [text.strip()]

# ── Routes ─────────────────────────────────────────────────────────────────

@voice_bp.post("/voice/speak")
def voice_speak():
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify(error="text is required"), 400
    if len(text) > VOICE_SPEAK_MAX_CHARS:
        return jsonify(error=f"text exceeds {VOICE_SPEAK_MAX_CHARS} chars"), 400
    voice = body.get("voice") or None
    speed = body.get("speed")
    try:
        cfg = _read_config()
        wav = _build_voice_wav(text, voice, speed, cfg)
        return Response(wav, mimetype="audio/wav")
    except MyVoiceSynthesisError as e:
        return jsonify(error=str(e), code="NOT_CONFIGURED"), 400
    except (ImportError, RuntimeError) as e:
        log.error("TTS synthesis failed: %s", e)
        return jsonify(error=str(e)), 500


@voice_bp.post("/voice/speak/split")
def voice_speak_split():
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify(error="text is required"), 400
    max_chunk = int(body.get("max_chunk_chars") or VOICE_SPEAK_CHUNK_TARGET_DEFAULT)
    chunks = _split_text_for_speak(text, max_chunk)
    return jsonify(chunks=chunks)


@voice_bp.post("/voice/preview")
def voice_preview():
    return voice_speak()


@voice_bp.get("/api/config/voice")
def api_config_voice_get():
    return jsonify(_read_config())


@voice_bp.post("/api/config/voice")
def api_config_voice_post():
    patch = request.get_json(silent=True) or {}
    cfg = _deep_merge(_read_config(), patch)
    _write_config(cfg)
    return jsonify(cfg)


# ── Clone routes (Phase E UI — backend ready, no frontend yet) ─────────────

@voice_bp.post("/voice/clone/record")
def voice_clone_record():
    f = request.files.get("audio")
    if not f:
        return jsonify(error="audio file required"), 400
    dest = _VOICES_DIR / "my_voice"
    dest.mkdir(parents=True, exist_ok=True)
    f.save(dest / "sample.wav")
    return jsonify(status="saved")


@voice_bp.post("/voice/clone/build")
def voice_clone_build():
    with _clone_lock:
        if _clone_state["status"] == "building":
            return jsonify(status="building"), 202
        _clone_state.update({"status": "building", "error": None})

    def _run():
        try:
            _get_coqui_tts()  # warm-up loads the model
            with _clone_lock:
                _clone_state["status"] = "ready"
        except Exception as e:
            with _clone_lock:
                _clone_state.update({"status": "error", "error": str(e)})

    threading.Thread(target=_run, daemon=True).start()
    return jsonify(status="building"), 202


@voice_bp.get("/voice/clone/status")
def voice_clone_status():
    with _clone_lock:
        return jsonify(**_clone_state)
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd server && python -m pytest tests/test_voice_routes.py -v
```

Expected: all 9 tests pass (✓). Tests mock `_build_voice_wav` so Kokoro need not be installed.

- [ ] **Step 3: Commit**

```bash
git add server/routes/voice.py
git commit -m "feat: add Flask voice routes — speak, split, config (Phase B)"
```

---

## Task 4: Smoke-test the running server

- [ ] **Step 1: Start the server**

```bash
cd server && python app.py
```

Expected output: `Running on http://0.0.0.0:5001`

- [ ] **Step 2: Test config endpoint**

```bash
curl http://localhost:5001/api/config/voice
```

Expected: JSON with `active_voice`, `speed`, etc.

- [ ] **Step 3: Test split endpoint**

```bash
curl -s -X POST http://localhost:5001/voice/speak/split \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world. This is a test sentence. And another one."}' | python -m json.tool
```

Expected: `{"chunks": ["Hello world. This is a test sentence. And another one."]}` (one chunk — short text).

- [ ] **Step 4: Test speak endpoint (requires Kokoro installed)**

If Kokoro models are not yet installed, this will return 500 — that is expected. Skip if models absent.

```bash
curl -s -X POST http://localhost:5001/voice/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, Isabelle."}' -o /tmp/test.wav && file /tmp/test.wav
```

Expected: `RIFF ... WAVE audio`

- [ ] **Step 5: Commit smoke-test notes (optional)**

```bash
git commit --allow-empty -m "chore: Phase B server smoke-tested"
```

---

## Done

Phase B delivers a running Flask TTS server testable via pytest (with mocks) and curl (with Kokoro installed). Phase C (VoicePlayer ES module) connects to this server. Phase D (translate) extends this server with a translate route.

**Kokoro model setup** (run once, outside this plan):
```bash
# Download af_heart model into server/voices/kokoro/
mkdir -p server/voices/kokoro
# Follow kokoro documentation to download af_heart.pt
```
