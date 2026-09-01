# FC-00007 — Universal rename with visible stable IDs and duplicate-name flag

**Date:** 2026-09-01 · **Slice:** M · **Risk:** Medium · **Status:** done · **Affected entities:** All

## What
Every employee has a stable, visible ID of format `EMP_<ENTITY3>_NNNNN` (`EMP_N11_00001`, `EMP_ZIO_00001`, `EMP_HEF_00001`). Renaming an employee anywhere updates the display label across all 3 user-facing pages and all exports, while the ID (and all internal links) stay put. Duplicate names within the same entity trigger a persistent urgent flag AND block all exports until resolved.

## Why
Names drift, get corrected, or clash. Today, changes require re-work and risk mis-attribution. Stable IDs make identity survive rename; visible IDs make audit trivial; duplicate blocking prevents wrong-person-paid.

## Where in UI
All 3 pages: Schedules, Actuals Intake, Payroll. Tables get a new `Employee ID` column next to Name; non-table displays get `Name · EMP_XXX_NNNNN` suffix. Two rename entry points: inline click-to-edit on any name (Payroll and Actuals), plus a "Rename Employee" button in the Payroll-Calc table (which functions as the roster panel).

## Touches
display, roster, exports, settings (schema stays V3 — IDs already there), infra

## Risk
Medium — renames route through existing dispatcher (safe), but visible-ID additions touch every table render and every export.

## Reversibility
Reversible per section. Full revert via single commit.

## Definition of Done
See original card in commit `11c2446`. 12/12 items shipped. 26/26 tests passing (19 pre-existing + 7 new).

## Out of scope
Color-coded exports, preview panel, palette config, PDF colors, schedule decoupling, OCR, mid-process append.

## Assumptions (locked at build time)
1. Confirmation dialog: `"Rename '{old}' → '{new}'? This updates all pages and exports."` via `confirm()`.
2. Duplicate flag styling: red background `#FEE`, ⚠ icon, text `"Duplicate name — resolve before export"`.
3. Export-blocked toast: `"Cannot export — duplicate employee names in {entity list}. Rename to resolve."`
4. Entity codes hardcoded: Nirvana→N11, Zion→ZIO, Hefner→HEF. No config field.
5. IDs in exports go in a new column labeled `Employee ID` immediately after Employee.

## Deviations from brief
1. Schedules table name input left as free-text (no click-to-edit / confirm) because that field is the page's native bulk-entry surface for the whole row. All rename effects still apply; only the confirm popup is omitted there.
2. "Roster panel" = Payroll-Calculation table, since no separate roster screen exists in the codebase.

## Tests
- `test_id_migration_converts_old_hex_to_new_format`
- `test_rename_propagates_via_dispatcher`
- `test_duplicate_name_flag_fires_same_entity`
- `test_duplicate_name_allowed_across_entities`
- `test_export_blocked_on_duplicate`
- `test_id_format_per_entity_codes`
- `test_id_migration_updates_keyed_stores`

## Slice
M

## Affected entities
All

## Shipped as
Merge commit `b5dafb7` (feature commits `11c2446`, `9ea0d86`)
