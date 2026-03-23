// import-views.js — Node.js 18+, run from repo root
// Usage: node scripts/import-views.js [--view <name>] [--dry-run]
//
// Reads views-export/<view_name>.tsv files and writes the target column
// back into book.json for each matching letter.
//
// Flags:
//   --view <name>   Only import a single named view
//   --dry-run       Print a summary without writing book.json
//
// TSV format (produced by scripts/export-views.js):
//   letter_id  |  source  |  target
//
// Rules:
//   - Rows where target is empty are skipped (leaves current value intact)
//   - letter_ids that do not exist in book.json are reported and skipped
//   - book.json is only written if at least one field changed

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DERIVED_VIEWS = [
  'modern_french',
  'literal_english_old',
  'literal_english_modern',
  'plain_english',
];

// Parse flags
const args = process.argv.slice(2);
const viewFlag = args.indexOf('--view');
const selectedView = viewFlag !== -1 ? args[viewFlag + 1] : null;
const dryRun = args.includes('--dry-run');

if (selectedView && !DERIVED_VIEWS.includes(selectedView)) {
  console.error(`Unknown view: ${selectedView}`);
  console.error(`Valid views: ${DERIVED_VIEWS.join(', ')}`);
  process.exit(1);
}

const views = selectedView ? [selectedView] : DERIVED_VIEWS;

// Unescape TSV cell value
function unescapeTSV(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

function parseTSV(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  // header: letter_id, source, target
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    rows.push({
      letter_id: cols[0].trim(),
      source: unescapeTSV(cols[1]),
      target: unescapeTSV(cols[2]),
    });
  }
  return rows;
}

const book = JSON.parse(readFileSync('book.json', 'utf8'));
const letterMap = new Map(book.letters.map(l => [l.id, l]));
const inDir = 'views-export';

let totalUpdated = 0;
let totalSkipped = 0;
let totalMissing = 0;

for (const view of views) {
  const tsvPath = join(inDir, `${view}.tsv`);
  if (!existsSync(tsvPath)) {
    console.log(`⚠ ${tsvPath} not found — skipping`);
    continue;
  }

  const rows = parseTSV(readFileSync(tsvPath, 'utf8'));
  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const { letter_id, target } of rows) {
    if (!target.trim()) { skipped++; continue; }
    const letter = letterMap.get(letter_id);
    if (!letter) { missing++; console.warn(`  ✗ ${letter_id} not found in book.json`); continue; }
    if (!letter.complete) { skipped++; continue; }
    letter.views[view] = target;
    updated++;
  }

  console.log(`${view}: ${updated} updated, ${skipped} skipped (empty), ${missing} not found`);
  totalUpdated += updated;
  totalSkipped += skipped;
  totalMissing += missing;
}

console.log(`\nTotal: ${totalUpdated} fields updated`);

if (totalUpdated === 0) {
  console.log('Nothing to write.');
  process.exit(0);
}

if (dryRun) {
  console.log('--dry-run: book.json not written');
  process.exit(0);
}

writeFileSync('book.json', JSON.stringify(book, null, 2), 'utf8');
console.log('✓ book.json updated');
