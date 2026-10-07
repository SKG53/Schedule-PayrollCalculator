# FC-00034 — Re-run OCR for one review row

**Date:** 2026-10-07 · **Slice:** S · **Risk:** Low · **Status:** done · **Affected entities:** All

## What
A "↻ This row" button on every OCR review row re-reads only that employee and date from the source image. The fresh reading replaces that row's times; nothing else changes. Manual edits can then be made on top.

## Why
Sastry: "enable a button that allows me to rerun OCR for one specific line of the payroll data? and then I can make manual edits on top of that if I need to. it's more granular than running ocr for the entire timecard again."

## Fix
- `rerunOcrForRow(entIdx, rowId)` finds the row's image by job id (FC-00030), sends the normal TC/EC prompt plus `_rowFocusPrompt` (employee, date, the current reading, "re-read independently, return one element or []"), and applies the result in place. Auto-escalation to Pro applies to TC as in a full run.
- `_pickRowReread`: same-date reading first; several → nearest clock-in (EasyClocking has one row per punch pair); a single reading with another date is used and flagged; otherwise no match and the row is left as it was.
- `_applyRowReread`: replaces date/times/confidence, keeps a reviewer-chosen schedule name, resets the row to an unedited OCR row (`source`, `_ocrSource`, new `_ocr` baseline, `_reviewerEdited=false`, clears `_superseded`), unapproves it and flags "Re-read from image — check and approve".
- A reviewer-edited (MN) row asks for confirmation before its values are replaced. If the image is not in the session, the tool says so instead of guessing.
- `ocrImage` takes an optional extra prompt block.

## Where in UI
Actuals Intake review table, Image column, next to "↻ 1x / ↻ 3x" (which still re-run the whole image). Shows "re-reading…" while running.

## Touches
intake, OCR

## Risk
Low — one row changes, and only on request; the row comes back unapproved.

## Reversibility
Fully reversible via one revert commit.

## Definition of Done
1. Only the chosen row changes; same row id; other rows and approvals untouched.
2. Re-read row is unapproved, flagged, and a later edit makes it MN again.
3. Edited row asks before overwrite; declining makes no OCR call.
4. No match or missing image leaves the row unchanged with a message.
5. Button only on OCR-sourced rows.

## Out of scope
Re-reading pure manual rows (no image). Re-reading a whole day across employees.

## Assumptions
The reviewer's chosen employee name is kept when it is a schedule name, since the re-read is for times, not identity.

## Open questions
None.

## Tests
`tests/fc00034_rerun_row.test.js` — `test_row_reread_replaces_only_that_row_in_place`, `test_manual_edits_after_reread_still_become_manual`, `test_reread_of_edited_row_asks_first`, `test_no_matching_entry_leaves_row_unchanged`, `test_easyclocking_picks_nearest_clock_in_on_same_date`, `test_single_reading_with_other_date_is_used_and_flagged`, `test_missing_image_is_reported_not_guessed`, `test_row_button_only_on_ocr_rows`

## Slice
S

## Affected entities
All
