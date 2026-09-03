# FC-00020 — Contract Check as 4th pay type

**Date:** 2026-09-01 · **Slice:** M · **Risk:** Medium · **Status:** done · **Affected entities:** All

## What
Added `Contract Check` as a 4th sibling to `Deposit`, `Cash`, and `Deposit + Cash`. New UI button, new value (`'contract'`), same math treatment as Deposit (full amount, no split). In exports, Contract Check flows to the Deposit column; skipped in Cash-Only exports.

## Why
User needs to tag employees paid by contract check separately from regular deposit/cash for tracking, even though the underlying payroll math is the same.

## Where in UI
Tab 3 (Payroll) — pay-type button group per employee. Now 4 buttons: `DEPOSIT / CASH / DEPOSIT + CASH / CONTRACT CHECK`.

## Touches
display, exports, settings (schema — Contract Check added to accepted values)

## Risk
Medium — pay-type enumeration touches many sites: `methodLabel`, `_payTypeRankForRow`, `_paytypeExportSortFn`, `computePayBreakdown`, `_filterRowsForKind`, `_collectExportData`, `_normalizePayMethod` (settings import), settings export.

## Reversibility
Reversible — new value is additive; old settings files with only 3 types still load.

## Definition of Done
Shipped. 111/111 tests passing (102 pre-existing + 9 new). Manually verified live end-to-end with Excel + PDF exports (Combined, Deposit-Only, Cash-Only, Full, Settings).

## Out of scope
Separate subtotal for Contract Check. Palette bucket. Contract-Check-specific validation. Renaming existing pay types.

## Assumptions (locked from user Q&A)
1. Contract Check is a LABEL, same math as other 3 (per user: "Contract Check is just a pay type, like deposit, cash, deposit+cash").
2. Value: `'contract'`. Label: `'Contract Check'`.
3. Sort order: Cash → Both → Deposit → Contract (contract LAST).
4. Export routing: goes in Deposit column of Combined/Deposit-Only exports; skipped in Cash-Only.
5. No palette allocation. No new subtotal row.

## Tests
- `test_contract_check_method_label`
- `test_contract_check_sort_order_last`
- `test_contract_check_flows_to_deposit_column_in_combined_export`
- `test_contract_check_included_in_deposit_only`
- `test_contract_check_excluded_from_cash_only`
- `test_contract_check_settings_round_trip`
- `test_settings_backward_compat_3_pay_types_still_load`
- `test_ui_button_group_shows_4_buttons_in_order`
- `test_compute_pay_breakdown_treats_contract_like_deposit`

## Slice
M

## Affected entities
All

## Shipped as
Merge commit `eeae6c2` (feature commit `7751f07`)
