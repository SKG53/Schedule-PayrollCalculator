# FC-00014 — Configurable palette (10 presets per entity)

**Date:** 2026-09-01 · **Slice:** M · **Risk:** Medium · **Status:** done · **Affected entities:** All

## What
Each entity gets a palette dropdown offering 10 named presets. Selection flows through both the Excel export (FC-00012) and the Payroll preview panel (FC-00013). Selection persists in the settings file round-trip via a new `Palette` column.

## Why
The three hardcoded palettes are aesthetically fine but not user-choosable. This gives visual flexibility without exposing a full color picker (which would be too complex for the desired scope).

## Where in UI
Payroll tab, per entity. A labeled `<select>` dropdown at the top of each entity's payroll section.

## Touches
display, exports, settings (schema V4 — adds `Palette` column)

## Risk
Medium — settings-file schema change, must stay backward compatible with V3 files.

## Reversibility
Reversible — new column has a default (falls back to hardcoded entity default when absent).

## Definition of Done
Shipped as specified. 57/57 tests passing (49 pre-existing + 8 new).

## Out of scope
Full color picker (see DEFERRED.md). Palette-per-column config. Palette in Timecard export (uncolored).

## Assumptions (locked)
1. 10 presets: `Nirvana Green`, `Zion Blue`, `Hefner Peach`, `Lavender`, `Slate`, `Sunset`, `Sage`, `Sky`, `Mint`, `Plain`.
2. Default per entity: N11→Nirvana Green, ZIO→Zion Blue, HEF→Hefner Peach.
3. Both FC-00012 Excel export and FC-00013 preview must resolve via a single `_paletteForEntity(ent)` function so they cannot drift.
4. Settings-file `Palette` column added at end of `PAYROLL_SETTINGS_HEADERS` for backward compatibility.
5. `_fc12PaletteFor(entCode)` kept as a backward-compat shim.

## Deviations from brief
1. Added preset colors beyond the three hardcoded originals + Plain — the seven new presets are the subagent's colour design.
2. `_applyEntityPalette` signature changed to accept a resolved palette object rather than an entity code (necessary for the unified resolution path).
3. `Palette` column placed at end of headers (safer for round-trip with V3 files).

## Tests
- `test_palette_dropdown_renders_10_presets_per_entity`
- `test_palette_selection_updates_preview_immediately`
- `test_palette_selection_flows_to_excel_export`
- `test_palette_persists_in_settings_file_round_trip`
- `test_settings_file_without_palette_column_falls_back_to_default`
- Plus 3 additional sanity/resolution tests.

## Slice
M

## Affected entities
All

## Shipped as
Merge commit `6918903` (feature commit `481418a`)
