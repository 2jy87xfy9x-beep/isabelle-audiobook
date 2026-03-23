// scripts/repair-damaged-letters.js — Node.js 18+, run from repo root
// Usage: node scripts/repair-damaged-letters.js [--apply] [--letter <id>]
//
// Repairs OCR-damaged and fragment-duplicated letters in book.json.
// Without --apply: prints proposed clean text for review only.
// With --apply: writes cleaned text back to book.json.
//
// Two types of damage handled:
//   1. UI contamination — Kindle app UI captured during OCR scanning
//   2. Duplicate fragments — same letter text repeated 2-3× with UI garbage between

import { readFileSync, writeFileSync } from 'fs';

// ── UI contamination patterns ────────────────────────────────────────────────
// These are Kindle / e-reader app interface elements that ended up in the OCR

const UI_PATTERNS = [
  // Kindle navigation row: "< = Q i] Aa [37]}" or "< = Q Ey] Aa" etc.
  /[<>]=?\s*=?\s*Q\s*(?:[Ei]y?\]?\s*)?\s*Aa\s*\[?\d*\s*\]?}?\s*/g,
  // Isolated Kindle artifacts: "is3]}" "[37]}" "[37 ]}"
  /(?:is\d+|(?:\[\s*\d+\s*\]))\s*\]?}\s*/g,
  // "Q Ey] Aa" or standalone "Ey] Aa" at start of text
  /(?:Q\s*)?Ey\]\s*Aa\s*/g,
  // Timestamps: "2:51 @", "2:50 ©", "2:51 af"
  /\d+:\d+\s*[©@af]\s*/g,
  // Page-number triplets like "105 164181 180" or "105 194 207"
  /\b\d{2,3}\s+\d{3,6}\s+\d{2,3}\b\s*/g,
  /\b\d{2,3}\s+\d{2,3}\s+\d{2,3}\b\s*/g,
  // Status bar noise: "ogo oso Qe ooo", "o{3} o{2} Qe"
  /(?:o{2,}\s*){3,}/g,
  /ogo\s+(?:oso|ee|Qe)\s+(?:oo+\s*)*/g,
  // "Back to N"
  /Back to \d+\s*/g,
  // Progress indicators: "37% [October" etc.
  /\d+%\s*/g,
  // Garbled footnote headers: "s2 87105 34 is3]}"
  /s\d+\s+\d+\s+\d+\s*/g,
  // "Lett..." separator (book title displayed in app)
  /:\s*Lett(?:er)?\.\.\.\s*/g,
  // "[Start The Arct ..."
  /\[Start\s+\w+.*?\]/g,
  // Garbage word runs (very short tokens with special chars)
  /\b(?:ure|nuser|c'mi|dayd't|etala|LOU|jene)\b\s*/gi,
  // "|_—" or "|—-" (damaged em-dash sequences)
  /\|[_—\-]+/g,
  // Isolated "{" and "}" not part of real text
  /[{}]/g,
];

// ── Separator phrase — appears between duplicate fragments ───────────────────
// "I'm dying of love for you" / "I am dying of love for you" / "I die of love"
const SEPARATOR_RE = /I(?:'m| am| die of)\s+dying?\s+of\s+love\s+for\s+you/gi;

// ── Duplicate-paragraph removal ───────────────────────────────────────────────
// Splits text into sentences, finds runs that repeat, keeps first occurrence.

function deduplicate(text) {
  // Split into chunks of ~50 chars for comparison
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const seen = new Set();
  const kept = [];
  for (const s of sentences) {
    const key = s.trim().toLowerCase().slice(0, 60);
    if (key.length < 10) { kept.push(s); continue; }
    if (!seen.has(key)) {
      seen.add(key);
      kept.push(s);
    }
  }
  return kept.join('').trim();
}

// ── Main repair function ──────────────────────────────────────────────────────

function repairLetter(text) {
  const original = text;
  let t = text;

  // 1. Remove UI contamination
  for (const re of UI_PATTERNS) {
    t = t.replace(re, ' ');
  }

  // 2. Replace remaining "|" — mostly OCR damage for "—" or line-break
  //    If surrounded by word chars: treat as em-dash
  //    Otherwise: remove
  t = t.replace(/(\w)\s*\|\s*(\w)/g, '$1 — $2');
  t = t.replace(/\s*\|\s*/g, ' ');

  // 3. Collapse runs of spaces and clean up punctuation artefacts
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  t = t.replace(/\s+([,;.!?])/g, '$1');
  t = t.replace(/([,;])\s*\1+/g, '$1');

  // 4. Remove duplicate paragraph/sentence runs
  t = deduplicate(t);

  // 5. Final trim
  t = t.trim();

  return { cleaned: t, changed: t !== original };
}

// ── letter-003 special handler — duplicate closings ──────────────────────────
// Fragments are genuine Isabelle text but concatenated from different pages.
// Strategy: remove the historian's footnote at the end, merge the fragments,
// keep ONE closing at the very end.

function repairLetter003(text) {
  // Strip the historian's footnote block (starts after last real closing)
  // "Isabelle left Parma on September 13, 1760, after her marriage by proxy..."
  const footnoteStart = text.indexOf('Isabelle left Parma on September 13');
  let t = footnoteStart !== -1 ? text.slice(0, footnoteStart).trim() : text;

  // Remove intermediate closings (keep only the final one)
  // Closing pattern: "Your faithful [one] [Sister] Isabelle Marie Louise."
  const CLOSING_INNER = /\b(?:Your|Votre)\s+(?:faithful\s+)?(?:one\s+)?(?:Sister\s+)?Isabelle\s+Marie\s+Louise\s*\.?\s*/gi;
  const closings = [...t.matchAll(CLOSING_INNER)];

  if (closings.length > 1) {
    // Remove all intermediate closings (keep last)
    for (let i = 0; i < closings.length - 1; i++) {
      t = t.replace(closings[i][0], ' ');
    }
  }

  // Fragment 3 "prove yourself in every way" is a trailing editorial note
  // or different version — drop it as it starts with an odd imperative
  t = t.replace(/\s*prove yourself in every way,?\s*/gi, ' ');

  t = t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { cleaned: t, changed: t !== text };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const letterFilter = args.indexOf('--letter') !== -1 ? args[args.indexOf('--letter') + 1] : null;

const DAMAGED_IDS = [
  'letter-003', 'letter-007', 'letter-010', 'letter-036',
  'letter-077', 'letter-081', 'letter-105', 'letter-122',
  'letter-128', 'letter-131', 'letter-146', 'letter-152',
  'letter-167', 'letter-174',
];

const book = JSON.parse(readFileSync('book.json', 'utf8'));
const targets = book.letters.filter(l =>
  l.complete &&
  DAMAGED_IDS.includes(l.id) &&
  (!letterFilter || l.id === letterFilter)
);

let changedCount = 0;

for (const letter of targets) {
  const original = letter.views.original_french || '';
  const { cleaned, changed } = letter.id === 'letter-003'
    ? repairLetter003(original)
    : repairLetter(original);

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`${letter.id}  ${letter.date_display || ''}`);

  if (!changed) {
    console.log('  (no changes)');
    continue;
  }

  changedCount++;
  console.log(`  Before (${original.length} chars): ${original.slice(0, 120).replace(/\n/g, '↵')}…`);
  console.log(`  After  (${cleaned.length} chars): ${cleaned.slice(0, 120).replace(/\n/g, '↵')}…`);

  if (apply) {
    letter.views.original_french = cleaned;
    // Propagate to other views only if they were identical placeholders
    for (const v of ['modern_french', 'literal_english_old', 'literal_english_modern', 'plain_english']) {
      if (letter.views[v] === original) letter.views[v] = cleaned;
    }
  }
}

console.log(`\n${'═'.repeat(64)}`);
console.log(`Letters with changes: ${changedCount} / ${targets.length}`);

if (!apply) {
  console.log('\nRun with --apply to write changes to book.json');
  console.log('Or --apply --letter <id> to apply one at a time');
  process.exit(0);
}

writeFileSync('book.json', JSON.stringify(book, null, 2), 'utf8');
console.log('✓ book.json updated');
