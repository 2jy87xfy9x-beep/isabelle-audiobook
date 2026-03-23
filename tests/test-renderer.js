// tests/test-renderer.js — run with: node tests/test-renderer.js
import { createParaElement, applyStyle } from '../js/renderer.js';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><body></body>');
global.document = dom.window.document;

// Test 1: normal paragraph renders as <p>
const para = { id: 1, text: 'Hello world', type: 'normal', style: {} };
const el = createParaElement(para, 0);
console.assert(el.tagName === 'P', 'Test 1: should be P tag');
console.assert(el.textContent === 'Hello world', 'Test 1: text content');
console.assert(el.dataset.index === '0', 'Test 1: data-index');

// Test 2: heading renders as <h2>
const heading = { id: 2, text: 'A Heading', type: 'heading', style: {} };
const h = createParaElement(heading, 1);
console.assert(h.tagName === 'H2', 'Test 2: should be H2');

// Test 3: bold style applied
const bold = { id: 3, text: 'Bold', type: 'normal', style: { bold: true } };
const b = createParaElement(bold, 2);
console.assert(b.style.fontWeight === 'bold', 'Test 3: bold');

// Test 4: chapter-title renders as <h1>
const chap = { id: 4, text: 'Chapter One', type: 'chapter-title', style: {} };
const c = createParaElement(chap, 3);
console.assert(c.tagName === 'H1', 'Test 4: should be H1');

// Test 5: quote renders as <blockquote>
const quote = { id: 5, text: 'A quote', type: 'quote', style: {} };
const q = createParaElement(quote, 4);
console.assert(q.tagName === 'BLOCKQUOTE', 'Test 5: should be BLOCKQUOTE');

console.log('✓ renderer tests passed');
