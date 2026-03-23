const LS_PREFIX = 'isabelle-v2-smart-';

const FEATURES = [
  { id: 'smart-scroll', label: 'Smart Scroll' },
  { id: 'peek-return', label: 'Peek & Return' },
  { id: 'range-copy', label: 'Sentence Range Copy' },
  { id: 'keyboard-nav', label: 'Keyboard Navigation' },
  { id: 'truncation-reveal', label: 'Truncation Reveal' },
  { id: 'resumability', label: 'Resumability' },
  { id: 'optimistic-feedback', label: 'Optimistic Feedback' },
  { id: 'undo-navigation', label: 'Undo Navigation' },
  { id: 'focus-states', label: 'Focus States' },
  { id: 'ctx-sync-indicator', label: 'Context Sync Indicator' },
  { id: 'narrator-position', label: 'Narrator Position Line' },
  { id: 'view-memory', label: 'View Memory Per Letter' },
  { id: 'missing-letters', label: 'Missing Letter Indicators' },
  { id: 'page-lock', label: 'Page Lock' },
];

export function isEnabled(id) {
  const val = localStorage.getItem(LS_PREFIX + id);
  return val === null ? true : val === '1';
}

export function setEnabled(id, on) {
  localStorage.setItem(LS_PREFIX + id, on ? '1' : '0');
  document.dispatchEvent(new CustomEvent('smart-feature-changed', { detail: { id, on } }));
}

export function renderTogglePanel(doc) {
  const frag = doc.createDocumentFragment();
  const title = doc.createElement('h2');
  title.textContent = 'Smart Features';
  frag.appendChild(title);

  for (const feat of FEATURES) {
    const row = doc.createElement('label');
    row.className = 'sf-row';
    const toggle = doc.createElement('button');
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', isEnabled(feat.id) ? 'true' : 'false');
    toggle.setAttribute('aria-label', feat.label);
    toggle.dataset.featureId = feat.id;
    toggle.className = 'sf-toggle' + (isEnabled(feat.id) ? ' on' : '');
    toggle.addEventListener('click', () => {
      const nowOn = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', nowOn ? 'true' : 'false');
      toggle.className = 'sf-toggle' + (nowOn ? ' on' : '');
      setEnabled(feat.id, nowOn);
    });
    const lbl = doc.createElement('span');
    lbl.textContent = feat.label;
    row.appendChild(toggle);
    row.appendChild(lbl);
    frag.appendChild(row);
  }
  return frag;
}

export function initKeyboardNav({
  onPrev,
  onNext,
  onToggleContext,
  onToggleChrome,
  onPeek,
  onRangeCopy,
}) {
  document.addEventListener('keydown', (e) => {
    if (!isEnabled('keyboard-nav')) return;
    const tag = document.activeElement?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.target?.isContentEditable) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onPrev?.();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onNext?.();
    } else if (e.key === 'c' || e.key === 'C') onToggleContext?.();
    else if (e.key === 'H' && e.shiftKey) onToggleChrome?.();
    else if (e.key === 'p' || e.key === 'P') onPeek?.();
    else if (e.key === 'r' || e.key === 'R') onRangeCopy?.();
    else if (e.key === 'Escape') document.dispatchEvent(new CustomEvent('escape-pressed'));
  });
}

export function showFeedback(msg) {
  if (!isEnabled('optimistic-feedback')) return;
  const el = document.getElementById('op-feedback');
  if (!el) return;
  el.textContent = msg;
  el.setAttribute('aria-live', 'polite');
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2000);
}

let _undoTimer = null;
export function showUndoNav(label, onUndo) {
  if (!isEnabled('undo-navigation')) return;
  const el = document.getElementById('undo-nav');
  if (!el) return;
  el.textContent = label;
  el.classList.add('visible');
  el.onclick = () => {
    onUndo?.();
    el.classList.remove('visible');
    clearTimeout(_undoTimer);
  };
  clearTimeout(_undoTimer);
  _undoTimer = setTimeout(() => el.classList.remove('visible'), 4000);
}

export function updateNarratorLine(sentenceIndex, totalSentences) {
  if (!isEnabled('narrator-position')) return;
  const line = document.getElementById('narrator-line');
  if (!line) return;
  const pct = totalSentences > 0 ? (sentenceIndex / totalSentences) * 100 : 0;
  line.style.width = `${pct}%`;
  line.style.display = pct > 0 ? 'block' : 'none';
}

export function initSmartScroll(contentEl) {
  if (!isEnabled('smart-scroll')) return;
  let _scrollTimer = null;
  contentEl.addEventListener('scroll', () => {
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(() => snapToNearestAnchor(contentEl), 120);
  });
}

function snapToNearestAnchor(el) {
  if (!isEnabled('smart-scroll')) return;
  const anchors = [...el.querySelectorAll('.letter-body')];
  const scrollTop = el.scrollTop;
  const viewMid = scrollTop + el.clientHeight / 2;
  let closest = null;
  let closestDist = Infinity;
  for (const a of anchors) {
    const dist = Math.abs(a.offsetTop - viewMid);
    if (dist < closestDist) {
      closestDist = dist;
      closest = a;
    }
  }
  if (closest && closestDist < 80) {
    el.scrollTo({ top: closest.offsetTop - 20, behavior: 'smooth' });
  }
}
