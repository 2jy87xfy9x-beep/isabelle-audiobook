// js/renderer.js
// Renders book paragraphs to DOM and applies formatting from style object.

const TYPE_TAG = {
  normal: 'p',
  heading: 'h2',
  'chapter-title': 'h1',
  quote: 'blockquote'
};

export function renderBook(bookData, container, onSingleClick, onDoubleClick) {
  container.innerHTML = '';
  bookData.paragraphs.forEach((para, index) => {
    const el = createParaElement(para, index);
    el.addEventListener('click', () => onSingleClick(index, el));
    el.addEventListener('dblclick', (e) => { e.stopPropagation(); onDoubleClick(index, el); });
    container.appendChild(el);
  });
}

export function createParaElement(para, index) {
  const tag = TYPE_TAG[para.type] || 'p';
  const el = document.createElement(tag);
  el.className = 'para';
  el.dataset.index = index;
  el.dataset.id = para.id;
  el.dataset.type = para.type || 'normal';
  el.textContent = para.text;
  applyStyle(el, para.style);
  return el;
}

export function applyStyle(el, style) {
  if (!style) return;
  el.style.fontFamily = style.fontFamily || '';
  el.style.color = style.color || '';
  el.style.marginLeft = style.marginLeft || '';
  el.style.textIndent = style.indent || '';
  el.style.fontWeight = style.bold ? 'bold' : '';
  el.style.fontStyle = style.italic ? 'italic' : '';
  el.style.textDecoration = style.underline ? 'underline' : '';
}

export function setCurrentParagraph(paragraphEls, index) {
  paragraphEls.forEach(el => el.classList.remove('current'));
  const current = paragraphEls[index];
  if (current) {
    current.classList.add('current');
    current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

export function getParagraphEls() {
  return Array.from(document.querySelectorAll('.para'));
}
