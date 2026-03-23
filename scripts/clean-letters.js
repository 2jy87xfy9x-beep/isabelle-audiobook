// scripts/clean-letters.js — Node.js 18+, run from repo root
// Usage: node scripts/clean-letters.js [--letter <id>]
//
// Analyses book.json for text artefacts and editorial intrusions.
// Produces:
//   views-export/clean-report.txt         — human-readable per-letter findings
//   views-export/book2-candidates.json    — historian footnotes structured for context.json
//
// Does NOT modify book.json. Review output, then apply manually or run
// node scripts/apply-clean.js (future step) to write proposals back.

import { readFileSync, writeFileSync, mkdirSync } from 'fs';

// ── Patterns ─────────────────────────────────────────────────────────────────

// "Letter 1 1 " or "Letter 7 Q Ey] Aa " at very start
const HEADER_PREFIX = /^Letter\s+\d+[\s\S]{0,20}?(?=[A-Z][a-z])/;

// [f. 278], [f. 279|, [f. 237], [p. 114]  (bracketed)
// , f. 237]                                (unbracketed — opening [ stripped at extraction)
const FOLIO_REF   = /(?:\[(?:f|p)\.\s*([\d\w\-|,\s]+?)[\]|]|,\s*f\.\s*(\d[\d\w\-]*)\])/gi;

// Historian footnote blocks at end: "1. Capital sentence at least 10 chars"
// Marker is 1–2 digits only, NOT preceded by another digit (avoids "1760." false matches)
const FOOTNOTE_RE = /(?<!\d)(\d{1,2})\.\s+([A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ][^]*?)(?=\s*(?<!\d)\d{1,2}\.\s+[A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ]|\s*$)/g;

// Inline footnote ref markers: space then 1-2 digit number then space/punct/end
// Only match if the number corresponds to an extracted footnote
const INLINE_MARKER = /[ \u00A0](\d{1,2})(?=[ ,;.!?»\n]|$)/g;

// Isabelle's closing signatures
const CLOSING_RE = /\b(?:Your|Votre)\s+(?:faithful\s+)?(?:(?:sister|Sœur)\s+)?Isabelle(?:\s+Marie(?:\s+Louise)?)?\s*\.?/gi;

// Person with lifespan dates in footnote text: "Name [1717-1790]" or "(YYYY–YYYY)"
const PERSON_DATES_RE = /([A-ZÀ-Ö][a-zA-ZÀ-ö\s\-']{3,40?})\s*[\[(](\d{4})\s*[-–]\s*(\d{4})[\])]/;

// Characters that indicate OCR damage
const OCR_CHARS_RE = /[|}{\\]/;

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase()
    .replace(/[éèêë]/g, 'e').replace(/[àâ]/g, 'a')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function trimSpaces(s) {
  return s.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Per-letter analysis ───────────────────────────────────────────────────────

function analyzeLetter(letter) {
  const original = letter.views.original_french || '';
  const findings = [];
  let working = original;

  // 1. Header prefix artefact
  const headerMatch = working.match(HEADER_PREFIX);
  if (headerMatch) {
    const removed = headerMatch[0];
    findings.push({
      type: 'header_artefact',
      removed,
      reason: 'Extraction duplicate — "Letter N" prefix from source HTML numbering',
      book2: false,
    });
    working = working.slice(removed.length);
  }

  // 2. Folio / page references
  const folios = [];
  working = working.replace(FOLIO_REF, (match, ref1, ref2) => {
    const val = (ref1 || ref2 || '').replace(/[|]/g, '').trim();
    folios.push(val);
    findings.push({
      type: 'folio_ref',
      removed: match,
      reason: 'Archival folio reference — belongs in metadata.folio, not letter body',
      extracted: val,
      book2: false,
    });
    return ' ';
  });

  // 3. Footnote blocks
  // Footnotes appear after the last real closing in the text.
  // Find all closing positions, then scan for footnote blocks in trailing text.
  const allClosings = [];
  {
    const re = new RegExp(CLOSING_RE.source, 'gi');
    let m;
    while ((m = re.exec(working)) !== null) allClosings.push(m.index + m[0].length);
  }
  const splitPos = allClosings.length ? allClosings[allClosings.length - 1] : working.length;
  const bodyPart = working.slice(0, splitPos);
  const trailingPart = working.slice(splitPos);

  const footnotes = [];
  {
    const fnPattern = /(?<!\d)(\d{1,2})\.\s+([A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ][^]*?)(?=\s*(?<!\d)\d{1,2}\.\s+[A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ]|\s*$)/g;
    const re = new RegExp(fnPattern.source, 'g');
    let m;
    while ((m = re.exec(trailingPart)) !== null) {
      footnotes.push({ marker: m[1], text: m[2].trim(), rawMatch: m[0] });
    }
    // Also catch footnotes that somehow appear in the body (before last closing)
    const bodyFnRe = new RegExp(fnPattern.source, 'g');
    while ((m = bodyFnRe.exec(bodyPart)) !== null) {
      // Only if this looks editorial (reference to Isabelle in 3rd person, or date spans)
      const t = m[2];
      if (/\bIsabelle\b/i.test(t) || /\d{4}/.test(t) || /\b(capital|city|court|archduke|archduchess|count|baron|prince|princess)\b/i.test(t)) {
        footnotes.push({ marker: m[1], text: t.trim(), rawMatch: m[0], inBody: true });
      }
    }
  }

  // Classify and record footnotes
  const footnoteMarkers = new Set(footnotes.map(f => f.marker));
  for (const fn of footnotes) {
    const personMatch = fn.text.match(PERSON_DATES_RE);
    let classification = 'editorial_note';
    let book2Entry = null;

    if (personMatch) {
      classification = 'person';
      const name = personMatch[1].trim().replace(/\s+/g, ' ');
      book2Entry = {
        type: 'person',
        suggested_id: slugify(name),
        name,
        dates: `${personMatch[2]}–${personMatch[3]}`,
        short: fn.text.split('.')[0].trim(),
        content_text: fn.text,
        source_letter: letter.id,
      };
    } else if (/\b(capital|city|castle|palace|located|province|region|duchy)\b/i.test(fn.text)) {
      classification = 'place';
      book2Entry = {
        type: 'place',
        content_text: fn.text,
        source_letter: letter.id,
      };
    } else {
      book2Entry = {
        type: 'concept',
        content_text: fn.text,
        source_letter: letter.id,
      };
    }

    findings.push({
      type: 'footnote',
      marker: fn.marker,
      removed: fn.text,
      reason: fn.inBody
        ? "Historian's note embedded in letter body — not Isabelle's writing"
        : "Historian's editorial footnote appended after letter closing",
      classification,
      book2: true,
      book2Entry,
    });
  }

  // Remove footnote text from working copy
  {
    // Remove trailing footnotes
    const fnBlockRe = /\s*\d+\.\s+[A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ][^]*/g;
    let fnStart = -1;
    let m;
    // Find the start of the first footnote block after the last closing
    const trailingCheck = /\d+\.\s+[A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ]/g;
    while ((m = trailingCheck.exec(trailingPart)) !== null) {
      if (fnStart === -1) fnStart = m.index;
    }
    if (fnStart !== -1) {
      working = working.slice(0, splitPos + fnStart).trim();
    }
  }

  // 4. Inline footnote markers
  if (footnoteMarkers.size > 0) {
    const before = working;
    let removedMarkers = [];
    working = working.replace(INLINE_MARKER, (match, num) => {
      if (footnoteMarkers.has(num)) {
        removedMarkers.push(num);
        return '';
      }
      return match;
    });
    if (removedMarkers.length) {
      findings.push({
        type: 'inline_markers',
        removed: [...new Set(removedMarkers)].join(', '),
        reason: 'Superscript footnote reference numbers pointing to editorial notes',
        book2: false,
      });
    }
  }

  // 5. Duplicate closings
  const closingMatches = [];
  {
    const re = new RegExp(CLOSING_RE.source, 'gi');
    let m;
    while ((m = re.exec(working)) !== null) closingMatches.push(m[0].trim());
  }
  if (closingMatches.length > 1) {
    findings.push({
      type: 'duplicate_closings',
      count: closingMatches.length,
      removed: null,
      reason: `Letter closing appears ${closingMatches.length}× — source likely concatenated multiple fragments or drafts`,
      book2: false,
      note: 'Manual review needed: decide which fragment is canonical',
    });
  }

  // 6. OCR garble
  const ocrFlags = [];
  if (OCR_CHARS_RE.test(working)) ocrFlags.push('pipe / brace characters');
  // Look for runs of ≥3 consecutive very-short capitalised tokens (≤3 chars)
  const shortCapRun = working.match(/(?:\b[A-Z][a-z]{0,2}\b\s+){3,}/g) || [];
  if (shortCapRun.length) ocrFlags.push(`short-cap token run: "${shortCapRun[0].trim()}"`);
  if (ocrFlags.length) {
    findings.push({
      type: 'ocr_garble',
      removed: null,
      reason: 'OCR damage — ' + ocrFlags.join('; '),
      book2: false,
      note: 'Manual repair needed',
    });
  }

  const proposedClean = trimSpaces(working);

  return { findings, proposedClean, folios };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const book = JSON.parse(readFileSync('book.json', 'utf8'));

// Optional --letter filter
const letterFlag = process.argv.indexOf('--letter');
const targetId = letterFlag !== -1 ? process.argv[letterFlag + 1] : null;

const letters = book.letters.filter(l =>
  l.complete && (!targetId || l.id === targetId)
);

if (letters.length === 0) {
  console.error(targetId ? `Letter "${targetId}" not found or not complete.` : 'No complete letters.');
  process.exit(1);
}

mkdirSync('views-export', { recursive: true });

const reportLines = [
  'LETTER CLEAN ANALYSIS',
  `Generated: ${new Date().toISOString()}`,
  `Letters analysed: ${letters.length}`,
  '='.repeat(72),
  '',
];

const book2Candidates = [];
let totalIssues = 0;
let totalFootnotes = 0;
let cleanCount = 0;

for (const letter of letters) {
  const { findings, proposedClean, folios } = analyzeLetter(letter);

  if (findings.length === 0) {
    cleanCount++;
    continue;
  }

  totalIssues += findings.length;

  reportLines.push(`── ${letter.id}  ${letter.date_display || ''}  ──`);

  for (const f of findings) {
    switch (f.type) {
      case 'header_artefact':
        reportLines.push(`  [HEADER]   Removed: "${f.removed.trim()}"`);
        reportLines.push(`             Reason:  ${f.reason}`);
        break;
      case 'folio_ref':
        reportLines.push(`  [FOLIO]    Removed: "${f.removed.trim()}"`);
        reportLines.push(`             Moved to: metadata.folio = "${f.extracted}"`);
        break;
      case 'footnote':
        totalFootnotes++;
        reportLines.push(`  [FOOTNOTE ${f.marker}] ${f.classification.toUpperCase()}`);
        reportLines.push(`             Text:    "${f.removed.slice(0, 120)}${f.removed.length > 120 ? '…' : ''}"`);
        reportLines.push(`             Reason:  ${f.reason}`);
        reportLines.push(`             BOOK 2:  ✓ candidate`);
        if (f.book2Entry?.name) {
          reportLines.push(`             Entry:   ${f.book2Entry.type} — "${f.book2Entry.name}" ${f.book2Entry.dates || ''}`);
        }
        book2Candidates.push({
          source_letter: letter.id,
          marker: f.marker,
          classification: f.classification,
          ...f.book2Entry,
        });
        break;
      case 'inline_markers':
        reportLines.push(`  [MARKERS]  Inline refs removed: ${f.removed}`);
        reportLines.push(`             Reason:  ${f.reason}`);
        break;
      case 'duplicate_closings':
        reportLines.push(`  [FRAGS]    ${f.reason}`);
        reportLines.push(`             ⚠ ${f.note}`);
        break;
      case 'ocr_garble':
        reportLines.push(`  [OCR]      ${f.reason}`);
        reportLines.push(`             ⚠ ${f.note}`);
        break;
    }
  }

  reportLines.push('');
  reportLines.push('  PROPOSED CLEAN TEXT (first 300 chars):');
  reportLines.push('  ' + proposedClean.slice(0, 300).replace(/\n/g, '\n  ') + (proposedClean.length > 300 ? '…' : ''));
  reportLines.push('');
  reportLines.push('-'.repeat(72));
  reportLines.push('');
}

// Summary
reportLines.push('='.repeat(72));
reportLines.push('SUMMARY');
reportLines.push(`  Letters analysed:     ${letters.length}`);
reportLines.push(`  Letters with issues:  ${letters.length - cleanCount}`);
reportLines.push(`  Clean letters:        ${cleanCount}`);
reportLines.push(`  Total findings:       ${totalIssues}`);
reportLines.push(`  Footnotes extracted:  ${totalFootnotes} → Book 2 candidates`);
reportLines.push('');

// Write report
const reportPath = 'views-export/clean-report.txt';
writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
console.log(`✓ ${reportPath}`);

// Write Book 2 candidates
const candidatesPath = 'views-export/book2-candidates.json';
writeFileSync(candidatesPath, JSON.stringify({ count: book2Candidates.length, candidates: book2Candidates }, null, 2), 'utf8');
console.log(`✓ ${candidatesPath}  (${book2Candidates.length} candidates)`);

console.log(`\n${letters.length - cleanCount} letters have issues. ${totalFootnotes} footnotes ready for Book 2.`);
console.log(`Review ${reportPath} before making any changes to book.json.`);
