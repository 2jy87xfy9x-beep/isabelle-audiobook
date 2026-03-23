// js/focusMode.js
// Manages the 4 focus modes by toggling CSS classes on paragraph elements.

let _currentMode = 'off';
let _currentIndex = 0;

export function setMode(mode) {
  _currentMode = mode;
  const book = document.getElementById('book');
  book.dataset.focus = mode === 'off' ? '' : mode;
  applyMode(_currentIndex);
}

export function applyMode(index) {
  _currentIndex = index;
  if (_currentMode === 'off') return;

  const els = Array.from(document.querySelectorAll('.para'));

  // Clear all focus classes first
  els.forEach(el => {
    el.classList.remove('hidden', 'fade-near');
  });

  if (_currentMode === 'reveal') {
    els.forEach((el, i) => {
      if (i > index) el.classList.add('hidden');
    });
  }
  // spotlight and fade-ahead are handled purely by CSS (.current class + data-focus attribute)
  // fade-ahead needs the fade-near class on the next 3 paragraphs
  if (_currentMode === 'fade-ahead') {
    els.forEach((el, i) => {
      const dist = i - index;
      if (dist > 0 && dist <= 3) el.classList.add('fade-near');
    });
  }
}

export function getMode() {
  return _currentMode;
}
