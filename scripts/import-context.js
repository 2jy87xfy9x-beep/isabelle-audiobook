// scripts/import-context.js — Node.js 18+, run from repo root
// Usage: node scripts/import-context.js [--depth brief|contextual|encyclopedic] [--entry <id>] [--dry-run]
//
// Reads views-export/context-<depth>.tsv and writes text back to context.json.
// Default depth: contextual
//
// IMPORTANT: run scripts/migrate-context.js once before using --depth.
// context.json must be at schema_version 3.
//
// Rules:
//   • Rows with empty paragraph_id are placeholders — skipped.
//   • Rows with empty text are skipped (preserves existing value).
//   • Existing paragraph matched by id → text updated.
//   • New paragraph_id → appended to entry's content_<depth> array.
//
// Escape sequences: \t → actual tab  |  \n → actual newline

import { readFileSync, writeFileSync } from 'fs';

function unesc(s) { return s.replace(/\\t/g, '\t').replace(/\\n/g, '\n'); }

// ── Main ──────────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const dryRun    = args.includes('--dry-run');
const depthIdx  = args.indexOf('--depth');
const depth     = depthIdx !== -1 ? args[depthIdx + 1] : 'contextual';
const entryFlag = args.indexOf('--entry');
const targetId  = entryFlag !== -1 ? args[entryFlag + 1] : null;

const DEPTHS = ['brief', 'contextual', 'encyclopedic'];
if (!DEPTHS.includes(depth)) {
  console.error(`--depth must be one of: ${DEPTHS.join(', ')}`);
  process.exit(1);
}

const contentKey = `content_${depth}`;
const tsvPath    = `views-export/context-${depth}.tsv`;

const raw   = readFileSync(tsvPath, 'utf8');
const lines = raw.split('\n').filter(l => l.trim());
if (lines.length < 2) { console.error('TSV is empty or has only a header row.'); process.exit(1); }

const header = lines[0].split('\t');
const COL = {
  entry_id:     header.indexOf('entry_id'),
  paragraph_id: header.indexOf('paragraph_id'),
  text:         header.indexOf('text'),
};
if ([COL.entry_id, COL.paragraph_id, COL.text].some(i => i === -1)) {
  console.error('TSV missing required columns: entry_id, paragraph_id, text');
  process.exit(1);
}

const rowsByEntry = new Map();
for (let i = 1; i < lines.length; i++) {
  const cols    = lines[i].split('\t');
  const entryId = unesc(cols[COL.entry_id]     || '');
  const paraId  = unesc(cols[COL.paragraph_id] || '');
  const text    = unesc(cols[COL.text]         || '');
  if (!entryId || !paraId || !text) continue;
  if (targetId && entryId !== targetId) continue;
  if (!rowsByEntry.has(entryId)) rowsByEntry.set(entryId, []);
  rowsByEntry.get(entryId).push({ id: paraId, text });
}

if (rowsByEntry.size === 0) { console.log('No non-empty rows to import.'); process.exit(0); }

const ctx = JSON.parse(readFileSync('context.json', 'utf8'));
if (ctx.schema_version < 3) {
  console.error('context.json is at schema_version ' + ctx.schema_version + '. Run: node scripts/migrate-context.js');
  process.exit(1);
}

let changedEntries = 0, changedParas = 0, addedParas = 0;

for (const [entryId, rows] of rowsByEntry) {
  const entry = ctx.entries.find(e => e.id === entryId);
  if (!entry) { console.warn(`  ⚠ entry "${entryId}" not found — skipped`); continue; }
  if (!entry[contentKey]) entry[contentKey] = [];

  let entryChanged = false;
  for (const row of rows) {
    const existing = entry[contentKey].find(p => p.id === row.id);
    if (existing) {
      if (existing.text !== row.text) { existing.text = row.text; changedParas++; entryChanged = true; console.log(`  ~ ${entryId} / ${row.id}`); }
    } else {
      entry[contentKey].push({ id: row.id, text: row.text });
      addedParas++;
      entryChanged = true;
      console.log(`  + ${entryId} / ${row.id}  (new)`);
    }
  }
  if (entryChanged) changedEntries++;
}

console.log(`\nEntries touched: ${changedEntries}  |  Updated: ${changedParas}  |  Added: ${addedParas}`);

if (dryRun) { console.log('--dry-run: context.json not written.'); process.exit(0); }
if (changedEntries === 0) { console.log('Nothing to write.'); process.exit(0); }

writeFileSync('context.json', JSON.stringify(ctx, null, 2), 'utf8');
console.log('✓ context.json updated');
