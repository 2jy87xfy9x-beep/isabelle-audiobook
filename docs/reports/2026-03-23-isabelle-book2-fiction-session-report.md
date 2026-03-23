# Isabelle Reader — Book 2 / Fiction Layer Session Report
**Date:** 2026-03-23
**Scope:** Content expansion, UI track selector, typography, tooltip unification

---

## Overview

This session completed the full Book 2 + Fiction Layer expansion for the Isabelle de Bourbon-Parma audiobook reader. All work builds on the Isabelle v2 reader infrastructure (vanilla JS ES modules, no build step, GitHub Pages). The project now ships five reading views per letter, three context depth tracks, and a complete sapphic fiction layer — none of which alters the original Book 1 letter text.

---

## 1. Technical Fixes Applied to book.json

### Date Display Cleanup
- Stripped folio suffixes (`, f. NNN`, `, f. NNN]`) from 69 `date_display` fields across the corpus. Two regex forms were required — bracketed (`[f. NNN]`) and unbracketed (`, f. NNN]`). Fix applied in both `scripts/apply-clean.js` and `scripts/clean-letters.js`.

### Letter-Specific Corrections
| Letter | Issue | Fix |
|--------|-------|-----|
| letter-001 | `date_display` read `"1717-1790"` (a person's lifespan, not a date) | Corrected to `"July 6, 1760"` |
| letter-010 | Body contained historian footnote metadata; wrong date | Body replaced with actual letter fragment; date corrected to `"Late 1760?"` |

---

## 2. Content Authoring — Five Letter Views

All 82 complete letters now have five views, authored in parallel by four background agents:

| View key | Tab label | Register |
|---|---|---|
| `original_french` | *vieux français* | Archival source text (pre-existing) |
| `modern_french` | français | Contemporary French prose |
| `literal_english_old` | literal | Scholarly rendering; preserves French syntax; brackets archival terms |
| `literal_english_modern` | narration | Audio-ready English; fluent, emotionally immediate |
| `plain_english` | **english** | Accessible general-audience reading |

**Coverage:** 82 of 194 letters are `complete: true` and carry source text. The remaining 112 are skeletal stubs with no original French — they display "This version has not been added yet" across all views, as expected.

**Agent workflow:** Four agents (batches A–D, ~20 letters each) wrote to isolated patch files (`views-export/patch-views-A.json` … `patch-views-D.json`). A Python state-machine script (`scripts/fix-patch-json.py`) repaired unescaped inner quotes and bare newlines in agent-generated JSON before each patch was applied.

---

## 3. context.json — Schema v3 Migration and Depth Tracks

### Schema Migration (v2 → v3)
`scripts/migrate-context.js` renamed the `content` field to `content_contextual` on all 34 entries and bumped `schema_version` to `3`. Idempotent; supports `--dry-run`.

### Three Context Depth Tracks
All 34 entries now carry three depth arrays:

| Track | Description |
|---|---|
| `content_brief` | 1–2 sentences — quick identification |
| `content_contextual` | 2–4 paragraphs — standard reading depth (was original `content`) |
| `content_encyclopedic` | 3–8 paragraphs — full scholarly detail with archival references |

**Newly authored entries** (were completely empty before):

- `marie-christine` — Archduchess Marie-Christine of Austria, Isabelle's intimate
- `vienna` — The Habsburg capital where Isabelle lived her married life
- `parma` — The Italian duchy where Isabelle grew up
- `habsburg-court` — The ceremonial world Isabelle navigated
- `bourbon-parma` — Isabelle's dynastic family

**Excluded from authoring:** `p23-105` and `a-a` — OCR scanning artefacts with no corresponding real entity.

### Updated Scripts
- `scripts/export-context.js` — `--depth brief|contextual|encyclopedic` flag; outputs `views-export/context-<depth>.tsv`
- `scripts/import-context.js` — round-trip import per depth; idempotent merge

---

## 4. fiction.json — Gap Scenes and Letter Reimaginings

A new `fiction.json` file ships two fiction tracks:

| Track | Field | Count | Description |
|---|---|---|---|
| `fiction-gaps` | `gap_scenes[]` | 81 | Scenes set between consecutive letters |
| `fiction-letters` | `letter_reimaginings[]` | 82 | First-person reimaginings of each letter |

**Voice and tone:** Written entirely in Isabelle's first-person voice, set in 1760–1763 Vienna and the Habsburg court. The sapphic love for Marie-Christine ("Laurette") is explicit throughout — desire, jealousy, declarations of dying of love, the final farewell. Historical specifics are grounded: Schönbrunn, Eckartsau, Archduchess Jeanne's illness, Van Swieten, Maria Theresa, the Orpheus opera.

**Fiction marking:** Every entry opens with a disclaimer:
> *FICTION — A creative reimagining inspired by the historical letters of Isabelle de Bourbon-Parma. Not historical fact.*

**Neither track alters Book 1.** The original letters are untouched.

### New Scripts
- `scripts/export-fiction.js` — `--track gaps|letters`; outputs `views-export/fiction-<track>.tsv`
- `scripts/import-fiction.js` — round-trip import per track; creates `fiction.json` if absent

---

## 5. UI — Book 2 Track Selector

A track bar was added to `#context-pane` offering five tracks:

| Track ID | Label |
|---|---|
| `contextual` | Contextual |
| `brief` | Brief |
| `encyclopedic` | Encyclopedic |
| `fiction-gaps` | Fiction — Gap Scenes |
| `fiction-letters` | Fiction — Reimaginings |

**Persistence model:**
- **Global default** — stored in `localStorage` as `isabelle-v2-book2-track`; applies across all letters
- **Per-letter override** — stored as `isabelle-v2-book2-track-<letter-id>`; overrides the global for that letter only
- Pills show distinct states: global active (accent border), local active (filled accent), neither (muted)

**Fiction visual treatment:** Fiction tracks render with a `FICTION` badge, an italic disclaimer paragraph, and italic body text styled in `var(--book-font)` — visually distinct from scholarly context content.

**Smart feature toggle:** `fiction-tracks` added to `js/smartFeatures.js`; when disabled, fiction pills are hidden from both rows.

**loader.js** updated to fetch `fiction.json` in the same `Promise.all` as `book.json` and `context.json`, with a graceful fallback `{ gap_scenes: [], letter_reimaginings: [] }` if the file is absent.

---

## 6. Per-View Typography

Each reading view now has a distinct typographic identity applied both to the tab label and to the letter body text:

| View | Tab font | Body treatment |
|---|---|---|
| *vieux français* | Georgia italic | Italic serif + slight letter-spacing |
| français | Georgia upright | Italic serif |
| literal | JetBrains Mono, wide spacing | Monospace, `.84rem`, `line-height: 1.95` |
| narration | JetBrains Mono | Monospace, `.86rem`, `line-height: 1.9` |
| **english** | JetBrains Mono | Default (Georgia serif) |
| *manuscrit* | Pinyon Script cursive | Pinyon Script (pre-existing `.handwriting` class) |
| PHOTOCOPIE | Georgia uppercase | Image view — no body text |

Tab labels were also renamed to reflect the language of each view:
- `vieux fr` → *vieux français* / `fr moderne` → français / `en littéral` → literal / `en mod fr` → narration / `anglais` → english

Body text receives its font via `.letter-body[data-view="…"]` CSS attribute selectors, added once `renderLetterBody` was updated to stamp `article.dataset.view = activeView`.

---

## 7. Universal Tooltip System

Replaced seven separate CSS `::before`/`::after` pseudo-element tooltip blocks with a single `#app-tooltip` DOM element:

- `position: fixed; z-index: 300` — never clipped by overflow
- Downward arrow via `::after`
- `opacity` fade transition (`0.12s ease`)
- `font-family: var(--ui-font)` (JetBrains Mono), `font-size: .63rem` — matches all other UI chrome

**Event model:** Document-level `mouseover`/`mouseout` delegation — works on any `[data-tip]` element including dynamically rendered nodes (view tabs, track pills, guardian marks).

**All `title=` attributes replaced with `data-tip=`:**
- `js/renderer.js` — view tab buttons
- `js/app.js` — sidebar letter nav buttons, track pills (global + local), editor indicator
- `js/smartFeatures.js` — Letter Integrity Guardian `<mark>` elements

---

## 8. New Scripts Summary

| Script | Purpose |
|---|---|
| `scripts/migrate-context.js` | One-time schema v2→v3 migration (rename `content` → `content_contextual`) |
| `scripts/export-context.js` | Export context depth to TSV (`--depth brief\|contextual\|encyclopedic`) |
| `scripts/import-context.js` | Import TSV back into context.json per depth |
| `scripts/export-fiction.js` | Export fiction track to TSV (`--track gaps\|letters`) |
| `scripts/import-fiction.js` | Import TSV back into fiction.json per track |
| `scripts/fix-patch-json.py` | Repair unescaped quotes / bare newlines in agent-generated patch JSON |

---

## 9. Commits

| Hash | Description |
|---|---|
| `cd3175c` | docs: Book 2 expansion + fiction layer design spec |
| `cb4957d` | feat: Book 2 depth tracks + fiction layer for Isabelle reader |
| `ff5d8c0` | feat: per-view typography — tab labels and body text |
| `a40a4d2` | feat: translate view tab labels to match each view's language |
| `d0cd39a` | feat: universal tooltip system — uniform across all UI elements |

---

## 10. Known Limitations / Possible Next Steps

- **112 incomplete letters** have no source text and show "This version has not been added yet" for all views. These are stubs in the original dataset with no recoverable original French.
- **context_brief / context_encyclopedic** for the two OCR-garbage entries (`p23-105`, `a-a`) remain empty — these entries have no real entity to describe.
- **Fiction TSV exports** are ready for external editing and re-import should the fiction content need revision.
- **Audio narration** for the new views (modern_french, literal_english_modern) is possible via the existing TTS pipeline — no code changes required, the track selector already exposes them as readable views.
