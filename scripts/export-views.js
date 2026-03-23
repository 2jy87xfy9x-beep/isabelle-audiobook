// export-views.js — Node.js 18+, run from repo root
// Usage: node scripts/export-views.js [--view <name>]
//
// Exports letter views to views-export/<view_name>.tsv for external editing.
// Each TSV has three columns:
//   letter_id  |  source (original_french)  |  target (current view text)
//
// If --view is given, only that view is exported.
// Views: modern_french, literal_english_old, literal_english_modern, plain_english
//
// After editing the TSV externally (spreadsheet, CAT tool, text editor),
// run: node scripts/import-views.js to write changes back to book.json

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DERIVED_VIEWS = [
  'modern_french',
  'literal_english_old',
  'literal_english_modern',
  'plain_english',
];

// Parse --view flag
const viewFlag = process.argv.indexOf('--view');
const selectedView = viewFlag !== -1 ? process.argv[viewFlag + 1] : null;

if (selectedView && !DERIVED_VIEWS.includes(selectedView)) {
  console.error(`Unknown view: ${selectedView}`);
  console.error(`Valid views: ${DERIVED_VIEWS.join(', ')}`);
  process.exit(1);
}

const views = selectedView ? [selectedView] : DERIVED_VIEWS;

const book = JSON.parse(readFileSync('book.json', 'utf8'));
const complete = book.letters.filter(l => l.complete);

if (complete.length === 0) {
  console.error('No complete letters found in book.json');
  process.exit(1);
}

const outDir = 'views-export';
mkdirSync(outDir, { recursive: true });

// Escape a cell value for TSV: replace tab and newlines with safe sequences
function escapeTSV(str) {
  if (str == null) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\r\n/g, '\\n')
    .replace(/\r/g, '\\n')
    .replace(/\n/g, '\\n');
}

let exported = 0;
for (const view of views) {
  const rows = ['letter_id\tsource\ttarget'];
  for (const letter of complete) {
    const source = escapeTSV(letter.views.original_french ?? '');
    const target = escapeTSV(letter.views[view] ?? '');
    rows.push(`${letter.id}\t${source}\t${target}`);
  }
  const outPath = join(outDir, `${view}.tsv`);
  writeFileSync(outPath, rows.join('\n') + '\n', 'utf8');
  exported++;
  console.log(`✓ ${outPath}  (${complete.length} letters)`);
}

console.log(`\nExported ${exported} view(s) to ${outDir}/`);
console.log('Edit the target column in each file, then run:');
console.log('  node scripts/import-views.js');
