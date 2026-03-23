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
  { id: 'letter-guardian', label: 'Letter Integrity Guardian' },
  { id: 'fiction-tracks', label: 'Fiction Tracks' },
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

// ── Letter Integrity Guardian ─────────────────────────────────────────────────
// Detects artefacts in letter text and returns annotated segments for rendering.
// Same patterns as scripts/clean-letters.js — keep in sync if patterns change.

const GUARDIAN_PATTERNS = [
  {
    id:     'header',
    re:     /^Letter\s+\d+[\s\S]{0,20}?(?=[A-Z][a-z])/,
    label:  'Header artefact',
    tip:    'Extraction duplicate — "Letter N" prefix from source HTML',
    cls:    'guardian-header',
  },
  {
    id:     'folio',
    re:     /\[(?:f|p)\.\s*[\d\w\-|,\s]+?\]/gi,
    label:  'Folio reference',
    tip:    'Archival folio ref — should be in metadata, not letter body',
    cls:    'guardian-folio',
  },
  {
    id:     'footnote',
    re:     /(?<!\d)\d{1,2}\.\s+[A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ].{10,}/g,
    label:  'Historian footnote',
    tip:    "Historian's editorial note — not Isabelle's writing; Book 2 candidate",
    cls:    'guardian-footnote',
  },
  {
    id:     'inline_marker',
    re:     /[ \u00A0][1-9](?=[ ,;.!?»])/g,
    label:  'Footnote marker',
    tip:    'Superscript reference number pointing to an editorial footnote',
    cls:    'guardian-marker',
  },
  {
    id:     'ocr',
    re:     /[|}{\\]/g,
    label:  'OCR damage',
    tip:    'Character that indicates OCR scanning damage — manual repair needed',
    cls:    'guardian-ocr',
  },
];

/**
 * Analyse text and return array of { start, end, patternId, label, tip }.
 * Ranges are character offsets into `text`.
 */
export function guardianAnalyse(text) {
  if (!text) return [];
  const hits = [];
  for (const pat of GUARDIAN_PATTERNS) {
    const re = new RegExp(pat.re.source, pat.re.flags.includes('g') ? pat.re.flags : pat.re.flags + 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      hits.push({ start: m.index, end: m.index + m[0].length, patternId: pat.id, label: pat.label, tip: pat.tip, cls: pat.cls });
    }
  }
  // Sort by start position, remove overlaps (first match wins)
  hits.sort((a, b) => a.start - b.start);
  const merged = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start >= cursor) { merged.push(h); cursor = h.end; }
  }
  return merged;
}

/**
 * Wrap detected artefact ranges in <mark class="guardian-*"> elements inside `el`.
 * Works on text nodes only — does not re-process already-wrapped nodes.
 * Call after renderLetterBody when guardian is enabled.
 */
export function guardianHighlight(el, text, doc) {
  if (!isEnabled('letter-guardian')) return;
  const hits = guardianAnalyse(text);
  if (!hits.length) return;

  // Build annotated HTML from plain text + hit ranges
  let html = '';
  let cursor = 0;
  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  for (const h of hits) {
    html += esc(text.slice(cursor, h.start));
    html += `<mark class="guardian-flag ${h.cls}" data-tip="${esc(h.tip)}" aria-label="${esc(h.label)}: ${esc(h.tip)}">${esc(text.slice(h.start, h.end))}</mark>`;
    cursor = h.end;
  }
  html += esc(text.slice(cursor));

  // Replace the first paragraph's text node with the annotated HTML
  // (guardian applies to the raw concatenated text, injected into the first <p>)
  const firstP = el.querySelector('.letter-paragraph');
  if (firstP) {
    const wrapper = doc.createElement('span');
    wrapper.innerHTML = html;
    firstP.innerHTML = '';
    firstP.appendChild(wrapper);
  }
}

/**
 * Return a plain-text summary of all issues in a letter for the editor banner.
 */
export function guardianSummary(text) {
  const hits = guardianAnalyse(text);
  if (!hits.length) return null;
  const counts = {};
  for (const h of hits) counts[h.label] = (counts[h.label] || 0) + 1;
  return Object.entries(counts).map(([k, v]) => `${v}× ${k}`).join(' · ');
}
