# FC-00023 — Never block export

**Date:** 2026-09-28 · **Slice:** S · **Risk:** Low · **Status:** done · **Affected entities:** All

## What
Every export always writes its file, even with duplicate employee names or flagged / needs-review rows.

## Why
`_blockExportIfDuplicates()` aborted exports whenever two records in one entity shared a display name, leaving no way to get a file out.

## Fix
- Removed the gate from every call site. The spec named three (`exportEmployee`, `exportManager`, `_exportExcel`); the same gate was also on `_exportPdf`, `exportActualsIntakeExcel`, `exportActualsIntakePdf` and `exportPayrollSettingsExcel`, so all seven were removed to meet "every export must always produce the file". `_blockExportIfDuplicates` is deleted.
- Duplicate detection (`hasDuplicateNames`, `getDuplicateEntities`, …) is unchanged and still drives the banner and inline flag.
- Wording is informational: flag "⚠ Possible duplicate — double-check", banner "⚠ Possible duplicate employee names in … — double-check. Exports still run." Colors moved from error red to amber.

## Where in UI
All export buttons (Schedules, Actuals Intake, Payroll, settings); duplicate banner and inline flags.

## Touches
exports, display

## Risk
Low — removes an early return; no calculation touched.

## Reversibility
Fully reversible via one revert commit.

## Definition of Done
1. With duplicates and flagged rows present, all 17 export buttons write a file.
2. Banner/flag still appear and read as informational.
3. Test count does not decrease.

## Out of scope
The unconfirmed-break `confirm()` prompt (a user choice, not a gate on duplicates/flags). "No data to export" guards on empty data.

## Assumptions
1. Source spec: `PAYROLL_FIX_SPEC.md` §3 (2026-09-28), approved by Sastry.

## Open questions
None.

## Tests
`tests/fc00023_export_never_blocked.test.js` — one `test_<export>_writes_file_with_duplicates_and_flags` per export entry point, plus `test_exportPayrollSettingsExcel_writes_file_with_duplicates`, `test_duplicate_warning_is_informational`, `test_no_export_gate_remains`.
`tests/fc00007_rename_ids.test.js`: `test_export_blocked_on_duplicate` replaced by `test_export_not_blocked_on_duplicate`.

## Slice
S

## Affected entities
All
