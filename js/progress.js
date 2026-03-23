// js/progress.js
// Updates progress bar and saves reading position.

import { savePositionLocal } from './loader.js';

let _syncCallback = null;
let _syncTimer = null;
const SYNC_DEBOUNCE_MS = 60_000; // minimum 60s between GitHub syncs

export function initProgress(totalParagraphs, syncCallback) {
  _syncCallback = syncCallback;
  updateBar(0, totalParagraphs);
}

export function updateProgress(index, totalParagraphs) {
  updateBar(index, totalParagraphs);
  savePositionLocal(index);
  scheduleSync(index);
}

function updateBar(index, total) {
  const fill = document.getElementById('progress-fill');
  if (!fill || total === 0) return;
  fill.style.width = `${Math.min(100, ((index + 1) / total) * 100)}%`;
}

function scheduleSync(index) {
  if (!_syncCallback) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    _syncCallback(index);
  }, SYNC_DEBOUNCE_MS);
}

export function flushSync(index) {
  clearTimeout(_syncTimer);
  if (_syncCallback) _syncCallback(index);
}

/** Cancel any pending debounced sync without triggering it. Used before an explicit save. */
export function cancelSync() {
  clearTimeout(_syncTimer);
}
