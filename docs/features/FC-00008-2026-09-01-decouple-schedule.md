# FC-00008 — Decouple schedule as prerequisite

**Date:** 2026-09-01 · **Slice:** M · **Risk:** Medium · **Status:** done · **Affected entities:** All

## What
Schedule upload becomes optional. User can proceed directly to Actuals Intake and Payroll without ever uploading a schedule. Features that genuinely need schedule data (coverage warnings, Avg In/Out Diff, shift-based flags) degrade gracefully with a "requires schedule" note; everything else works normally.

## Why
Blocking the entire pipeline behind schedule upload forces users to open a fresh instance and lose state when there's no schedule to upload or they just want to process timecards.

## Where in UI
Tab 1 (Schedules) — no longer required. Tabs 2/3 accessible directly. Entity name gate stays required.

## Touches
display, infra, actuals ingestion, payroll calc

## Risk
Medium — name matching against timecards can rely on schedule roster as one input. Without schedule, matching falls back to prior settings-file roster + fuzzy on timecard names alone.

## Reversibility
Fully reversible — gates re-added, no data structure changes.

## Definition of Done
Shipped as specified. 32/32 tests passing (26 pre-existing + 6 new).

## Out of scope
Rebuilding name matching to be fully schedule-independent (already was; this just removes the gate). No changes to OCR. No schedule OCR (that's FC-00009).

## Assumptions
1. Existing name matching already uses roster+fuzzy; schedule was a helper, not a hard dependency.
2. "Requires schedule" placeholders are static text.
3. Entity naming stays required — no entity, no timecards.

## Deviations from brief
1. Entity-name gate was tightened (pre-existing gap closed) rather than just preserved — an improvement.
2. Avg In/Out Diff `—` cell placeholder was already correct pre-existing code; only the tooltip was new.
3. Test harness gained a DOM-caching fix.

## Tests
- `test_payroll_flow_without_schedule`
- `test_coverage_placeholder_when_no_schedule`
- `test_actuals_intake_without_schedule`
- `test_tab_gate_entity_name_required`
- `test_avg_in_out_diff_placeholder_tooltip`
- `test_ocr_fallback_matching_without_schedule`

## Slice
M

## Affected entities
All

## Shipped as
Merge commit `80059f6` (feature commit `4840b18`)
