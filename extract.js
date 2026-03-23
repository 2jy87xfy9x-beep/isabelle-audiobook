// extract.js — Node.js 18+, run from C:\audio_book\
// Usage: node extract.js
// Output: book.json

import { readFileSync, writeFileSync } from 'fs';

const html = readFileSync('Isabelle.html', 'utf8');

// ── Step 1: Extract raw text from every <p> block ─────────────────────────
const pMatches = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => m[1]);

function cleanHtml(raw) {
  // Strip nested <div>...</div> blocks (page markers, UI chrome)
  let t = raw.replace(/<div[\s\S]*?<\/div>/g, ' ');
  // Strip all remaining HTML tags
  t = t.replace(/<[^>]+>/g, ' ');
  // Strip noise markers
  t = t.replace(/Leaming\s+reading\s+\S*/g, '');
  t = t.replace(/\d+ minutes? left in chapter \d+%/gi, '');
  t = t.replace(/\d+ minute ago left in chapter \d+%/gi, '');
  t = t.replace(/\d+ minute\(s\) left in chapter \d+%/gi, '');
  // Decode HTML entities
  t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ');
  // Collapse whitespace
  return t.replace(/\s+/g, ' ').trim();
}

// ── Step 2: Sub-split long blocks on sentence boundaries ──────────────────
function splitSentences(text, maxLen = 400) {
  // Split on . ! ? followed by whitespace + capital letter (avoids mid-sentence splits)
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z"])/);
  const result = [];
  let current = '';
  for (const s of parts) {
    if (current && current.length + s.length + 1 > maxLen) {
      result.push(current.trim());
      current = s;
    } else {
      current = current ? current + ' ' + s : s;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

// ── Step 3: Build paragraph objects ──────────────────────────────────────
const rawTexts = [];
for (const p of pMatches) {
  const text = cleanHtml(p);
  if (text.length < 20) continue; // drop fragments
  if (text.length > 400) {
    rawTexts.push(...splitSentences(text));
  } else {
    rawTexts.push(text);
  }
}

const paragraphs = rawTexts
  .filter(t => t.length >= 20)
  .filter(t => !t.includes('Go to most recent page'))
  .map((text, i) => ({
    id: i + 1,
    text,
    type: 'normal',
    style: {
      fontFamily: null,
      color: null,
      marginLeft: null,
      indent: null,
      bold: false,
      italic: false,
      underline: false
    }
  }));

// ── Step 4: Write output ──────────────────────────────────────────────────
const book = {
  title: 'Isabelle',
  author: 'Naziyah',
  lastPosition: 0,
  lastPositionTimestamp: 0,
  paragraphs
};

writeFileSync('book.json', JSON.stringify(book, null, 2), 'utf8');
console.log(`✓ Extracted ${paragraphs.length} paragraphs to book.json`);

if (paragraphs.length < 100) {
  console.warn('⚠ Warning: paragraph count is suspiciously low. Check book.json manually.');
  process.exit(1);
}
