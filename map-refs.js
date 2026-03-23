// map-refs.js — Node.js 18+, run from repo root
// Reads book.json + context.json; writes contextRefs on letters and letterRefs on entries.

import { readFileSync, writeFileSync } from 'fs';

const book = JSON.parse(readFileSync('book.json', 'utf8'));
const context = JSON.parse(readFileSync('context.json', 'utf8'));

const aliasMap = new Map();
for (const entry of context.entries) {
  const names = [entry.name, ...(entry.aliases || [])];
  for (const name of names) {
    if (!name || typeof name !== 'string') continue;
    aliasMap.set(name.toLowerCase(), entry.id);
  }
}

const sortedAliases = [...aliasMap.entries()].sort((a, b) => b[0].length - a[0].length);

function findRefs(text) {
  if (!text) return [];
  const textLower = text.toLowerCase();
  const found = new Set();
  for (const [alias, id] of sortedAliases) {
    if (alias.length < 4) continue;
    if (textLower.includes(alias)) found.add(id);
  }
  return [...found];
}

let totalRefs = 0;
for (const letter of book.letters) {
  if (!letter.complete) continue;
  const allText = [letter.views.original_french, letter.salutation, letter.closing]
    .filter(Boolean)
    .join(' ');
  letter.contextRefs = findRefs(allText);
  totalRefs += letter.contextRefs.length;
}

for (const entry of context.entries) {
  entry.letterRefs = book.letters
    .filter((l) => l.contextRefs.includes(entry.id))
    .map((l) => l.id);
}

writeFileSync('book.json', JSON.stringify(book, null, 2), 'utf8');
writeFileSync('context.json', JSON.stringify(context, null, 2), 'utf8');

const referenced = book.letters.filter((l) => l.contextRefs.length > 0).length;
console.log(`✓ Mapped ${totalRefs} total refs across ${referenced} letters`);
console.log(
  `  Context entries with letter links: ${context.entries.filter((e) => e.letterRefs.length > 0).length}`
);
