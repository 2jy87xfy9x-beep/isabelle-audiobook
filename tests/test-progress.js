import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => {
    store[k] = v;
  },
  removeItem: (k) => {
    delete store[k];
  },
};

const { savePosition, cancelSync } = await import('../js/progress.js');

test('savePosition writes to localStorage under isabelle-v2-position', () => {
  const pos = {
    letter_id: 'letter-005',
    paragraph_index: 1,
    scroll_offset: 0,
    active_view: 'plain_english',
    timestamp: 0,
  };
  savePosition(pos);
  const raw = store['isabelle-v2-position'];
  assert.ok(raw, 'Position not written to localStorage');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.letter_id, 'letter-005');
  assert.ok(parsed.timestamp > 0, 'Timestamp should be set');
});

test('cancelSync clears pending sync without throwing', () => {
  assert.doesNotThrow(() => cancelSync());
});
