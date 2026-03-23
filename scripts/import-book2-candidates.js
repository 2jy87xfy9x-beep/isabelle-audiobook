// scripts/import-book2-candidates.js — Node.js 18+, run from repo root
// Usage: node scripts/import-book2-candidates.js [--dry-run]
//
// Reads views-export/book2-candidates.json (produced by clean-letters.js)
// and merges historian footnotes into context.json as:
//
//   • Named persons/places with dates → new context entry (if not already present)
//   • Editorial notes without a clear name → content paragraphs on a per-letter
//     "annotations" concept entry (id: "<letter_id>-notes")
//
// Existing entries are never overwritten — only content[] is appended to.
// Run with --dry-run to preview without writing.

import { readFileSync, writeFileSync, existsSync } from 'fs';

const dryRun = process.argv.includes('--dry-run');

const context  = JSON.parse(readFileSync('context.json', 'utf8'));
const { candidates } = JSON.parse(readFileSync('views-export/book2-candidates.json', 'utf8'));

function slugify(str) {
  return str.toLowerCase()
    .replace(/[éèêë]/g, 'e').replace(/[àâ]/g, 'a')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function paraId(entryId, text) {
  // Stable id from entry + first 30 chars of text
  const slug = slugify(text.slice(0, 30));
  return `${entryId}-${slug}`.slice(0, 60);
}

const entryMap = new Map(context.entries.map(e => [e.id, e]));

let newEntries = 0;
let newParas = 0;
let skipped = 0;

for (const cand of candidates) {
  const text = cand.content_text?.trim();
  if (!text || text.length < 10) { skipped++; continue; }

  // ── Named entry (person / place with suggested_id) ──────────────────────
  if (cand.suggested_id && cand.name) {
    const id = cand.suggested_id;
    if (!entryMap.has(id)) {
      const entry = {
        id,
        type: cand.type || 'person',
        name: cand.name,
        aliases: [],
        short: text.split('.')[0].trim().slice(0, 200),
        content: [{ id: paraId(id, text), text }],
        images: [],
        letterRefs: [cand.source_letter],
        relatedRefs: [],
      };
      if (cand.dates) entry.dates = cand.dates;
      context.entries.push(entry);
      entryMap.set(id, entry);
      newEntries++;
      console.log(`  + new entry: ${id} (${cand.type})`);
    } else {
      // Append content if not duplicate
      const entry = entryMap.get(id);
      const pid = paraId(id, text);
      if (!entry.content.some(p => p.id === pid || p.text === text)) {
        entry.content.push({ id: pid, text });
        newParas++;
        console.log(`  ~ appended para to: ${id}`);
      } else {
        skipped++;
      }
      if (!entry.letterRefs.includes(cand.source_letter)) {
        entry.letterRefs.push(cand.source_letter);
      }
    }
    continue;
  }

  // ── Editorial note without a clear name → per-letter annotations entry ──
  const annotId = `${cand.source_letter}-notes`;
  if (!entryMap.has(annotId)) {
    const entry = {
      id: annotId,
      type: 'concept',
      name: `Editor's notes — ${cand.source_letter}`,
      aliases: [],
      short: "Historian's editorial annotations for this letter.",
      content: [],
      images: [],
      letterRefs: [cand.source_letter],
      relatedRefs: [],
    };
    context.entries.push(entry);
    entryMap.set(annotId, entry);
    newEntries++;
    console.log(`  + new entry: ${annotId}`);
  }

  const entry = entryMap.get(annotId);
  const pid = paraId(annotId, text);
  if (!entry.content.some(p => p.id === pid || p.text === text)) {
    entry.content.push({ id: pid, text });
    newParas++;
  } else {
    skipped++;
  }
}

console.log(`\nNew entries:    ${newEntries}`);
console.log(`New paragraphs: ${newParas}`);
console.log(`Skipped:        ${skipped}`);
console.log(`Total entries:  ${context.entries.length}`);

if (dryRun) {
  console.log('\n--dry-run: context.json not written.');
  process.exit(0);
}

writeFileSync('context.json', JSON.stringify(context, null, 2), 'utf8');
console.log('✓ context.json updated');
