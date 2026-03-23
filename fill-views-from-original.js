// fill-views-from-original.js — Node.js 18+, run from repo root
// For each complete letter, if modern_french / literal_* / plain_english are still null,
// copies views.original_french into those fields. Use after extract.js when the source
// column is the canonical body; replace text later via editorial workflow or hand edits.

import { readFileSync, writeFileSync } from 'fs';

const book = JSON.parse(readFileSync('book.json', 'utf8'));
let n = 0;
for (const letter of book.letters) {
  if (!letter.complete) continue;
  const o = letter.views?.original_french;
  if (!o) continue;
  if (!letter.views.modern_french) {
    letter.views.modern_french = o;
    n++;
  }
  if (!letter.views.literal_english_old) letter.views.literal_english_old = o;
  if (!letter.views.literal_english_modern) letter.views.literal_english_modern = o;
  if (!letter.views.plain_english) letter.views.plain_english = o;
}
writeFileSync('book.json', JSON.stringify(book, null, 2), 'utf8');
console.log(`✓ Updated view fallbacks for ${n} letters (touched fields that were null).`);
