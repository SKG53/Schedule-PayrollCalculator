# FC-00033 — Excel exports carry live formulas

**Date:** 2026-10-07 · **Slice:** M · **Risk:** Medium · **Status:** done · **Affected entities:** All

## What
Every derived number in the Excel exports is now a formula with the tool's value cached as its result. Change an hour, a rate or a flat amount in Excel and the row, the entity subtotal and the grand total recalculate.

## Why
Sastry: "these exports need to have numbers and formulas and values. I keep getting excels with just copy pasted values and so if I change something, the totals and stuff like that don't update."

## Fix
- `_columnsFor` specs gain `fx(r, rowNumber)` (row formulas) and `totals` (summed columns). `_exportExcel` applies both; `_exportPdf` uses the same `totals` through `_sectionTotals`, so the PDF and the workbook always total the same columns.
- Formula builders restate the tool's math: `_fxPay` (hours × rate at the employee's rounding digits, then cents), `_fxCash` / `_fxDeposit` (cash `ROUND(T,0)`; deposit/contract `ROUND(T,2)`; both-split mirrors `_computeBothBreakdown`, whole-typed and decimal paths), `ROUND(G+H,2)` rounded final, `ROUND(I-F,2)` diff.
- Inputs stay values: hours, rate (written exact, not pre-rounded), flat amount. Rows with no actuals, flat rows and wage-blank rows keep a value for Actual Total.
- Zero amounts are numeric 0 shown as "—" (`$#,##0.00;-$#,##0.00;"—"`) or blank, never the text "—", which would break the arithmetic.
- Subtotals `SUM(first:last)` per entity; grand total `SUM(subtotal cells)`.
- Payroll Calculation subtotals now sit under Actual Hrs, Deposit, Cash, Actual Total and Rounded Final. They used to be written under Diff (Excel and PDF).
- Time Card subtotals cover Expected Hrs, Actual Hrs and Diff. Actual Hrs used to add expected hours for anyone with zero actual hours; it now sums the column it sits under.
- Manager Report: weekly totals and the TOTAL row are SUMs. Edited Copy: subtotal and grand cells are SUMs over the typed values.
- `_xlFormulaWorkbook` sets `fullCalcOnLoad` (ExcelJS does not store a cached 0).
- Bug found while verifying: the Full Report merged the title twice and real ExcelJS threw "Cannot merge already merged cells", so Full Excel never produced a file. Title now merges once; the test mock now throws on a double merge like the real library.

## Where in UI
Excel export buttons (all six payroll kinds, Manager Report, Edited Copy).

## Touches
exports, tests

## Risk
Medium — every Excel export changes shape (formulas instead of values). Mitigated by an evaluator test and a real-workbook recalculation check.

## Reversibility
Fully reversible via one revert commit.

## Definition of Done
1. Every derived money/hours cell is a formula whose evaluated result equals the tool's value.
2. Editing hours or rate in Excel changes row, subtotal and grand total.
3. Subtotals are SUM ranges; grand total sums subtotals.
4. PDF totals match the Excel totals column for column.
5. Full Report Excel exports without error.

## Verification
Five real weeks × nine workbooks (six payroll kinds + three Manager Reports) built with real ExcelJS 4.4.0 and recalculated in LibreOffice: 3,468 formula cells, 0 errors, 0 differences from the tool's values. Adding one hour to a row moved the row total and the grand total by exactly that row's rate. Real data stayed in the private workspace.

## Out of scope
Actuals Intake and Payroll Settings exports (re-import files; values on purpose). Employee Schedule (no numbers).

## Assumptions
Excel's ROUND (half away from zero, decimal-corrected) can differ from the tool's `Math.round(x*100)/100` by a cent on a binary edge such as 1.005. None occurred in five weeks of real data. On open, Excel's value is the one that recalculates.

## Open questions
None.

## Tests
`tests/fc00033_excel_formulas.test.js` — `test_combined_rows_are_formulas_that_reproduce_tool_values`, `test_subtotals_sum_rows_and_grand_sums_subtotals`, `test_editing_an_input_moves_the_totals`, `test_every_report_kind_formulas_agree_and_payroll_calc_totals_not_under_diff`, `test_full_excel_merges_title_once`, `test_manager_report_totals_are_sums`. Updated: `combined_pdf_totals`, `fc00024_scratch_copy`, `fc00027_no_schedule_export` read formula results via `tests/xl-helpers.js`.

## Slice
M

## Affected entities
All
