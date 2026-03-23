import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, buildSentenceContextMap } from '../js/player.js';

test('splitSentences splits on sentence boundaries', () => {
  const text = 'Hello world. This is sentence two. And three!';
  const parts = splitSentences(text);
  assert.ok(parts.length >= 2);
  assert.ok(parts[0].includes('Hello'));
});

test('splitSentences keeps short text as single sentence', () => {
  const text = 'Short.';
  assert.equal(splitSentences(text).length, 1);
});

test('buildSentenceContextMap returns entry IDs for matched sentences', () => {
  const sentences = ['I wrote to Christine today.', 'The weather is fine.'];
  const sortedAliases = [['christine', 'marie-christine']];
  const map = buildSentenceContextMap(sentences, sortedAliases);
  assert.equal(map.get(0), 'marie-christine');
  assert.equal(map.get(1), undefined);
});
