# Isabelle — Book 2 Expansion + Fiction Layer Design
**Date:** 2026-03-23
**Status:** Approved by user

---

## Overview

Expand the Isabelle audiobook reader with:
1. Three depth levels for Book 2 (context) entries
2. A fiction companion layer — gap scenes and letter reimaginings — clearly marked as fiction
3. Complete authoring of all 5 letter text views
4. Export/import TSV workflows for every new content type
5. UI track selector (global default + per-letter override)

Book 1 (`book.json` letter content) is never modified by this work.

---

## 1. Data Architecture

### 1.1 `book.json` — unchanged structure
The 5 views are filled in by authoring. No schema changes.

| View key | Purpose | Character |
|---|---|---|
| `original_french` | Source reference | Cleaned OCR, as-written |
| `modern_french` | French narration / French-language readers | Updated spelling, punctuation, modern vocabulary |
| `literal_english_old` | Scholarly / annotated | Preserves French syntax; brackets untranslatable terms e.g. `[Votre]` |
| `literal_english_modern` | Audio-ready narration | Accurate, clean prose, no brackets, TTS-safe punctuation |
| `plain_english` | Accessible / general audience | Flowing, simplified — gains readability over precision |

### 1.2 `context.json` — depth levels added
`schema_version` bumped from `2` to `3` by the migration script.

The existing single `content` array is renamed to `content_contextual` by `scripts/migrate-context.js` (run once, explicitly). Each entry gains two additional depth arrays:

```json
{
  "id": "marie-christine",
  "type": "person",
  "name": "...",
  "short": "...",
  "content_brief": [{ "id": "mc-brief-001", "text": "..." }],
  "content_contextual": [{ "id": "mc-ctx-001", "text": "..." }],
  "content_encyclopedic": [{ "id": "mc-enc-001", "text": "..." }],
  "images": [],
  "letterRefs": [],
  "relatedRefs": []
}
```

Depth definitions:
- **Brief** — 1–2 paragraphs drawn only from what appears in the letters themselves
- **Contextual** — 2–4 paragraphs with period-accurate historical context (default; migrated from `content`)
- **Encyclopedic** — Full companion-volume entry with extensive historical background

### 1.3 `fiction.json` — new file
Two sections, never merged with Book 1:

```json
{
  "schema_version": 1,
  "gap_scenes": [
    {
      "id": "gap-letter-001-letter-002",
      "after_letter": "letter-001",
      "before_letter": "letter-002",
      "title": "Short scene title",
      "text": "..."
    }
  ],
  "letter_reimaginings": [
    {
      "id": "reimagining-letter-001",
      "letter_id": "letter-001",
      "text": "..."
    }
  ]
}
```

- **Gap scenes** — narrative fiction filling the silence between consecutive content-letter pairs (see section 2.2 for scope); written in close third-person or Isabelle's voice; sapphic in nature; clearly marked as fiction
- **Letter reimaginings** — each letter rewritten as intimate prose fiction, making the subtext explicit; Isabelle's voice; clearly marked as fiction
- Both tracks are based on historical assumptions and period research; never presented as fact

---

## 2. Scripts

### 2.1 Migration script (run once)

**`scripts/migrate-context.js`**
- Renames `content` → `content_contextual` on every entry where `content_contextual` is absent
- Bumps `schema_version` from `2` to `3`
- Supports `--dry-run` (prints what would change without writing)
- Idempotent: safe to re-run (skips entries already having `content_contextual`)
- Must be run before `export-context.js` or `import-context.js` with `--depth`

### 2.2 Updated scripts

**`scripts/export-context.js`**
- Add `--depth brief|contextual|encyclopedic` flag (default: `contextual`)
- Output filename changes from `context-content.tsv` to `context-<depth>.tsv`
  - e.g. `views-export/context-contextual.tsv`, `views-export/context-brief.tsv`
  - **Breaking change from previous filename** — update any documented workflows
- TSV columns unchanged: `entry_id | entry_type | entry_name | paragraph_id | text`
- Does NOT migrate `context.json`; run `migrate-context.js` first
- Supports `--dry-run` (prints row count without writing TSV)

**`scripts/import-context.js`**
- Add `--depth brief|contextual|encyclopedic` flag (default: `contextual`)
- Reads `views-export/context-<depth>.tsv` (matches export filename convention)
- Writes rows into `entry.content_<depth>` array (e.g. `content_brief`, `content_contextual`)
- Supports `--dry-run`

### 2.3 New scripts

**`scripts/export-fiction.js`**
- Flag: `--track gaps|letters` (required)
- Reads `fiction.json` (and `book.json` for letter date lookup)
- Outputs:
  - `views-export/fiction-gaps.tsv` — columns: `scene_id | after_letter | before_letter | title | text`
  - `views-export/fiction-letters.tsv` — columns: `reimagining_id | letter_id | letter_date | text`
    - `letter_date` is read-only context for the author (joined from `book.json`); uses `date_display` field, falling back to `date_iso` if `date_display` is absent or looks like a lifespan (e.g. "1717-1790"); not stored in `fiction.json`
- Gap scenes exported for all **consecutive content-letter pairs only** (letters where `complete === true`), not all 194 letter stubs
- Supports `--dry-run`

**`scripts/import-fiction.js`**
- Flag: `--track gaps|letters` (required)
- Reads the corresponding TSV (`fiction-gaps.tsv` or `fiction-letters.tsv`)
- `letter_date` column is ignored on import (read-only editorial aid)
- Writes into the correct section of `fiction.json`
- Creates `fiction.json` with `schema_version: 1` if it does not exist
- Supports `--dry-run`

All export files go to `views-export/` (gitignored).

---

## 3. UI

### 3.1 Book 2 panel definition
"Book 2 panel" refers to the existing `#context-pane` element in `index.html`, which currently renders context entries when a letter link is clicked. The track selector is added inside this pane.

### 3.2 Book 2 track selector
A pill/tab bar at the top of `#context-pane` with 5 tracks:

```
Brief · Contextual · Encyclopedic · Fiction: Gaps · Fiction: Letters
```

- Selected track saved to localStorage as global default (`isabelle-v2-book2-track`)
- Persists across sessions and letters

### 3.3 Per-letter override
- Small inline picker within `#context-pane` when viewing a specific letter
- Defaults to global track
- Override saved to localStorage keyed by letter ID (`isabelle-v2-book2-track-<letter-id>`)
- **Fiction: Gaps display rule** — when the active track is "Fiction: Gaps", show the gap scene where `after_letter` equals the current letter ID. (Shows what happened just after this letter was written.)
- **Fiction: Letters display rule** — when the active track is "Fiction: Letters", show the reimagining where `letter_id` equals the current letter ID.

### 3.4 Fiction visual treatment
- Italic body text
- Top label `FICTION` in accent colour
- Disclaimer line: *"Historical fiction — imaginative reconstruction, not fact"*
- Visually distinct from all scholarly content
- CSS added as an inline `<style>` block in `index.html` (consistent with existing project pattern)

### 3.5 Smart Features guard
`js/smartFeatures.js` adds a new feature entry:
```js
{ id: 'fiction-tracks', label: 'Fiction Tracks' }
```
`isEnabled('fiction-tracks')` is checked before rendering any fiction content. Defaults on.

### 3.6 No Book 1 changes
Letter body, view tabs, and audio player are untouched.

---

## 4. Content Authoring

All authoring done programmatically via TSV export → fill → import workflow.

| Phase | Work | Volume |
|---|---|---|
| 1 | Technical fixes (date_display, letter-010, OCR repairs) | ~10 letters |
| 2 | `plain_english` view — establishes narrative voice | 82 passages |
| 3 | `literal_english_modern` + `modern_french` | 164 passages |
| 4 | `literal_english_old` (scholarly annotated) | 82 passages |
| 5 | Context: Contextual depth (migrate + fill gaps) | 34 entries |
| 6 | Context: Brief + Encyclopedic | 68 entries |
| 7 | Fiction: Letter reimaginings | 82 passages |
| 8 | Fiction: Gap scenes | ~81 scenes (consecutive content-letter pairs) |

---

## 5. Technical Fixes (Phase 1 detail)

### 5.1 Strip folio suffix from `date_display`
69 fields read e.g. `"October–November 1760, f. 237"`. Strip `, f. NNN` suffix since folio now lives in `letter.folio`.

### 5.2 Letter-010 body
Text is almost entirely historian footnotes with a small letter fragment embedded. The date display incorrectly shows archduchess lifespan dates, not a letter date. Fix: isolate the actual letter text fragment, move footnote content to context, correct date_display.

### 5.3 Letter-001 date_display
`date_display` reads `"1717-1790"` (Isabelle's lifespan), not a letter date. Correct to the actual letter date or leave blank if unknown.

### 5.4 OCR manual repairs
~8 letters with remaining character-level garble (e.g. letter-007: "hgnificent", "Isat miers"). Best-effort reconstruction from context and surrounding text.

---

## 6. File Summary

| File | Change |
|---|---|
| `book.json` | Views authored (no schema change) |
| `context.json` | `schema_version` 2 → 3; `content` renamed to `content_contextual` via migrate script; `content_brief` and `content_encyclopedic` added |
| `fiction.json` | Created new (`schema_version: 1`) |
| `scripts/migrate-context.js` | Created new — one-time migration |
| `scripts/export-context.js` | `--depth` flag; new output filename pattern; `--dry-run` |
| `scripts/import-context.js` | `--depth` flag; reads `content_<depth>` arrays |
| `scripts/export-fiction.js` | Created new |
| `scripts/import-fiction.js` | Created new |
| `js/app.js` | Book 2 track selector + per-letter override wired to `#context-pane` |
| `js/smartFeatures.js` | `fiction-tracks` feature entry added |
| `index.html` | Fiction visual treatment CSS (inline `<style>` block) |
