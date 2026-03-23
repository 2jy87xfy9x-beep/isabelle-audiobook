// build-context.js — Node.js 18+, run from repo root
// Reads context-seed.json, writes context.json (schema v2).
// With ANTHROPIC_API_KEY: entity extraction via Claude. Without: chapter-based stub entries.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

function loadDotEnv() {
  if (!existsSync('.env')) return;
  const raw = readFileSync('.env', 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) process.env.ANTHROPIC_API_KEY = m[1].replace(/^["']|["']$/g, '');
  }
}
loadDotEnv();

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
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

function offlineEntries() {
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

async function extractEntities(client) {
  const allText = seed.chapters.map((ch) => ch.paragraphs.map((p) => p.text).join('\n')).join('\n\n');
  const prompt = `Below is the text of a biography of Isabelle de Bourbon-Parma (1741–1763).

Extract all significant named entities. Return a JSON array of objects, each with:
{
  "name": "Full name or title",
  "type": "person|place|event|concept",
  "aliases": ["alternative spellings or short names"],
  "short": "One sentence description",
  "chapter_hint": "which chapter this is most associated with"
}

Include: all named people, all named places, all named historical events, any key concepts (e.g. 'court etiquette').
Exclude: Isabelle herself (she is the author), generic terms.
Return ONLY the JSON array, no markdown.

TEXT:
${allText.slice(0, 12000)}`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const raw = msg.content[0].text
    .trim()
    .replace(/^```json?\s*/i, '')
    .replace(/\s*```$/i, '');
  return JSON.parse(raw);
}

async function main() {
  let entries;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      'ANTHROPIC_API_KEY not set — building context from narrative chapters only (offline).'
    );
    entries = offlineEntries();
  } else {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log('Extracting named entities from biographical text...');
    let entities;
    try {
      entities = await extractEntities(client);
      console.log(`  Found ${entities.length} entities`);
    } catch (err) {
      console.error('Entity extraction failed:', err.message);
      entities = [];
    }

    entries = entities.map((entity) => ({
      id: slugify(entity.name),
      type: entity.type || 'person',
      name: entity.name,
      aliases: entity.aliases || [],
      short: entity.short || '',
      content: [],
      images: [],
      letterRefs: [],
      relatedRefs: [],
    }));

    const seen = new Set();
    entries = entries.filter((e) => {
      if (!e.id || seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

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

    for (const ch of seed.chapters) {
      const chText = ch.paragraphs.map((p) => p.text).join(' ').toLowerCase();
      let bestEntry = null;
      let bestCount = 0;
      for (const entry of entries) {
        const needle = entry.name.toLowerCase().slice(0, 40);
        if (needle.length < 3) continue;
        const n = (chText.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
        if (n > bestCount) {
          bestCount = n;
          bestEntry = entry;
        }
      }
      if (bestEntry && bestCount >= 1) {
        for (const p of ch.paragraphs) {
          bestEntry.content.push({ id: `${bestEntry.id}-${p.id}`, text: p.text });
        }
      }
    }
  }

  const context = { schema_version: 2, entries };
  writeFileSync('context.json', JSON.stringify(context, null, 2), 'utf8');
  console.log(`✓ context.json: ${entries.length} entries`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
