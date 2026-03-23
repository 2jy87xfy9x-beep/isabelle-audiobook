// Run: node --test tests/test-extract.js
// Requires: node extract.js (book.json + context-seed.json); later: context.json from build-context.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';

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
  assert.ok(
    book.letters.length >= 50,
    `Expected ≥50 letters, got ${book.letters.length}`
  );
});

test('every letter has required fields', () => {
  for (const letter of book.letters) {
    assert.ok(letter.id, 'letter missing id');
    assert.ok(letter.letter_number > 0, `${letter.id} missing letter_number`);
    assert.ok(typeof letter.complete === 'boolean', `${letter.id} missing complete`);
    assert.ok(letter.views, `${letter.id} missing views`);
    assert.ok(typeof letter.contextRefs === 'object', `${letter.id} missing contextRefs`);
    assert.ok(Array.isArray(letter.contextRefs), `${letter.id} contextRefs not array`);
  }
});

test('complete letters have original_french text', () => {
  const complete = book.letters.filter((l) => l.complete);
  assert.ok(complete.length > 0, 'No complete letters found');
  for (const letter of complete) {
    assert.ok(
      letter.views.original_french && letter.views.original_french.length > 10,
      `${letter.id} has empty original_french`
    );
  }
});

test('letter ids are unique and stable format', () => {
  const ids = book.letters.map((l) => l.id);
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

// ── Task 5: cross-refs + plain_english (requires full pipeline) ────────────
if (existsSync('context.json')) {
  const ctx = JSON.parse(readFileSync('context.json', 'utf8'));

  test('context.json schema_version is 2', () => {
    assert.equal(ctx.schema_version, 2);
  });

  test('context has at least 10 entries', () => {
    assert.ok(
      ctx.entries.length >= 10,
      `Expected ≥10 context entries, got ${ctx.entries.length}`
    );
  });

  test('marie-christine entry present', () => {
    assert.ok(
      ctx.entries.some((e) => e.id === 'marie-christine'),
      'marie-christine missing from context.json'
    );
  });

  test('all context entry ids are unique', () => {
    const ids = ctx.entries.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('all letterRefs in context exist in book', () => {
    const letterIds = new Set(book.letters.map((l) => l.id));
    for (const entry of ctx.entries) {
      for (const ref of entry.letterRefs) {
        assert.ok(
          letterIds.has(ref),
          `Context entry ${entry.id} references unknown letter ${ref}`
        );
      }
    }
  });

  test('all contextRefs in letters exist in context', () => {
    const entryIds = new Set(ctx.entries.map((e) => e.id));
    for (const letter of book.letters) {
      for (const ref of letter.contextRefs) {
        assert.ok(
          entryIds.has(ref),
          `Letter ${letter.id} references unknown context entry ${ref}`
        );
      }
    }
  });

  test('no complete letter has null plain_english', () => {
    const missing = book.letters.filter(
      (l) => l.complete && !l.views.plain_english
    );
    assert.equal(
      missing.length,
      0,
      `${missing.length} complete letters still missing plain_english: ${missing.map((l) => l.id).join(', ')}`
    );
  });
}
