// extract.js — Node.js 18+, run from repo root
// Usage: node extract.js
// Outputs: book.json (v2), context-seed.json

import { readFileSync, writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';

const html = readFileSync('Isabelle.html', 'utf8');
const dom = new JSDOM(html);
const doc = dom.window.document;

const LETTER_CHAPTER_ID = 'ch-letters-marie-christine';
const KNOWN_LETTER_COUNT = 194;

function cleanText(el) {
  let t = el.textContent || '';
  t = t.replace(/L[ei]a[mr]n?ing\s+reading\s+speed\s+\d+%/gi, '');
  t = t.replace(
    /\d+\s*%?\s*minutes?\s+(?:ago\s+)?left\s+in\s+chapter\s*\d*\s*%?/gi,
    ''
  );
  t = t.replace(/Go to most recent page/gi, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseDateFromText(dateStr) {
  const months = {
    january: 1,
    janvier: 1,
    february: 2,
    février: 2,
    mars: 3,
    march: 3,
    avril: 4,
    april: 4,
    mai: 5,
    may: 5,
    juin: 6,
    june: 6,
    juillet: 7,
    july: 7,
    août: 8,
    august: 8,
    septembre: 9,
    september: 9,
    octobre: 10,
    october: 10,
    novembre: 11,
    november: 11,
    décembre: 12,
    december: 12,
  };
  const m = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (!m) return null;
  const month = months[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

function extractDateDisplay(slice) {
  const bracket = slice.match(/\[([^\]]*\d{4}[^\]]*)\]/);
  if (bracket) return bracket[1].trim().slice(0, 80);
  const m = slice.match(
    /\b(\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+\w+\s+\d{4})\b/i
  );
  return m ? m[1].trim() : null;
}

const CLOSING_RE =
  /\b(Your Isabelle|Votre Isabelle|Isabelle de Bourbon|Isabelle de Parme|I kiss you[^.]*)\b/i;

function extractClosing(slice) {
  const m = slice.match(CLOSING_RE);
  return m ? m[1].trim() : null;
}

function extractSalutation(slice) {
  const m = slice.match(
    /\b(Madam my dear \w+|Dear \w+|My dear \w+|Ma chère \w+)[,.]?/i
  );
  return m ? m[1].trim() : null;
}

// ── Walk document ─────────────────────────────────────────────────────────

const allNodes = [];
const root = doc.querySelector('[style*="max-width:600px"]') || doc.body;

function walk(node) {
  if (node.nodeType !== 1) return;
  const tag = node.tagName.toLowerCase();
  if (tag === 'h2') {
    allNodes.push({ type: 'heading', text: cleanText(node) });
  } else if (
    tag === 'div' &&
    node.querySelector('hr') &&
    /page\s+\d+/i.test(node.textContent) &&
    node.querySelectorAll('p').length === 0
  ) {
    const pm = node.textContent.match(/page\s+(\d+)/i);
    if (pm) allNodes.push({ type: 'page', number: parseInt(pm[1], 10) });
  } else if (tag === 'p') {
    const text = cleanText(node);
    if (text.length >= 15) allNodes.push({ type: 'para', text });
  } else {
    for (const child of node.childNodes) walk(child);
  }
}
walk(root);

const chapters = [];
let currentChapter = { id: 'ch-preface', title: 'Preface', nodes: [], page_start: 1 };

for (const node of allNodes) {
  if (node.type === 'heading') {
    if (currentChapter.nodes.length) chapters.push(currentChapter);
    const id = 'ch-' + slugify(node.text);
    currentChapter = { id, title: node.text, nodes: [], page_start: null };
  } else {
    if (node.type === 'page' && currentChapter.page_start === null) {
      currentChapter.page_start = node.number;
    }
    currentChapter.nodes.push(node);
  }
}
if (currentChapter.nodes.length) chapters.push(currentChapter);

function isLetterChapter(title) {
  // CHESS is a stray heading in source between "LETTERS TO" and "MARIE-/CHRISTINE"
  return /letter|marie|christine|correspondence|\bchess\b/i.test(title);
}

const letterChapters = chapters.filter((ch) => isLetterChapter(ch.title));
const narrativeChapters = chapters.filter((ch) => !isLetterChapter(ch.title));

console.log(
  `Found ${chapters.length} chapters: ${letterChapters.length} letter, ${narrativeChapters.length} narrative`
);

// ── Letter blob: all <p> after first letter-section heading (DOM order) ────

const letterHeadingRe = /LETTERS TO|MARIE-|CHRISTINE/i;
let letterBlob = '';
let inLetterRegion = false;
for (const el of root.querySelectorAll('h2, p')) {
  if (el.tagName === 'H2') {
    const ht = cleanText(el);
    if (letterHeadingRe.test(ht)) inLetterRegion = true;
    continue;
  }
  if (el.tagName === 'P' && inLetterRegion) {
    const t = cleanText(el);
    if (t.length >= 20) letterBlob += t + '\n\n';
  }
}

const letterRe = /\bLetter\s+(\d+)\b/gi;
const matches = [];
let mm;
while ((mm = letterRe.exec(letterBlob)) !== null) {
  matches.push({ num: parseInt(mm[1], 10), index: mm.index });
}

const byNum = new Map();
for (let i = 0; i < matches.length; i++) {
  const { num, index } = matches[i];
  const end = i + 1 < matches.length ? matches[i + 1].index : letterBlob.length;
  const slice = letterBlob.slice(index, end).trim();
  if (!byNum.has(num) || slice.length > (byNum.get(num)?.length ?? 0)) {
    byNum.set(num, slice);
  }
}

const extractedNums = [...byNum.keys()].sort((a, b) => a - b);
console.log(`  Extracted ${extractedNums.length} distinct letters by number (1–194 range)`);

// ── Build letters array 1..KNOWN_LETTER_COUNT ─────────────────────────────

const letters = [];
for (let n = 1; n <= KNOWN_LETTER_COUNT; n++) {
  const id = `letter-${String(n).padStart(3, '0')}`;
  const raw = byNum.get(n);
  const complete = Boolean(raw && raw.length > 40);

  const date_display = complete ? extractDateDisplay(raw) : null;
  const date_iso = date_display ? parseDateFromText(date_display) : null;

  letters.push({
    id,
    letter_number: n,
    date_iso,
    date_display,
    recipient: 'Marie-Christine',
    recipient_id: 'marie-christine',
    location: null,
    salutation: complete ? extractSalutation(raw) : null,
    closing: complete ? extractClosing(raw) : null,
    chapter_id: LETTER_CHAPTER_ID,
    page: null,
    complete,
    contextRefs: [],
    images: {
      photocopy: null,
      photocopy_alt: complete
        ? `Handwritten letter${date_display ? ` — ${date_display}` : ''}`
        : null,
      isabelle_portraits: [],
    },
    views: complete
      ? {
          original_french: raw,
          modern_french: null,
          literal_english_old: null,
          literal_english_modern: null,
          plain_english: null,
        }
      : {
          original_french: null,
          modern_french: null,
          literal_english_old: null,
          literal_english_modern: null,
          plain_english: null,
        },
  });
}

const bookChapters = [
  {
    id: LETTER_CHAPTER_ID,
    title: 'Letters to Marie-Christine',
    letter_ids: letters.map((l) => l.id),
    page_start: letterChapters[0]?.page_start ?? null,
  },
];

const completeCount = letters.filter((l) => l.complete).length;
const incompleteCount = letters.length - completeCount;

if (completeCount < 50) {
  console.error(
    `✗ Fewer than 50 complete letters (${completeCount}). Check Isabelle.html / Letter markers.`
  );
  process.exit(1);
}

const book = {
  title: 'Isabelle',
  subtitle: 'A Collection of Letters',
  author: 'Isabelle de Bourbon-Parma',
  editor: 'Naziyah',
  schema_version: 2,
  lastPosition: {
    letter_id: letters.find((l) => l.complete)?.id || 'letter-001',
    paragraph_index: 0,
    scroll_offset: 0,
    active_view: 'plain_english',
    timestamp: 0,
  },
  defaultView: 'plain_english',
  chapters: bookChapters,
  letters,
};

writeFileSync('book.json', JSON.stringify(book, null, 2), 'utf8');

const contextSeed = {
  chapters: narrativeChapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    page_start: ch.page_start,
    paragraphs: ch.nodes
      .filter((n) => n.type === 'para')
      .map((n, i) => ({
        id: `${ch.id}-para-${String(i + 1).padStart(3, '0')}`,
        text: n.text,
      })),
  })),
};

writeFileSync('context-seed.json', JSON.stringify(contextSeed, null, 2), 'utf8');

console.log(
  `\n✓ book.json: ${letters.length} letters (${completeCount} complete, ${incompleteCount} placeholders)`
);
console.log(
  `✓ context-seed.json: ${contextSeed.chapters.length} narrative chapters`
);
console.log(
  `  Total narrative paragraphs: ${contextSeed.chapters.reduce((s, ch) => s + ch.paragraphs.length, 0)}`
);
