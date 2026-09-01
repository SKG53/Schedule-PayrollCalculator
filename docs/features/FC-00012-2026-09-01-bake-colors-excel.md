# FC-00012 — Bake color scheme into default Excel export

**Date:** 2026-09-01 · **Slice:** M · **Risk:** Low · **Status:** done · **Affected entities:** All

## What
Excel exports (Combined, Cash-Only, Deposit-Only) come out pre-colored per entity, matching the reference `_Colors.xlsx` layout provided by the user. Header, body, subtotal, and grand-total rows all fill with the correct ARGB values.

## Why
Every reference file the user shared was hand-colored post-export. Automating it removes an entire manual step from every payroll cycle.

## Where in UI
No UI change. Purely an export enhancement — same buttons, colored output.

## Touches
exports

## Risk
Low — exports only, no cross-dependency.

## Reversibility
Fully reversible via one revert commit.

## Definition of Done
Shipped as specified. Excel opens in Excel/LibreOffice with fills matching reference. All 43 tests passing (40 pre-existing + 3 new).

## Out of scope
PDF colors (see FC-00015). Configurable palette (FC-00014). Preview panel (FC-00013).

## Assumptions (locked palette)
- N11 body `FFE8F0DC`, cash `FFBDD7EE` (Nirvana Green)
- ZIO body `FFDCE6F1`, cash `FF9DC3E6` (Zion Blue)
- HEF body `FFFCE4D6`, cash `FF9DC3E6` (Hefner Peach)
- Header `FFE8E8E4`, subtotal `FFBFBFBF`, grand `FFA6A6A6` (all entities)

## Deviations from brief
Subagent's first pass placed subtotal fill on wrong column in one export; caught by re-inspecting the reference file with openpyxl. Also, subagent used `FFBFBFBF` for grand-total row (matching subtotal); I patched to `FFA6A6A6` to match the darker reference fill.

## Tests
- `test_combined_export_applies_entity_palette`
- `test_cashonly_export_uses_cash_fill`
- `test_grand_total_fill_matches_reference`

## Slice
M

## Affected entities
All

## Shipped as
Merge commit `cf55540`
