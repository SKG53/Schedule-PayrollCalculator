# FC-00024 — Editable scratch copy of the combined preview ("god mode")

**Date:** 2026-09-28 · **Slice:** M · **Risk:** Low · **Status:** done · **Affected entities:** All

## What
A "Make editable copy" button on the Combined export preview creates an independent table where every cell can be hand-edited and exported as-is to Excel and PDF, without touching real data.

## Why
If an upstream feature breaks, there must still be a way to produce a correct payroll file: copy the preview, fix the cells by hand, export.

## Fix
- `renderPayrollExportPreviewHtml` split into `_fc13PreviewModel()` (row model) + `_fc13ModelTableHtml(model, editable)` (renderer). Read-only preview output is byte-identical to before.
- `_fc24MakeCopy()` deep-copies the model into `_fc24Scratch` (session memory only, never persisted). Rendered below the read-only preview with every non-blank cell `contenteditable`; typing updates only `_fc24Scratch` via `_fc24EditCell` (no re-render, so the caret stays put). Enter ends the edit.
- Toolbar: **Export this copy (.xlsx)**, **Export this copy (.pdf)**, **Refresh copy from preview** (confirms before discarding edits), **Discard copy**.
- `_fc24ExportScratchExcel` / `_fc24ExportScratchPdf` write straight from the copy's current cells using the same building blocks as the combined writers (fonts, borders, column widths, `_applyNumFmt`, `_fc12Fill`, `_argbToRgbTriplet`, `downloadBlob`, jsPDF autoTable) and the copy's snapshotted palette fills. Numeric-looking cells in currency/hours columns are written as numbers with the usual formats (CLAUDE.md rule 6); anything else is written as typed text. Filename suffix `_Edited_Copy`.

## Where in UI
Payroll tab, bottom — Combined export preview panel.

## Touches
display, exports

## Risk
Low — additive; the only change to existing code is a behavior-preserving split of the preview renderer.

## Reversibility
Fully reversible via one revert commit.

## Definition of Done
1. "Make editable copy" renders a second, independent table with every cell editable.
2. Editing the copy changes nothing upstream: session stores, roster, change log, computePayroll, read-only preview.
3. Export this copy (.xlsx/.pdf) writes a file matching the copy's cells.
4. Refresh re-snapshots from the live preview; discard removes the copy.
5. Read-only preview output unchanged.

## Out of scope
Adding/removing rows or columns in the copy. Auto-recomputing subtotals after edits (the copy is exported exactly as typed). Persisting the copy across refresh (rule 3). Scratch copies of the other report kinds.

## Assumptions
1. Source spec: `PAYROLL_FIX_SPEC.md` §4 (2026-09-28), approved by Sastry.
2. Subtotal and grand-total cells are plain editable values, not formulas.

## Open questions
None.

## Tests
`tests/fc00024_scratch_copy.test.js`
- `test_make_copy_snapshots_preview_exactly`
- `test_preview_panel_offers_copy_and_renders_editable_scratch`
- `test_editing_copy_leaves_real_data_untouched`
- `test_export_copy_excel_matches_cells`
- `test_export_copy_pdf_matches_cells`
- `test_refresh_and_discard_copy`
- `test_cell_parsing_keeps_currency_numeric`

## Slice
M

## Affected entities
All
