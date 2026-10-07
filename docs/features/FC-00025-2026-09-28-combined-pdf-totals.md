# FC-00025 — Combined PDF subtotal and grand-total rows match Excel

**Date:** 2026-09-28 · **Slice:** S · **Risk:** Low · **Status:** done · **Affected entities:** All

*Backfilled 2026-10-07 (FC-00031): this fix shipped as commit `548112b` without a card.*

## What
The Combined PDF's entity subtotal and grand-total rows carry the same values, in the same columns, as the Combined Excel and the preview.

## Why
The PDF summed each entity's Rounded Final and wrote it into the Diff column, so its totals disagreed with the Excel and the preview.

## Fix
Sum `actualFinal` into Actual Total, add Deposit and Cash subtotals, leave Rounded Final and Diff blank — identical to `_exportExcel` combined mode.

## Where in UI
Payroll tab → Combined Report → PDF.

## Touches
exports

## Risk
Low — PDF totals rows only.

## Reversibility
Fully reversible via one revert commit.

## Definition of Done
1. PDF total rows equal Excel total rows and preview total rows to the penny.
2. Actual Total carries the amount; Rounded Final and Diff blank.

## Out of scope
Other PDF kinds.

## Assumptions
None.

## Open questions
None.

## Tests
`tests/combined_pdf_totals.test.js` — `test_combined_pdf_totals_match_excel_and_preview`

## Slice
S

## Affected entities
All

## Shipped as
Commit `548112b` — "Fix Combined PDF subtotal and grand-total rows"
