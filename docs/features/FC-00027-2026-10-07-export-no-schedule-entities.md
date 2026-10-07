# FC-00027 — Export entities that have actuals but no schedule

**Date:** 2026-10-07 · **Slice:** S · **Risk:** Medium · **Status:** done · **Affected entities:** All

## What
An entity with approved actuals but no schedule loaded now appears in every payroll export (Excel and PDF), the Combined preview, the editable copy and the all-entity preview.

## Why
FC-00008 made the schedule optional and the Payroll tab computed these employees correctly, but `_collectExportData` and `renderAllEntityPreview` only looked at entities with scheduled employees. Their people vanished from every file — a silent underpay.

## Root cause
`_collectExportData` pre-filtered `entities` on `e.employees.length>0 || flat rows`; `renderAllEntityPreview` filtered on `e.employees.length>0`. Orphan (actuals-only) rows were never reached.

## Fix
- `_collectExportData` iterates every entity; the existing `allRows.length===0` check still skips truly empty ones.
- `renderAllEntityPreview` iterates every entity and skips only those with no rows at all.
- `_confirmBreaksOrBail` also prompts for an unconfirmed break on an entity that has actuals but no schedule.
- `computePayrollForEntity` tolerates a missing `dateLabels` / `employees` / `breakMinutes` on an entity object (defensive; real entities always have them).

## Where in UI
Payroll tab: export buttons, Combined preview, editable copy, all-entity preview.

## Touches
exports, display

## Risk
Medium — changes which rows reach every payroll file. Scheduled entities are unaffected (same rows, same order, same totals).

## Reversibility
Fully reversible via one revert commit.

## Definition of Done
1. An actuals-only entity's employees appear in Combined / Cash-Only / Deposit-Only / Time Card / Payroll Calc / Full exports (Excel + PDF).
2. Its rows appear in the Combined preview and the all-entity preview; the grand total includes them.
3. An unconfirmed break on such an entity triggers the existing export confirmation.
4. An entity with no rows at all still exports nothing.
5. Existing tests pass; new tests pass.

## Out of scope
Entity tab employee counts. Any change to how orphan rows are computed.

## Assumptions
1. Approved actuals for an entity are payroll whether or not a schedule exists (FC-00008).

## Open questions
None.

## Tests
`tests/fc00027_no_schedule_export.test.js`
- `test_collect_export_data_includes_no_schedule_entity`
- `test_combined_excel_and_pdf_carry_no_schedule_entity`
- `test_previews_include_no_schedule_entity`
- `test_break_confirmation_covers_no_schedule_entity`
- `test_empty_entity_still_skipped`

## Slice
S

## Affected entities
All
