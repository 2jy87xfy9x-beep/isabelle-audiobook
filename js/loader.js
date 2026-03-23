const LS_POSITION = 'isabelle-v2-position';

export async function loadData() {
  const [bookRes, ctxRes, fictRes] = await Promise.all([
    fetch('./book.json'),
    fetch('./context.json'),
    fetch('./fiction.json'),
  ]);
  if (!bookRes.ok) throw new Error('book_fetch_failed');
  const book    = await bookRes.json();
  const context = ctxRes.ok  ? await ctxRes.json()  : { entries: [] };
  const fiction = fictRes.ok ? await fictRes.json() : { gap_scenes: [], letter_reimaginings: [] };
  return { book, context, fiction };
}

export function resolvePosition(local, remote) {
  const fallback = {
    letter_id: 'letter-001',
    paragraph_index: 0,
    scroll_offset: 0,
    active_view: 'plain_english',
    timestamp: 0,
  };
  if (!local && !remote) return fallback;
  if (!local) return remote;
  if (!remote) return local;
  return local.timestamp >= remote.timestamp ? local : remote;
}

export function loadLocalPosition() {
  try {
    const raw = localStorage.getItem(LS_POSITION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocalPosition(pos) {
  localStorage.setItem(LS_POSITION, JSON.stringify({ ...pos, timestamp: Date.now() }));
}
