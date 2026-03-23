// scripts/apply-clean.js — Node.js 18+, run from repo root
// Usage: node scripts/apply-clean.js [--letter <id>] [--dry-run]
//
// Applies safe automatic fixes from the clean-letters analysis to book.json:
//   ✓ Strip "Letter N" header prefix
//   ✓ Extract folio refs → letter.folio field
//   ✓ Remove historian footnote blocks from letter body
//   ✓ Remove inline footnote markers (bare numbers)
//
// Skips (manual repair needed):
//   ✗ OCR garble — flagged in report, not auto-fixed
//   ✗ Duplicate closings — human decision required
//
// Run node scripts/clean-letters.js first to review what will change.
// Use --dry-run to preview without writing.

import { readFileSync, writeFileSync } from 'fs';

// ── Patterns (same as clean-letters.js) ──────────────────────────────────────

const HEADER_PREFIX   = /^Letter\s+\d+[\s\S]{0,20}?(?=[A-Z][a-z])/;
// Matches: [f. 237] or [f. 279|  (bracketed)
// Also:    , f. 237]              (unbracketed — opening [ stripped at extraction)
const FOLIO_REF       = /(?:\[(?:f|p)\.\s*([\d\w\-|,\s]+?)[\]|]|,\s*f\.\s*(\d[\d\w\-]*)\])/gi;
const FOOTNOTE_RE     = /(?<!\d)(\d{1,2})\.\s+([A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ][^]*?)(?=\s*(?<!\d)\d{1,2}\.\s+[A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ]|\s*$)/g;
const INLINE_MARKER   = /[ \u00A0]([1-9])(?=[ ,;.!?»\n]|$)/g;
const CLOSING_RE      = /\b(?:Your|Votre)\s+(?:faithful\s+)?(?:(?:sister|Sœur)\s+)?Isabelle(?:\s+Marie(?:\s+Louise)?)?\s*\.?/gi;

function trimSpaces(s) {
  return s.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Apply fixes to one letter ─────────────────────────────────────────────────

function applyClean(letter) {
  const original = letter.views?.original_french;
  if (!original) return { changed: false, skipped: [] };

  let text = original;
  const applied = [];
  const skipped = [];

  // 1. Header prefix
  const headerMatch = text.match(HEADER_PREFIX);
  if (headerMatch) {
    text = text.slice(headerMatch[0].length);
    applied.push(`header stripped: "${headerMatch[0].trim()}"`);
  }

  // 2. Folio refs → letter.folio
  const folios = [];
  text = text.replace(FOLIO_REF, (match, ref1, ref2) => {
    const ref = (ref1 || ref2 || '').replace(/[|]/g, '').trim();
    if (ref) folios.push(ref);
    return ' ';
  });
  if (folios.length) {
    letter.folio = folios.join(', ');
    applied.push(`folio extracted: "${letter.folio}"`);
  }

  // 3. Find footnote split point (after last closing)
  const allClosings = [];
  {
    const re = new RegExp(CLOSING_RE.source, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) allClosings.push(m.index + m[0].length);
  }

  // Check for duplicate closings — skip auto-fix, flag for manual
  if (allClosings.length > 1) {
    skipped.push(`duplicate closings (${allClosings.length}×) — manual review needed`);
  }

  const splitPos = allClosings.length ? allClosings[allClosings.length - 1] : text.length;
  const trailingPart = text.slice(splitPos);

  // 4. Extract footnotes and collect markers
  const footnoteMarkers = new Set();
  const fnRe = /(?<!\d)(\d{1,2})\.\s+([A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ][^]*?)(?=\s*(?<!\d)\d{1,2}\.\s+[A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ]|\s*$)/g;
  let m;
  while ((m = fnRe.exec(trailingPart)) !== null) {
    footnoteMarkers.add(m[1]);
  }

  // Remove footnote text block (everything from first footnote after last closing)
  const trailingFnStart = trailingPart.search(/(?<!\d)\d{1,2}\.\s+[A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ]/);
  if (trailingFnStart !== -1) {
    text = text.slice(0, splitPos + trailingFnStart).trim();
    applied.push(`footnotes removed: ${footnoteMarkers.size} block(s)`);
  }

  // 5. Remove inline markers only for extracted footnote numbers
  if (footnoteMarkers.size > 0) {
    const before = text;
    text = text.replace(INLINE_MARKER, (match, num) =>
      footnoteMarkers.has(num) ? '' : match
    );
    if (text !== before) applied.push(`inline markers removed: ${[...footnoteMarkers].join(', ')}`);
  }

  // 6. OCR garble — flag only, do not touch
  if (/[|}{\\]/.test(text)) {
    skipped.push('OCR garble (pipe/brace chars) — manual repair needed');
  }

  text = trimSpaces(text);

  const changed = text !== original;
  if (changed) letter.views.original_french = text;

  // Propagate clean text to other views IF they were still identical to original
  // (i.e. fill-views-from-original placeholder — don't overwrite real editorial text)
  if (changed) {
    for (const view of ['modern_french', 'literal_english_old', 'literal_english_modern', 'plain_english']) {
      if (letter.views[view] === original) {
        letter.views[view] = text;
        applied.push(`propagated to ${view} (was placeholder)`);
      }
    }
  }

  return { changed, applied, skipped };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const letterFlag = args.indexOf('--letter');
const targetId = letterFlag !== -1 ? args[letterFlag + 1] : null;
const dryRun = args.includes('--dry-run');

const book = JSON.parse(readFileSync('book.json', 'utf8'));

const letters = book.letters.filter(l =>
  l.complete && (!targetId || l.id === targetId)
);

if (letters.length === 0) {
  console.error(targetId ? `Letter "${targetId}" not found or not complete.` : 'No complete letters.');
  process.exit(1);
}

let changedCount = 0;
let skipCount = 0;

for (const letter of letters) {
  const { changed, applied = [], skipped = [] } = applyClean(letter);

  if (changed || skipped.length) {
    console.log(`\n${letter.id}  ${letter.date_display || ''}`);
    for (const a of applied) console.log(`  ✓ ${a}`);
    for (const s of skipped) console.log(`  ⚠ SKIP: ${s}`);
    if (changed) changedCount++;
  }

  if (skipped.length) skipCount++;
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Letters changed: ${changedCount}  |  Skipped (manual): ${skipCount}`);

if (changedCount === 0) {
  console.log('Nothing to write.');
  process.exit(0);
}

if (dryRun) {
  console.log('--dry-run: book.json not written.');
  process.exit(0);
}

writeFileSync('book.json', JSON.stringify(book, null, 2), 'utf8');
console.log('✓ book.json updated');
