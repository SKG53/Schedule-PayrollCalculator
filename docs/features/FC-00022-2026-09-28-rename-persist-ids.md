# FC-00022 — Rename persists on every page and keeps the employee ID

**Date:** 2026-09-28 · **Slice:** M · **Risk:** Medium · **Status:** done · **Affected entities:** All

## What
Renaming an employee from any page keeps the same employee ID, carries all pay data, and shows the new name on every page and in the settings file.

## Why
Renaming from Schedules, Actuals Intake, Payroll or Roster didn't persist and the employee ID changed to a new value.

## Root cause
The `rosterRename` reducer relabelled the roster record only. Schedule rows (`ent.employees[].name`), intake `reviewRows[].empName` and loaded actuals kept the old name, so the next `wKey(entId, oldName)` missed `keyToId` and `ensureRosterRecord` minted a fresh id for an empty record. The revert path also used the wrong "from" name.

## Fix
- `_propagateEmployeeRename(entId, from, to)` rewrites the name in schedule rows, entity + combined actuals, intake review rows, intake active sub-tab, ignored-employee keys, and flat-wage display names. Called from the `rosterRename` reducer and from `ensureRosterRecord` when a known id arrives under a new name (settings import).
- Each record keeps `former_names`; `ensureRosterRecord` resolves a former name to that record (resolution only — never renames back) instead of minting a new id.
- The old name stays an alias (existing behavior); the new name is removed from the alias list.
- Revert now moves the record from `entry.to` back to `entry.from`.
- Actuals Intake gets the FC-00007 click-to-edit rename on the per-employee name (FC-00007 listed it; it was never wired).
- Employee IDs are unchanged in format and are never removed.

## Where in UI
Schedules, Actuals Intake, Payroll (Time Card Data, Payroll Calculation), Roster button.

## Touches
roster, display, settings

## Risk
Medium — touches the identity path every page uses.

## Reversibility
Fully reversible via one revert commit. No schema change; `former_names` is session-only.

## Definition of Done
1. ID identical before and after rename, from every entry point.
2. New name shown and resolved on every page; old name never mints a new record.
3. wage / pay_method / deposit / flat / aliases / notes / break overrides carry over.
4. Survives re-render and tab switches.
5. Settings export carries the new name on the same id; import restores it.
6. `fc00007_rename_ids.test.js` still passes; new tests pass.

## Out of scope
Changing the ID format. Resolving schedule rows by user-set aliases. Deduplicating two records that share a display name (still flagged per FC-00007).

## Assumptions
1. Source spec: `PAYROLL_FIX_SPEC.md` §2 (2026-09-28), approved by Sastry.
2. Two people with the same display name in one entity are ambiguous by name; a rename of one rewrites name-keyed rows carrying that name. The duplicate flag already surfaces this case.

## Open questions
1. A former name resolves to the renamed record. If a genuinely new employee later joins with exactly that former name, they would resolve to the renamed record until the former name is cleared. Acceptable?

## Tests
`tests/fc00022_rename_persist.test.js`
- `test_rename_from_payroll_inline`
- `test_rename_from_roster_button`
- `test_rename_from_actuals_intake`
- `test_rename_from_schedules_table`
- `test_rename_survives_rerender_and_tab_switch`
- `test_rename_flat_employee_keeps_flat_amount`
- `test_rename_settings_round_trip_keeps_id`
- `test_rename_revert_restores_old_name_same_id`

## Slice
M

## Affected entities
All
