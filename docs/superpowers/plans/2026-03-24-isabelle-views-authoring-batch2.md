# Isabelle — Letter Views Authoring Batch 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author the four derived letter views (`modern_french`, `literal_english_old`, `literal_english_modern`, `plain_english`) for the 32 complete letters that currently carry only placeholder text (their `modern_french` is either null or equals `original_french`).

**Background:** Batch 1 (from the 2026-03-23 session) authored views for the original 82 complete letters. The OCR recovery pass (commit `bd885c9`) raised the complete count to 101 by splitting 10 combined blobs into 19 individual letters. Those 19 recovered letters, plus 13 others identified below, still lack translated views. This plan covers all 32.

**Architecture:** Export TSVs via `scripts/export-views.js` (one per view), author content externally or via agent batches, repair JSON as needed, then re-import via `scripts/import-views.js`. No schema changes to `book.json`.

**Tech stack:** Node.js 18+, `scripts/export-views.js`, `scripts/import-views.js`, `scripts/fix-patch-json.py` (if using patch-based agent workflow).

**Prerequisite:** `book.json` at HEAD (`bd885c9`) — 101 complete letters, 32 without translated views.

---

## Letters in scope

| Batch | Letter IDs |
|-------|-----------|
| A (letters 027–103) | letter-027, letter-055, letter-090, letter-091, letter-092, letter-102, letter-103 |
| B (letters 123–159) | letter-123, letter-124, letter-139, letter-140, letter-149, letter-150, letter-154, letter-155, letter-156, letter-157, letter-158, letter-159 |
| C (letters 168–194) | letter-168, letter-171, letter-174, letter-175, letter-176, letter-181, letter-183, letter-187, letter-189, letter-190, letter-191, letter-193, letter-194 |

---

## Task 0: Verify state

- [ ] **Step 0.1: Confirm 32 letters need views**

```bash
node -e "
const b = require('./book.json');
const complete = b.letters.filter(l => l.complete);
const need = complete.filter(l => !l.views.modern_french || l.views.modern_french === l.views.original_french);
console.log('Needs views:', need.length, need.map(l => l.id).join(', '));
"
```

Expected: `Needs views: 32 letter-027, letter-055, …`

- [ ] **Step 0.2: Export TSVs for all four views**

```bash
node scripts/export-views.js --view modern_french
node scripts/export-views.js --view literal_english_old
node scripts/export-views.js --view literal_english_modern
node scripts/export-views.js --view plain_english
```

Output: `views-export/modern_french.tsv`, `views-export/literal_english_old.tsv`, `views-export/literal_english_modern.tsv`, `views-export/plain_english.tsv`

Each TSV has columns `letter_id | source (original_french) | target (current view)`. Rows where target equals source are the ones to fill.

---

## Task 1: Author Batch A (7 letters: 027, 055, 090–092, 102–103)

**Input:** `views-export/*.tsv` rows for the 7 Batch A IDs.

**Register reference:**

| View | Tab | Register |
|------|-----|----------|
| `modern_french` | français | Contemporary French prose, updated spelling/punctuation |
| `literal_english_old` | literal | Scholarly; preserves French syntax; brackets archival terms e.g. `[Votre]` |
| `literal_english_modern` | narration | Audio-ready English; fluent, emotionally immediate; TTS-safe punctuation |
| `plain_english` | english | Accessible general-audience reading; flowing, simplified |

**Voice and tone:** Isabelle writes to Marie-Christine ("Laurette") — intimate, passionate, occasionally melancholy. Letters span late 1760–late 1762. Sapphic love is explicit in the source text and should be preserved.

- [ ] **Step 1.1: Author views for Batch A using agent or human editorial workflow**

If using the agent batch workflow (recommended for speed):

1. Create `views-export/patch-views-A.json` with the following shape:
   ```json
   [
     {
       "letter_id": "letter-027",
       "views": {
         "modern_french": "...",
         "literal_english_old": "...",
         "literal_english_modern": "...",
         "plain_english": "..."
       }
     }
   ]
   ```
2. Feed the 7 letters' `original_french` text to the authoring agent with the register reference above.
3. Collect output into `patch-views-A.json`.

If views are authored directly into the TSVs, skip the patch file and jump to Step 1.2.

- [ ] **Step 1.2: Repair JSON (patch workflow only)**

```bash
python3 scripts/fix-patch-json.py views-export/patch-views-A.json views-export/patch-views-A-fixed.json
```

Review `patch-views-A-fixed.json` — confirm 7 letter objects, 4 view fields each, no truncated values.

- [ ] **Step 1.3: Apply patch to book.json**

If using TSV workflow:
```bash
node scripts/import-views.js --dry-run
# Review summary, then:
node scripts/import-views.js
```

If using patch workflow, apply with a small inline script or extend `import-views.js` to accept `--patch <file>`. Alternatively, manually merge via `import-views.js` after writing patch rows into the TSVs.

- [ ] **Step 1.4: Verify Batch A**

```bash
node -e "
const b = require('./book.json');
const ids = ['letter-027','letter-055','letter-090','letter-091','letter-092','letter-102','letter-103'];
ids.forEach(id => {
  const l = b.letters.find(x => x.id === id);
  const ok = l.views.modern_french && l.views.modern_french !== l.views.original_french;
  console.log(id, ok ? 'OK' : 'MISSING');
});
"
```

Expected: all 7 lines show `OK`.

---

## Task 2: Author Batch B (12 letters: 123–159)

Same workflow as Task 1.

**Context:** Letters from January–April 1763, during Archduchess Jeanne's illness and death. Isabelle's mood shifts toward exhaustion and anxiety.

- [ ] **Step 2.1: Author views for Batch B** (12 letters)
- [ ] **Step 2.2: Repair JSON** (if patch workflow)
- [ ] **Step 2.3: Import**
- [ ] **Step 2.4: Verify Batch B**

```bash
node -e "
const b = require('./book.json');
const ids = ['letter-123','letter-124','letter-139','letter-140','letter-149','letter-150','letter-154','letter-155','letter-156','letter-157','letter-158','letter-159'];
ids.forEach(id => {
  const l = b.letters.find(x => x.id === id);
  const ok = l.views.modern_french && l.views.modern_french !== l.views.original_french;
  console.log(id, ok ? 'OK' : 'MISSING');
});
"
```

---

## Task 3: Author Batch C (13 letters: 168–194)

Same workflow as Tasks 1–2.

**Context:** Late-cycle letters, spring–November 1763. Isabelle's final months; the farewell arc begins. Letter 194 is among the last known in the corpus.

- [ ] **Step 3.1: Author views for Batch C** (13 letters)
- [ ] **Step 3.2: Repair JSON** (if patch workflow)
- [ ] **Step 3.3: Import**
- [ ] **Step 3.4: Verify Batch C**

```bash
node -e "
const b = require('./book.json');
const ids = ['letter-168','letter-171','letter-174','letter-175','letter-176','letter-181','letter-183','letter-187','letter-189','letter-190','letter-191','letter-193','letter-194'];
ids.forEach(id => {
  const l = b.letters.find(x => x.id === id);
  const ok = l.views.modern_french && l.views.modern_french !== l.views.original_french;
  console.log(id, ok ? 'OK' : 'MISSING');
});
"
```

---

## Task 4: Full validation

- [ ] **Step 4.1: Run unit tests**

```bash
node --test tests/test-extract.js
```

Expected: 0 failures. The test suite validates `book.json` schema and `plain_english` presence for complete letters.

- [ ] **Step 4.2: Confirm zero letters still need views**

```bash
node -e "
const b = require('./book.json');
const complete = b.letters.filter(l => l.complete);
const need = complete.filter(l => !l.views.modern_french || l.views.modern_french === l.views.original_french);
console.log('Still needs views:', need.length);
"
```

Expected: `Still needs views: 0`

- [ ] **Step 4.3: Spot-check in browser**

```bash
npx serve . -p 8080
```

Open a Batch C letter (e.g. letter-194) in the reader. Switch through all 5 view tabs. Confirm each shows distinct text.

---

## Task 5: Commit

- [ ] **Step 5.1: Stage and commit**

```bash
git add book.json
git commit -m "content: author 4 views for 32 complete letters (batch 2)"
```

---

## When things fail

| Symptom | What to check |
|---------|----------------|
| `views.modern_french` unchanged after import | TSV `target` column may be empty — check for tab character issues in the TSV file. |
| `fix-patch-json.py` fails | Patch file has unescaped control characters; open in a hex editor or add explicit `\n`→`\\n` replacement before calling the script. |
| Unit tests fail after import | `plain_english` field is null — the import did not apply. Check `--dry-run` output for skipped rows. |
| Letter not in TSV | Letter may not be `complete: true` in `book.json` — `export-views.js` only exports complete letters. |

---

*Created: 2026-03-24. Update checklist items as batches complete.*
