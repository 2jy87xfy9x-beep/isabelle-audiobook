// generate-views.js — Node.js 18+, run from repo root
// Reads book.json, fills 4 translated views per complete letter, writes book.json in batches.
// Set ANTHROPIC_API_KEY for API generation; if unset, copies original_french into all views (offline fallback).

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
const BATCH_SIZE = 10;

const book = JSON.parse(readFileSync('book.json', 'utf8'));
const letters = book.letters.filter((l) => l.complete && !l.views.plain_english);

function offlineFill() {
  for (const letter of book.letters) {
    if (!letter.complete) continue;
    const o = letter.views.original_french;
    letter.views.modern_french = o;
    letter.views.literal_english_old = o;
    letter.views.literal_english_modern = o;
    letter.views.plain_english = o;
  }
  writeFileSync('book.json', JSON.stringify(book, null, 2), 'utf8');
  console.log('✓ Offline mode: copied original_french into all text views for complete letters.');
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      'ANTHROPIC_API_KEY not set — using offline copy (set key + re-run for real translations).'
    );
    offlineFill();
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  console.log(`Generating views for ${letters.length} letters (model ${MODEL})...`);

  const SYSTEM = `You are a scholarly translator working on the letters of Isabelle de Bourbon-Parma (1741–1763), an Austrian archduchess who wrote predominantly in French. You produce accurate, nuanced translations that preserve the emotional and historical character of her writing.`;

  async function generateViews(letter) {
    const original = letter.views.original_french;
    const prompt = `Here is a letter by Isabelle de Bourbon-Parma in its original French:

---
${original}
---

Produce exactly four versions. Return them as a JSON object with these exact keys:
{
  "modern_french": "...",
  "literal_english_old": "...",
  "literal_english_modern": "...",
  "plain_english": "..."
}

Rules:
- modern_french: Rewrite in clear, contemporary French while preserving tone and content. Keep proper nouns unchanged.
- literal_english_old: A word-for-word English translation of the original French. Preserve archaic grammar. It may read awkwardly — that is correct.
- literal_english_modern: A word-for-word English translation of the modern_french version. It may also read somewhat awkwardly.
- plain_english: A natural, readable English version for modern general readers. Preserve the emotional truth and voice. No footnotes, no brackets.

Return ONLY the JSON object. No markdown, no explanation.`;

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = msg.content[0].text.trim();
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    return JSON.parse(jsonStr);
  }

  let processed = 0;
  for (let i = 0; i < letters.length; i += BATCH_SIZE) {
    const batch = letters.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (letter) => {
        try {
          const views = await generateViews(letter);
          const target = book.letters.find((l) => l.id === letter.id);
          if (target) {
            target.views.modern_french = views.modern_french;
            target.views.literal_english_old = views.literal_english_old;
            target.views.literal_english_modern = views.literal_english_modern;
            target.views.plain_english = views.plain_english;
          }
          processed++;
          process.stdout.write(`\r  ${processed}/${letters.length} complete`);
        } catch (err) {
          console.error(`\n✗ Failed for ${letter.id}: ${err.message}`);
        }
      })
    );
    writeFileSync('book.json', JSON.stringify(book, null, 2), 'utf8');
    console.log(
      `\n  Batch saved (${Math.min(i + BATCH_SIZE, letters.length)}/${letters.length})`
    );
  }

  const remaining = book.letters.filter(
    (l) => l.complete && !l.views.plain_english
  ).length;
  console.log(
    `\n✓ Done. ${processed} letters updated. ${remaining} still missing views (re-run to retry).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
