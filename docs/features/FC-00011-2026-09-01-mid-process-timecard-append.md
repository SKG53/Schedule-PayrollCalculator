# FC-00011 — Mid-process timecard append

**Date:** 2026-09-01 · **Slice:** M · **Risk:** Medium · **Status:** done · **Affected entities:** All

## What
Allow uploading additional timecard photos after the first OCR batch has been run and reviewed. Newly-added timecards go through the OCR pipeline in a fresh batch; already-processed cards and their approvals stay intact.

## Why
Reality: users don't always have all photos on-hand at once. Forcing them to restart the whole pipeline when late photos arrive loses approvals, notes, and manual edits.

## Where in UI
Tab 2 (Actuals Intake). The existing upload area accepts new files at any time; a "new since upload" badge marks entries from later batches.

## Touches
ocr, actuals ingestion, display

## Risk
Medium — must not clobber existing OCR results/approvals; must dedupe by file identity (name + size + hash).

## Reversibility
Reversible per section. Full revert via one commit.

## Definition of Done
Shipped as specified. 40/40 tests passing (32 pre-existing + 8 new).

## Out of scope
Automatic re-OCR of already-approved cards. Deletion of previously uploaded cards (separate concern).

## Assumptions
1. Dedupe key: `name + size` (fast) with hash fallback if collision.
2. Approvals persist by employee+date, not by upload batch.
3. "New since upload" badge is per-batch, not permanent.

## Deviations from brief
Subagent found and fixed a pre-existing semantic bug in how the "new since upload" badge was scoped in batch mode.

## Tests
- `test_append_preserves_prior_ocr_results`
- `test_dedupe_by_name_size`
- `test_new_batch_gets_new_since_badge`
- `test_approvals_survive_append`
- `test_late_batch_ocr_runs_only_new`
- Plus 3 additional coverage tests.

## Slice
M

## Affected entities
All

## Shipped as
Merge commit `98484fd`
