import { test } from 'node:test';
import assert from 'node:assert/strict';

test('saveToGitHub throws sha_conflict on 409', async () => {
  globalThis.localStorage = {
    getItem: () => 'fake-token',
    setItem: () => {},
    removeItem: () => {},
  };
  globalThis.window = {
    location: { hostname: 'owner.github.io' },
  };
  globalThis.document = { documentElement: { dataset: {} } };
  globalThis.atob = (s) => Buffer.from(s, 'base64').toString('utf8');
  globalThis.btoa = (s) => Buffer.from(s, 'utf8').toString('base64');

  let callCount = 0;
  globalThis.fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: Buffer.from('{}').toString('base64'),
          sha: 'abc123',
        }),
      };
    }
    return { ok: false, status: 409 };
  };

  const { saveToGitHub } = await import('../js/github.js');
  try {
    await saveToGitHub('book.json', {});
    assert.fail('Should have thrown');
  } catch (e) {
    assert.equal(e.code, 'sha_conflict');
  }
});

test('saveToGitHub throws bad_token on 401 from PUT', async () => {
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: Buffer.from('{}').toString('base64'),
          sha: 'abc',
        }),
      };
    }
    return { ok: false, status: 401 };
  };

  const { saveToGitHub } = await import('../js/github.js');
  try {
    await saveToGitHub('book.json', {});
    assert.fail('Should have thrown');
  } catch (e) {
    assert.equal(e.code, 'bad_token');
  }
});
