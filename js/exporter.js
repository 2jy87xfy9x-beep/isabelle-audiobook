const TEXT_VIEWS = [
  'original_french',
  'modern_french',
  'literal_english_old',
  'literal_english_modern',
  'plain_english',
];
const VIEW_LABELS = {
  original_french: 'Vieux Français',
  modern_french: 'Français Moderne',
  literal_english_old: 'Anglais Littéral (vieux)',
  literal_english_modern: 'Anglais Littéral (moderne)',
  plain_english: 'Anglais Moderne',
};

export function exportLetters({ letters, scope, view, format, selectionText }) {
  let subset;
  if (scope === 'selection') {
    subset = [
      {
        id: 'selection',
        letter_number: 0,
        date_display: '',
        views: { plain_english: selectionText },
        contextRefs: [],
      },
    ];
  } else if (scope === 'this-letter') {
    subset = letters.slice(0, 1);
  } else {
    subset = letters;
  }

  const views = view === 'all' ? TEXT_VIEWS : [view];

  if (format === 'plain-text') {
    const text = subset
      .map((l) => views.map((v) => l.views?.[v] || '').join('\n\n---\n\n'))
      .join('\n\n═══\n\n');
    download(text, 'isabelle-letters.txt', 'text/plain');
    return;
  }

  if (format === 'print') {
    const win = window.open('', '_blank');
    win.document.write(buildHtmlDoc(subset, views, true));
    win.document.close();
    win.print();
    return;
  }

  const html = buildHtmlDoc(subset, views, false);
  download(html, 'isabelle-letters.html', 'text/html');
}

function buildHtmlDoc(letters, views, forPrint) {
  const toc = letters
    .map(
      (l) =>
        `<li><a href="#${l.id}">${l.date_display || ''} — Letter ${l.letter_number}</a></li>`
    )
    .join('');

  const body = letters
    .map((l) => {
      const sections = views
        .map((v) => {
          const text = l.views?.[v];
          if (!text) return '';
          return `<section class="view-section">
        <h3>${VIEW_LABELS[v] || v}</h3>
        ${text.split(/\n\n+/).map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
      </section>`;
        })
        .join('');
      return `<article id="${l.id}" class="letter-export">
      <header><time>${escapeHtml(l.date_display || '')}</time><span>Letter ${l.letter_number}</span></header>
      ${l.salutation ? `<p class="salutation">${escapeHtml(l.salutation)}</p>` : ''}
      ${sections}
      ${l.closing ? `<p class="closing">${escapeHtml(l.closing)}</p>` : ''}
    </article>`;
    })
    .join('<hr>');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
  <title>Isabelle — Letters</title>
  <style>
    body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;color:#1a1a1a;line-height:1.75}
    header{display:flex;justify-content:space-between;font-size:.8rem;color:#666;margin-bottom:1rem}
    h3{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:#888;margin:1.5rem 0 .5rem}
    .salutation,.closing{font-style:italic}
    .closing{text-align:right;margin-top:1.5rem}
    article{margin-bottom:3rem}
    ${forPrint ? '@media print{hr{display:none}}' : ''}
  </style></head><body>
  <nav><ol>${toc}</ol></nav>
  ${body}
  </body></html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function download(content, filename, type) {
  try {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    document.dispatchEvent(new CustomEvent('export-failed'));
  }
}
