let _mode = 'off';
let _currentIndex = 0;
let _paragraphEls = [];

export function initFocusMode(paragraphEls) {
  _paragraphEls = paragraphEls || [];
}

export function setMode(mode) {
  _mode = mode;
  applyMode(_currentIndex);
}

export function getMode() {
  return _mode;
}

export function applyMode(index) {
  _currentIndex = index;
  if (_mode === 'off') {
    _paragraphEls.forEach((el) => {
      el.style.opacity = '';
      el.style.display = '';
    });
    return;
  }
  if (_mode === 'reveal') {
    _paragraphEls.forEach((el, i) => {
      el.style.display = i <= index ? '' : 'none';
      el.style.opacity = '';
    });
    return;
  }
  if (_mode === 'spotlight') {
    _paragraphEls.forEach((el, i) => {
      el.style.display = i === index ? '' : 'none';
      el.style.opacity = '';
    });
    return;
  }
  if (_mode === 'fade_ahead') {
    _paragraphEls.forEach((el, i) => {
      el.style.display = i <= index + 3 ? '' : 'none';
      el.style.opacity = i === index ? '1' : i <= index + 3 ? '0.15' : '0';
    });
    return;
  }
  if (_mode === 'page') {
    _paragraphEls.forEach((el) => {
      el.style.opacity = '';
      el.style.display = '';
    });
  }
}
