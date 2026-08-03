# Functionality Baseline

**Status: complete as of 2026-08-03, commit 72542f3** (branch `tool-v2`)
**Reconciled against the v2 docs** (`CLAUDE.md`, `docs/DOMAIN.md`) the same day —
see the note at the head of §10.

This is the inventory of what the tool does today. Its purpose is to prevent silent
regressions. Compiled by reading the entire codebase: `index.html` (4,544 lines, the
whole app), both test files, `FORMATS.md`, `README.md`.

Keep it current. When a change alters described behavior, update this file in the same
commit.

---

## 1. Stack and structure

- **Language / framework:** Vanilla JavaScript, single-file app. All HTML, CSS, and JS
  live in `index.html`. No framework, no build step, no bundler, no package.json.
- **File layout:**
  - `index.html` — the entire application (~275 KB). Structure: CSS (lines 12–440),
    HTML shell (442–646), then one `<script>` block: constants/state (649–790),
    utilities (792–880), entity management, schedule parsing/rendering/exports,
    payroll compute (`computePayrollForEntity`, 1543–1727), payroll render, settings
    overlay + localStorage, intake state/render, Gemini OCR, review table, actuals
    sync, unified payroll export system, actuals-intake export/import, payroll
    settings export/import, init (4840–4850).
  - `tests/break_and_sort.test.js` — Node unit tests that *mirror* (copy) the break
    override + sort helpers.
  - `tests/integration_smoke.test.js` — Node smoke test that loads the real
    `<script>` from `index.html` into a sandbox and exercises the real functions.
  - `FORMATS.md`, `README.md` — input-format and user docs.
- **Third-party dependencies (CDN, loaded at runtime from cdnjs):**
  - `xlsx` 0.18.5 (SheetJS) — reading uploaded .xlsx
  - `exceljs` 4.4.0 — writing formatted .xlsx exports
  - `jspdf` 2.5.1 + `jspdf-autotable` 3.8.2 — PDF exports
  - Google Fonts (Outfit, IBM Plex Mono)
  - Google Gemini API (`generativelanguage.googleapis.com`) — OCR, called with a
    user-supplied API key
- **Serving:** GitHub Pages from `main`, root directory, as a static file. Anything
  committed to `main` is live immediately.

## 2. Where state lives

- **Parsed intake data:** in-memory. `entities[]` array; each entity holds
  `employees` (the schedule/roster), `actualDays` (computed punch data), and
  `intake.reviewRows` (OCR/manual/imported rows awaiting approval).
- **Roster/settings:** in-memory maps keyed by `wKey(entityId, empName)`:
  `wageRates`, `wageBlank`, `flatWages`, `flatWagesDisplayNames`, `payMethod`,
  `splitAmounts`, `breakOverrides`, `payrollSortMode`. Entity-level: `breakMinutes`,
  `breakMinutesSet`.
- **Computed payroll:** never stored — recomputed on every render by
  `computePayrollForEntity(idx)`.
- **Persistence — the tool is NOT fully stateless. Browser storage IS used:**
  - **`localStorage`** (settings overlay + OCR, lines 2431–2506, 2750, 2843):
    `pv26_api_key` (Gemini API key), `pv26_tc_model`, `pv26_ec_model`,
    `pv26_tc_model_custom`, `pv26_ec_model_custom`, `pv26_auto_escalate`,
    `pv26_model` (legacy, cleared on save).
  - **`sessionStorage`** (login gate, lines 2414/2426): `pv26_unlocked`. The gate
    itself is disabled at init (4843–4847) so this is write-only dead code, but the
    calls exist.
  - No cookies, no IndexedDB.
  - **Permitted.** CLAUDE.md rule 3 explicitly allows API credentials and model/UI
    preferences in `localStorage`; only payroll data, roster, wages and
    settings-file content are barred, and none of those are stored. No payroll
    data reaches any browser store.
- **What survives a refresh:** the Gemini API key, model choices, and auto-escalate
  flag (localStorage). All schedule/actuals/payroll data is gone — correct.
- **Settings export fields:** `Entity | Employee | Wage/hour | Type | Flat Amount |
  Pay Method | Deposit Amount | Deposit Typed As` (schema tag
  `SPCalcPayrollSettingsV1`), optionally + 15 break columns: `Default Break (min)`
  and per-day `<Day> Break` / `<Day> Break Status` pairs (tag
  `SPCalcPayrollSettingsV2`). Round-trip: wage (including explicit-blank state),
  type, flat amount, pay method, typed deposit + whole/decimal flag survive.
  Break columns survive only when the "Include per-day breaks" toggle is on for both
  export AND import. **Not carried:** roster itself (comes from the schedule file),
  aliases, active/inactive flag — none of these exist in the schema.

## 3. Screens

Three top-level tabs (leaving Schedules is blocked until every entity with employees
has a name):

1. **Schedules** — per-entity sub-tabs (+ Entity to add, Remove button). Upload
   .xlsx schedule or start blank; edit shifts inline (`6:45AM - 2:15PM` / `OFF`,
   overnight supported); set new week start date (headers recalc); Employee/Manager
   view toggle (manager adds per-day hours rows); info chips (weekly hours per
   employee, >40h highlighted); calendar view with per-hour staffing counts
   (warn threshold: ≥4 before 4:30 PM, ≥5 after — hard-coded, NOT the domain's
   3-minimum coverage rule); flags panel (see §6). Exports: Employee Schedule,
   Manager Report.
2. **Actuals Intake** — per-entity blocks. Three drop zones: Timecard photos,
   EasyClocking screenshots, Mixed/Auto-Classify. Run OCR (Gemini; concurrency 3,
   auto-retry 3 attempts with 12 s delay, per-file retry buttons, optional
   auto-escalate to Pro below 75% confidence). Review table split into per-employee
   sub-tabs plus "Unrecognized"; inline edit of name (dropdown of schedule names),
   date, up to 3 punch pairs (text inputs, `845` → `8:45 AM` on blur); flag pills;
   per-row / per-employee / per-entity approve & unapprove; "Ignore Time Cards" per
   employee; manual row add (entity-level and employee-level). Import/export of the
   Actuals Intake .xlsx (round-trip) and PDF (record only).
3. **Payroll** — per-entity sub-tabs. Mandatory break bar (minutes + explicit
   Confirm; unconfirmed shows orange and export asks to confirm). Weekly Actuals
   grid (sched vs punches per day, status coloring, per-day hours). Two sub-tabs:
   *Time Card Data* (expected/actual break + hours, diff, avg in/out lateness,
   40 h+ flag) and *Payroll Calculation* (wage input, Hourly/Flat toggle, pay
   method Deposit/Cash/Deposit+Cash, split deposit input, Actual Total / Rounded
   Final / Diff, plus a per-day break override row per employee). Sort toggle:
   schedule order vs pay-type grouping (Cash → Deposit+Cash → Deposit). All-entity
   preview table mirroring the export. 12 export buttons + settings export/import.

## 4. Upload and parsing

- **Accepted files:** schedules `.xlsx/.xls/.csv` (first sheet; header row located by
  a cell equal to `name`; day columns matched by day-name prefix; optional date row
  under the header). Actuals images (`image/*`) via OCR. Actuals .xlsx via the
  intake import (extended `SPCalcActualsIntakeV1` schema, or legacy combined
  FORMATS.md schema as fallback). Payroll settings .xlsx.
- **Source recognition:** by which drop zone the file entered — TC (timecard photo),
  EC (EasyClocking screenshot), or Mixed (auto-classified TC vs EC by a
  `gemini-2.0-flash-lite` call). Rows created in-app are MN; rows from a legacy
  combined xlsx import are XL.
- **OCR:** Google Gemini, user-selectable models (default TC = 2.5 Pro,
  EC = 2.5 Flash; custom model names supported). Prompts include the entity's
  roster names, week dates, and full per-employee schedule anchors (shift times) to
  disambiguate AM/PM and overnights. Structured JSON output with per-row
  `confidence` 0.0–1.0; <0.75 flags "Low OCR confidence"; optional auto-escalation
  re-runs low-confidence TC images with Pro. Images >2048 px or >1.5 MB are
  downscaled client-side before upload.
- **Name matching** (`matchEmployeeName`): exact case-insensitive → auto-applied;
  else substring/first-name containment → suggestion (row keeps OCR text, flag
  "Name unsure", bucketed under the suggested employee, and `syncActualsFromReview`
  routes its punches to the suggested schedule name); else Levenshtein similarity
  ≥ 0.85 → suggestion; else "Not on schedule". There is no alias table.
- **Parse failure:** schedule — `alert()` and nothing loads. OCR — per-file error
  status with retry buttons after 3 auto-attempts; failed file's rows are excluded.
  Row-level anomalies (missing punch, bad sequence, >2 pairs, outside week) become
  flags, not rejections; structurally invalid rows (one-sided pair) cannot be
  approved.

## 5. Calculation

- **Hours formula** (`computePayrollForEntity`, lines 1626–1666): per employee-day,
  punch pairs are aggregated to `totalMin` (sum of pair minutes), `firstIn`, and
  `lastOut`. Then:
  ```js
  workedH = totalMin/60;
  spanH   = lastOut - firstIn;
  actualBreakH_raw = max(0, spanH - workedH);
  effectiveBreakH  = override != null
      ? max(0, min(override/60, spanH))          // per-day override, 0 allowed
      : max(mandBreakH, actualBreakH_raw);       // mandatory-break FLOOR
  billableH = max(0, spanH - effectiveBreakH);
  ```
  Weekly `actualHours` = Σ billableH. Pay = actualHours × wage (rounded 2 dp).
- **BREAK RULE — the answer to the +0.50 h question:** billable hours are **span
  minus break**, not the sum of worked pairs. The deducted break is
  `max(entity mandatory break, actual gap between pairs)` unless a per-day override
  exists. Consequences:
  - If the actual gap ≥ mandatory break, billable = sum of pairs (matches domain).
  - **If the employee took no break (single pair) or a shorter one, the mandatory
    break is deducted anyway.** With a 30-minute entity break, an employee who
    worked one continuous shift loses exactly 0.50 h per day relative to their
    punches. This is the +0.50 h discrepancy: it is invisible in exports because
    the "Actual Break Hrs" column reports the *effective* (deducted) break, not the
    true observed gap (line 1649).
  - **This is intended behavior**, confirmed by `docs/DOMAIN.md` ("Hours —
    span-based, not pair-sum") and CLAUDE.md hard rule 1. The span basis stops
    duplicate or overlapping punches from inflating a day; the floor is business
    policy set per entity at runtime. Do not replace it with a pair-sum, and never
    change or default a break value in code. Exports writing the *effective* break
    into "Actual Break Hrs" is likewise expected, not a bug.
- **Overnight shifts:** pair duration `dur = out - in; if (dur < 0) dur += 24`.
  Multi-pair overnight fix: a pair whose clock-in is earlier than the previous
  pair's adjusted clock-out is advanced by 24 h so span math stays correct
  (parseActuals 1487–1499, syncActualsFromReview mkPair 3774–3782).
- **MN vs TC/EC (same employee + date):** **purely additive.** `syncActualsFromReview`
  merges all approved rows for the same employee+date by concatenating their pairs
  (3789–3797). There is **no overlap-supersede logic anywhere** — the
  overlap-supersede rule is NOT implemented. Overlapping MN+TC pairs are both
  kept; the span-based formula caps the damage (a duplicate pair cannot push a day
  past its own span). Per `docs/DOMAIN.md` and CLAUDE.md hard rule 3 this is the
  **current accepted state** — whether to implement the overlap rule is an open
  decision, and doing so changes paid hours. On OCR re-run, MN rows are preserved
  (2853).
- **Rounding:** pay per row = 2 dp. Cash = `Math.round` to whole dollars.
  Deposit = 2 dp. `roundingFactors` is legacy no-op. Split ("Deposit + Cash",
  `_computeBothBreakdown` 755–772): typed whole-number deposit → deposit kept
  exact, cash = round(remainder), Rounded Final may differ from Actual; typed
  decimal deposit or no entry → cash = round(total − requested), clamped to
  [0, floor(total)], deposit recomputed as total − cash (absorbs the cents), so
  deposit + cash == total exactly.
- **Flat-rate employees:** `flatWages[wKey]` overrides pay entirely
  (`row.pay = flatAmount`); hours ignored. Flat employees not on the schedule and
  not in actuals still export via `getFlatWageRows` (zero-hour retention for flat
  extras). Seeded from current computed pay when toggled.
- **Employee filtering:** actuals are filtered to the schedule week's ISO dates
  (skipped entirely if the schedule has no date row — see §10 defect 7), and
  aggregated by `empName + dayIdx` (day-of-week, not date). "Ignored" employees'
  punches are excluded at the calculation boundary only (data preserved in intake).
- **Special cases:** none hard-coded per employee or entity. `OT_THRESHOLD = 40`
  (informational flag only, straight time). Wage explicitly blanked (`wageBlank`)
  renders blank and is excluded from money totals; wage 0/unset shows `—`.
- **Orphans** (in actuals, not on schedule): computed identically (same break
  logic), flagged `(orphan)`, included in totals.
- **Display name resolution** (`resolveDisplayName`, 1602–1614): upgrades a
  schedule name to the longest OCR full name; includes a fuzzy cross-key pass
  (`k.includes(firstWord)`) that can attach another employee's full name — see
  §10 defect 8.

## 6. Flags and validation

Schedule tab (`renderFlags`, per entity):
- Overtime >40 h/week (red)
- Insufficient days off — fewer than 2 (amber)
- 6+ consecutive days (red)
- Long shift >10 h in a day (amber)
- Overstaffing — 5+ concurrent employees between 7 AM and 11 PM (amber)

Calendar view (not surfaced as a flag): per-hour headcount turns red at ≥4 before
4:30 PM / ≥5 after. **This is an overstaffing warning; there is NO understaffing /
minimum-coverage check (domain's "3 minimum" rule is unimplemented).**

Intake review rows (`recomputeRowFlags`): Name missing · Name unsure (fuzzy) ·
Not on schedule · Date missing · Outside week · Check clock-in/out (one-sided pair,
per pair) · No clock-in · Sequence error (per pair, duration ≤0 or >24 h) ·
Low OCR confidence (<75%) · Too many punch pairs (>2) · Escalated to Pro ·
verbatim Gemini notes. Any flag ⇒ needs review. Approval is blocked (row and bulk)
while any pair is one-sided.

Payroll day-status classification: off / noshow / ignored / unsched / late-in
(>10 m) / early-in (<−15 m) / early-out (<−10 m) / late-out (>15 m) / over / under
(±30 m daily hours diff). 40 h+ flag in Time Card Data. Non-flag validation:
entity-name-required gate on leaving Schedules; unconfirmed break `confirm()`
prompt on export; `collectAllFlags` (no-show / unsched / orphan / 40 h+ rollup)
exists but currently has **no caller** — dead code.

## 7. Exports

**Seventeen buttons, 11 distinct exports** — the "six known" are the six payroll
report kinds; four more exist beyond the payroll group.

Payroll group (6 kinds × Excel + PDF, `_exportExcel`/`_exportPdf`; single sheet
"Report" / single PDF, entities stacked with subtotals + grand total; filename
`<Kind>_Week_of_<ISO>.xlsx/.pdf`; break-confirmation prompt first):
1. **Cash-Only Report** — rows with method cash or both; Cash Portion column; grouped Cash→Both→Deposit.
2. **Deposit-Only Report** — method deposit or both; Deposit Portion column.
3. **Combined Report** — all rows; Method/Hours/Rate/Actual Total/Deposit/Cash/Rounded Final/Diff.
4. **Time Card Data** — expected vs actual break/hours, diff, avg in/out (always blank — §10 defect 5), OT flag.
5. **Payroll Calculation** — break, hours, wage/flat, mode, method, deposit, cash, totals, diff.
6. **Full Report** — Time Card Data + Payroll Calculation stacked in one sheet/page.

Others:
7. **Employee Schedule** (.xlsx, per entity) — Name + 7 day columns, styled.
8. **Manager Report** (.xlsx, per entity) — adds per-day hours rows, weekly totals, TOTAL row.
9. **Actuals Intake** (.xlsx re-importable + .pdf record) — all review rows
   (approved AND unapproved, unapproved highlighted), "All Entities" sheet + one
   sheet per entity, 17 columns (first 10 = FORMATS.md combined schema), tag
   `SPCalcActualsIntakeV1`.
10. **Payroll Settings** (.xlsx re-importable) — 8 columns, +15 break columns when
    toggled (tags V1/V2, see §2).
11. *(Legacy aliases `exportPayroll`/`exportPayrollPdf`/`exportActualsExcel` map to
    the above.)*

**Formatting: every currency value in every export is written as a pre-formatted
text string (`'$' + n.toFixed(2)`), not a numeric cell with `$#,##0.00` format.**
Hours are also strings via `.toFixed(2)`. This violates CLAUDE.md hard rule 5 —
nothing can be summed in Excel. (§10 defect 4.)

There is no deck export (BUILD_SPEC §7 is unbuilt), no entity fills, no numeric
cross-check block.

## 8. Settings

- **Stored:** see §2. In-app Settings overlay = Gemini key + model choices only
  (localStorage). Payroll settings (.xlsx) = wages/type/flat/method/deposit
  (+ optional breaks).
- **Import:** settings file matched by entity **name** (unmatched entities skipped
  and reported), then per-employee by name key. Blank wage cell imports as
  explicit-blank. Break columns applied only when the include-breaks toggle is on;
  status column drives override set/clear.
- **Missing roster entry for an intake employee:** the row buckets under
  "Unrecognized" (or a fuzzy suggestion); if approved with a non-schedule name it
  becomes an **orphan** row in payroll — computed, flagged, exported with
  `(orphan)`. No active/inactive flag exists anywhere; departed employees persist
  as long as they're on a schedule file.

## 9. Undocumented behavior

1. **Mandatory break is a floor, not a fixed deduction** — deducted per worked day
   even when the punches show no break; the longer of (mandatory, actual gap) is
   what's deducted; and the exported "Actual Break Hrs" is this effective value,
   masking the deduction. Per-day overrides (any value including 0) are exact and
   win over both.
2. **Billable hours are span-based** (first-in→last-out minus effective break),
   not pair-sum — equivalent only when the actual gap ≥ mandatory break.
3. **MN/TC/EC rows are merged additively** per employee+date; the documented
   MN-overlap-supersede rule does not exist in code.
4. **Approval gate:** only explicitly approved review rows reach payroll. If an
   entity has zero approved rows, previously synced `actualDays` (e.g. from a
   legacy xlsx import) are preserved rather than wiped.
5. **Fuzzy-suggested rows silently pay under the suggested schedule name** once
   approved — the punches route to the schedule employee even though the row still
   displays the OCR text.
6. **"Ignore Time Cards"** per employee: punches excluded from payroll at the calc
   boundary, day renders "IGNORED" instead of NO SHOW, data retained in intake.
7. **Login gate is disabled** at init; a hardcoded `LOGIN_PASSWORD` constant
   remains in the public source, with an unused `PASSWORD_HASH` placeholder above
   it. See §10 defect 6.
8. **Schedule data goes to Google:** OCR prompts embed the full roster and every
   employee's scheduled shifts (schedule anchors) plus week dates.
9. **Auto-escalation:** low-confidence (<75%) TC rows optionally re-OCR'd with
   Gemini 2.5 Pro; mixed-zone images classified TC/EC by gemini-2.0-flash-lite.
10. **Wage blank ≠ wage zero:** clearing a wage marks the employee explicitly
    blank; they render `—` and are excluded from money totals and export sums.
11. **Flat-wage extras:** a flat employee not on any schedule and absent from
    actuals still appears in exports (deliberate zero-hour retention for flat pay).
12. **Display-name upgrading:** payroll rows show the longest full name seen in
    OCR for that employee, found partly by fuzzy containment across employees.
13. **Week filtering is silent:** actuals dated outside the schedule's date labels
    are dropped from payroll without any flag ("Outside week" appears only in the
    intake review table); if the schedule has no date row, nothing is filtered.
14. **Aggregation is by day-of-week**, not by date (relevant only if the week
    filter is inactive — then multiple weeks fold onto the same weekday).
15. **Entity identity:** wages/methods/overrides key on a stable per-session
    entity `id`, so renames are safe, but deleting an entity orphans its settings;
    settings .xlsx import re-binds by entity *name*.
16. **Overstaffing thresholds are hard-coded** (5+ flags; calendar warn at 4/5 by
    time of day); there is no minimum-coverage validation at all.
17. **OCR keeps manual rows:** re-running OCR clears prior TC/EC rows but preserves
    MN rows; per-image re-run drops and replaces only that image's rows.
18. **Break-confirmation friction is deliberate:** every entity has
    `breakMinutesSet`; exports prompt if any entity is unconfirmed; changing the
    default with per-day overrides present opens a 3-way modal (keep/overwrite/
    cancel).
19. **Legacy combined-actuals import** (10-column FORMATS.md file) still works via
    the intake import's fallback path — rows go straight to payroll with **no
    review/approval step**, filtered by exact entity-name match.

## 10. Known defects found while reading

> **Reclassified after the v2 docs landed.** Three items originally listed here as
> defects are confirmed *intended behavior* by `docs/DOMAIN.md` and `CLAUDE.md`
> rules 1–3, and have been moved to §9 (undocumented → now documented behavior):
> span-based hours, the mandatory-break floor, and additive MN merging. Do not
> "fix" them. The MN overlap rule remains an open decision, not a defect.

1. **All export currency/hours cells are text strings**, not numbers with
   `$#,##0.00` format (every `rowFn`, `_writeActualsIntakeSheet`, subtotal/grand
   rows). Violates CLAUDE.md hard rule 5; nothing is summable in Excel.
2. **Avg In/Out Diff columns in the Time Card Data export are always empty**
   (3955–3956): export reads `r.avgInDiffMin`/`r.avgOutDiffMin` but the compute
   sets `avgInDiff`/`avgOutDiff` (1678–1679). On-screen table is correct; the
   export column is dead.
3. **No minimum-coverage validation** — the domain's core schedule check (3 staff
   during open hours) is absent; only overstaffing is flagged, with hard-coded
   thresholds that don't match documented store hours.
4. **Week filter silently disabled without a date row** (1568): a schedule
   uploaded without dates lets any-dated actuals through, folded by weekday
   (see §9.13–14). No warning.
5. **`resolveDisplayName` fuzzy containment can cross employees** (1607–1612):
   `k.includes(firstWord)` can attach one employee's OCR full name to another
   whose first name is a substring. This is the same-rate/same-method conflation
   hazard DOMAIN.md warns about, reachable through code rather than data entry.
6. **Plain-text shared password in the public source** (2402): a hardcoded
   `LOGIN_PASSWORD` constant with the gate disabled at init, plus a misleading
   unused `PASSWORD_HASH` placeholder above it. Rotate the value out of the file
   rather than quoting it here.
7. **FORMATS.md is stale** (see §7): claims the combined-file Entity column
   "doesn't have to match the entity tab name" — but the legacy combined import
   filters rows by exact entity-name match, silently excluding mismatches; also
   documents none of the three newer re-importable schemas. Its "sample files are
   in this folder" line is now false — the new `.gitignore` excludes `*.xlsx`.
8. **Settings schema gaps** (confirmed against DOMAIN.md): no `active` flag, no
   aliases, roster not carried. The flat-amount-not-persisting defect could **not**
   be reproduced from code reading — `_gatherPayrollSettingsRows` does export
   `flatWages` — needs a live round-trip with a real settings file.
9. **`collectAllFlags` is dead code** (4820) — the no-show/unsched/orphan/40 h+
   rollup is computed nowhere and shown nowhere.
10. **Tests cannot run here:** both test files require Node.js, which is not
    installed on this machine. `break_and_sort.test.js` also only *mirrors* the
    production helpers (drift risk); the smoke test loads the real code.
11. **Weekly expected-break total overstates on short shifts:**
    `expectedBreakH = scheduledDays × mandBreak` charges a full break to every
    scheduled day, including shifts shorter than the break itself. The per-day
    cell floors at 0 and hides it; the weekly column does not.
12. **README.md overstates persistence:** "Everything lives in your browser's
    `localStorage`" — only the API key, model choices, and auto-escalate flag do.
    Schedules, punches, and payroll are memory-only. Under the v2 rule 3 table the
    storage itself is permitted; the sentence is simply inaccurate and invites the
    belief that payroll data is being retained.
