import { test } from 'node:test';
import assert from 'node:assert/strict';

const { resolvePosition } = await import('../js/loader.js');

test('resolvePosition prefers more recent timestamp', () => {
  const local = {
    letter_id: 'letter-005',
    paragraph_index: 2,
    scroll_offset: 0,
    active_view: 'plain_english',
    timestamp: 2000,
  };
  const remote = {
    letter_id: 'letter-001',
    paragraph_index: 0,
    scroll_offset: 0,
    active_view: 'plain_english',
    timestamp: 1000,
  };
  const result = resolvePosition(local, remote);
  assert.equal(result.letter_id, 'letter-005');
});

test('resolvePosition falls back to remote when local is null', () => {
  const remote = {
    letter_id: 'letter-003',
    paragraph_index: 0,
    scroll_offset: 0,
    active_view: 'plain_english',
    timestamp: 500,
  };
  const result = resolvePosition(null, remote);
  assert.equal(result.letter_id, 'letter-003');
});

test('resolvePosition returns default when both null', () => {
  const result = resolvePosition(null, null);
  assert.equal(typeof result.letter_id, 'string');
});
