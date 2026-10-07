# FC-00036 — Permanent employee IDs; master settings file owns identity

**Date:** 2026-10-07 · **Slice:** M · **Risk:** Medium-High · **Status:** done · **Affected entities:** All

## What
Each employee has one permanent ID and one canonical name, both defined by the settings (master) file. Every other spelling (alias, other case, stray period) lands on that ID. New employees continue after the highest ID. The order files are loaded in no longer changes any ID or any pay figure.

## Why
Sastry: "set names with ids once, and let that persevere from here forward. any new employees will continue from there. any aliases, will just attach to this new permanent employee ID." Resolves DECISIONS open #16.

Observed in real weeks: when the settings file renamed people to full names (alias = the schedule's first name), the schedule's first names minted new, empty records. Nine to ten people per week computed at $0 in the tool. IDs also shifted between weeks with load order, and loading a settings file after a schedule could relabel one person's record as another's.

## Fix
- `_aliasNorm` ignores case, periods and repeated spaces.
- Settings import registers every file ID first (`_noteSeenEmployeeId`) and marks file records `fromFile`.
- A session-minted record sitting on a file ID is moved to a fresh ID (`_rekeyRecord`), never renamed into the file's person.
- Aliases in the file absorb session records with that spelling before alias validation (so a first name already on the schedule no longer blocks the alias).
- `_mergeProvisionalRecords`: session records that are a file person under another spelling are merged into the file record. File values win. Schedule, actuals and intake names are rewritten to the canonical name (`_propagateEmployeeRename` exact mode also fixes case/punctuation).
- `_renumberProvisionalIds`: people not in the file are numbered right after the file's highest ID, in order of first appearance. These are the same IDs a settings-first load gives.
- `ensureRosterRecord` resolves aliases. `parseSchedule` loads names as canonical (`_canonicalNameFor`). `matchEmployeeName` resolves aliases and file names even for people not on the schedule.
- Settings export keeps every file person (inactive and unscheduled included), sorted by ID, so no ID drops out of the master file.

## Where in UI
No new controls. Names on every screen show the canonical name. The settings-import toast reports how many names were matched to existing employees.

## Touches
roster, settings import/export, schedule load, intake name matching

## Risk
Medium-High. Identity code touches every per-employee value.

## Reversibility
Fully reversible via one revert commit.

## Definition of Done
1. Schedule alias/case variants load under the file person's ID and canonical name.
2. New employee gets highest file ID + 1; gaps are never reused.
3. Settings-first, schedule-first and actuals-before-settings orders produce identical IDs and pay.
4. A session record on a file ID is moved, not renamed.
5. Settings export carries every file person, sorted by ID.

## Verification
Five real weeks × three load orders: identical IDs, payroll and settings export in every order. Old vs new on the two weeks with full-name settings: the nine-to-ten $0 rows per week now pay. Every one of them matches Sastry's final payroll file to the cent. The other three weeks are unchanged. Real data stayed in the private workspace.

## Out of scope
Reconciling the historical weekly settings files with each other (the master settings file replaces them).

## Assumptions
Departed people stay in the master file with Active = No. Deleting their row would free their ID for reuse in a later session.

## Open questions
None.

## Tests
`tests/fc00036_permanent_ids.test.js` — `test_alias_norm_ignores_case_periods_and_spaces`, `test_schedule_alias_and_spelling_land_on_file_person`, `test_new_employee_continues_after_highest_file_id`, `test_load_order_never_changes_ids_or_pay`, `test_schedule_first_squatter_is_moved_not_renamed`, `test_settings_export_keeps_everyone_from_file_sorted_by_id`, `test_ocr_alias_matches_even_when_not_on_schedule`

## Slice
M

## Affected entities
All
