# FC-00018 — Fix date-cell input jitter/cursor kicking

**Date:** 2026-09-01 · **Slice:** S · **Risk:** Low · **Status:** done · **Affected entities:** All

## What
Fixed the bug where typing in the Actuals Intake Date column kicked the cursor out mid-entry, dropped digits, or lost focus. Date cell now uses the same LIGHT/HEAVY split as the time fields.

## Why
User reported: "typing in this field is extremely difficult. it keeps kicking the cursor out, types halfway and exits."

## Root cause
`<input class="date-field" type="date">` was using `onchange="updateReviewField(...)"` which is a heavy path that triggers a full table re-render. Every intermediate valid date the browser accepted fired `onchange` and destroyed the DOM node the user was typing into.

## Fix
Split into light + heavy:
- `oninput` → `updateReviewFieldLight` (mutates `r.date`, no re-render).
- `onchange` / `onblur` → `commitDateInput` (full validation + render), with a dedup guard so native date-picker's paired change+blur events only render once.

## Where in UI
Tab 2 (Actuals Intake) review table, Date column.

## Touches
display, actuals ingestion

## Risk
Low — pattern is the same one already in use for time fields.

## Reversibility
Fully reversible.

## Definition of Done
Shipped. 78/78 tests passing (73 pre-existing + 5 new).

## Out of scope
Other input fields (already work). Format changes. Custom picker.

## Assumptions
1. Writing to `r.date` in YYYY-MM-DD format.
2. Light handler skips re-render; commit path triggers full render exactly once.
3. Date-picker click still commits immediately (via `change`).

## Tests
- `test_date_field_uses_light_input_handler`
- `test_light_input_updates_state_without_render`
- `test_commit_triggers_render`
- `test_dedup_guard_prevents_double_render`
- `test_flags_recompute_on_commit_only`

## Slice
S

## Affected entities
All

## Shipped as
Merge commit `a5fe833` (feature commit `4c69f7a`)
