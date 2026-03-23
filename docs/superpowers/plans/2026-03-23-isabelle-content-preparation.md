# Isabelle — Content Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `extract.js` to produce v2-schema `book.json` (letters as first-class objects) and an initial `context.json` (Book 2 seed), then generate all 5 text format views per letter using the Anthropic API.

**Architecture:** Two scripts: `extract.js` parses `Isabelle.html` into the v2 data model; `generate-views.js` calls the Claude API to produce the 5 text views per letter and writes them back into `book.json`. Both are one-time Node.js scripts, not part of the running app.

**Tech Stack:** Node.js 18+, ES modules, `@anthropic-ai/sdk`, `node --test` for validation, `jsdom` (already in devDependencies)

---

## Source HTML Structure Reference

Before touching code, understand what `Isabelle.html` contains:

- **Chapter headings:** `<h2 style="...color:var(--accent)...text-transform:uppercase...">CHAPTER NAME</h2>`
- **Page markers:** `<div style="display:flex;align-items:center;gap:8px..."> <hr ...> page N <hr ...> </div>`
- **All text:** inside `<p style="margin-bottom:12px">` elements (minified, ~53 `<p>` blocks total)
- **Letters to Marie-Christine:** inside the chapter heading matching `LETTERS TO` or `MARIE.CHRISTINE`
- **Letter patterns within prose:** date + salutation at start, signature closing at end
- **Biographical narrative chapters:** everything outside letter sections → seeds `context.json`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `extract.js` | **Rewrite** | Parse HTML → `book.json` (v2) + `context-seed.json` |
| `generate-views.js` | **Create** | Anthropic API batch → populate 5 text views in `book.json` |
| `book.json` | **Generated** | V2 letters schema |
| `context.json` | **Generated** | Book 2 skeleton (entries seeded from biographical chapters) |
| `tests/test-extract.js` | **Create** | Validates `book.json` and `context.json` schema on every run |

---

## Task 0: Install Anthropic SDK

**Files:** `package.json`

- [ ] **Step 0.1: Install SDK**

```bash
cd C:\audio_book && npm install @anthropic-ai/sdk
```

Expected: `node_modules/@anthropic-ai/sdk` appears. `package.json` updated with dependency.

- [ ] **Step 0.2: Verify Node version**

```bash
node --version
```

Expected: `v18.x.x` or higher. If lower, stop and upgrade Node before continuing.

- [ ] **Step 0.3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add anthropic sdk for view generation"
```

---

## Task 1: Write v2 extract.js

**Files:**
- Rewrite: `C:\audio_book\extract.js`
- Create: `C:\audio_book\tests\test-extract.js`

**What the new script must do:**
1. Parse all `<h2>` headings → build chapter list
2. Parse all page markers → build page number map
3. Identify the letter chapter(s) — any `<h2>` matching `LETTERS` or `MARIE` or `CHRISTINE`
4. Within letter chapters: detect individual letters by date+salutation patterns
5. Outside letter chapters: collect biographical paragraphs → `context-seed.json`
6. Write `book.json` (v2 schema, all `views.*` text fields populated for `original_french` only — other views `null` for now)
7. Write `context-seed.json` (biographical chapters as flat text, to be shaped into `context.json` in Task 4)
8. Print completeness report to stdout

- [ ] **Step 1.1: Write test first**

```bash
# Create tests/test-extract.js
```

```js
// tests/test-extract.js
// Run: node --test tests/test-extract.js
// Requires: node extract.js to have already run (produces book.json + context-seed.json)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const book = JSON.parse(readFileSync('book.json', 'utf8'));
const seed = JSON.parse(readFileSync('context-seed.json', 'utf8'));

test('book.json has required top-level fields', () => {
  assert.equal(typeof book.title, 'string');
  assert.equal(typeof book.schema_version, 'number');
  assert.equal(book.schema_version, 2);
  assert.ok(Array.isArray(book.chapters));
  assert.ok(Array.isArray(book.letters));
  assert.equal(typeof book.lastPosition, 'object');
  assert.equal(typeof book.lastPosition.letter_id, 'string');
});

test('book has at least 50 letters', () => {
  assert.ok(book.letters.length >= 50,
    `Expected ≥50 letters, got ${book.letters.length}`);
});

test('every letter has required fields', () => {
  for (const letter of book.letters) {
    assert.ok(letter.id, `letter missing id`);
    assert.ok(letter.letter_number > 0, `${letter.id} missing letter_number`);
    assert.ok(typeof letter.complete === 'boolean', `${letter.id} missing complete`);
    assert.ok(letter.views, `${letter.id} missing views`);
    assert.ok(typeof letter.contextRefs === 'object', `${letter.id} missing contextRefs`);
    assert.ok(Array.isArray(letter.contextRefs), `${letter.id} contextRefs not array`);
  }
});

test('complete letters have original_french text', () => {
  const complete = book.letters.filter(l => l.complete);
  assert.ok(complete.length > 0, 'No complete letters found');
  for (const letter of complete) {
    assert.ok(letter.views.original_french && letter.views.original_french.length > 10,
      `${letter.id} has empty original_french`);
  }
});

test('letter ids are unique and stable format', () => {
  const ids = book.letters.map(l => l.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, 'Duplicate letter IDs found');
  for (const id of ids) {
    assert.match(id, /^letter-\d{3}$/, `ID format wrong: ${id}`);
  }
});

test('context-seed has chapters array', () => {
  assert.ok(Array.isArray(seed.chapters));
  assert.ok(seed.chapters.length > 0, 'No chapters in context seed');
});

test('each chapter in seed has id, title, and paragraphs', () => {
  for (const ch of seed.chapters) {
    assert.ok(ch.id, 'chapter missing id');
    assert.ok(ch.title, 'chapter missing title');
    assert.ok(Array.isArray(ch.paragraphs), `${ch.id} missing paragraphs`);
  }
});
```

- [ ] **Step 1.2: Run test to verify it fails (book.json doesn't exist yet)**

```bash
cd C:\audio_book && node --test tests/test-extract.js
```

Expected: FAIL — `Cannot read file 'book.json'` or similar. Good.

- [ ] **Step 1.3: Write the new extract.js**

```js
// extract.js — Node.js 18+, run from C:\audio_book\
// Usage: node extract.js
// Outputs: book.json (v2), context-seed.json

import { readFileSync, writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';

const html = readFileSync('Isabelle.html', 'utf8');
const dom = new JSDOM(html);
const doc = dom.window.document;

// ── Helpers ────────────────────────────────────────────────────────────────

function cleanText(el) {
  let t = el.textContent || '';
  t = t.replace(/L[ei]a[mr]n?ing\s+reading\s+speed\s+\d+%/gi, '');
  t = t.replace(/\d+\s*%?\s*minutes?\s+(?:ago\s+)?left\s+in\s+chapter\s*\d*\s*%?/gi, '');
  t = t.replace(/Go to most recent page/gi, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Detect if a text block is the start of a letter.
// Returns { date_display, salutation } or null.
const DATE_RE = /^((?:Vienna|Paris|Schönbrunn|Versailles|[A-Z][a-zA-Zé]+)[,\s]+(?:le\s+)?\d{1,2}[\s\w]+\d{4})[,.]?\s*/i;
const SALUTATION_RE = /^(Ma\s+ch[eè]re?\s+\w+[,.]?|Mon\s+ch[eè]r?\s+\w+[,.]?|Dear\s+\w+[,.]?|Très?\s+ch[eè]r?\s+\w+[,.]?)/i;
const CLOSING_RE = /\b(Votre\s+Isabelle|Isabelle\s+de\s+Bourbon|Isabelle\s+de\s+Parme|Votre\s+très?\s+humble|Your\s+Isabelle)\s*\.?\s*$/i;

function detectLetterStart(text) {
  const dateMatch = text.match(DATE_RE);
  if (!dateMatch) return null;
  const rest = text.slice(dateMatch[0].length);
  const salMatch = rest.match(SALUTATION_RE);
  return {
    date_display: dateMatch[1].trim(),
    salutation: salMatch ? salMatch[1].trim() : null,
    body_start: dateMatch[0].length + (salMatch ? salMatch[0].length : 0)
  };
}

function parseDate(dateStr) {
  // Returns ISO date or null
  const months = {
    'janvier':1,'february':2,'février':2,'mars':3,'march':3,
    'avril':4,'april':4,'mai':5,'may':5,'juin':6,'june':6,
    'juillet':7,'july':7,'août':8,'august':8,'septembre':9,'september':9,
    'octobre':10,'october':10,'novembre':11,'november':11,'décembre':12,'december':12
  };
  const m = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (!m) return null;
  const month = months[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
}

// ── Phase 1: Collect all nodes in document order ───────────────────────────

const allNodes = [];
const root = doc.querySelector('[style*="max-width:600px"]') || doc.body;

function walk(node) {
  if (node.nodeType === 1) { // ELEMENT_NODE
    const tag = node.tagName.toLowerCase();
    if (tag === 'h2') {
      allNodes.push({ type: 'heading', text: cleanText(node) });
    } else if (tag === 'div' && node.textContent.match(/page\s+\d+/i) && node.querySelector('hr')) {
      const m = node.textContent.match(/page\s+(\d+)/i);
      if (m) allNodes.push({ type: 'page', number: parseInt(m[1]) });
    } else if (tag === 'p') {
      const text = cleanText(node);
      if (text.length >= 15) allNodes.push({ type: 'para', text });
    } else {
      for (const child of node.childNodes) walk(child);
    }
  }
}
walk(root);

// ── Phase 2: Split into chapters ──────────────────────────────────────────

const chapters = [];
let currentChapter = { id: 'ch-preface', title: 'Preface', nodes: [], page_start: 1 };

for (const node of allNodes) {
  if (node.type === 'heading') {
    if (currentChapter.nodes.length) chapters.push(currentChapter);
    const id = 'ch-' + slugify(node.text);
    currentChapter = { id, title: node.text, nodes: [], page_start: null };
  } else {
    if (node.type === 'page' && currentChapter.page_start === null) {
      currentChapter.page_start = node.number;
    }
    currentChapter.nodes.push(node);
  }
}
if (currentChapter.nodes.length) chapters.push(currentChapter);

// ── Phase 3: Identify letter chapters ────────────────────────────────────

function isLetterChapter(title) {
  return /letter|marie|christine|correspondence/i.test(title);
}

const letterChapters = chapters.filter(ch => isLetterChapter(ch.title));
const narrativeChapters = chapters.filter(ch => !isLetterChapter(ch.title));

console.log(`Found ${chapters.length} chapters: ${letterChapters.length} letter, ${narrativeChapters.length} narrative`);

// ── Phase 4: Extract individual letters ──────────────────────────────────

let letterNum = 0;
const letters = [];
const bookChapters = [];

for (const ch of letterChapters) {
  const chLetters = [];
  let currentLetter = null;
  let currentPage = ch.page_start || 1;

  for (const node of ch.nodes) {
    if (node.type === 'page') { currentPage = node.number; continue; }
    if (node.type !== 'para') continue;

    const start = detectLetterStart(node.text);
    if (start) {
      // Save previous letter
      if (currentLetter) chLetters.push(currentLetter);
      letterNum++;
      const id = `letter-${String(letterNum).padStart(3, '0')}`;
      currentLetter = {
        id,
        letter_number: letterNum,
        date_iso: parseDate(start.date_display),
        date_display: start.date_display,
        recipient: 'Marie-Christine',
        recipient_id: 'marie-christine',
        location: null,
        salutation: start.salutation || null,
        closing: null,
        chapter_id: ch.id,
        page: currentPage,
        complete: true,
        contextRefs: [],
        images: { photocopy: null, photocopy_alt: null, isabelle_portraits: [] },
        views: {
          original_french: node.text.slice(start.body_start).trim() || node.text,
          modern_french: null,
          literal_english_old: null,
          literal_english_modern: null,
          plain_english: null
        }
      };
    } else if (currentLetter) {
      // Check for closing
      const closingMatch = node.text.match(CLOSING_RE);
      if (closingMatch) {
        currentLetter.closing = closingMatch[1].trim();
        currentLetter.views.original_french += '\n\n' + node.text;
      } else {
        currentLetter.views.original_french += '\n\n' + node.text;
      }
    }
  }
  if (currentLetter) chLetters.push(currentLetter);

  letters.push(...chLetters);
  bookChapters.push({
    id: ch.id,
    title: ch.title,
    letter_ids: chLetters.map(l => l.id),
    page_start: ch.page_start
  });
  console.log(`  Chapter "${ch.title}": ${chLetters.length} letters extracted`);
}

// ── Phase 5: Completeness check against known count ──────────────────────

const KNOWN_LETTER_COUNT = 194; // known historical count of letters to Marie-Christine
const placeholderCount = KNOWN_LETTER_COUNT - letters.length;
if (placeholderCount > 0) {
  console.warn(`⚠ ${placeholderCount} letters may be missing. Adding placeholder slots.`);
  for (let i = 0; i < placeholderCount; i++) {
    letterNum++;
    letters.push({
      id: `letter-${String(letterNum).padStart(3,'0')}`,
      letter_number: letterNum,
      date_iso: null,
      date_display: null,
      recipient: 'Marie-Christine',
      recipient_id: 'marie-christine',
      location: null,
      salutation: null,
      closing: null,
      chapter_id: bookChapters[bookChapters.length - 1]?.id || 'ch-letters-marie-christine',
      page: null,
      complete: false,
      contextRefs: [],
      images: { photocopy: null, photocopy_alt: null, isabelle_portraits: [] },
      views: {
        original_french: null, modern_french: null,
        literal_english_old: null, literal_english_modern: null, plain_english: null
      }
    });
  }
}

// ── Phase 6: Write book.json ──────────────────────────────────────────────

const book = {
  title: 'Isabelle',
  subtitle: 'A Collection of Letters',
  author: 'Isabelle de Bourbon-Parma',
  editor: 'Naziyah',
  schema_version: 2,
  lastPosition: {
    letter_id: letters[0]?.id || 'letter-001',
    paragraph_index: 0,
    scroll_offset: 0,
    active_view: 'plain_english',
    timestamp: 0
  },
  defaultView: 'plain_english',
  chapters: bookChapters,
  letters
};

writeFileSync('book.json', JSON.stringify(book, null, 2), 'utf8');

// ── Phase 7: Write context-seed.json ─────────────────────────────────────

const contextSeed = {
  chapters: narrativeChapters.map(ch => ({
    id: ch.id,
    title: ch.title,
    page_start: ch.page_start,
    paragraphs: ch.nodes
      .filter(n => n.type === 'para')
      .map((n, i) => ({ id: `${ch.id}-para-${String(i+1).padStart(3,'0')}`, text: n.text }))
  }))
};

writeFileSync('context-seed.json', JSON.stringify(contextSeed, null, 2), 'utf8');

// ── Report ────────────────────────────────────────────────────────────────

const complete = letters.filter(l => l.complete).length;
const incomplete = letters.filter(l => !l.complete).length;
console.log(`\n✓ book.json: ${letters.length} letters (${complete} complete, ${incomplete} placeholders)`);
console.log(`✓ context-seed.json: ${contextSeed.chapters.length} narrative chapters`);
console.log(`  Total narrative paragraphs: ${contextSeed.chapters.reduce((s, ch) => s + ch.paragraphs.length, 0)}`);

if (complete < 50) {
  console.error('✗ Fewer than 50 complete letters. Check letter detection patterns in extract.js.');
  process.exit(1);
}
```

- [ ] **Step 1.4: Run extract.js**

```bash
cd C:\audio_book && node extract.js
```

Expected stdout (approximate):
```
Found N chapters: M letter, K narrative
  Chapter "LETTERS TO MARIE-CHRISTINE": ~150 letters extracted
⚠ N letters may be missing. Adding placeholder slots.

✓ book.json: 194 letters (150 complete, 44 placeholders)
✓ context-seed.json: K narrative chapters
```

If `complete < 50` or the script exits with code 1, the letter detection patterns need tuning. Inspect `book.json` manually — look at the first few letters, check `original_french` text looks right, verify `salutation` and `date_display` are populated. Adjust the regex patterns in `detectLetterStart()` to match the actual text patterns found in the HTML.

- [ ] **Step 1.5: Run tests**

```bash
cd C:\audio_book && node --test tests/test-extract.js
```

Expected: All tests PASS. If any fail, fix the extraction logic and re-run steps 1.4–1.5.

- [ ] **Step 1.6: Manually inspect book.json**

Open `book.json` in an editor. Spot-check 5 random letters:
- `date_display` is a readable date string
- `salutation` is present on letters that have one
- `views.original_french` contains coherent French letter text (not biographical prose)
- `complete: false` letters have all `views.*` as `null`

Fix any systematic issues in `extract.js` and re-run.

- [ ] **Step 1.7: Commit**

```bash
git add extract.js tests/test-extract.js book.json context-seed.json
git commit -m "feat: rewrite extract.js for v2 schema — letter detection + context seed"
```

---

## Task 2: Generate Format Views (Anthropic API)

**Files:**
- Create: `C:\audio_book\generate-views.js`

This script reads `book.json`, iterates over complete letters, and for each letter calls the Claude API to generate the 4 remaining text views. It writes results back to `book.json` after each batch of 10 letters so progress is saved if the script is interrupted.

**Prerequisite:** Set `ANTHROPIC_API_KEY` in your environment.

- [ ] **Step 2.1: Set API key**

```bash
# Windows — run in the terminal session before executing the script
set ANTHROPIC_API_KEY=your_key_here
```

Or add to a `.env` file (do NOT commit this file):
```
ANTHROPIC_API_KEY=sk-ant-...
```

Add `.env` to `.gitignore`:
```bash
echo ".env" >> .gitignore
```

- [ ] **Step 2.2: Write generate-views.js**

```js
// generate-views.js — Node.js 18+, run from C:\audio_book\
// Usage: node generate-views.js
// Reads: book.json  Writes: book.json (in place, batched)
// Requires: ANTHROPIC_API_KEY env var

import { readFileSync, writeFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const book = JSON.parse(readFileSync('book.json', 'utf8'));

const BATCH_SIZE = 10;
const letters = book.letters.filter(l => l.complete && !l.views.plain_english);

console.log(`Generating views for ${letters.length} letters...`);

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
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }]
  });

  const raw = msg.content[0].text.trim();
  // Strip markdown code fences if present
  const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(jsonStr);
}

async function run() {
  let processed = 0;
  for (let i = 0; i < letters.length; i += BATCH_SIZE) {
    const batch = letters.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (letter) => {
      try {
        const views = await generateViews(letter);
        // Find and update the letter in book.letters
        const target = book.letters.find(l => l.id === letter.id);
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
        // Leave views as null — script is resumable
      }
    }));
    // Save progress after each batch
    writeFileSync('book.json', JSON.stringify(book, null, 2), 'utf8');
    console.log(`\n  Batch saved (${Math.min(i + BATCH_SIZE, letters.length)}/${letters.length})`);
  }
  const remaining = book.letters.filter(l => l.complete && !l.views.plain_english).length;
  console.log(`\n✓ Done. ${processed} letters updated. ${remaining} still missing views (re-run to retry).`);
}

run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2.3: Run generate-views.js**

```bash
cd C:\audio_book && node generate-views.js
```

This will take several minutes depending on letter count. Progress is saved every 10 letters — if interrupted, re-run and it will skip already-generated letters.

Expected final output:
```
✓ Done. N letters updated. 0 still missing views (re-run to retry).
```

If `remaining > 0`, re-run the script once. If failures persist, inspect the specific letter IDs printed in error lines — the `original_french` text may be malformed for those letters.

- [ ] **Step 2.4: Validate views were written**

```bash
node -e "
  const b = JSON.parse(require('fs').readFileSync('book.json','utf8'));
  const complete = b.letters.filter(l => l.complete);
  const hasAll = complete.filter(l => l.views.plain_english && l.views.modern_french);
  console.log('Complete letters:', complete.length);
  console.log('With all views:', hasAll.length);
  console.log('Missing views:', complete.length - hasAll.length);
"
```

Expected: `Missing views: 0`

- [ ] **Step 2.5: Spot-check 3 letters manually**

Open `book.json` and find letters at positions ~10, ~80, ~150. For each:
- Verify `modern_french` is readable modern French
- Verify `plain_english` reads naturally in English
- Verify `literal_english_old` is obviously more awkward/archaic than `plain_english`
- Verify none of the views contain JSON artifacts or error text

- [ ] **Step 2.6: Commit**

```bash
git add generate-views.js book.json .gitignore
git commit -m "feat: generate all 4 format views for complete letters via Claude API"
```

---

## Task 3: Build context.json

**Files:**
- Create: `C:\audio_book\build-context.js`
- Produces: `C:\audio_book\context.json`

This script takes `context-seed.json` (biographical narrative chapters) and builds the initial `context.json` with typed entries (people, places, events). It also calls the Claude API to extract named entities from the biographical text and create stubs.

- [ ] **Step 3.1: Write build-context.js**

```js
// build-context.js — Node.js 18+, run from C:\audio_book\
// Usage: node build-context.js
// Reads: context-seed.json   Writes: context.json

import { readFileSync, writeFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const seed = JSON.parse(readFileSync('context-seed.json', 'utf8'));

function slugify(str) {
  return str.toLowerCase().replace(/[éèêë]/g,'e').replace(/[àâ]/g,'a')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

const allText = seed.chapters.map(ch =>
  ch.paragraphs.map(p => p.text).join('\n')
).join('\n\n');

async function extractEntities() {
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
${allText.slice(0, 12000)}`; // Claude context limit safety — first 12k chars

  const msg = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  });
  const raw = msg.content[0].text.trim().replace(/^```json?\s*/i,'').replace(/\s*```$/i,'');
  return JSON.parse(raw);
}

async function run() {
  console.log('Extracting named entities from biographical text...');
  let entities;
  try {
    entities = await extractEntities();
    console.log(`  Found ${entities.length} entities`);
  } catch (err) {
    console.error('Entity extraction failed:', err.message);
    entities = [];
  }

  // Build entries from entities
  const entries = entities.map((entity, i) => ({
    id: slugify(entity.name),
    type: entity.type || 'person',
    name: entity.name,
    aliases: entity.aliases || [],
    short: entity.short || '',
    content: [],          // to be filled in Task 4
    images: [],
    letterRefs: [],       // to be filled in Task 4
    relatedRefs: []
  }));

  // Deduplicate by id
  const seen = new Set();
  const deduped = entries.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  // Add Marie-Christine as a guaranteed entry
  if (!deduped.find(e => e.id === 'marie-christine')) {
    deduped.unshift({
      id: 'marie-christine',
      type: 'person',
      name: 'Marie-Christine of Austria',
      aliases: ['Christine', 'Marie Christine', 'MC', 'Marie-Christine'],
      short: "Isabelle's closest friend, confidante, and sister-in-law. Nearly all of Isabelle's surviving letters are addressed to her.",
      content: [],
      images: [],
      letterRefs: [],
      relatedRefs: []
    });
  }

  // Attach narrative paragraphs as content to the most relevant entry
  // (simple heuristic: assign each chapter's paragraphs to the entry whose name appears most in that chapter)
  for (const ch of seed.chapters) {
    const chText = ch.paragraphs.map(p => p.text).join(' ').toLowerCase();
    let bestEntry = null;
    let bestCount = 0;
    for (const entry of deduped) {
      const count = (chText.match(new RegExp(slugify(entry.name).replace(/-/g,'[\\s-]'), 'gi')) || []).length;
      if (count > bestCount) { bestCount = count; bestEntry = entry; }
    }
    if (bestEntry && bestCount >= 2) {
      bestEntry.content.push(...ch.paragraphs.map(p => ({ id: `${bestEntry.id}-${p.id}`, text: p.text })));
    }
  }

  const context = { schema_version: 2, entries: deduped };
  writeFileSync('context.json', JSON.stringify(context, null, 2), 'utf8');
  console.log(`✓ context.json: ${deduped.length} entries`);
}

run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3.2: Run build-context.js**

```bash
cd C:\audio_book && node build-context.js
```

Expected:
```
Extracting named entities from biographical text...
  Found ~30-60 entities
✓ context.json: N entries
```

- [ ] **Step 3.3: Validate context.json**

```bash
node -e "
  const c = JSON.parse(require('fs').readFileSync('context.json','utf8'));
  console.log('Entries:', c.entries.length);
  const people = c.entries.filter(e => e.type === 'person').length;
  const places = c.entries.filter(e => e.type === 'place').length;
  const events = c.entries.filter(e => e.type === 'event').length;
  console.log('People:', people, '  Places:', places, '  Events:', events);
  const mcEntry = c.entries.find(e => e.id === 'marie-christine');
  console.log('Marie-Christine present:', !!mcEntry);
"
```

Expected: At least 10 people entries, Marie-Christine present.

- [ ] **Step 3.4: Commit**

```bash
git add build-context.js context.json context-seed.json
git commit -m "feat: build initial context.json with entity extraction"
```

---

## Task 4: Establish Initial contextRefs Mappings

**Files:**
- Create: `C:\audio_book\map-refs.js`

This script scans each complete letter's `original_french` text for matches against `context.json` entry aliases, then writes `contextRefs` arrays back to `book.json`. Also writes `letterRefs` arrays back to `context.json`.

- [ ] **Step 4.1: Write map-refs.js**

```js
// map-refs.js — Node.js 18+, run from C:\audio_book\
// Usage: node map-refs.js
// Reads: book.json + context.json   Writes: both files updated

import { readFileSync, writeFileSync } from 'fs';

const book = JSON.parse(readFileSync('book.json', 'utf8'));
const context = JSON.parse(readFileSync('context.json', 'utf8'));

// Build alias lookup: aliasLower → entry.id
const aliasMap = new Map();
for (const entry of context.entries) {
  const names = [entry.name, ...(entry.aliases || [])];
  for (const name of names) {
    aliasMap.set(name.toLowerCase(), entry.id);
  }
}

// Sort aliases by length descending (longest-match-first)
const sortedAliases = [...aliasMap.entries()].sort((a, b) => b[0].length - a[0].length);

function findRefs(text) {
  if (!text) return [];
  const textLower = text.toLowerCase();
  const found = new Set();
  for (const [alias, id] of sortedAliases) {
    if (alias.length < 4) continue; // skip very short aliases
    if (textLower.includes(alias)) found.add(id);
  }
  return [...found];
}

// Map letters → contextRefs
let totalRefs = 0;
for (const letter of book.letters) {
  if (!letter.complete) continue;
  const allText = [
    letter.views.original_french,
    letter.salutation,
    letter.closing
  ].filter(Boolean).join(' ');
  letter.contextRefs = findRefs(allText);
  totalRefs += letter.contextRefs.length;
}

// Map context entries → letterRefs
for (const entry of context.entries) {
  entry.letterRefs = book.letters
    .filter(l => l.contextRefs.includes(entry.id))
    .map(l => l.id);
}

writeFileSync('book.json', JSON.stringify(book, null, 2), 'utf8');
writeFileSync('context.json', JSON.stringify(context, null, 2), 'utf8');

const referenced = book.letters.filter(l => l.contextRefs.length > 0).length;
console.log(`✓ Mapped ${totalRefs} total refs across ${referenced} letters`);
console.log(`  Context entries with letter links: ${context.entries.filter(e => e.letterRefs.length > 0).length}`);
```

- [ ] **Step 4.2: Run map-refs.js**

```bash
cd C:\audio_book && node map-refs.js
```

Expected:
```
✓ Mapped ~200+ total refs across ~100+ letters
  Context entries with letter links: ~20+
```

If `total refs` is 0, the alias matching failed. Inspect `context.json` — check that entries have `aliases` arrays populated and that the aliases match text that actually appears in the letters.

- [ ] **Step 4.3: Run full test suite**

```bash
cd C:\audio_book && node --test tests/test-extract.js
```

All tests should still pass. The mapping additions don't break schema.

- [ ] **Step 4.4: Commit**

```bash
git add map-refs.js book.json context.json
git commit -m "feat: initial contextRefs and letterRefs mapping via alias scan"
```

---

## Task 5: Final Validation

- [ ] **Step 5.1: Write schema validation test**

Add to `tests/test-extract.js`:

```js
// Append to existing test file
import { readFileSync as rf2 } from 'fs';
const ctx = JSON.parse(rf2('context.json', 'utf8'));

test('context.json schema_version is 2', () => {
  assert.equal(ctx.schema_version, 2);
});

test('all context entry ids are unique', () => {
  const ids = ctx.entries.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('all letterRefs in context exist in book', () => {
  const letterIds = new Set(book.letters.map(l => l.id));
  for (const entry of ctx.entries) {
    for (const ref of entry.letterRefs) {
      assert.ok(letterIds.has(ref), `Context entry ${entry.id} references unknown letter ${ref}`);
    }
  }
});

test('all contextRefs in letters exist in context', () => {
  const entryIds = new Set(ctx.entries.map(e => e.id));
  for (const letter of book.letters) {
    for (const ref of letter.contextRefs) {
      assert.ok(entryIds.has(ref), `Letter ${letter.id} references unknown context entry ${ref}`);
    }
  }
});

test('no complete letter has null plain_english', () => {
  const missing = book.letters.filter(l => l.complete && !l.views.plain_english);
  assert.equal(missing.length, 0,
    `${missing.length} complete letters still missing plain_english: ${missing.map(l=>l.id).join(', ')}`);
});
```

- [ ] **Step 5.2: Run tests**

```bash
cd C:\audio_book && node --test tests/test-extract.js
```

Expected: All tests PASS.

- [ ] **Step 5.3: Final commit**

```bash
git add tests/test-extract.js
git commit -m "test: add cross-reference integrity checks to extract test suite"
```

---

## Completion Criteria

Content preparation is done when:
- `book.json` exists with ≥50 complete letters, all having 5 text views populated
- `context.json` exists with ≥10 entries, all with `letterRefs` populated
- All cross-reference integrity tests pass
- `node --test tests/test-extract.js` exits 0

Proceed to `2026-03-23-isabelle-app-build.md`.
