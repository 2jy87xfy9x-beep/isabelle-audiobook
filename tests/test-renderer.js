import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  buildAliasMap,
  injectContextSpans,
  renderLetterMeta,
} from '../js/renderer.js';

test('buildAliasMap returns map from alias to entry id', () => {
  const entries = [
    {
      id: 'marie-christine',
      name: 'Marie-Christine of Austria',
      aliases: ['Christine', 'MC'],
    },
  ];
  const map = buildAliasMap(entries);
  assert.equal(map.get('marie-christine of austria'), 'marie-christine');
  assert.equal(map.get('christine'), 'marie-christine');
});

test('injectContextSpans wraps matched text in span', () => {
  const map = new Map([['christine', 'marie-christine']]);
  const sorted = [['christine', 'marie-christine']];
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  const p = dom.window.document.createElement('p');
  p.textContent = 'I write to Christine today.';
  injectContextSpans(p, sorted, dom.window.document);
  assert.ok(p.innerHTML.includes('data-ref-id="marie-christine"'));
  assert.ok(p.innerHTML.includes('Christine'));
});

test('injectContextSpans does not modify text without matches', () => {
  const sorted = [['napoleon', 'napoleon-i']];
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  const p = dom.window.document.createElement('p');
  p.textContent = 'No named entities here.';
  const before = p.textContent;
  injectContextSpans(p, sorted, dom.window.document);
  assert.equal(p.textContent, before);
});

test('renderLetterMeta returns date and letter number elements', () => {
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  const letter = {
    letter_number: 12,
    date_display: '14 November 1760',
    id: 'letter-012',
  };
  const meta = renderLetterMeta(letter, dom.window.document);
  assert.ok(meta.querySelector('[data-letter-number]'));
  assert.ok(meta.querySelector('[data-letter-date]'));
});
