// scripts/export-context.js — Node.js 18+, run from repo root
// Usage: node scripts/export-context.js [--depth brief|contextual|encyclopedic] [--entry <id>] [--dry-run]
//
// Exports context.json content paragraphs to TSV for external authoring.
// Output: views-export/context-<depth>.tsv  (default depth: contextual)
//
// IMPORTANT: run scripts/migrate-context.js once before using --depth.
// context.json must be at schema_version 3.
//
// Columns (tab-separated):
//   entry_id | entry_type | entry_name | paragraph_id | text
//
// Empty content_<depth> arrays produce one placeholder row (paragraph_id="", text="").
// Edit the "text" column, then run import-context.js --depth <same>.
//
// Escape sequences: actual tab → \t  |  actual newline → \n

import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const ESC_TAB = '\\t';
const ESC_NL  = '\\n';
function esc(s) { return String(s).replace(/\t/g, ESC_TAB).replace(/\r?\n/g, ESC_NL); }

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

const ctx = JSON.parse(readFileSync('context.json', 'utf8'));

if (ctx.schema_version < 3) {
  console.error('context.json is at schema_version ' + ctx.schema_version + '. Run: node scripts/migrate-context.js');
  process.exit(1);
}

const contentKey = `content_${depth}`;
const entries = ctx.entries.filter(e => !targetId || e.id === targetId);

if (entries.length === 0) {
  console.error(targetId ? `Entry "${targetId}" not found.` : 'No entries.');
  process.exit(1);
}

mkdirSync('views-export', { recursive: true });

const header = ['entry_id', 'entry_type', 'entry_name', 'paragraph_id', 'text'].join('\t');
const rows   = [header];

for (const entry of entries) {
  const id   = entry.id   || '';
  const type = entry.type || '';
  const name = esc(entry.name || entry.short || id);
  const content = entry[contentKey] || [];

  if (content.length === 0) {
    rows.push([esc(id), esc(type), name, '', ''].join('\t'));
    continue;
  }
  for (const para of content) {
    rows.push([esc(id), esc(type), name, esc(para.id || ''), esc(para.text || '')].join('\t'));
  }
}

const outPath = `views-export/context-${depth}.tsv`;
if (!dryRun) writeFileSync(outPath, rows.join('\n') + '\n', 'utf8');
console.log(`${dryRun ? '[dry-run] ' : ''}✓ ${outPath}  (${rows.length - 1} rows, ${entries.length} entries)`);
if (!dryRun) console.log(`Edit the "text" column, then run: node scripts/import-context.js --depth ${depth}`);
