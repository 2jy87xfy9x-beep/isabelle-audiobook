// js/loader.js
// Fetches book.json and resolves cross-device position conflict.

export async function loadBook() {
  const response = await fetch('./book.json');
  if (!response.ok) {
    throw new Error(`Failed to fetch book.json: ${response.status}`);
  }
  return response.json();
}

/**
 * Returns the position (zero-based paragraph index) to restore.
 * Uses the value with the more recent lastPositionTimestamp.
 * Falls back to 0 if neither source has a valid position.
 */
export function resolvePosition(bookData) {
  const localRaw = localStorage.getItem('isabelle_position');
  const local = localRaw ? JSON.parse(localRaw) : null;

  const remote = {
    position: bookData.lastPosition ?? 0,
    timestamp: bookData.lastPositionTimestamp ?? 0
  };

  if (!local) return remote.position;
  if (local.timestamp >= remote.timestamp) return local.position;
  return remote.position;
}

export function savePositionLocal(position) {
  localStorage.setItem('isabelle_position', JSON.stringify({
    position,
    timestamp: Date.now()
  }));
}

export function getSavedLocal() {
  const raw = localStorage.getItem('isabelle_position');
  return raw ? JSON.parse(raw) : { position: 0, timestamp: 0 };
}
