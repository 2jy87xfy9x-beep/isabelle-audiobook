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
  toggleEditorMode,
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
  guardianHighlight,
  guardianSummary,
} from './smartFeatures.js';
import { saveToGitHub } from './github.js';

const LS = (k) => `isabelle-v2-${k}`;

let book = null;
let context = null;
let fiction = null;
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
  fiction = data.fiction || { gap_scenes: [], letter_reimaginings: [] };
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

  applyLayoutFromStorage();
  buildSidebar();
  syncSidebarRevealFocus();
  document.getElementById('loading').style.display = 'none';
  renderCurrentLetter();

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
  initPanelResize();
  initBottomBarResize();
  initTooltipPositioning();
  window.addEventListener('resize', syncSidebarRevealFocus);

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

  // Letter Integrity Guardian — highlight artefacts when feature is enabled
  if (isEnabled('letter-guardian')) {
    const rawText = letter.views?.original_french || '';
    guardianHighlight(body, rawText, document);
    const summary = guardianSummary(rawText);
    let banner = document.getElementById('guardian-banner');
    if (summary) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'guardian-banner';
        banner.className = 'guardian-banner';
        container.prepend(banner);
      }
      banner.textContent = `⚠ Integrity issues in original_french: ${summary}`;
      banner.hidden = false;
    } else if (banner) {
      banner.hidden = true;
    }
  }

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
  renderTrackBar();

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

function isMobileLayout() {
  return window.matchMedia('(max-width:767px)').matches;
}

function buildSidebar() {
  const headLbl = document.getElementById('sidebar-head-label');
  if (headLbl) {
    if (book.chapters?.length === 1) {
      const t = book.chapters[0].title || '';
      headLbl.textContent = t.length > 42 ? `${t.slice(0, 40)}…` : t || 'Letters';
    } else {
      headLbl.textContent = 'Letters';
    }
  }
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
      btn.dataset.tip = btn.textContent;
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

// ── Book 2 track management ───────────────────────────────────────────────────

const BOOK2_TRACKS = [
  { id: 'contextual',        label: 'Contextual' },
  { id: 'brief',             label: 'Brief' },
  { id: 'encyclopedic',      label: 'Encyclopedic' },
  { id: 'fiction-gaps',      label: 'Fiction: Gaps' },
  { id: 'fiction-letters',   label: 'Fiction: Letters' },
];
const BOOK2_TRACK_KEY        = 'isabelle-v2-book2-track';
const BOOK2_TRACK_LETTER_KEY = (id) => `isabelle-v2-book2-track-${id}`;

function getBook2Track(letterId) {
  return localStorage.getItem(BOOK2_TRACK_LETTER_KEY(letterId))
    || localStorage.getItem(BOOK2_TRACK_KEY)
    || 'contextual';
}

function setBook2TrackGlobal(trackId) {
  localStorage.setItem(BOOK2_TRACK_KEY, trackId);
  renderTrackBar();
  const letter = currentLetter();
  if (letter) renderContextPane(letter.id);
}

function setBook2TrackLocal(letterId, trackId) {
  localStorage.setItem(BOOK2_TRACK_LETTER_KEY(letterId), trackId);
  renderTrackBar();
  renderContextPane(letterId);
}

function renderTrackBar() {
  const bar = document.getElementById('context-track-bar');
  if (!bar) return;
  const letter   = currentLetter();
  const letterId = letter?.id;
  const global   = localStorage.getItem(BOOK2_TRACK_KEY) || 'contextual';
  const local    = letterId ? localStorage.getItem(BOOK2_TRACK_LETTER_KEY(letterId)) : null;
  const active   = local || global;

  bar.innerHTML = '';

  // Global track pills
  const globalRow = document.createElement('div');
  globalRow.className = 'track-row track-row-global';
  for (const t of BOOK2_TRACKS) {
    if (!isEnabled('fiction-tracks') && t.id.startsWith('fiction')) continue;
    const btn = document.createElement('button');
    btn.className = 'track-pill' + (t.id === global ? ' global-active' : '') + (t.id === active ? ' active' : '');
    btn.textContent = t.label;
    btn.dataset.track = t.id;
    btn.dataset.tip = 'Set as default track';
    btn.addEventListener('click', () => setBook2TrackGlobal(t.id));
    globalRow.appendChild(btn);
  }
  bar.appendChild(globalRow);

  // Per-letter override row (only if a letter is loaded)
  if (letterId) {
    const localRow = document.createElement('div');
    localRow.className = 'track-row track-row-local';
    const lbl = document.createElement('span');
    lbl.className = 'track-override-label';
    lbl.textContent = 'This letter:';
    localRow.appendChild(lbl);
    for (const t of BOOK2_TRACKS) {
      if (!isEnabled('fiction-tracks') && t.id.startsWith('fiction')) continue;
      const btn = document.createElement('button');
      btn.className = 'track-pill track-pill-sm' + (t.id === local ? ' local-active' : '') + (t.id === active ? ' active' : '');
      btn.textContent = t.label;
      btn.dataset.track = t.id;
      btn.dataset.tip = local === t.id ? 'Clear this override' : 'Override for this letter';
      btn.addEventListener('click', () => {
        if (local === t.id) {
          localStorage.removeItem(BOOK2_TRACK_LETTER_KEY(letterId));
          renderTrackBar();
          renderContextPane(letterId);
        } else {
          setBook2TrackLocal(letterId, t.id);
        }
      });
      localRow.appendChild(btn);
    }
    bar.appendChild(localRow);
  }
}

function renderContextPane(letterId) {
  const track = getBook2Track(letterId);
  if (track === 'fiction-gaps' || track === 'fiction-letters') {
    renderFictionContent(track, letterId);
  } else {
    // show last activated entity entry, or letter-linked entries
    const letter = letters.find(l => l.id === letterId);
    const refs = letter?.contextRefs || [];
    if (refs.length > 0) renderContextEntry(refs[0]);
    else {
      const container = document.getElementById('context-content');
      container.innerHTML = '';
      const p = document.createElement('p');
      p.style.cssText = 'font-size:.75rem;color:var(--text-d);font-style:italic;margin-top:8px';
      p.textContent = 'Click a highlighted word in the letter to open a context entry.';
      container.appendChild(p);
    }
  }
}

function renderFictionContent(track, letterId) {
  if (!isEnabled('fiction-tracks')) return;
  const container = document.getElementById('context-content');
  container.innerHTML = '';

  // Fiction header
  const badge = document.createElement('div');
  badge.className = 'fiction-badge';
  badge.textContent = 'FICTION';
  container.appendChild(badge);
  const disclaimer = document.createElement('p');
  disclaimer.className = 'fiction-disclaimer';
  disclaimer.textContent = 'Historical fiction — imaginative reconstruction, not fact';
  container.appendChild(disclaimer);

  let text = '';
  let title = '';

  if (track === 'fiction-gaps') {
    const scene = fiction?.gap_scenes?.find(s => s.after_letter === letterId);
    text  = scene?.text  || '';
    title = scene?.title || '';
  } else {
    const reim = fiction?.letter_reimaginings?.find(r => r.letter_id === letterId);
    text = reim?.text || '';
  }

  if (title) {
    const h3 = document.createElement('h3');
    h3.className = 'fiction-title';
    h3.textContent = title;
    container.appendChild(h3);
  }

  if (!text) {
    const notice = document.createElement('p');
    notice.style.cssText = 'font-size:.75rem;color:var(--text-d);font-style:italic;margin-top:8px';
    notice.textContent = track === 'fiction-gaps'
      ? 'No gap scene written yet for this letter.'
      : 'No reimagining written yet for this letter.';
    container.appendChild(notice);
    return;
  }

  for (const para of text.split(/\n\n+/).filter(Boolean)) {
    const p = document.createElement('p');
    p.className = 'fiction-paragraph';
    p.textContent = para;
    container.appendChild(p);
  }
}

function renderContextEntry(entryId) {
  const entry = contextIndex[entryId];
  if (!entry) return;

  // Check if current track is fiction — if so, show fiction content instead
  const letter   = currentLetter();
  const track    = letter ? getBook2Track(letter.id) : 'contextual';
  if (track === 'fiction-gaps' || track === 'fiction-letters') {
    renderFictionContent(track, letter.id);
    return;
  }

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

  // Read from the correct depth array (schema_version 3) or fall back to legacy `content`
  const depthKey = `content_${track}`;
  const content  = entry[depthKey] ?? entry.content_contextual ?? entry.content ?? [];

  if (content.length === 0) {
    const notice = document.createElement('p');
    notice.style.cssText = 'font-size:.75rem;color:var(--text-d);font-style:italic;margin-top:8px';
    notice.textContent = 'No entry written yet.';
    container.appendChild(notice);
  } else {
    for (const para of content) {
      const p = document.createElement('p');
      p.style.cssText =
        'font-family:var(--book-font);font-size:.88rem;line-height:1.75;color:var(--text-m);margin-bottom:12px';
      p.textContent = para.text;
      container.appendChild(p);
    }
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

  const loadingOpt =
    '<option value="" disabled selected>Loading voices…</option>';
  let voiceChangeBound = false;

  function populateVoiceSelectors() {
    const voices = window.speechSynthesis.getVoices();
    const lv = localStorage.getItem(LS('letter-voice')) || '';
    const cv = localStorage.getItem(LS('context-voice')) || '';
    const esc = (s) =>
      String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const lvSel = document.getElementById('letter-voice-select');
    const cvSel = document.getElementById('context-voice-select');
    if (!lvSel || !cvSel) return;

    if (!voices.length) {
      lvSel.innerHTML = loadingOpt;
      cvSel.innerHTML = loadingOpt;
      player.autoSelectVoices();
      return;
    }

    const opts = voices
      .map((v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`)
      .join('');
    lvSel.innerHTML = opts;
    cvSel.innerHTML = opts;
    player.autoSelectVoices();
    if (lv && [...lvSel.options].some((o) => o.value === lv)) lvSel.value = lv;
    else if (player.letterVoice) lvSel.value = player.letterVoice.voiceURI;
    if (cv && [...cvSel.options].some((o) => o.value === cv)) cvSel.value = cv;
    else if (player.contextVoice) cvSel.value = player.contextVoice.voiceURI;
    player.setLetterVoice(lvSel.value);
    player.setContextVoice(cvSel.value);

    if (!voiceChangeBound) {
      voiceChangeBound = true;
      lvSel.addEventListener('change', () => {
        player.setLetterVoice(lvSel.value);
        localStorage.setItem(LS('letter-voice'), lvSel.value);
      });
      cvSel.addEventListener('change', () => {
        player.setContextVoice(cvSel.value);
        localStorage.setItem(LS('context-voice'), cvSel.value);
      });
    }
  }

  populateVoiceSelectors();
  window.speechSynthesis.addEventListener('voiceschanged', populateVoiceSelectors);
  [0, 80, 250, 700, 2000].forEach((ms) =>
    setTimeout(() => populateVoiceSelectors(), ms)
  );

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

function applyLayoutFromStorage() {
  const app = document.getElementById('app');
  const sw = parseInt(localStorage.getItem(LS('sidebar-w')) || '', 10);
  const cw = parseInt(localStorage.getItem(LS('context-w')) || '', 10);
  if (Number.isFinite(sw))
    app.style.setProperty(
      '--sidebar-w',
      `${Math.max(180, Math.min(520, sw))}px`
    );
  if (Number.isFinite(cw))
    app.style.setProperty(
      '--context-w',
      `${Math.max(200, Math.min(560, cw))}px`
    );
  const bottomBar = document.getElementById('bottom-bar');
  if (localStorage.getItem(LS('bottom-collapsed')) === '1')
    bottomBar.classList.add('collapsed');
  const bmh = parseInt(localStorage.getItem(LS('bottom-bar-max-h')) || '', 10);
  if (Number.isFinite(bmh))
    bottomBar.style.setProperty(
      '--bottom-bar-max-h',
      `${Math.max(96, Math.min(480, bmh))}px`
    );
}

function initPanelResize() {
  const app = document.getElementById('app');
  const gS = document.getElementById('gutter-sidebar');
  const gC = document.getElementById('gutter-context');

  const parsePx = (val, fallback) => {
    const n = parseInt(String(val).trim(), 10);
    return Number.isFinite(n) ? n : fallback;
  };

  const bind = (gutter, mode) => {
    gutter.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const cs = getComputedStyle(app);
      const startSw = parsePx(cs.getPropertyValue('--sidebar-w'), 260);
      const startCw = parsePx(cs.getPropertyValue('--context-w'), 320);

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        if (mode === 'sidebar') {
          const w = Math.max(180, Math.min(520, startSw + dx));
          app.style.setProperty('--sidebar-w', `${w}px`);
        } else {
          if (document.getElementById('context-pane').classList.contains('collapsed'))
            return;
          const w = Math.max(200, Math.min(560, startCw + dx));
          app.style.setProperty('--context-w', `${w}px`);
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const cs2 = getComputedStyle(app);
        if (mode === 'sidebar') {
          localStorage.setItem(
            LS('sidebar-w'),
            String(parsePx(cs2.getPropertyValue('--sidebar-w'), 260))
          );
        } else if (!document.getElementById('context-pane').classList.contains('collapsed')) {
          localStorage.setItem(
            LS('context-w'),
            String(parsePx(cs2.getPropertyValue('--context-w'), 320))
          );
        }
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    gutter.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (mode === 'sidebar') {
        app.style.removeProperty('--sidebar-w');
        localStorage.removeItem(LS('sidebar-w'));
      } else {
        app.style.removeProperty('--context-w');
        localStorage.removeItem(LS('context-w'));
      }
    });
  };

  bind(gS, 'sidebar');
  bind(gC, 'context');
}

function initBottomBarResize() {
  const bar = document.getElementById('bottom-bar');
  const gutter = document.getElementById('bottom-bar-resize');
  if (!bar || !gutter) return;

  const parseMaxH = () => {
    const v = getComputedStyle(bar).getPropertyValue('--bottom-bar-max-h').trim();
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 400;
  };

  const applyH = (px) => {
    const h = Math.max(96, Math.min(480, Math.round(px)));
    bar.style.setProperty('--bottom-bar-max-h', `${h}px`);
    localStorage.setItem(LS('bottom-bar-max-h'), String(h));
  };

  gutter.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || bar.classList.contains('collapsed')) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = parseMaxH();
    const onMove = (ev) => {
      const dy = startY - ev.clientY;
      applyH(startH + dy);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  gutter.addEventListener('keydown', (e) => {
    if (bar.classList.contains('collapsed')) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      applyH(parseMaxH() + 12);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      applyH(parseMaxH() - 12);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      bar.style.removeProperty('--bottom-bar-max-h');
      localStorage.removeItem(LS('bottom-bar-max-h'));
    }
  });
}

function initTooltipPositioning() {
  const tip = document.getElementById('app-tooltip');
  if (!tip) return;
  let hideTimer = null;

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip]');
    clearTimeout(hideTimer);
    if (!el?.dataset.tip) {
      tip.classList.remove('visible');
      return;
    }
    tip.textContent = el.dataset.tip;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const x = Math.round(Math.max(110, Math.min(window.innerWidth - 110, cx)));
    // Show above the element
    const bottom = Math.round(window.innerHeight - r.top + 10);
    tip.style.left = `${x}px`;
    tip.style.bottom = `${bottom}px`;
    tip.classList.add('visible');
  });

  document.addEventListener('mouseout', (e) => {
    if (!e.target.closest('[data-tip]')) return;
    hideTimer = setTimeout(() => tip.classList.remove('visible'), 80);
  });
}

function letterPlainTextForTranslate() {
  const root = document.getElementById('letter-content');
  if (!root) return '';
  const sel =
    '.letter-salutation,.letter-paragraph,.letter-closing,.letter-meta,.view-missing';
  const parts = [];
  root.querySelectorAll(sel).forEach((el) => {
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    if (t) parts.push(t);
  });
  return parts.join('\n\n');
}

function flashOpFeedback(msg) {
  const el = document.getElementById('op-feedback');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2200);
}

function openLetterInGoogleTranslate() {
  let text = letterPlainTextForTranslate();
  if (!text) {
    flashOpFeedback('No letter text to translate');
    return;
  }
  const max = 4500;
  if (text.length > max) {
    text = text.slice(0, max);
    flashOpFeedback('Long letter — opening first part in Translate');
  }
  const url = `https://translate.google.com/?sl=auto&tl=en&op=translate&text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function syncSidebarRevealFocus() {
  const r = document.getElementById('sidebar-reveal');
  const s = document.getElementById('sidebar');
  if (!r || !s) return;
  if (isMobileLayout()) {
    r.setAttribute('aria-hidden', 'true');
    r.tabIndex = -1;
    return;
  }
  const collapsed = s.classList.contains('collapsed');
  r.setAttribute('aria-hidden', collapsed ? 'false' : 'true');
  r.tabIndex = collapsed ? 0 : -1;
}

function closeSidebar() {
  const s = document.getElementById('sidebar');
  if (isMobileLayout()) s.classList.remove('open');
  else {
    s.classList.add('collapsed');
    s.classList.remove('open');
  }
  syncSidebarRevealFocus();
}

function openSidebar() {
  const s = document.getElementById('sidebar');
  if (isMobileLayout()) s.classList.add('open');
  else {
    s.classList.remove('collapsed');
    s.classList.remove('open');
  }
  syncSidebarRevealFocus();
}

function toggleSidebar() {
  const s = document.getElementById('sidebar');
  if (isMobileLayout()) s.classList.toggle('open');
  else {
    s.classList.toggle('collapsed');
    s.classList.remove('open');
  }
  syncSidebarRevealFocus();
}

function toggleChrome() {
  const bar = document.getElementById('bottom-bar');
  bar.classList.toggle('collapsed');
  localStorage.setItem(
    LS('bottom-collapsed'),
    bar.classList.contains('collapsed') ? '1' : '0'
  );
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
  document.getElementById('btn-sidebar-collapse')?.addEventListener('click', () => {
    closeSidebar();
  });
  const sidebarReveal = document.getElementById('sidebar-reveal');
  sidebarReveal?.addEventListener('click', () => openSidebar());
  sidebarReveal?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openSidebar();
    }
  });
  document.getElementById('btn-context').addEventListener('click', toggleContextPanel);
  document.getElementById('btn-theme').addEventListener('click', () => {
    const light = document.documentElement.dataset.theme === 'light';
    document.documentElement.dataset.theme = light ? 'dark' : 'light';
    localStorage.setItem(LS('theme'), light ? 'dark' : 'light');
  });
  document.getElementById('btn-save').addEventListener('click', () => saveAll());

  const editorIndicator = document.getElementById('editor-indicator');
  if (editorIndicator) {
    editorIndicator.style.display = 'inline';
    editorIndicator.style.cursor = 'pointer';
    editorIndicator.setAttribute('role', 'button');
    editorIndicator.setAttribute('tabindex', '0');
    editorIndicator.setAttribute('aria-pressed', 'false');
    editorIndicator.dataset.tip = 'Click to unlock inline editor (Shift+E)';
    editorIndicator.addEventListener('click', toggleEditorMode);
    editorIndicator.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEditorMode(); }
    });
  }

  const smartPanel = document.getElementById('smart-features-panel');
  document.getElementById('btn-smart').addEventListener('click', () => {
    smartPanel.classList.toggle('open');
    if (smartPanel.classList.contains('open')) smartPanel.focus();
  });
  document.getElementById('btn-range-copy').addEventListener('click', toggleRangeMode);
  document.getElementById('btn-translate').addEventListener('click', () =>
    openLetterInGoogleTranslate()
  );
  document.getElementById('btn-bottom-collapse').addEventListener('click', () =>
    toggleChrome()
  );

  const expandBar = () => {
    document.getElementById('bottom-bar').classList.remove('collapsed');
    localStorage.setItem(LS('bottom-collapsed'), '0');
  };
  document.getElementById('pull-strip').addEventListener('click', expandBar);
  document.getElementById('pull-strip').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') expandBar();
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
