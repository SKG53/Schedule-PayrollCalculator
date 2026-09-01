# FC-00013 — Live WYSIWYG preview panel on Payroll tab

**Date:** 2026-09-01 · **Slice:** M · **Risk:** Medium · **Status:** done · **Affected entities:** All

## What
Tab 3 (Payroll) gets a live, read-only preview that mirrors exactly what the Combined Excel export will look like — same columns, same rows, same colors, same subtotal/grand-total layout. Updates live as the user edits any input on the tab.

## Why
Today, users export → open Excel → check → re-adjust → re-export. A live preview eliminates the round-trip.

## Where in UI
Payroll tab. New "Preview" section below the Payroll-Calc table.

## Touches
display, exports (indirect — reuses the export's own data pipeline)

## Risk
Medium — coupling preview to export code path is the smart thing but requires the export functions to be refactored to expose their intermediate data.

## Reversibility
Reversible — new panel, no changes to export output.

## Definition of Done
Shipped as specified. All fields read-only (no editable inputs even for display names). 49/49 tests passing (43 pre-existing + 6 new).

## Out of scope
Editable fields in preview (explicitly ruled out — force user to edit at source).
Cash-Only / Deposit-Only preview variants (Combined only for MVP).
Live preview during Actuals editing (only Payroll tab).

## Assumptions
1. Preview reuses `_collectExportData` + `_columnsFor('combined')` — no duplicate data pipeline.
2. Colors match FC-00012 palette (and FC-00014 config, when merged).
3. Read-only = no `<input>` / `<select>` / `contenteditable` in the preview DOM.

## Deviations from brief
Subagent recognized the coupling benefit and structured the code so preview and export CANNOT drift.

## Tests
- `test_preview_renders_same_columns_as_combined_export`
- `test_preview_read_only_no_inputs`
- `test_preview_updates_on_input_change`
- `test_preview_applies_palette_colors`
- `test_preview_shows_subtotals_and_grand_total`
- `test_preview_uses_shared_data_collector`

## Slice
M

## Affected entities
All

## Shipped as
Merge commit `e0eb754`
