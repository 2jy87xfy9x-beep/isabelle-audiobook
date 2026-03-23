// js/editor.js
// Handles double-click inline editing and the floating formatting toolbar.

let _activeEl = null;
let _activeIndex = -1;
let _paragraphs = null; // reference to book.paragraphs array
let _onPause = null;    // callback to pause playback

export function initEditor(paragraphs, onPause) {
  _paragraphs = paragraphs;
  _onPause = onPause;
  positionToolbarOnScroll();
}

export function openEditor(index, el) {
  if (_activeEl && _activeEl !== el) closeEditor();
  _onPause?.();
  _activeEl = el;
  _activeIndex = index;
  el.contentEditable = 'true';
  el.focus();
  showToolbar(el);
}

export function closeEditor() {
  if (!_activeEl) return;
  _activeEl.contentEditable = 'false';
  // Persist text change back to paragraphs array
  if (_activeIndex >= 0 && _paragraphs) {
    _paragraphs[_activeIndex].text = _activeEl.textContent;
  }
  _activeEl = null;
  _activeIndex = -1;
  hideToolbar();
}

function showToolbar(el) {
  const tb = document.getElementById('fmt-toolbar');
  if (!tb) return;
  tb.classList.add('visible');
  positionToolbar(el);
  syncToolbarToStyle(_activeIndex);
}

function positionToolbar(el) {
  const tb = document.getElementById('fmt-toolbar');
  if (!tb || !el) return;
  const rect = el.getBoundingClientRect();
  tb.style.top = `${Math.max(60, rect.top - 48)}px`;
  tb.style.left = `${Math.min(rect.left, window.innerWidth - 380)}px`;
}

function positionToolbarOnScroll() {
  window.addEventListener('scroll', () => {
    if (_activeEl) positionToolbar(_activeEl);
  }, { passive: true });
}

function hideToolbar() {
  document.getElementById('fmt-toolbar')?.classList.remove('visible');
}

function syncToolbarToStyle(index) {
  if (index < 0 || !_paragraphs) return;
  const style = _paragraphs[index].style || {};
  const tb = document.getElementById('fmt-toolbar');
  if (!tb) return;
  tb.querySelector('#fmt-bold').classList.toggle('active', !!style.bold);
  tb.querySelector('#fmt-italic').classList.toggle('active', !!style.italic);
  tb.querySelector('#fmt-underline').classList.toggle('active', !!style.underline);
  tb.querySelector('#fmt-color').value = style.color || '#ffffff';
  tb.querySelector('#fmt-font').value = style.fontFamily || '';
  tb.querySelector('#fmt-indent').value = style.marginLeft || '';
  tb.querySelector('#fmt-type').value = _paragraphs[index].type || 'normal';
}

export function applyFormat(action, value) {
  if (_activeIndex < 0 || !_paragraphs) return;
  const para = _paragraphs[_activeIndex];
  const el = _activeEl;
  if (!para || !el) return;

  switch (action) {
    case 'bold':
      para.style.bold = !para.style.bold;
      el.style.fontWeight = para.style.bold ? 'bold' : '';
      break;
    case 'italic':
      para.style.italic = !para.style.italic;
      el.style.fontStyle = para.style.italic ? 'italic' : '';
      break;
    case 'underline':
      para.style.underline = !para.style.underline;
      el.style.textDecoration = para.style.underline ? 'underline' : '';
      break;
    case 'color':
      para.style.color = value;
      el.style.color = value;
      break;
    case 'fontFamily':
      para.style.fontFamily = value;
      el.style.fontFamily = value;
      break;
    case 'indent':
      para.style.marginLeft = value;
      el.style.marginLeft = value;
      break;
    case 'type':
      para.type = value;
      el.dataset.type = value;
      break;
  }
  syncToolbarToStyle(_activeIndex);
}

export function getActiveIndex() { return _activeIndex; }
