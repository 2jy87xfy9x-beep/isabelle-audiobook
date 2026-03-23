import { loadData, resolvePosition, loadLocalPosition } from './loader.js';
import {
  buildAliasMap,
  buildSortedAliases,
  renderLetterMeta,
  renderViewSwitcher,
  renderLetterBody,
  renderLetterNav,
} from './renderer.js';
import { Player } from './player.js';
import { initProgress, savePosition, cancelSync } from './progress.js';
import { setMode as setFocusMode, applyMode, initFocusMode } from './focusMode.js';
import { initSync, syncToLetter, activateEntry } from './sync.js';
import {
  initEditor,
  openInlineEdit,
  closeInlineEdit,
  applyInlineFormat,
  attachLongPress,
  isEditorUnlocked,
  renderMappingEditor,
} from './editor.js';
import { exportLetters } from './exporter.js';
import {
  renderTogglePanel,
  initKeyboardNav,
  showFeedback,
  showUndoNav,
  updateNarratorLine,
  initSmartScroll,
  isEnabled,
} from './smartFeatures.js';
import { saveToGitHub } from './github.js';

const LS = (k) => `isabelle-v2-${k}`;

let book = null;
let context = null;
let letters = [];
let contextIndex = {};
let currentLetterIdx = 0;
let sortedAliases = [];
let activeView = 'plain_english';
let player = null;
let rangeModeActive = false;
let rangeStart = null;
const narratorModes = ['letters', 'context', 'both', 'silent'];
let narratorModeIndex = 0;

function currentLetter() {
  return letters[currentLetterIdx];
}

function letterViewKey(letter) {
  const memKey = LS(`view-memory-${letter.id}`);
  return localStorage.getItem(memKey) || activeView;
}

function paragraphSourceForPlayer(letter, viewKey) {
  if (viewKey === 'photocopy' || viewKey === 'handwriting_style') {
    return letter.views?.original_french || letter.views?.plain_english || '';
  }
  return letter.views?.[viewKey] || letter.views?.plain_english || '';
}

function refreshPlayerData() {
  if (!player) return;
  const letter = currentLetter();
  if (!letter) return;
  const vk = letterViewKey(letter);
  const text = paragraphSourceForPlayer(letter, vk);
  const paras = text.split(/\n\n+/).filter(Boolean).map((t) => ({ text: t }));
  player.setData({
    paragraphs: paras,
    sortedAliases,
    contextEntries: contextIndex,
  });
  player.setMode(narratorModes[narratorModeIndex] || 'letters');
  const bodyParas = document.querySelectorAll('.letter-paragraph');
  initFocusMode([...bodyParas]);
  applyMode(0);
}

async function init() {
  if (!window.speechSynthesis) {
    document.getElementById('loading').textContent =
      'Your browser does not support text-to-speech. Try Chrome or Edge.';
    return;
  }

  let data;
  try {
    data = await loadData();
  } catch {
    document.getElementById('loading').textContent =
      'Could not load book. Check your connection and reload.';
    return;
  }

  book = data.book;
  context = data.context;
  letters = book.letters;
  contextIndex = Object.fromEntries((context.entries || []).map((e) => [e.id, e]));

  const aliasMap = buildAliasMap(context.entries || []);
  sortedAliases = buildSortedAliases(aliasMap);

  activeView =
    localStorage.getItem(LS('view-default')) || book.defaultView || 'plain_english';
  document.documentElement.dataset.theme =
    localStorage.getItem(LS('theme')) || 'dark';
  document.documentElement.style.setProperty(
    '--font-size',
    `${localStorage.getItem(LS('font-size')) || '16'}px`
  );

  const localPos = loadLocalPosition();
  const resolvedPos = resolvePosition(localPos, book.lastPosition);
  currentLetterIdx = Math.max(
    0,
    letters.findIndex((l) => l.id === resolvedPos?.letter_id)
  );
  if (currentLetterIdx < 0) currentLetterIdx = 0;

  buildSidebar();
  renderCurrentLetter();

  document.getElementById('loading').style.display = 'none';

  initPlayer();
  initProgress(() => book);
  initSync({
    contextPanel: document.getElementById('context-content'),
    contextEntries: contextIndex,
    onEntryActivate: renderContextEntry,
  });
  initEditor({
    onPause: () => player?.pause(),
    onSave: () => saveAll(),
  });
  initKeyboardNav({
    onPrev: () => goToLetter(currentLetterIdx - 1),
    onNext: () => goToLetter(currentLetterIdx + 1),
    onToggleContext: toggleContextPanel,
    onToggleChrome: toggleChrome,
    onPeek: () => {},
    onRangeCopy: toggleRangeMode,
  });
  initSmartScroll(document.getElementById('letter-content'));

  const sfPanel = document.getElementById('smart-features-panel');
  sfPanel.innerHTML = '';
  sfPanel.appendChild(renderTogglePanel(document));

  wireControls();

  const storedMode = localStorage.getItem(LS('narrator-mode'));
  if (storedMode) {
    const i = narratorModes.indexOf(storedMode);
    if (i >= 0) narratorModeIndex = i;
  }
}

function renderCurrentLetter() {
  const letter = currentLetter();
  if (!letter) return;
  const container = document.getElementById('letter-content');
  container.innerHTML = '';

  const vk = letterViewKey(letter);

  const meta = renderLetterMeta(letter, document);
  const numEl = meta.querySelector('[data-letter-number]');
  attachLongPress(numEl, () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'E', shiftKey: true, bubbles: true })
    )
  );
  container.appendChild(meta);

  const viewSwitcher = renderViewSwitcher(
    letter,
    vk,
    (view) => {
      localStorage.setItem(LS(`view-memory-${letter.id}`), view);
      renderCurrentLetter();
    },
    document
  );
  container.appendChild(viewSwitcher);

  const body = renderLetterBody(letter, vk, sortedAliases, document);
  body.querySelectorAll('.ctx-ref').forEach((span) => {
    span.addEventListener('click', () => {
      activateEntry(span.dataset.refId, { pulse: true });
      openContextPanel();
      renderContextEntry(span.dataset.refId);
    });
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        span.click();
      }
    });
  });
  body.querySelectorAll('.letter-paragraph').forEach((p, i) => {
    p.addEventListener('click', () => handleParaClick(p, i));
    p.addEventListener('dblclick', () => openInlineEdit(p));
    attachLongPress(p, () => openInlineEdit(p));
  });
  container.appendChild(body);

  const nav = renderLetterNav(
    letter,
    letters.length,
    () => goToLetter(currentLetterIdx - 1),
    () => goToLetter(currentLetterIdx + 1),
    document
  );
  container.appendChild(nav);

  document.querySelectorAll('.nav-letter').forEach((el) => {
    el.classList.toggle('active', el.dataset.letterId === letter.id);
  });

  syncToLetter(letter);
  refreshPlayerData();

  savePosition({
    letter_id: letter.id,
    paragraph_index: 0,
    scroll_offset: 0,
    active_view: vk,
    timestamp: Date.now(),
  });
}

function goToLetter(idx, { addUndo = true } = {}) {
  const prev = currentLetterIdx;
  currentLetterIdx = Math.max(0, Math.min(idx, letters.length - 1));
  const next = currentLetter();
  if (!next?.complete) {
    const forward = idx > prev;
    let step = forward ? 1 : -1;
    let guard = 0;
    while (guard++ < letters.length && !letters[currentLetterIdx]?.complete) {
      currentLetterIdx = Math.max(0, Math.min(currentLetterIdx + step, letters.length - 1));
    }
  }
  if (addUndo && isEnabled('undo-navigation')) {
    showUndoNav(`← Letter ${letters[prev]?.letter_number ?? prev + 1}`, () =>
      goToLetter(prev, { addUndo: false })
    );
  }
  rangeStart = null;
  renderCurrentLetter();
}

function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = '';
  for (const ch of book.chapters) {
    const heading = document.createElement('div');
    heading.className = 'nav-chapter-heading';
    heading.textContent = ch.title;
    nav.appendChild(heading);
    const chLetters = letters.filter((l) => l.chapter_id === ch.id);
    chLetters.forEach((letter) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-letter' + (letter.complete ? '' : ' placeholder');
      btn.dataset.letterId = letter.id;
      btn.setAttribute('role', 'listitem');
      btn.textContent = letter.date_display
        ? `${letter.letter_number}. ${letter.date_display}`
        : `${letter.letter_number}. — not yet added`;
      if (!letter.complete) btn.disabled = true;
      btn.title = btn.textContent;
      btn.addEventListener('click', () => {
        goToLetter(letters.indexOf(letter));
        closeSidebar();
      });
      nav.appendChild(btn);
    });
  }
}

function openContextPanel() {
  const pane = document.getElementById('context-pane');
  pane.classList.remove('collapsed');
  pane.classList.add('open');
}

function closeContextPanel() {
  const pane = document.getElementById('context-pane');
  pane.classList.add('collapsed');
  pane.classList.remove('open');
}

function toggleContextPanel() {
  const pane = document.getElementById('context-pane');
  if (pane.classList.contains('collapsed')) openContextPanel();
  else closeContextPanel();
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
  sub.textContent = entry.short || '';
  container.appendChild(h2);
  container.appendChild(sub);
  if (entry.images?.length) {
    entry.images
      .filter((img) => img.url)
      .forEach((img) => {
        const figure = document.createElement('figure');
        const image = document.createElement('img');
        image.src = img.url;
        image.alt = img.alt || '';
        image.style.cssText = 'max-width:100%;margin-bottom:6px';
        const cap = document.createElement('figcaption');
        cap.style.cssText = 'font-size:.62rem;color:var(--text-d)';
        cap.textContent = img.caption || '';
        figure.appendChild(image);
        figure.appendChild(cap);
        container.appendChild(figure);
      });
  }
  for (const para of entry.content || []) {
    const p = document.createElement('p');
    p.style.cssText =
      'font-family:var(--book-font);font-size:.88rem;line-height:1.75;color:var(--text-m);margin-bottom:12px';
    p.textContent = para.text;
    container.appendChild(p);
  }
  if (isEditorUnlocked()) {
    const mapEditor = renderMappingEditor(
      {
        letter: currentLetter(),
        contextEntries: contextIndex,
        onLink: (id) => {
          const L = currentLetter();
          if (!L.contextRefs.includes(id)) L.contextRefs.push(id);
          if (!contextIndex[id].letterRefs.includes(L.id))
            contextIndex[id].letterRefs.push(L.id);
          showFeedback('Connection added');
        },
        onUnlink: (id) => {
          const L = currentLetter();
          L.contextRefs = L.contextRefs.filter((r) => r !== id);
          contextIndex[id].letterRefs = contextIndex[id].letterRefs.filter(
            (x) => x !== L.id
          );
          showFeedback('Connection removed');
        },
        onCreate: (name, wrap) => {
          showFeedback(`Creating entry: ${name}`);
          wrap.remove();
        },
      },
      document
    );
    container.appendChild(mapEditor);
  }
}

function initPlayer() {
  player = new Player({
    onParagraphAdvance: (idx) => {
      const total = player._paragraphs?.length || 1;
      updateNarratorLine(idx, total);
      document.querySelectorAll('.letter-paragraph.current').forEach((p) =>
        p.classList.remove('current')
      );
      const el = document.querySelector(`.letter-paragraph[data-paragraph-index="${idx}"]`);
      if (el) el.classList.add('current');
    },
    onWord: () => {},
    onEnd: () => {
      document.getElementById('btn-play').textContent = '▶';
    },
    onContextSnippet: (id) => {
      activateEntry(id, { pulse: true });
      renderContextEntry(id);
    },
  });

  function populateVoiceSelectors() {
    const voices = window.speechSynthesis.getVoices();
    const lv = localStorage.getItem(LS('letter-voice')) || '';
    const cv = localStorage.getItem(LS('context-voice')) || '';
    const esc = (s) =>
      String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const opts = voices
      .map((v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`)
      .join('');
    const lvSel = document.getElementById('letter-voice-select');
    const cvSel = document.getElementById('context-voice-select');
    lvSel.innerHTML = opts;
    cvSel.innerHTML = opts;
    if (lv) lvSel.value = lv;
    if (cv) cvSel.value = cv;
    player.setLetterVoice(lvSel.value);
    player.setContextVoice(cvSel.value);
    lvSel.onchange = () => {
      player.setLetterVoice(lvSel.value);
      localStorage.setItem(LS('letter-voice'), lvSel.value);
    };
    cvSel.onchange = () => {
      player.setContextVoice(cvSel.value);
      localStorage.setItem(LS('context-voice'), cvSel.value);
    };
  }

  if (window.speechSynthesis.getVoices().length) populateVoiceSelectors();
  else player.autoSelectVoices();
  window.speechSynthesis.addEventListener('voiceschanged', populateVoiceSelectors);

  refreshPlayerData();
}

function handleParaClick(el, paraIdx) {
  if (rangeModeActive) {
    handleRangeClick(el);
    return;
  }
  player?.setIndex(paraIdx);
  document.querySelectorAll('.letter-paragraph.current').forEach((p) =>
    p.classList.remove('current')
  );
  el.classList.add('current');
}

function toggleRangeMode() {
  rangeModeActive = !rangeModeActive;
  document.body.classList.toggle('range-mode', rangeModeActive);
  rangeStart = null;
  document.querySelectorAll('.rp-start,.rp-end').forEach((el) => {
    el.classList.remove('rp-start', 'rp-end');
  });
}

function handleRangeClick(el) {
  if (!rangeStart) {
    rangeStart = el;
    el.classList.add('rp-start');
  } else {
    el.classList.add('rp-end');
    const text = [rangeStart.textContent, el.textContent].join(' … ');
    navigator.clipboard.writeText(text).then(() => {
      showFeedback('Copied');
      toggleRangeMode();
    });
  }
}

function closeSidebar() {
  const s = document.getElementById('sidebar');
  s.classList.add('collapsed');
  s.classList.remove('open');
}

function toggleSidebar() {
  const s = document.getElementById('sidebar');
  s.classList.toggle('collapsed');
  s.classList.toggle('open');
}

function toggleChrome() {
  document.getElementById('bottom-bar').classList.toggle('collapsed');
}

async function saveAll() {
  cancelSync();
  const letter = currentLetter();
  if (letter) {
    book.lastPosition = {
      letter_id: letter.id,
      paragraph_index: 0,
      scroll_offset: 0,
      active_view: letterViewKey(letter),
      timestamp: Date.now(),
    };
  }
  try {
    await saveToGitHub('book.json', book);
    await saveToGitHub('context.json', context);
    showFeedback(
      'Saved. Changes will appear after a short delay — hard-refresh if needed (Ctrl+Shift+R).'
    );
  } catch (e) {
    const msgs = {
      missing_config: 'Enter your GitHub token in settings.',
      bad_token: 'Save failed. Check token — repo must be Public.',
      rate_limited: 'Too many saves. Wait a minute.',
      sha_conflict: 'Save conflict — reload and try again.',
      get_failed: 'Could not reach GitHub. Try again when connected.',
    };
    showFeedback(msgs[e.code] || `Save failed: ${e.message}`);
  }
}

function wireControls() {
  const btnPlay = document.getElementById('btn-play');
  btnPlay.addEventListener('click', () => {
    closeInlineEdit();
    if (player.playing) {
      player.pause();
      btnPlay.textContent = '▶';
    } else {
      refreshPlayerData();
      player.play();
      btnPlay.textContent = '⏸';
    }
  });

  document.getElementById('btn-stop').addEventListener('click', () => {
    player.stop();
    btnPlay.textContent = '▶';
  });
  document.getElementById('btn-prev').addEventListener('click', () => player.skipPrev());
  document.getElementById('btn-next').addEventListener('click', () => player.skipNext());
  document.getElementById('btn-sidebar').addEventListener('click', toggleSidebar);
  document.getElementById('btn-context').addEventListener('click', toggleContextPanel);
  document.getElementById('btn-theme').addEventListener('click', () => {
    const light = document.documentElement.dataset.theme === 'light';
    document.documentElement.dataset.theme = light ? 'dark' : 'light';
    localStorage.setItem(LS('theme'), light ? 'dark' : 'light');
  });
  document.getElementById('btn-save').addEventListener('click', () => saveAll());

  const smartPanel = document.getElementById('smart-features-panel');
  document.getElementById('btn-smart').addEventListener('click', () => {
    smartPanel.classList.toggle('open');
    if (smartPanel.classList.contains('open')) smartPanel.focus();
  });
  document.getElementById('btn-range-copy').addEventListener('click', toggleRangeMode);
  document.getElementById('pull-strip').addEventListener('click', () =>
    document.getElementById('bottom-bar').classList.remove('collapsed')
  );
  document.getElementById('pull-strip').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ')
      document.getElementById('bottom-bar').classList.remove('collapsed');
  });

  document.getElementById('btn-narrator').addEventListener('click', () => {
    narratorModeIndex = (narratorModeIndex + 1) % narratorModes.length;
    const m = narratorModes[narratorModeIndex];
    localStorage.setItem(LS('narrator-mode'), m);
    player.setMode(m);
    showFeedback(`Narrator: ${m}`);
  });

  let fs = parseInt(localStorage.getItem(LS('font-size')) || '16', 10);
  document.getElementById('btn-font-dec').addEventListener('click', () => {
    fs = Math.max(14, fs - 2);
    document.documentElement.style.setProperty('--font-size', `${fs}px`);
    localStorage.setItem(LS('font-size'), String(fs));
  });
  document.getElementById('btn-font-inc').addEventListener('click', () => {
    fs = Math.min(28, fs + 2);
    document.documentElement.style.setProperty('--font-size', `${fs}px`);
    localStorage.setItem(LS('font-size'), String(fs));
  });

  const spd = document.getElementById('speed-range');
  spd.value = localStorage.getItem(LS('speed')) || '1';
  document.getElementById('speed-label').textContent = `${parseFloat(spd.value).toFixed(1)}×`;
  spd.addEventListener('input', () => {
    const r = parseFloat(spd.value);
    player.setRate(r);
    document.getElementById('speed-label').textContent = `${r.toFixed(1)}×`;
    localStorage.setItem(LS('speed'), spd.value);
  });

  document.getElementById('btn-export').addEventListener('click', () =>
    document.getElementById('export-panel').classList.toggle('open')
  );
  buildExportPanel();

  const focusModes = ['off', 'reveal', 'spotlight', 'fade_ahead', 'page'];
  let fmIdx = focusModes.indexOf(localStorage.getItem(LS('focus-mode')) || 'off');
  if (fmIdx < 0) fmIdx = 0;
  document.getElementById('btn-focus').addEventListener('click', () => {
    fmIdx = (fmIdx + 1) % focusModes.length;
    const m = focusModes[fmIdx];
    setFocusMode(m);
    localStorage.setItem(LS('focus-mode'), m);
    document.body.classList.toggle('page-mode', m === 'page');
    showFeedback(`Mode: ${m}`);
  });

  document.addEventListener('escape-pressed', () => {
    smartPanel.classList.remove('open');
    document.getElementById('export-panel').classList.remove('open');
    closeInlineEdit();
    if (rangeModeActive) toggleRangeMode();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (smartPanel.classList.contains('open')) {
        smartPanel.classList.remove('open');
        e.preventDefault();
      }
    }
  });

  document.addEventListener('export-failed', () =>
    showFeedback('Export failed. Try a smaller selection or reload.')
  );
}

function buildExportPanel() {
  const panel = document.getElementById('export-panel');
  panel.innerHTML = `
    <div class="export-row" id="exp-scope">
      <button type="button" class="export-btn active" data-scope="this-letter">this letter</button>
      <button type="button" class="export-btn" data-scope="all-letters">all letters</button>
      <button type="button" class="export-btn" data-scope="selection">selection</button>
      <button type="button" class="export-btn" data-scope="full-book">full book</button>
    </div>
    <div class="export-row" id="exp-view">
      <button type="button" class="export-btn active" data-view="plain_english">anglais</button>
      <button type="button" class="export-btn" data-view="original_french">vieux fr</button>
      <button type="button" class="export-btn" data-view="modern_french">fr moderne</button>
      <button type="button" class="export-btn" data-view="all">all views</button>
    </div>
    <div class="export-row" id="exp-format">
      <button type="button" class="export-btn" data-format="html">html</button>
      <button type="button" class="export-btn" data-format="print">print / pdf</button>
      <button type="button" class="export-btn" data-format="plain-text">plain text</button>
    </div>
  `;

  let selectedScope = 'this-letter';
  let selectedView = 'plain_english';

  panel.querySelectorAll('[data-scope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-scope]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedScope = btn.dataset.scope;
    });
  });
  panel.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedView = btn.dataset.view;
    });
  });
  panel.querySelectorAll('[data-format]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const letter = currentLetter();
      let subset;
      if (selectedScope === 'this-letter') subset = [letter];
      else if (selectedScope === 'all-letters' || selectedScope === 'full-book')
        subset = letters.filter((l) => l.complete);
      else subset = [letter];

      exportLetters({
        letters: subset,
        scope: selectedScope,
        view: selectedView === 'all' ? 'all' : selectedView,
        format: btn.dataset.format,
        selectionText: window.getSelection()?.toString() || '',
      });
      panel.classList.remove('open');
      showFeedback('Exported');
    });
  });
}

window._editor = { applyInlineFormat, closeInlineEdit };

init();
