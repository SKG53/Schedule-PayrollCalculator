# FC-00029 — Reviewer edits are final; MN supersedes overlapping OCR

**Date:** 2026-10-07 · **Slice:** M · **Risk:** Medium-High · **Status:** done · **Affected entities:** All

## What
When Sastry changes a time or date that OCR produced, the row becomes a manual (MN) entry: his value is kept, survives OCR re-runs, and in payroll an approved MN pair replaces any overlapping TC/EC pair for the same employee and date. Non-overlapping pairs still add.

## Why
Sastry reads every card and is the final verification. Before this, all sources merged additively: a manual correction never replaced the OCR punch it corrected, and re-running OCR on an image discarded edits made to that image's rows. Decision recorded as DECISIONS Settled #15 (was Open #11).

## Fix
- `processReviewRow` stores the OCR values (`_ocr`) and source (`_ocrSource`) for TC/EC rows.
- `_applyReviewerEditState(row)` runs on every time/date change (`updateReviewField`, `updateReviewFieldLight`, `handleTimeInput`): any field different from `_ocr` → `source='MN'`, `_reviewerEdited=true`; all fields back to `_ocr` → original source restored. Employee-name changes do not count.
- OCR re-runs (`runOcrForEntity` retry cleanup, `retryOcrJob`, `rerunOcrForImage`) drop only the image's non-MN rows; reviewer-edited rows stay.
- `syncActualsFromReview` tags pairs with `_mn` and drops any non-MN pair that overlaps an MN pair within the same employee+date (`_pairsOverlap`: `a.in < b.outAdj && b.in < a.outAdj`). The dropped row gets `_superseded`.
- Review table badges: "✎ edited (was TC/EC)" and "⤳ replaced by manual entry". Re-run buttons stay on edited rows.
- Docs: CLAUDE.md hard rule 3, DOMAIN.md MN precedence, DECISIONS #15/#11, BUILD_SPEC §6.1, BASELINE §5/§9, DEFERRED.

## Where in UI
Actuals Intake review table (badges); Payroll (hours where an MN pair overlaps an OCR pair).

## Touches
actuals ingestion, payroll calc, display, docs

## Risk
Medium-High — changes paid hours wherever an approved MN pair overlaps an approved TC/EC pair. Weeks with no overlapping MN pairs compute identically — verified 2026-10-07 by running five real weeks (Aug 23 – Oct 3, 2026) through the old and new code: zero row differences.

## Reversibility
Fully reversible via one revert commit (session-only fields; no schema change — the Actuals Intake export already writes `Source`, so an edited row round-trips as MN).

## Definition of Done
1. Editing a time/date on an OCR row keeps the edited value and marks it MN; reverting all values restores TC/EC.
2. A name-only change does not mark MN.
3. An approved MN pair replaces an overlapping approved TC/EC pair; non-overlapping pairs add; unapproved rows supersede nothing.
4. Re-running OCR on an image keeps that image's edited rows and replaces its unedited ones.
5. Badges render; existing tests pass; new tests pass.

## Out of scope
Overnight continuation rows split across two manual rows (DEFERRED). Shift-merge thresholds.

## Assumptions
1. "Overlap" = positive-length overlap of clock-in→clock-out on the clock-in date's clock.
2. An approved reviewer-edited row needs no extra approval beyond the existing rules.

## Open questions
None.

## Tests
`tests/fc00029_reviewer_edits_final.test.js`
- `test_editing_ocr_time_makes_row_manual_and_keeps_value`
- `test_setting_value_back_restores_ocr_source`
- `test_date_edit_also_counts_as_reviewer_edit`
- `test_name_change_alone_is_not_a_time_edit`
- `test_manual_pair_supersedes_overlapping_ocr_pair`
- `test_non_overlapping_pairs_still_add`
- `test_unapproved_manual_row_supersedes_nothing`
- `test_ocr_rerun_keeps_reviewer_edited_rows`
- `test_review_table_shows_edit_and_supersede_badges`

## Slice
M

## Affected entities
All
