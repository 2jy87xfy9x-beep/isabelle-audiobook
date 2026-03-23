// tests/test-loader.js — run with: node tests/test-loader.js
import { resolvePosition, savePositionLocal, getSavedLocal } from '../js/loader.js';

// Mock localStorage for Node
const store = {};
global.localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; }
};

// Test 1: no local data → use remote
let book = { lastPosition: 5, lastPositionTimestamp: 1000 };
console.assert(resolvePosition(book) === 5, 'Test 1 failed');

// Test 2: local is newer → use local
savePositionLocal(10);
store['isabelle_position'] = JSON.stringify({ position: 10, timestamp: 2000 });
book = { lastPosition: 5, lastPositionTimestamp: 1000 };
console.assert(resolvePosition(book) === 10, 'Test 2 failed');

// Test 3: remote is newer → use remote
store['isabelle_position'] = JSON.stringify({ position: 3, timestamp: 500 });
book = { lastPosition: 8, lastPositionTimestamp: 1500 };
console.assert(resolvePosition(book) === 8, 'Test 3 failed');

console.log('✓ loader tests passed');
