# FC-00035 — Unchecking Active leaves a person out of the preview and exports

**Date:** 2026-10-07 · **Slice:** S · **Risk:** Medium · **Status:** done · **Affected entities:** All

## What
The Active checkbox in Payroll → Payroll Calculation now also controls this week's output. An unchecked person is left out of the Combined preview, the all-entity preview and every payroll export (Excel and PDF). The same box still keeps them off the next schedule.

## Why
Sastry: "if I uncheck the blue check mark on that last screen of the app or tool, that name and all of its data doesn't show up on the final export, even in the preview."

## Fix
- `_collectExportData` and `renderAllEntityPreview` skip rows whose roster Active is unchecked (`_isInPayroll`). Every export and the Combined preview read through these, so nothing else needs its own filter.
- `_inactiveExclusionSummary` lists who was left out, with hours and pay.
- The Combined preview shows a grey "Left out (Active unchecked): …" note, or a red banner when anyone left out has hours or pay this week.
- Export toast (`_toastExportWithWeekNote`) names who was left out. If any of them has hours or pay, the toast is an error.
- Payroll Calculation: an unchecked row stays visible (dimmed, "left out of export" pill, red when it carries hours or pay) and its totals exclude it so they match the export. The checkbox toast warns when the person has hours this week.
- No new state: this is the existing `rosterActive` flag, set through the dispatcher and logged.
- Payroll Settings export still lists unchecked people with Active = No.
- Wording fix: the all-inactive schedule alert said "Uncheck Active"; it now says "Check Active".

## Where in UI
Payroll → Payroll Calculation (Active column), Combined preview, all-entity preview, export toasts.

## Touches
payroll display, previews, exports

## Risk
Medium. One click removes a person's pay from the files. Mitigated: the omission is always named, and red when money is involved.

## Reversibility
Fully reversible via one revert commit. Re-checking the box restores the person immediately.

## Definition of Done
1. Unchecked person is absent from Combined preview, all-entity preview, Excel and PDF exports.
2. Preview and export toast name them; red/error when they have hours or pay.
3. Payroll Calculation totals equal the export totals.
4. Re-checking restores them.
5. Settings export still carries them as inactive.

## Out of scope
A separate "this week only" switch distinct from Active.

## Assumptions
One checkbox for both meanings (off this week's payroll, off the next schedule), as requested. If the two ever need to differ, re-check before loading the next schedule.

## Open questions
None.

## Tests
`tests/fc00035_active_excludes.test.js` — `test_unchecked_zero_hour_person_left_out_everywhere_with_quiet_note`, `test_unchecked_person_with_hours_is_a_loud_warning`, `test_checkbox_toast_payroll_calc_totals_and_recheck`, `test_settings_export_still_lists_unchecked_people`

## Slice
S

## Affected entities
All
