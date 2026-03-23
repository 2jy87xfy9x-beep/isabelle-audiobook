// fix-combined-letters.js
// Cleans OCR noise and splits combined letter blobs in book.json
import { readFileSync, writeFileSync } from 'fs';

const BOOK_PATH = 'book.json';

// ─── OCR NOISE CLEANING ───────────────────────────────────────────────────────

function cleanOCR(text) {
  if (!text) return text;
  let t = text;

  // 1. Remove app progress UI
  t = t.replace(/\d+\s*%?\s*minutes?\s+(?:ago\s+)?left\s+in\s+chapter\s*\d*\s*%?/gi, '');

  // 2. Remove "I'm dying of love" app header (various forms)
  t = t.replace(/I(?:'m|'m|m)\s+dying\s+of\s+love\s+for\s+you[^\n]*/gi, '');
  // 2b. Remove "I am dying of love for you" mid-sentence OCR artifact
  t = t.replace(/I\s+am\s+dying\s+of\s+love\s+for\s+you/gi, '');

  // 3. Remove "I die of love" variant
  t = t.replace(/I\s+die\s+of\s+love\s+for\s+you[^\n]*/gi, '');

  // 4. Remove "dies of love" variant
  t = t.replace(/\ddies\s+of\s+love\s+for\s+you[^\n]*/gi, '');

  // 5. Remove "Lett..." truncated
  t = t.replace(/Lett\.\.\./gi, '');

  // 6. Remove status bar icon garbage
  t = t.replace(/[oO]+\s*o[mg]o\s*[Qe@+°]+\s*[oO]+/g, '');

  // 7. Remove "See all footnotes"
  t = t.replace(/See\s+all\s+footnotes/gi, '');

  // 8. Remove trailing OCR garbage at end
  t = t.replace(/\s+nes\s+tait\s+it-[^]*$/g, '');
  t = t.replace(/\s+\d+\s*Tl\s*\d*%?\s*$/g, '');
  t = t.replace(/\s+\d+%\s*$/g, '');

  // 9. Remove leading garble like "105207222212 "
  t = t.replace(/^\d{9,}\s+/, '');

  // 10. Normalize whitespace
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  t = t.trim();

  return t;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function blankImages() {
  return { photocopy: null, photocopy_alt: null, isabelle_portraits: [] };
}

function blankViews(frText) {
  return {
    original_french: frText,
    modern_french: null,
    literal_english_old: null,
    literal_english_modern: null,
    plain_english: null,
  };
}

function makeLetter(base, num, frText, dateDisplay) {
  return {
    id: `letter-${String(num).padStart(3, '0')}`,
    letter_number: num,
    date_iso: null,
    date_display: dateDisplay,
    recipient: base.recipient,
    recipient_id: base.recipient_id,
    location: null,
    salutation: null,
    closing: null,
    chapter_id: base.chapter_id,
    page: null,
    complete: true,
    contextRefs: [],
    images: blankImages(),
    views: blankViews(frText.trim()),
    folio: null,
  };
}

// ─── LOAD BOOK ───────────────────────────────────────────────────────────────

const book = JSON.parse(readFileSync(BOOK_PATH, 'utf8'));
const letters = book.letters;
const chapter = book.chapters[0];

function findLetter(num) {
  return letters.find(l => l.letter_number === num);
}

function getLetterIndex(num) {
  return letters.findIndex(l => l.letter_number === num);
}

const log = [];

// ─── STEP 1: CLEAN ALL original_french FIELDS ────────────────────────────────

let cleanedCount = 0;
for (const letter of letters) {
  if (letter.views?.original_french) {
    const before = letter.views.original_french;
    const after = cleanOCR(before);
    if (after !== before) {
      letter.views.original_french = after;
      cleanedCount++;
    }
  }
}
log.push(`Cleaned OCR noise from ${cleanedCount} letters`);

// ─── STEP 2: LETTER 26 → SPLIT INTO 26 AND 27 ───────────────────────────────

{
  const L26 = findLetter(26);
  const raw = L26.views.original_french;

  // Letter 26: up to and including "if it will go like the day before yesterday? Farewell." + footnote
  const end26marker = '1. Incomprehensible word.';
  const idx26 = raw.indexOf(end26marker);

  // Letter 27: from "you would not have been found reading" to "I kiss and kiss you with all my heart."
  const start27 = 'you would not have been found reading';
  const end27 = '1. From a piece written by Isabelle: a theater or musical piece?';

  const idxStart27 = raw.indexOf(start27);
  const idxEnd27 = raw.indexOf(end27);

  let text26 = '';
  let text27 = '';

  if (idx26 !== -1) {
    text26 = raw.substring(0, idx26 + end26marker.length).trim();
  } else {
    // Fallback: take up to "Farewell." before "you would not"
    text26 = raw.substring(0, idxStart27 > 0 ? idxStart27 : raw.length / 2).trim();
  }

  if (idxStart27 !== -1 && idxEnd27 !== -1) {
    text27 = raw.substring(idxStart27, idxEnd27 + end27.length).trim();
  } else if (idxStart27 !== -1) {
    // grab everything from start27 to "all men in society"
    const endAll = raw.indexOf('all men in society.');
    text27 = raw.substring(idxStart27, endAll > -1 ? endAll : raw.length).trim();
  }

  // Discard essay: everything after "all men in society." is dropped automatically
  // since we only assign up to end27 marker.

  L26.views.original_french = cleanOCR(text26);

  // Insert letter 27 after 26 in letters array
  const idx = getLetterIndex(26);
  const newL27 = makeLetter(L26, 27, cleanOCR(text27), null);
  // Update existing letter-027 if it exists (it's already a placeholder)
  const existing27 = findLetter(27);
  if (existing27) {
    existing27.views = blankViews(cleanOCR(text27));
    existing27.complete = true;
    existing27.date_display = null;
  } else {
    letters.splice(idx + 1, 0, newL27);
  }

  log.push('Split letter 26 → 26, 27 (discarded advisory essay)');
}

// ─── STEP 3: LETTER 54 → SPLIT INTO 54 AND 55 ───────────────────────────────

{
  const L54 = findLetter(54);
  const raw = L54.views.original_french;

  const end54marker = '1. Lisette and Linon are comedy lovers.';
  const start55 = 'not getting from you what I\'m going to ask you';

  const idx54end = raw.indexOf(end54marker);
  const idx55start = raw.indexOf(start55);

  let text54 = '';
  let text55 = '';

  if (idx54end !== -1) {
    text54 = raw.substring(0, idx54end + end54marker.length).trim();
  } else {
    text54 = raw.substring(0, idx55start > 0 ? idx55start : raw.length).trim();
  }

  if (idx55start !== -1) {
    text55 = raw.substring(idx55start).trim();
  }

  L54.views.original_french = cleanOCR(text54);

  const existing55 = findLetter(55);
  if (existing55) {
    existing55.views = blankViews(cleanOCR(text55));
    existing55.complete = true;
    existing55.date_display = 'Summer 1761';
  } else {
    const idx = getLetterIndex(54);
    const newL55 = makeLetter(L54, 55, cleanOCR(text55), 'Summer 1761');
    letters.splice(idx + 1, 0, newL55);
  }

  log.push('Split letter 54 → 54, 55');
}

// ─── STEP 4: LETTER 89 → SPLIT INTO 89, 90, 91, 92 ─────────────────────────

{
  const L89 = findLetter(89);
  const raw = L89.views.original_french;

  // Letter 89: up to and including footnote 4
  const end89marker = '4. Countess Trauttsmandorff is lady-in-waiting to Marie-Thérèse.';
  // Letter 90: from "you thought you were dying" to "Farewell, tell me everything, I kiss you and love you."
  const start90 = 'you thought you were dying';
  const end90 = 'Farewell, tell me everything, I kiss you and love you.';
  // Letter 91: from "Guess where I'm going?" to end of letter 91
  const start91 = "Guess where I'm going?";
  const end91 = 'and even if I don\'t have lunch today, I want to fix it.';
  // Letter 92: everything remaining

  const idx89end = raw.indexOf(end89marker);
  const idx90start = raw.indexOf(start90);
  const idx90end = raw.indexOf(end90);
  const idx91start = raw.indexOf(start91);
  const idx91end = raw.indexOf(end91);

  // Build text89: up to end of footnote 4
  // The footnote may vary; let's try a broader approach
  let text89, text90, text91, text92;

  // Footnote 4 might be slightly different — let's find what's actually there
  const fn4patterns = [
    '4. Countess Trauttsmandorff',
    '4. Countess Trauttsmandorff is lady-in-waiting',
  ];

  let fn4End = -1;
  for (const p of fn4patterns) {
    const i = raw.indexOf(p);
    if (i !== -1) {
      // Find end of this footnote line
      const lineEnd = raw.indexOf('\n', i);
      fn4End = lineEnd > -1 ? lineEnd : raw.indexOf(start90, i);
      break;
    }
  }

  if (fn4End === -1 && idx90start !== -1) {
    fn4End = idx90start;
  }

  text89 = (fn4End > -1 ? raw.substring(0, fn4End) : raw.substring(0, idx90start > -1 ? idx90start : raw.length / 4)).trim();

  if (idx90start !== -1 && idx90end !== -1) {
    text90 = raw.substring(idx90start, idx90end + end90.length).trim();
  } else if (idx90start !== -1) {
    text90 = raw.substring(idx90start, idx91start > -1 ? idx91start : raw.length / 2).trim();
  }

  if (idx91start !== -1 && idx91end !== -1) {
    text91 = raw.substring(idx91start, idx91end + end91.length).trim();
  } else if (idx91start !== -1) {
    text91 = raw.substring(idx91start).trim();
  }

  if (idx91end !== -1) {
    text92 = raw.substring(idx91end + end91.length).trim();
  }

  L89.views.original_french = cleanOCR(text89);

  const date90_92 = 'June 1762';

  const existing90 = findLetter(90);
  if (existing90) {
    existing90.views = blankViews(cleanOCR(text90 || ''));
    existing90.complete = true;
    existing90.date_display = date90_92;
  }

  const existing91 = findLetter(91);
  if (existing91) {
    existing91.views = blankViews(cleanOCR(text91 || ''));
    existing91.complete = true;
    existing91.date_display = date90_92;
  }

  const existing92 = findLetter(92);
  if (existing92) {
    existing92.views = blankViews(cleanOCR(text92 || ''));
    existing92.complete = !!(text92 && text92.length > 10);
    existing92.date_display = date90_92;
  }

  log.push('Split letter 89 → 89, 90, 91, 92');
}

// ─── STEP 5: LETTER 96 → DE-DUPLICATE ───────────────────────────────────────

{
  const L96 = findLetter(96);
  const raw = L96.views.original_french;

  // The letter body is repeated ~3 times. Strategy:
  // 1. Take the first clean occurrence of the letter body (intro paragraph)
  // 2. Append the footnote at the very end
  // The letter body starts: "Autumn 1762 I have some pretty good news..."
  // and ends with "I kiss you with all my heart"
  // Find the LAST occurrence of "I kiss you with all my heart" before OCR garbage
  const closingPhrase = 'I kiss you with all my heart';
  const bodyEnd = 'Farewell, be well. I sacrifice the boredom I experience so that we can be even more together.';
  const footnote = '1. Two illegible words. This letter written in pencil is almost completely erased.';

  // Take the text up to and including the first "Farewell, be well..." + the clean closing
  // First occurrence of the body end
  const idxBodyEnd = raw.indexOf(bodyEnd);

  let clean96 = raw;
  if (idxBodyEnd !== -1) {
    // Include the body end + closing phrase
    const afterBodyEnd = raw.substring(idxBodyEnd + bodyEnd.length);
    const closingInAfter = afterBodyEnd.indexOf(closingPhrase);
    let textEnd = idxBodyEnd + bodyEnd.length;
    if (closingInAfter !== -1) {
      textEnd = idxBodyEnd + bodyEnd.length + closingInAfter + closingPhrase.length;
    }
    clean96 = raw.substring(0, textEnd).trim();
    // Append footnote if it exists
    const fnIdx = raw.lastIndexOf(footnote);
    if (fnIdx !== -1) {
      clean96 = clean96 + ' ' + footnote;
    }
  } else {
    // Fallback: find last occurrence of closing phrase
    let lastIdx = -1;
    let searchIdx = 0;
    while (true) {
      const found = raw.indexOf(closingPhrase, searchIdx);
      if (found === -1) break;
      lastIdx = found;
      searchIdx = found + 1;
    }
    if (lastIdx !== -1) {
      clean96 = raw.substring(0, lastIdx + closingPhrase.length).trim();
    }
  }

  L96.views.original_french = cleanOCR(clean96);

  // Letter 97 — set to empty/null since no recoverable content
  const L97 = findLetter(97);
  if (L97) {
    L97.views = blankViews(null);
    L97.complete = false;
  }

  log.push('De-duplicated letter 96; cleared letter 97 (no recoverable content)');
}

// ─── STEP 6: LETTER 101 → SPLIT INTO 101, 102, 103 ──────────────────────────

{
  const L101 = findLetter(101);
  const raw = L101.views.original_french;

  // Letter 101: scheduling note ending with "for the" → add [text truncated]
  const end101marker = 'Tuesday trip to Eckartsau for the';
  const start102 = 'with beings of the same species when they are superior in power';
  const end102marker = 'prayers mixed in consecrated paper';
  const start103 = 'It is nevertheless true that you could not have addressed yourself';

  const idx101end = raw.indexOf(end101marker);
  const idx102start = raw.indexOf(start102);
  const idx102end = raw.indexOf(end102marker);
  const idx103start = raw.indexOf(start103);

  let text101, text102, text103;

  if (idx101end !== -1) {
    text101 = raw.substring(0, idx101end + end101marker.length).trim() + ' [text truncated]';
  } else {
    text101 = raw.substring(0, idx102start > -1 ? idx102start : raw.length / 3).trim() + ' [text truncated]';
  }

  if (idx102start !== -1 && idx102end !== -1) {
    text102 = raw.substring(idx102start, idx102end + end102marker.length).trim();
  } else if (idx102start !== -1) {
    text102 = raw.substring(idx102start, idx103start > -1 ? idx103start : raw.length).trim();
  }

  if (idx103start !== -1) {
    text103 = raw.substring(idx103start).trim();
  }

  L101.views.original_french = cleanOCR(text101);
  L101.date_display = 'Thursday November 11, 1762';

  const existing102 = findLetter(102);
  if (existing102) {
    existing102.views = blankViews(cleanOCR(text102 || ''));
    existing102.complete = true;
    existing102.date_display = 'November 1762';
  }

  const existing103 = findLetter(103);
  if (existing103) {
    existing103.views = blankViews(cleanOCR(text103 || ''));
    existing103.complete = true;
    existing103.date_display = 'November 1762';
  }

  log.push('Split letter 101 → 101, 102, 103');
}

// ─── STEP 7: LETTER 122 → SPLIT INTO 122, 123, 124 ──────────────────────────

{
  const L122 = findLetter(122);
  const raw = L122.views.original_french;

  // Letter 122: from start to "Farewell." (the first farewell of the 122 letter)
  // The text starts: "January 1763? I forget everything..."
  const end122marker = 'because I don\'t understand the slightest joke. Farewell.';

  // Letter 123: "I can say that my sleep..." to "Goodbye, I kiss you and go too."
  const start123 = 'I can say that my sleep was longer';
  const end123 = 'Goodbye, I kiss you and go too.';

  // Letter 124: from "Here I am. full of it" to end, de-duplicated
  const start124 = 'Here I am. full of it';
  // Clean version: from "marvel although a little wheely" to the shortbread sentence
  const cleanStart124 = 'marvel although a little wheely';
  const end124 = 'I am sending you herewith a small orange peel shortbread which will be very good to remove the taste of the decoctions if you eat it afterwards.';

  const idx122end = raw.indexOf(end122marker);
  const idx123start = raw.indexOf(start123);
  const idx123end = raw.indexOf(end123);
  const idx124start = raw.indexOf(start124);
  const idxClean124start = raw.indexOf(cleanStart124);
  const idx124end = raw.indexOf(end124);

  let text122, text123, text124;

  if (idx122end !== -1) {
    text122 = raw.substring(0, idx122end + end122marker.length).trim();
  } else {
    text122 = raw.substring(0, idx123start > -1 ? idx123start : raw.length / 4).trim();
  }

  if (idx123start !== -1 && idx123end !== -1) {
    text123 = raw.substring(idx123start, idx123end + end123.length).trim();
  } else if (idx123start !== -1) {
    text123 = raw.substring(idx123start, idx124start > -1 ? idx124start : raw.length / 2).trim();
  }

  // For letter 124: skip the noisy part, take the clean version
  if (idx124start !== -1) {
    // Build letter 124: header from "Here I am. full of it" + skip to clean version
    const header124 = raw.substring(idx124start, idxClean124start > -1 ? idxClean124start : idx124start + 50);
    if (idxClean124start !== -1 && idx124end !== -1) {
      text124 = raw.substring(idxClean124start, idx124end + end124.length).trim();
    } else if (idxClean124start !== -1) {
      text124 = raw.substring(idxClean124start).trim();
    } else {
      text124 = raw.substring(idx124start).trim();
    }
  }

  L122.views.original_french = cleanOCR(text122);

  const existing123 = findLetter(123);
  if (existing123) {
    existing123.views = blankViews(cleanOCR(text123 || ''));
    existing123.complete = true;
    existing123.date_display = 'January 1763';
  }

  const existing124 = findLetter(124);
  if (existing124) {
    existing124.views = blankViews(cleanOCR(text124 || ''));
    existing124.complete = true;
    existing124.date_display = 'January 1763';
  }

  log.push('Split letter 122 → 122, 123, 124');
}

// ─── STEP 8: LETTER 138 → SPLIT INTO 138, 139, 140 ──────────────────────────

{
  const L138 = findLetter(138);
  const raw = L138.views.original_french;

  // Letter 138: Take the SECOND (cleaner) occurrence of the letter body
  // Key markers:
  const cleanBodyStart = 'I am sorry for the time I will have to spend without seeing you';
  // Find the SECOND occurrence
  const firstOcc = raw.indexOf(cleanBodyStart);
  const secondOcc = raw.indexOf(cleanBodyStart, firstOcc + cleanBodyStart.length);
  const bodyStart = secondOcc > -1 ? secondOcc : firstOcc;

  const end138marker = '2. If Silsabelle had had measles';
  const idx138end = raw.indexOf(end138marker);

  // Letter 139: starting with "1. To avoid the risk of contagion." → strip footnote prefix
  const start139raw = '1. To avoid the risk of contagion.';
  const start139clean = 'I console myself, in idea, but that is not worth a moment of reality.';
  // Also include the footnote about Countess von Goés
  const end139 = '1. Countess Maria Anna von n Goés, lady-in-waiting to Mari de Christine.';

  // Letter 140: "Patelin 7 Although..." to end
  const start140 = 'Patelin 7 Although';
  const start140clean = 'Although it has often amused me';

  const idx139raw = raw.indexOf(start139raw);
  const idx139clean = raw.indexOf(start139clean);
  const idx139end = raw.indexOf(end139);
  const idx140 = raw.indexOf(start140);
  const idx140clean = raw.indexOf(start140clean);

  let text138, text139, text140;

  if (bodyStart > -1) {
    const endIdx = idx138end > -1 ? idx138end + end138marker.length + 100 : (idx139raw > -1 ? idx139raw : raw.length);
    // grab a reasonable chunk for the footnote ending
    let endSearch = raw.indexOf('\n', idx138end + end138marker.length);
    if (endSearch === -1) endSearch = idx138end + end138marker.length + 200;
    // Include the full footnote sentence
    const periodAfter = raw.indexOf('.', idx138end + end138marker.length);
    const actualEnd = periodAfter > -1 ? periodAfter + 1 : endSearch;

    // Build letter 138: date header + clean body + footnotes
    const dateHeader = 'March 1763';
    const bodyChunk = raw.substring(bodyStart, actualEnd < raw.length ? actualEnd : (idx139raw > -1 ? idx139raw : raw.length)).trim();
    text138 = dateHeader + ' ' + bodyChunk;
  } else {
    text138 = raw.substring(0, idx139raw > -1 ? idx139raw : raw.length / 3).trim();
  }

  // Letter 139: strip footnote prefix, use cleaner phrasing
  if (idx139clean !== -1) {
    const endOfL139 = idx139end > -1 ? idx139end + end139.length : (idx140 > -1 ? idx140 : raw.length);
    text139 = raw.substring(idx139clean, endOfL139).trim();
    // Add footnote if found
    if (idx139end > -1 && !text139.includes(end139)) {
      text139 = text139 + ' ' + end139;
    }
  } else if (idx139raw !== -1) {
    text139 = raw.substring(idx139raw + start139raw.length, idx140 > -1 ? idx140 : raw.length).trim();
  }

  // Also add "laughs" if it exists
  const laughsIdx = raw.indexOf('laughs');
  if (laughsIdx > -1 && text139 && laughsIdx > idx139clean && laughsIdx < idx140) {
    if (!text139.includes('laughs')) {
      text139 += ' laughs';
    }
  }

  // Letter 140
  if (idx140clean !== -1) {
    text140 = raw.substring(idx140clean).trim();
    // Clean "Patelin 7" → just "Patelin"
    // The clean version already starts without "Patelin 7"
  } else if (idx140 !== -1) {
    // Remove "Patelin 7 " prefix
    text140 = raw.substring(idx140).replace(/^Patelin\s*\d+\s*/, 'Patelin ').trim();
  }

  L138.views.original_french = cleanOCR(text138);

  const existing139 = findLetter(139);
  if (existing139) {
    existing139.views = blankViews(cleanOCR(text139 || ''));
    existing139.complete = true;
    existing139.date_display = 'March 1763';
  }

  const existing140 = findLetter(140);
  if (existing140) {
    existing140.views = blankViews(cleanOCR(text140 || ''));
    existing140.complete = true;
    existing140.date_display = 'March 1763';
  }

  log.push('Split letter 138 → 138, 139, 140');
}

// ─── STEP 9: LETTER 153 → SPLIT INTO 153–159 ─────────────────────────────────

{
  const L153 = findLetter(153);
  const raw = L153.views.original_french;

  // Letter 153: start to "with all my heart." (first block)
  const text153 = 'Beginning of April 1763 Hello dear Sister, I am very much obliged to you and am no longer worried since you are naughty. I had planned well yesterday that I would not write to you not this morning. I really envy the fate of the Archduke: he is now with you. What can I do as well? It will be for [this] Sunday in eight. I am not happy with the Vasquez that I kiss, and you too, with all my heart.';

  // Letter 154: "1763 Hello, dear Sister..." → "as well as me with all my heart."
  const start154 = '1763 Hello, dear Sister, my appearance prevented me from writing to you earlier.';
  const end154 = 'as well as me with all my heart.';

  // Letter 155: "Tell ala Vasquez..." → "while waiting for me to go and see you."
  const start155 = 'Tell ala Vasquez that I am not happy with her';
  const end155 = 'Alte, I kiss you with all my strength while waiting for me to go and see you.';

  // Letter 156: "of a second which could..." → "it would have been a shame."
  const start156 = 'of a second which could in the end put me to bed';
  const end156 = 'My dark thoughts are the cause of our quarrel; you yesterday, it would have been a shame.';

  // Letter 157: "The 1 Ceintray believed it..." → "only the Kammerfrau."
  const start157 = 'The 1 Ceintray believed it too';
  const end157 = 'But in the end it was only the Kammerfrau.';

  // Letter 158: "dear sister, stay for two more days." → "is not homogeneous to me."
  const start158 = 'dear sister, stay for two more days.';
  const end158 = 'it is the greatest proof that I could give you to give you a sample of it in the best way that you know is not homogeneous to me.';

  // Letter 159: "and you can assure Vasquez..." → end
  const start159 = 'and you can assure Vasquez that she has never seen me';

  function extractBetween(text, startStr, endStr) {
    const si = text.indexOf(startStr);
    if (si === -1) return null;
    if (!endStr) return text.substring(si).trim();
    const ei = text.indexOf(endStr, si);
    if (ei === -1) return text.substring(si).trim();
    return text.substring(si, ei + endStr.length).trim();
  }

  L153.views.original_french = cleanOCR(text153);

  const pieces = [
    { num: 154, text: extractBetween(raw, start154, end154) },
    { num: 155, text: extractBetween(raw, start155, end155) },
    { num: 156, text: extractBetween(raw, start156, end156) },
    { num: 157, text: extractBetween(raw, start157, end157) },
    { num: 158, text: extractBetween(raw, start158, end158) },
    { num: 159, text: extractBetween(raw, start159, null) },
  ];

  for (const { num, text } of pieces) {
    const existing = findLetter(num);
    if (existing) {
      existing.views = blankViews(text ? cleanOCR(text) : null);
      existing.complete = !!(text && text.length > 20);
      existing.date_display = 'April 1763';
    }
  }

  log.push('Split letter 153 → 153, 154, 155, 156, 157, 158, 159');
}

// ─── STEP 10: LETTER 182 → SPLIT INTO 182, 183 ───────────────────────────────

{
  const L182 = findLetter(182);
  const raw = L182.views.original_french;

  // Letter 182: up to and including "the Great Madwoman" block + footnotes about Vienna Political Correspondence
  const end182marker = 'the Great Madwoman';
  // Also include the long footnotes that follow
  const fnStart = '1. Vienna Political Correspondence';
  // Find the footnote block
  const idxFn = raw.indexOf(fnStart);
  // Letter 183 starts with "time continues:"
  const start183 = 'time continues:';
  const idx183start = raw.indexOf(start183);

  const idx182end = raw.indexOf(end182marker);

  let text182, text183;

  if (idx182end !== -1) {
    // Include footnotes up to where letter 183 starts
    const end = idx183start > -1 ? idx183start : raw.length;
    text182 = raw.substring(0, end).trim();
    // Clean out the OCR garbage footnote lines
    text182 = text182.replace(/of\s*>\s*G&[^\n]*/g, '');
    text182 = text182.replace(/ou\s*\/une\s*rive[^\n]*/g, '');
    text182 = text182.replace(/you\s+from\s+Isabelle\s+in\s+Parma[^\n]*/g, '');
  } else {
    text182 = raw.substring(0, idx183start > -1 ? idx183start : raw.length / 2).trim();
  }

  if (idx183start !== -1) {
    text183 = raw.substring(idx183start).trim();
    // Clean OCR noise in 183
    text183 = text183.replace(/of\s*>\s*G&[^\n]*/g, '');
    text183 = text183.replace(/[oO]+\s*o[mg][^\n]*/g, '');
  }

  L182.views.original_french = cleanOCR(text182);

  const existing183 = findLetter(183);
  if (existing183) {
    existing183.views = blankViews(cleanOCR(text183 || ''));
    existing183.complete = true;
    existing183.date_display = 'Summer 1763';
  }

  log.push('Split letter 182 → 182, 183');
}

// ─── STEP 11: LETTER 188 → SPLIT INTO 188, 189 ───────────────────────────────

{
  const L188 = findLetter(188);
  const raw = L188.views.original_french;

  // Letter 188: start to footnote "1. Is this his friendly will..."
  const end188marker = '1. Is this his friendly will, "Advice to Mary"?';
  const start189 = 'that you will know how to take a time that would not have inconvenienced you to read this post.';

  const idx188end = raw.indexOf(end188marker);
  const idx189start = raw.indexOf(start189);

  let text188, text189;

  if (idx188end !== -1) {
    text188 = raw.substring(0, idx188end + end188marker.length).trim();
  } else {
    text188 = raw.substring(0, idx189start > -1 ? idx189start : raw.length / 2).trim();
  }

  if (idx189start !== -1) {
    text189 = raw.substring(idx189start).trim();
  }

  L188.views.original_french = cleanOCR(text188);

  const existing189 = findLetter(189);
  if (existing189) {
    existing189.views = blankViews(cleanOCR(text189 || ''));
    existing189.complete = true;
    existing189.date_display = 'October-November 1763';
  }

  log.push('Split letter 188 → 188, 189');
}

// ─── STEP 12: POST-PROCESS SPECIFIC KNOWN ISSUES ─────────────────────────────

// Letter 96 de-dup is handled in STEP 5 above; no additional post-processing needed.

// Letter 139: clean OCR artifacts and trim trailing garbage
{
  const L139 = findLetter(139);
  if (L139?.views?.original_french) {
    let t = L139.views.original_french;
    // Remove "2C" OCR artifact (appears between "laughs" and footnote "1.")
    t = t.replace(/\s+2C\s+/g, ' ');
    // Remove trailing garble after "Mari de Christine."
    const goodEnd = 'lady-in-waiting to Mari de Christine.';
    const ei = t.indexOf(goodEnd);
    if (ei !== -1) {
      t = t.substring(0, ei + goodEnd.length).trim();
    }
    L139.views.original_french = t;
  }
}

// Letter 183: trim trailing OCR garbage; fix "II]" OCR artifact in footnote
{
  const L183 = findLetter(183);
  if (L183?.views?.original_french) {
    let t = L183.views.original_french;
    // Fix "II] excelled" → "He excelled" (OCR misread of "He")
    t = t.replace(/II\]\s+excelled/g, 'He excelled');
    // Fix "of Isabelle in Parma, she had brought him to Vienna." (duplicate fragment before the comedy line)
    t = t.replace(/of Isabelle in Parma, she had brought him to Vienna\.\s*/g, '');
    // Remove any trailing © symbol garbage lines
    t = t.replace(/©[^\n]*/g, '');
    // Remove trailing leading-digit junk
    t = t.replace(/\n\s*\d{6,}[^\n]*/g, '');
    t = cleanOCR(t);
    L183.views.original_french = t;
  }
}

log.push('Applied post-processing fixes to letters 96, 139, 183');

// ─── STEP 13: ENSURE chapter letter_ids LIST IS CONSISTENT ───────────────────

// Rebuild the letter_ids list in chapter order, sorted by letter_number
const sortedIds = [...letters]
  .sort((a, b) => a.letter_number - b.letter_number)
  .map(l => l.id);

chapter.letter_ids = sortedIds;
log.push(`Updated chapter letter_ids: ${sortedIds.length} total letters`);

// ─── WRITE OUTPUT ─────────────────────────────────────────────────────────────

writeFileSync(BOOK_PATH, JSON.stringify(book, null, 2), 'utf8');

// ─── SUMMARY ──────────────────────────────────────────────────────────────────

console.log('\n=== fix-combined-letters.js SUMMARY ===\n');
for (const line of log) {
  console.log('  ✓', line);
}
console.log('\nDone. book.json updated.\n');
