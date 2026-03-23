// build-context.js — Node.js 18+, run from repo root
// Reads context-seed.json, writes context.json (schema v2) from narrative chapters
// and fixed seed entries. Expand or edit context.json by hand for Book 2 depth.

import { readFileSync, writeFileSync } from 'fs';

const seed = JSON.parse(readFileSync('context-seed.json', 'utf8'));

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[éèêë]/g, 'e')
    .replace(/[àâ]/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const OFFLINE_SEED_ENTITIES = [
  {
    id: 'vienna',
    type: 'place',
    name: 'Vienna',
    aliases: ['Vienne', 'Wiener'],
    short: 'Imperial residence and political centre of the Habsburg court where Isabelle spent key years.',
  },
  {
    id: 'parma',
    type: 'place',
    name: 'Parma',
    aliases: [],
    short: 'Duchy linked to the Bourbon-Parma house, central to Isabelle’s early life and marriage politics.',
  },
  {
    id: 'habsburg-court',
    type: 'concept',
    name: 'Habsburg court',
    aliases: ['imperial court', 'Viennese court'],
    short: 'The ceremonial and political world in which Isabelle moved as an archduchess.',
  },
  {
    id: 'bourbon-parma',
    type: 'concept',
    name: 'House of Bourbon-Parma',
    aliases: ['Bourbon-Parma'],
    short: 'Isabelle’s dynastic lineage, shaping her education, marriage prospects, and correspondence.',
  },
];

function buildEntries() {
  const entries = OFFLINE_SEED_ENTITIES.map((s) => ({
    ...s,
    content: [],
    images: [],
    letterRefs: [],
    relatedRefs: [],
  }));
  for (const ch of seed.chapters) {
    const id = slugify(ch.title) || ch.id.replace(/^ch-/, '');
    if (entries.some((e) => e.id === id)) continue;
    const first = ch.paragraphs[0]?.text?.slice(0, 280) || ch.title;
    entries.push({
      id,
      type: 'concept',
      name: ch.title,
      aliases: [],
      short: first.slice(0, 200) + (first.length > 200 ? '…' : ''),
      content: ch.paragraphs.map((p) => ({ id: p.id, text: p.text })),
      images: [],
      letterRefs: [],
      relatedRefs: [],
    });
  }
  if (!entries.find((e) => e.id === 'marie-christine')) {
    entries.unshift({
      id: 'marie-christine',
      type: 'person',
      name: 'Marie-Christine of Austria',
      aliases: ['Christine', 'Marie Christine', 'MC', 'Marie-Christine'],
      short: "Isabelle's closest friend, confidante, and sister-in-law. Nearly all of Isabelle's surviving letters are addressed to her.",
      content: [],
      images: [],
      letterRefs: [],
      relatedRefs: [],
    });
  }
  return entries;
}

function main() {
  const entries = buildEntries();
  const context = { schema_version: 2, entries };
  writeFileSync('context.json', JSON.stringify(context, null, 2), 'utf8');
  console.log(`✓ context.json: ${entries.length} entries`);
}

main();
