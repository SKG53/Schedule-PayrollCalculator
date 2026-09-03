# FC-00017 — No-schedule employee polish

**Date:** 2026-09-01 · **Slice:** S · **Risk:** Low · **Status:** done · **Affected entities:** All

## What
When an entity has no schedule loaded, orphan employees (from Actuals only) no longer get red "not in schedule" tags — they get a subtle gray "actuals-only" pill instead. The Actuals review dropdown shows helper text explaining that typed names will be created as new employees. Verified stable `EMP_XXX_NNNNN` IDs already flow through for orphan employees.

## Why
When there's no schedule at all, tagging every employee as "not in schedule" is redundant noise. Users already know. A neutral label reduces visual clutter without changing behavior.

## Where in UI
Tab 3 (Payroll) — orphan employee cards + payroll-calc table.  
Tab 2 (Actuals Intake) — Employee dropdown helper text.

## Touches
display

## Risk
Low — display-only polish, no math changes.

## Reversibility
Fully reversible.

## Definition of Done
Shipped. 91/91 tests passing (85 pre-existing + 6 new). Verified orphan IDs already stable via `_employeeIdFor`.

## Out of scope
Auto-generating a schedule from actuals. Fuzzy-merging orphan with similar-named scheduled employee (already handled elsewhere). Changing payroll math for orphans.

## Assumptions
1. `ent.employees.length === 0` is the signal for "no schedule loaded" (FC-00008 invariant).
2. Orphan employees already get IDs via existing `_employeeIdFor` path (verified — no wiring needed).
3. New CSS class `orphan-row-quiet` for subtle styling.

## Tests
- `test_no_schedule_hides_not_in_schedule_tag`
- `test_no_schedule_actuals_only_label_shown`
- `test_orphan_with_schedule_still_shows_red_warning` (regression)
- `test_orphan_gets_stable_emp_id`
- `test_review_dropdown_hint_when_no_schedule`
- `test_review_dropdown_no_hint_when_schedule_present`

## Slice
S

## Affected entities
All

## Shipped as
Merge commit `e1202e3` (feature commit `ce0618b`)
