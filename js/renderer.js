const VIEW_LABELS = {
  original_french: { tab: 'vieux fr', tip: 'Original Old French' },
  modern_french: { tab: 'fr moderne', tip: 'Modern French' },
  literal_english_old: { tab: 'en littéral', tip: 'Literal English of Old French' },
  literal_english_modern: { tab: 'en mod fr', tip: 'Literal English of Modern French' },
  plain_english: { tab: 'anglais', tip: 'Plain Modern English' },
  handwriting_style: { tab: 'manuscrit', tip: 'Handwriting Style' },
  photocopy: { tab: 'photocopie', tip: 'Original Photocopy' },
};
const TEXT_VIEWS = [
  'original_french',
  'modern_french',
  'literal_english_old',
  'literal_english_modern',
  'plain_english',
];

export function buildAliasMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    const names = [entry.name, ...(entry.aliases || [])];
    for (const name of names) {
      if (name) map.set(String(name).toLowerCase(), entry.id);
    }
  }
  return map;
}

export function buildSortedAliases(aliasMap) {
  return [...aliasMap.entries()].sort((a, b) => b[0].length - a[0].length);
}

export function injectContextSpans(el, sortedAliases, doc) {
  const walker = doc.createTreeWalker(el, 4);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  for (const tn of textNodes) {
    const text = tn.nodeValue;
    let html = text;
    let matched = false;
    for (const [alias, id] of sortedAliases) {
      if (alias.length < 4) continue;
      const re = new RegExp(`(?<![\\w-])(${escapeRe(alias)})(?![\\w-])`, 'gi');
      const next = html.replace(
        re,
        `<span class="ctx-ref" data-ref-id="${id}" role="button" tabindex="0" aria-label="Context: ${id}">$1</span>`
      );
      if (next !== html) {
        matched = true;
        html = next;
      }
    }
    if (matched) {
      const span = doc.createElement('span');
      span.innerHTML = html;
      tn.parentNode.replaceChild(span, tn);
    }
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderLetterMeta(letter, doc) {
  const div = doc.createElement('div');
  div.className = 'letter-meta';
  div.dataset.letterId = letter.id;
  div.innerHTML = `
    <span data-letter-date class="letter-date">${letter.date_display || ''}</span>
    <span data-letter-number class="letter-number">Letter ${letter.letter_number}</span>
  `;
  return div;
}

export function renderViewSwitcher(letter, activeView, onSwitch, doc) {
  const nav = doc.createElement('nav');
  nav.className = 'view-switcher';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Letter format view');

  for (const [key, { tab, tip }] of Object.entries(VIEW_LABELS)) {
    const btn = doc.createElement('button');
    btn.setAttribute('role', 'tab');
    btn.dataset.view = key;
    btn.textContent = tab;
    btn.title = tip;
    btn.setAttribute('aria-selected', key === activeView ? 'true' : 'false');
    if (key === activeView) btn.classList.add('active');
    btn.addEventListener('click', () => onSwitch(key));
    nav.appendChild(btn);
  }
  return nav;
}

export function renderLetterBody(letter, activeView, sortedAliases, doc) {
  const article = doc.createElement('article');
  article.className = 'letter-body';
  article.dataset.letterId = letter.id;

  if (activeView === 'photocopy') {
    renderPhotocopy(letter, article, doc);
    return article;
  }

  const sourceText =
    activeView === 'handwriting_style'
      ? letter.views.original_french
      : letter.views[activeView];

  if (!sourceText) {
    const notice = doc.createElement('p');
    notice.className = 'view-missing';
    notice.textContent = 'This version has not been added yet.';
    article.appendChild(notice);
    return article;
  }

  if (letter.salutation) {
    const sal = doc.createElement('p');
    sal.className = 'letter-salutation';
    sal.textContent = letter.salutation;
    article.appendChild(sal);
  }

  const paragraphs = sourceText.split(/\n\n+/).filter(Boolean);
  for (let i = 0; i < paragraphs.length; i++) {
    const p = doc.createElement('p');
    p.className = 'letter-paragraph';
    p.dataset.paragraphIndex = String(i);
    p.textContent = paragraphs[i];
    if (TEXT_VIEWS.includes(activeView) && sortedAliases.length) {
      injectContextSpans(p, sortedAliases, doc);
    }
    if (activeView === 'handwriting_style') p.classList.add('handwriting');
    article.appendChild(p);
  }

  if (letter.closing) {
    const closing = doc.createElement('p');
    closing.className = 'letter-closing';
    closing.textContent = letter.closing;
    article.appendChild(closing);
  }
  return article;
}

function renderPhotocopy(letter, container, doc) {
  if (letter.images?.photocopy) {
    const img = doc.createElement('img');
    img.src = letter.images.photocopy;
    img.alt = letter.images.photocopy_alt || `Letter ${letter.letter_number}`;
    img.className = 'photocopy-img';
    img.addEventListener('error', () => renderPhotocopyFallback(letter, container, doc));
    container.appendChild(img);
  } else {
    renderPhotocopyFallback(letter, container, doc);
  }
}

function renderPhotocopyFallback(letter, container, doc) {
  container.innerHTML = '';
  container.classList.add('photocopy-fallback');
  const notice = doc.createElement('p');
  notice.className = 'photocopy-notice';
  notice.textContent = letter.images?.photocopy
    ? 'Image could not be loaded — showing transcription.'
    : 'Original image not yet added — showing transcription.';
  container.appendChild(notice);
  const text = letter.views?.original_french || '';
  text
    .split(/\n\n+/)
    .filter(Boolean)
    .forEach((para) => {
      const p = doc.createElement('p');
      p.className = 'letter-paragraph handwriting';
      p.textContent = para;
      container.appendChild(p);
    });
}

export function renderLetterNav(letter, totalLetters, onPrev, onNext, doc) {
  const nav = doc.createElement('nav');
  nav.className = 'letter-nav';
  const prev = doc.createElement('button');
  prev.className = 'letter-nav-prev';
  prev.setAttribute('aria-label', 'Previous letter');
  prev.textContent =
    letter.letter_number <= 1 ? '← —' : `← Letter ${letter.letter_number - 1}`;
  prev.disabled = letter.letter_number <= 1;
  prev.addEventListener('click', onPrev);
  const next = doc.createElement('button');
  next.className = 'letter-nav-next';
  next.setAttribute('aria-label', 'Next letter');
  next.textContent =
    letter.letter_number >= totalLetters
      ? '— →'
      : `Letter ${letter.letter_number + 1} →`;
  next.disabled = letter.letter_number >= totalLetters;
  next.addEventListener('click', onNext);
  nav.appendChild(prev);
  nav.appendChild(next);
  return nav;
}
