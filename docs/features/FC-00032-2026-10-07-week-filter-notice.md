# FC-00032 — Week filter: never drop punches silently

**Date:** 2026-10-07 · **Slice:** S · **Risk:** Low · **Status:** done · **Affected entities:** All

## What
The week filter stays exactly as it is (only the loaded schedule's seven dates are paid). Whatever it leaves out is now shown on the Payroll tab, in the export preview and in the toast after every payroll export. A schedule without a date row (filter off) gets its own warning.

## Why
Sastry: the logic is right, but "dropping it without notification or clear instruction is bad … someone might just forget, and never be told that it's a problem." Resolves DECISIONS open #17.

## Fix
- `computePayrollForEntity` also returns `excludedActuals` ({empName, date, hours worked}) and `weekInfo` ({filtered, start, end, noDateRow}). Paid figures are unchanged.
- `_weekFilterBannerHtml` — amber banner at the top of each entity's Payroll tab: count, week range, total hours, one line per excluded employee-day, and where to fix a wrong date. Red banner when the schedule has no date row.
- `_weekExclusionSummary` — all-entity summary shown above the Combined preview.
- `_toastExportWithWeekNote` — every Excel/PDF payroll export toasts what was not included (9 s, error styling). Exports are never blocked (FC-00023).
- `showToast(msg, kind, ms)` takes an optional duration.

## Where in UI
Payroll tab (per-entity banner, preview summary), export toast.

## Touches
display, exports

## Risk
Low — reporting only; computed pay unchanged.

## Reversibility
Fully reversible via one revert commit.

## Definition of Done
1. Out-of-week approved punches still excluded from pay.
2. Banner lists each excluded employee-day with hours; preview and export toast report the totals.
3. No-date-row schedule shows the filter-off warning.
4. No banner when nothing is excluded.

## Out of scope
Changing what the filter includes. Blocking exports.

## Assumptions
None.

## Open questions
None.

## Tests
`tests/fc00032_week_filter_notice.test.js` — `test_filter_still_excludes_out_of_week_punches`, `test_payroll_tab_shows_excluded_banner`, `test_preview_and_export_toast_report_exclusion`, `test_no_date_row_warning`, `test_no_banner_when_everything_in_week`

## Slice
S

## Affected entities
All
