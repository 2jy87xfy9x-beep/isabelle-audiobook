let _contextPanel = null;
let _contextEntries = {};
let _onEntryActivate = null;

export function initSync({ contextPanel, contextEntries, onEntryActivate }) {
  _contextPanel = contextPanel;
  _contextEntries = contextEntries || {};
  _onEntryActivate = onEntryActivate;
}

export function syncToLetter(letter) {
  if (!_contextPanel || !letter.contextRefs?.length) return;
  const firstRef = letter.contextRefs[0];
  activateEntry(firstRef, { pulse: true });
}

export function activateEntry(entryId, { pulse = false } = {}) {
  if (!_contextPanel || !_contextEntries[entryId]) return;
  if (_onEntryActivate) _onEntryActivate(entryId);
  if (pulse) {
    const dot = document.getElementById('ctx-sync-dot');
    if (dot) {
      dot.classList.remove('pulse');
      void dot.offsetWidth;
      dot.classList.add('pulse');
    }
  }
}
