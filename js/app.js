// js/app.js
// Wires all modules together. Entry point loaded by index.html.

import { loadBook, resolvePosition } from './loader.js';
import { renderBook, setCurrentParagraph, getParagraphEls } from './renderer.js';
import { Player } from './player.js';
import { initProgress, updateProgress, cancelSync } from './progress.js';
import { setMode as setFocusMode, applyMode } from './focusMode.js';
import { initEditor, openEditor, closeEditor, applyFormat } from './editor.js';
import { saveToGitHub } from './github.js';

let book = null;
let currentIndex = 0;
let player = null;

// ── Status banner ──────────────────────────────────────────────────────────
function showStatus(msg, type = 'info', durationMs = 3000) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `visible ${type}`;
  setTimeout(() => { el.className = ''; }, durationMs);
}

// ── Settings helpers ───────────────────────────────────────────────────────
function loadSettings() {
  const saved = {
    speed: parseFloat(localStorage.getItem('speed') || '1'),
    fontSize: parseInt(localStorage.getItem('fontSize') || '16'),
    theme: localStorage.getItem('theme') || 'dark',
    focusMode: localStorage.getItem('focusMode') || 'off',
    voice: localStorage.getItem('voice') || ''
  };

  document.getElementById('speed-range').value = saved.speed;
  document.getElementById('speed-label').textContent = `${saved.speed.toFixed(1)}×`;
  document.documentElement.style.setProperty('--font-size', `${saved.fontSize}px`);
  document.body.dataset.theme = saved.theme === 'light' ? 'light' : '';
  document.getElementById('focus-select').value = saved.focusMode;
  setFocusMode(saved.focusMode);

  document.getElementById('gh-owner').value = localStorage.getItem('gh_owner') || '';
  document.getElementById('gh-repo').value = localStorage.getItem('gh_repo') || 'isabelle-audiobook';
  document.getElementById('gh-token').value = localStorage.getItem('gh_token') || '';

  return saved;
}

// ── Advance current paragraph ──────────────────────────────────────────────
function goTo(index) {
  currentIndex = Math.max(0, Math.min(index, book.paragraphs.length - 1));
  const els = getParagraphEls();
  setCurrentParagraph(els, currentIndex);
  applyMode(currentIndex);
  updateProgress(currentIndex, book.paragraphs.length);
}

// ── Populate voice selector ────────────────────────────────────────────────
function populateVoices() {
  const sel = document.getElementById('voice-select');
  const voices = player.getVoices();
  const savedVoice = localStorage.getItem('voice') || '';
  sel.innerHTML = voices.map(v =>
    `<option value="${v.voiceURI}" ${v.voiceURI === savedVoice ? 'selected' : ''}>${v.name} (${v.lang})</option>`
  ).join('');
  if (savedVoice) player.setVoice(savedVoice);
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  // Check for speechSynthesis support
  if (!window.speechSynthesis) {
    document.getElementById('loading').textContent =
      'Your browser does not support text-to-speech. Try Chrome or Edge.';
    document.querySelectorAll('#toolbar button, #toolbar select').forEach(el => el.disabled = true);
    return;
  }

  // Load book
  try {
    book = await loadBook();
  } catch (e) {
    document.getElementById('loading').textContent =
      'Could not load book. Check your internet connection and reload.';
    return;
  }

  document.getElementById('loading').style.display = 'none';
  document.getElementById('book-title').textContent = `${book.title} — ${book.author}`;

  // Render
  const container = document.getElementById('paragraphs');
  renderBook(book, container, handleSingleClick, handleDoubleClick);

  // Restore position
  currentIndex = resolvePosition(book);

  // Init player
  const settings = loadSettings();
  player = new Player({
    onAdvance: (idx) => goTo(idx),
    onWord: (charIndex, charLen, idx) => {
      // best-effort word highlight — clear previous paragraph's mark first
      const els = getParagraphEls();
      if (idx > 0) {
        const prev = els[idx - 1];
        if (prev) prev.textContent = book.paragraphs[idx - 1].text;
      }
      const el = els[idx];
      if (!el) return;
      const text = book.paragraphs[idx].text;
      const before = text.slice(0, charIndex);
      const word = text.slice(charIndex, charIndex + charLen);
      const after = text.slice(charIndex + charLen);
      el.innerHTML = `${escHtml(before)}<mark>${escHtml(word)}</mark>${escHtml(after)}`;
    }
  });
  player.setData(book.paragraphs, currentIndex);
  player.setRate(settings.speed);

  // Populate voices (may fire after voiceschanged)
  populateVoices();
  window.speechSynthesis.addEventListener('voiceschanged', populateVoices);

  // Init other modules
  initProgress(book.paragraphs.length, syncPosition);
  // Note: setFocusMode was already called inside loadSettings() above — do NOT call it again here
  initEditor(book.paragraphs, () => player.pause());

  // Apply initial position
  goTo(currentIndex);

  // Wire toolbar events
  wireEvents(settings);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Event handlers ─────────────────────────────────────────────────────────
function handleSingleClick(index, el) {
  closeEditor();
  currentIndex = index;
  player.setIndex(index);
  goTo(index);
  if (player.playing) {
    player.pause();
    player.play();
  }
}

function handleDoubleClick(index, el) {
  openEditor(index, el);
}

async function syncPosition(index) {
  if (!book) return;
  book.lastPosition = index;
  book.lastPositionTimestamp = Date.now();
  try {
    await saveToGitHub(book);
  } catch (e) {
    // silent fail for background sync — errors only shown on explicit save
  }
}

function wireEvents(settings) {
  // Playback
  document.getElementById('btn-play').onclick = () => { closeEditor(); player.play(); };
  document.getElementById('btn-pause').onclick = () => player.pause();
  document.getElementById('btn-stop').onclick = () => { player.stop(); goTo(0); };
  document.getElementById('btn-prev').onclick = () => player.skipPrev();
  document.getElementById('btn-next').onclick = () => player.skipNext();

  // Speed
  document.getElementById('speed-range').oninput = (e) => {
    const v = parseFloat(e.target.value);
    player.setRate(v);
    document.getElementById('speed-label').textContent = `${v.toFixed(1)}×`;
    localStorage.setItem('speed', v);
  };

  // Voice
  document.getElementById('voice-select').onchange = (e) => {
    player.setVoice(e.target.value);
    localStorage.setItem('voice', e.target.value);
  };

  // Font size
  let fontSize = settings.fontSize;
  document.getElementById('btn-font-dec').onclick = () => {
    fontSize = Math.max(12, fontSize - 2);
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`);
    localStorage.setItem('fontSize', fontSize);
  };
  document.getElementById('btn-font-inc').onclick = () => {
    fontSize = Math.min(24, fontSize + 2);
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`);
    localStorage.setItem('fontSize', fontSize);
  };

  // Focus mode
  document.getElementById('focus-select').onchange = (e) => {
    setFocusMode(e.target.value);
    localStorage.setItem('focusMode', e.target.value);
  };

  // Theme
  document.getElementById('btn-theme').onclick = () => {
    const isLight = document.body.dataset.theme === 'light';
    document.body.dataset.theme = isLight ? '' : 'light';
    localStorage.setItem('theme', isLight ? 'dark' : 'light');
  };

  // Save — cancel any pending background sync to avoid SHA race, then save directly
  document.getElementById('btn-save').onclick = async () => {
    if (!book) return;
    book.lastPosition = currentIndex;
    book.lastPositionTimestamp = Date.now();
    cancelSync(); // prevent debounced sync from racing with this explicit save
    try {
      await saveToGitHub(book);
      showStatus('Saved to GitHub ✓', 'success');
    } catch (e) {
      if (e.message === 'missing_config') {
        showStatus('Enter your GitHub details in Settings first.', 'error', 5000);
      } else if (e.message === 'bad_token') {
        showStatus('Save failed. Check your GitHub token in Settings. Also check that your repo is set to Public.', 'error', 6000);
      } else if (e.message === 'rate_limited') {
        showStatus('Too many saves. Please wait a minute and try again.', 'error', 5000);
      } else {
        showStatus(`Save failed: ${e.message}`, 'error', 5000);
      }
    }
  };

  // Settings panel
  document.getElementById('btn-settings').onclick = () =>
    document.getElementById('settings-panel').classList.add('visible');
  document.getElementById('btn-settings-close').onclick = () =>
    document.getElementById('settings-panel').classList.remove('visible');
  document.getElementById('btn-save-settings').onclick = () => {
    localStorage.setItem('gh_owner', document.getElementById('gh-owner').value.trim());
    localStorage.setItem('gh_repo', document.getElementById('gh-repo').value.trim());
    localStorage.setItem('gh_token', document.getElementById('gh-token').value.trim());
    document.getElementById('settings-panel').classList.remove('visible');
    showStatus('Settings saved ✓', 'success');
  };

  // Formatting toolbar
  document.getElementById('fmt-bold').onclick = () => applyFormat('bold');
  document.getElementById('fmt-italic').onclick = () => applyFormat('italic');
  document.getElementById('fmt-underline').onclick = () => applyFormat('underline');
  document.getElementById('fmt-color').oninput = (e) => applyFormat('color', e.target.value);
  document.getElementById('fmt-font').onchange = (e) => applyFormat('fontFamily', e.target.value);
  document.getElementById('fmt-indent').onchange = (e) => applyFormat('indent', e.target.value);
  document.getElementById('fmt-type').onchange = (e) => applyFormat('type', e.target.value);
  document.getElementById('fmt-close').onclick = () => closeEditor();

  // Close editor on click outside
  document.addEventListener('click', (e) => {
    const tb = document.getElementById('fmt-toolbar');
    const activeEl = document.querySelector('[contenteditable="true"]');
    if (activeEl && !activeEl.contains(e.target) && !tb.contains(e.target)) {
      closeEditor();
    }
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
init();
