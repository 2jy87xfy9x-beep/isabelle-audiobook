import { showFeedback } from './smartFeatures.js';

let _unlocked = false;
let _editingEl = null;
let _onPause = null;
const LONG_PRESS_MS = 800;

export function initEditor({ onPause, onSave }) {
  _onPause = onPause;
  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'e' || e.key === 'E')) toggleEditorMode();
  });
  void onSave;
}

export function isEditorUnlocked() {
  return _unlocked;
}

function toggleEditorMode() {
  _unlocked = !_unlocked;
  document.body.classList.toggle('editor-mode', _unlocked);
  const indicator = document.getElementById('editor-indicator');
  if (indicator) indicator.style.display = _unlocked ? 'inline' : 'none';
  showFeedback(_unlocked ? 'Editor mode on' : 'Editor mode off');
}

export function attachLongPress(el, callback) {
  let timer = null;
  el.addEventListener('pointerdown', () => {
    timer = setTimeout(callback, LONG_PRESS_MS);
  });
  el.addEventListener('pointerup', () => clearTimeout(timer));
  el.addEventListener('pointercancel', () => clearTimeout(timer));
}

export function openInlineEdit(el) {
  if (!_unlocked) return;
  closeInlineEdit();
  _editingEl = el;
  el.contentEditable = 'true';
  el.classList.add('editing');
  _onPause?.();
  showToolbar(el);
}

export function closeInlineEdit() {
  if (!_editingEl) return;
  _editingEl.contentEditable = 'false';
  _editingEl.classList.remove('editing');
  _editingEl = null;
  hideToolbar();
}

function showToolbar(anchorEl) {
  const tb = document.getElementById('inline-toolbar');
  if (!tb) return;
  tb.style.display = 'flex';
  const rect = anchorEl.getBoundingClientRect();
  tb.style.top = `${rect.top - 48}px`;
  tb.style.left = `${rect.left}px`;
}

function hideToolbar() {
  const tb = document.getElementById('inline-toolbar');
  if (tb) tb.style.display = 'none';
}

export function applyInlineFormat(command) {
  if (!_editingEl) return;
  _editingEl.focus();
  if (command === 'bold') document.execCommand('bold');
  else if (command === 'italic') document.execCommand('italic');
  else if (command === 'underline') document.execCommand('underline');
}

export function renderMappingEditor(
  { letter, contextEntries, onLink, onUnlink, onCreate },
  doc
) {
  const panel = doc.createElement('div');
  panel.className = 'mapping-editor';
  panel.setAttribute('aria-label', `Connections for Letter ${letter.letter_number}`);

  const title = doc.createElement('h3');
  title.textContent = `Letter ${letter.letter_number} — ${letter.date_display || ''}`;
  panel.appendChild(title);

  const list = doc.createElement('ul');
  list.className = 'mapping-list';
  for (const refId of letter.contextRefs) {
    const entry = contextEntries[refId];
    if (!entry) continue;
    const li = doc.createElement('li');
    li.textContent = entry.name;
    const remove = doc.createElement('button');
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `Remove link to ${entry.name}`);
    remove.addEventListener('click', () => {
      onUnlink(refId);
      li.remove();
    });
    li.appendChild(remove);
    list.appendChild(li);
  }
  panel.appendChild(list);

  const addBtn = doc.createElement('button');
  addBtn.className = 'add-connection';
  addBtn.textContent = '+ Add connection';
  addBtn.addEventListener('click', () =>
    openConnectionSearch(panel, contextEntries, letter, onLink, onCreate, doc)
  );
  panel.appendChild(addBtn);
  return panel;
}

function openConnectionSearch(panel, contextEntries, letter, onLink, onCreate, doc) {
  const existing = panel.querySelector('.connection-search');
  if (existing) existing.remove();

  const wrap = doc.createElement('div');
  wrap.className = 'connection-search';
  const input = doc.createElement('input');
  input.type = 'search';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', 'Search context entries');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'true');
  const results = doc.createElement('ul');
  results.setAttribute('role', 'listbox');

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    results.innerHTML = '';
    const matches = Object.values(contextEntries)
      .filter((e) => e.name.toLowerCase().includes(q))
      .slice(0, 8);
    for (const entry of matches) {
      const li = doc.createElement('li');
      li.setAttribute('role', 'option');
      li.textContent = entry.name;
      li.addEventListener('click', () => {
        onLink(entry.id);
        wrap.remove();
      });
      results.appendChild(li);
    }
    if (q.length >= 2) {
      const create = doc.createElement('li');
      create.setAttribute('role', 'option');
      create.setAttribute('aria-label', `Create new entry: ${input.value}`);
      create.textContent = `No match — Create "${input.value}"`;
      create.addEventListener('click', () => onCreate(input.value, wrap));
      results.appendChild(create);
    }
  });

  wrap.appendChild(input);
  wrap.appendChild(results);
  panel.appendChild(wrap);
  input.focus();
}
