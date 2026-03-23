import { saveLocalPosition } from './loader.js';
import { saveToGitHub } from './github.js';

const MIN_SYNC_INTERVAL = 60000;
let _syncTimer = null;
let _pendingSync = false;
let _getBookFn = null;

export function initProgress(getBook) {
  _getBookFn = getBook;
}

export function savePosition(pos) {
  saveLocalPosition(pos);
  scheduleSyncPosition();
}

export function cancelSync() {
  if (_syncTimer) {
    clearTimeout(_syncTimer);
    _syncTimer = null;
  }
  _pendingSync = false;
}

function scheduleSyncPosition() {
  if (_pendingSync) return;
  _pendingSync = true;
  _syncTimer = setTimeout(async () => {
    _pendingSync = false;
    if (!_getBookFn) return;
    const book = _getBookFn();
    try {
      await saveToGitHub('book.json', book);
    } catch {
      /* silent */
    }
  }, MIN_SYNC_INTERVAL);
}

export async function forceSyncPosition(book) {
  cancelSync();
  await saveToGitHub('book.json', book);
}
