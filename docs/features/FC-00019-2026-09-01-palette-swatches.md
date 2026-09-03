# FC-00019 — Palette dropdown color swatches + strip entity names

**Date:** 2026-09-01 · **Slice:** M · **Risk:** Medium · **Status:** done · **Affected entities:** All

## What
The palette dropdown (FC-00014) now shows a color swatch next to each preset name. Preset names had entity brands stripped: "Nirvana Green" → "Green", "Zion Blue" → "Blue", "Hefner Peach" → "Peach". Native `<select>` was replaced with a lightweight custom trigger+popover so swatches can render.

## Why
Native `<option>` can't reliably render arbitrary HTML like a colored square. And entity brand names in preset labels ("Nirvana Green" on a Hefner entity) were confusing. This is a color picker; native `<select>` isn't the right widget.

## Where in UI
Tab 3 (Payroll) — palette picker at top of each entity section.

## Touches
display, exports (indirect — palette resolution unchanged), settings (legacy-name compat)

## Risk
Medium — replacing a `<select>` with a custom widget always risks focus/keyboard regressions. Kept scope tight: click-only, plus click-outside + Esc.

## Reversibility
Reversible — colors and dispatcher path unchanged; can restore `<select>` in one revert.

## Definition of Done
Shipped. 102/102 tests passing (91 pre-existing + 11 new).

## Out of scope
Full color picker (custom hex). Palette per column. Reordering presets.

## Assumptions
1. Swatch = body color only, 20×20px square (per user Q&A).
2. Legacy names map on import: `Nirvana Green` → `Green`, `Zion Blue` → `Blue`, `Hefner Peach` → `Peach`. Exports write new names.
3. Colors unchanged. Only labels renamed.
4. Popover closes on click-outside + Esc. Keyboard nav (arrows/Enter) not required.

## Tests
- `test_palette_picker_renders_swatch_per_option`
- `test_old_setting_name_maps_to_new`
- Plus 9 additional tests covering trigger, popover open/close, click-outside, Esc, legacy names for all 3 renames, dispatcher wiring, and export round-trip.

## Slice
M

## Affected entities
All

## Shipped as
Merge commit `8eeab88` (feature commit `093e8f1`)
