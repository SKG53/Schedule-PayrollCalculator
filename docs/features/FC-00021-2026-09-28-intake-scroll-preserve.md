# FC-00021 — Fix Actuals Intake "snap-left" on cell commit

**Date:** 2026-09-28 · **Slice:** S · **Risk:** Low · **Status:** done · **Affected entities:** All

## What
Committing a cell in the Actuals Intake review table no longer scrolls the table back to the left edge.

## Why
Editing a time / date / name cell and pressing Enter (or blurring) made the whole review table jump horizontally to the left, losing the user's place.

## Root cause
`updateReviewField` → `refreshReviewTable` rebuilds `#reviewTable_<idx>` via `innerHTML`. That replaces the `.review-wrap` scroll container, so its `scrollLeft`/`scrollTop` reset to 0. The existing fix only preserved `window` scroll, not the container's.

## Fix
- `_captureReviewScroll(idx)` / `_restoreReviewScroll(idx,pos)` capture both `scrollLeft` and `scrollTop` of the entity's `.review-wrap` before a rebuild and restore them on the new node right after. Wired into `refreshReviewTable` and `renderIntake`.
- Every `scrollIntoView` call now passes `inline:'nearest'`. They fire only on new-row add (`addManualRow`, `addManualRowEntity`) and the "Add more timecards" jump — never on an ordinary cell commit.

## Where in UI
Tab 2 (Actuals Intake) review table.

## Touches
display

## Risk
Low — display-only; no data path changed.

## Reversibility
Fully reversible via one revert commit.

## Definition of Done
1. Committing any time / date / name cell leaves the table's horizontal and vertical scroll unchanged.
2. `renderIntake` re-renders keep each entity's table scroll position.
3. No `scrollIntoView` on cell-commit paths; all calls use `inline:'nearest'`.
4. Test count does not decrease; new tests pass.

## Out of scope
Window-level scroll handling (already preserved). Enter-key behavior of time inputs. Any change to what a commit writes.

## Assumptions
1. Source spec: `PAYROLL_FIX_SPEC.md` §1 (2026-09-28), approved by Sastry.

## Open questions
None.

## Tests
`tests/fc00021_intake_scroll.test.js`
- `test_refresh_review_table_preserves_wrap_scroll`
- `test_time_commit_does_not_move_table`
- `test_date_commit_does_not_move_table`
- `test_name_commit_does_not_move_table`
- `test_render_intake_preserves_wrap_scroll`
- `test_scroll_into_view_only_on_new_row_and_inline_nearest`

## Slice
S

## Affected entities
All
