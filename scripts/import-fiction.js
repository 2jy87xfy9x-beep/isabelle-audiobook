// scripts/import-fiction.js — Node.js 18+, run from repo root
// Usage: node scripts/import-fiction.js --track gaps|letters [--dry-run]
//
// Reads the edited TSV and writes content back into fiction.json.
// Creates fiction.json if it does not exist.
//
// --track gaps    reads views-export/fiction-gaps.tsv
//   Updates/adds gap_scenes entries. letter_date column is ignored.
// --track letters reads views-export/fiction-letters.tsv
//   Updates/adds letter_reimaginings entries. letter_date column is ignored.
//
// Rows with empty text are skipped.

import { readFileSync, writeFileSync } from 'fs';

function unesc(s) { return s.replace(/\\t/g, '\t').replace(/\\n/g, '\n'); }

function loadFiction() {
  try {
    return JSON.parse(readFileSync('fiction.json', 'utf8'));
  } catch {
    return { schema_version: 1, gap_scenes: [], letter_reimaginings: [] };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args  = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const trackIdx = args.indexOf('--track');
if (trackIdx === -1 || !args[trackIdx + 1]) {
  console.error('Usage: node scripts/import-fiction.js --track gaps|letters [--dry-run]');
  process.exit(1);
}
const track = args[trackIdx + 1];
if (!['gaps', 'letters'].includes(track)) {
  console.error('--track must be "gaps" or "letters"');
  process.exit(1);
}

const tsvPath = track === 'gaps' ? 'views-export/fiction-gaps.tsv' : 'views-export/fiction-letters.tsv';
const raw  = readFileSync(tsvPath, 'utf8');
const lines = raw.split('\n').filter(l => l.trim());
if (lines.length < 2) { console.log('TSV is empty.'); process.exit(0); }

const headerCols = lines[0].split('\t');
const col = name => headerCols.indexOf(name);

const fiction = loadFiction();
let added = 0, updated = 0;

if (track === 'gaps') {
  const iId    = col('scene_id');
  const iAfter = col('after_letter');
  const iBefore= col('before_letter');
  const iTitle = col('title');
  const iText  = col('text');

  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t');
    const text = unesc(c[iText] || '');
    if (!text) continue;
    const id     = unesc(c[iId]    || '');
    const after  = unesc(c[iAfter] || '');
    const before = unesc(c[iBefore]|| '');
    const title  = unesc(c[iTitle] || '');
    const existing = fiction.gap_scenes.find(s => s.after_letter === after);
    if (existing) {
      const changed = existing.text !== text || existing.title !== title;
      if (changed) { existing.text = text; existing.title = title; updated++; console.log(`  ~ gap after ${after}`); }
    } else {
      fiction.gap_scenes.push({ id, after_letter: after, before_letter: before, title, text });
      added++;
      console.log(`  + gap after ${after}`);
    }
  }
} else {
  const iId     = col('reimagining_id');
  const iLetter = col('letter_id');
  const iText   = col('text');

  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t');
    const text   = unesc(c[iText]   || '');
    if (!text) continue;
    const id     = unesc(c[iId]     || '');
    const letterId = unesc(c[iLetter]|| '');
    const existing = fiction.letter_reimaginings.find(r => r.letter_id === letterId);
    if (existing) {
      if (existing.text !== text) { existing.text = text; updated++; console.log(`  ~ ${letterId}`); }
    } else {
      fiction.letter_reimaginings.push({ id, letter_id: letterId, text });
      added++;
      console.log(`  + ${letterId}`);
    }
  }
}

console.log(`\nAdded: ${added}  |  Updated: ${updated}`);

if (dryRun) { console.log('--dry-run: fiction.json not written.'); process.exit(0); }
if (added + updated === 0) { console.log('Nothing to write.'); process.exit(0); }

writeFileSync('fiction.json', JSON.stringify(fiction, null, 2), 'utf8');
console.log('✓ fiction.json updated');
