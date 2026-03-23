// scripts/export-fiction.js — Node.js 18+, run from repo root
// Usage: node scripts/export-fiction.js --track gaps|letters [--dry-run]
//
// Exports fiction.json content to TSV for external authoring.
//
// --track gaps    → views-export/fiction-gaps.tsv
//   columns: scene_id | after_letter | before_letter | title | text
//   Exports one row per consecutive content-letter pair (complete=true letters only).
//   Placeholder rows (empty text) for scenes not yet written.
//
// --track letters → views-export/fiction-letters.tsv
//   columns: reimagining_id | letter_id | letter_date | text
//   letter_date is read-only context (joined from book.json); not imported back.
//   Placeholder rows for letters not yet reimagined.

import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const ESC_TAB = '\\t';
const ESC_NL  = '\\n';
function esc(s) { return String(s).replace(/\t/g, ESC_TAB).replace(/\r?\n/g, ESC_NL); }

// ── Helpers ────────────────────────────────────────────────────────────────────

function loadFiction() {
  try {
    return JSON.parse(readFileSync('fiction.json', 'utf8'));
  } catch {
    return { schema_version: 1, gap_scenes: [], letter_reimaginings: [] };
  }
}

function isLifespan(s) {
  // Detect strings like "1717-1790" that are lifespan dates, not letter dates
  return s && /^\d{4}\s*[-–]\s*\d{4}$/.test(s.trim());
}

function letterDate(letter) {
  const d = letter.date_display;
  if (!d || isLifespan(d)) return letter.date_iso || '';
  return d;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args  = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const trackIdx = args.indexOf('--track');
if (trackIdx === -1 || !args[trackIdx + 1]) {
  console.error('Usage: node scripts/export-fiction.js --track gaps|letters [--dry-run]');
  process.exit(1);
}
const track = args[trackIdx + 1];
if (!['gaps', 'letters'].includes(track)) {
  console.error('--track must be "gaps" or "letters"');
  process.exit(1);
}

const book    = JSON.parse(readFileSync('book.json', 'utf8'));
const fiction = loadFiction();

mkdirSync('views-export', { recursive: true });

// Complete letters only, in order
const complete = book.letters.filter(l => l.complete);

if (track === 'gaps') {
  const header = ['scene_id', 'after_letter', 'before_letter', 'title', 'text'].join('\t');
  const rows = [header];

  // Build lookup of existing scenes
  const sceneMap = new Map(fiction.gap_scenes.map(s => [s.after_letter, s]));

  for (let i = 0; i < complete.length - 1; i++) {
    const a = complete[i];
    const b = complete[i + 1];
    const existing = sceneMap.get(a.id);
    rows.push([
      esc(existing?.id    || `gap-${a.id}-${b.id}`),
      esc(a.id),
      esc(b.id),
      esc(existing?.title || ''),
      esc(existing?.text  || ''),
    ].join('\t'));
  }

  const outPath = 'views-export/fiction-gaps.tsv';
  if (!dryRun) writeFileSync(outPath, rows.join('\n') + '\n', 'utf8');
  console.log(`${dryRun ? '[dry-run] ' : ''}✓ ${outPath}  (${rows.length - 1} rows)`);

} else {
  // letters
  const header = ['reimagining_id', 'letter_id', 'letter_date', 'text'].join('\t');
  const rows = [header];

  const reimMap = new Map(fiction.letter_reimaginings.map(r => [r.letter_id, r]));

  for (const letter of complete) {
    const existing = reimMap.get(letter.id);
    rows.push([
      esc(existing?.id   || `reimagining-${letter.id}`),
      esc(letter.id),
      esc(letterDate(letter)),
      esc(existing?.text || ''),
    ].join('\t'));
  }

  const outPath = 'views-export/fiction-letters.tsv';
  if (!dryRun) writeFileSync(outPath, rows.join('\n') + '\n', 'utf8');
  console.log(`${dryRun ? '[dry-run] ' : ''}✓ ${outPath}  (${rows.length - 1} rows)`);
}

console.log('Edit the "text" (and "title" for gaps) column, then run: node scripts/import-fiction.js --track ' + track);
