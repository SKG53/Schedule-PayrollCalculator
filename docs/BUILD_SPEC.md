# Build Specification

Enhancement spec for the Schedule & Payroll Calculator. Written from analysis of the
tool's output files, not its source code — see `docs/BASELINE.md` for what the code
actually does today.

Work through this in phase order (Section 10). Do not attempt multiple phases at once.

**Status:** not started. Update the checkboxes in Section 10 as phases complete.

---

## 1. Root Architectural Change

Everything in Sections 3, 4 and 5 depends on this. It is not optional and it is not a feature — it is the precondition.

**Current behavior.** Upload is a one-way pipeline. Files parse into a derived result set, screens render that result set, and the only way to change an input is to clear the tool and re-upload. This is why a roster error noticed at the payroll screen forces a return to the local Excel file.

**Required behavior.** Upload parses into a **mutable session state**. All screens read from and write to that state. Recalculation is triggered by state change, not by upload.

| Element | Requirement |
|---|---|
| Session object | Holds roster, schedule, intake rows, computed payroll, change log |
| Derivation | Payroll figures are computed views over intake + roster, never stored independently |
| Recalculation | Any mutation triggers downstream recompute of that employee only, not full reparse |
| Persistence | **In-memory only.** Session survives navigation within the tool and is gone on refresh. No browser storage of any kind. |
| Mutation routing | **All** state changes pass through a single dispatcher (see Section 4) |

The mutation dispatcher must be built **at the same time** as the mutable session, not after. Retrofitting a change log onto direct state writes means auditing every write site in the codebase. Build the dispatcher first and the log is nearly free.

---

## 2. Roster Registry

An extension of the **settings file**, which is the tool's only persistence mechanism.
The tool holds nothing on its own — the registry is exported at the end of a session and
imported at the start of the next, exactly like today's settings export.

This is the single highest-value item in the spec: it eliminates the orphan-name problem
permanently rather than requiring weekly cleanup.

The new fields below extend the existing settings schema. Importing an older settings
file must still work — treat missing fields as empty and default `active` to true.

| Field | Type | Purpose |
|---|---|---|
| `canonical_name` | text | Display name, used everywhere |
| `entity` | enum | NIRVANA 11TH / ZION / HEFNER |
| `aliases` | text[] | Every observed spelling and OCR variant |
| `rate` | currency | Hourly rate |
| `pay_method` | enum | Cash / Deposit / Deposit + Cash / Contract Check |
| `final_pass_method` | enum, nullable | Overrides `pay_method` on deck export only |
| `deposit_amount` | currency, nullable | Fixed deposit for Deposit + Cash employees |
| `flat_amount` | currency, nullable | For flat-rate employees |
| `active` | boolean | Controls inclusion in new weeks |
| `notes` | text | Free text |

**Alias matching.** On intake, match each parsed name against `canonical_name` first, then against `aliases`. A match resolves silently with no flag. A miss raises `NOT_IN_ROSTER` (Section 5) and offers a one-click "add as alias to…" action that writes back to the registry.

Confirmed aliases to seed are listed in `docs/REFERENCE_WEEKS.md` (gitignored). Read them
from there rather than restating them here.

That list is incomplete. Six to eight additional weeks of intake files would let it cover every spelling that has actually occurred.

**Round-tripping.** Every field must survive export and re-import without loss. The
alias list is the highest-risk one: it is the whole point of the registry, and it grows
week over week. Export it in a form that tolerates commas in names.

**Departures.** Setting `active = false` is how an employee leaves. This replaces the current pattern where departed staff persist as schedule remnants until manually deleted from the local file.

---

## 3. Session Mutations

All three are the same capability expressed on different screens. All require Section 1.

### 3.1 Post-upload schedule editing

Editable after upload, without re-upload:

- Shift cell — set start/end times, set OFF, clear
- Employee row — add, remove, reorder
- Employee row — mark inactive for this week only

Re-validates coverage on every edit (Section 9). Does not require the local file to be touched.

### 3.2 Incremental intake

Both operations must work mid-session without clearing the tool:

- **Add an employee.** Creates roster entry if absent, then accepts their rows.
- **Add timecards for an existing employee.** Appends rows and recomputes that employee only. Existing employees' figures are untouched.

Current behavior forces a full clear-and-restart to add one or two people left off the initial upload. That is the highest-friction defect in the tool.

### 3.3 Rename cascade

A rename executed anywhere propagates to every screen: intake grid, schedule, payroll table, deck preview, roster, exports. Implementation is trivial once state is centralized — screens hold an employee **ID**, never a name string. Rename writes to `canonical_name` on the roster record; every screen re-renders from the ID.

The old name is automatically appended to `aliases` so future intakes with the prior spelling still match.

---

## 4. Change Log

**Design:** a panel, not a stack. Non-linear revert.

| Column | Content |
|---|---|
| Time | Session-relative timestamp |
| Screen | Where the change originated |
| Target | Entity / employee / field |
| Change | from → to |
| Action | Revert button, per entry |

**Why non-linear.** The failure case you described — a punch assigned to the wrong employee and then lost — is not usually caught immediately. Linear undo forces you to unwind every good change made since, then redo them. A per-entry revert pulls out the one bad change and leaves the rest intact. It is also a record you can hand to a CPA.

**Two additions that prevent the failure rather than reversing it:**

1. **Reassignment toast.** When a row moves to a different employee, display "Moved to <name> — undo" for ~8 seconds with inline undo. The time never gets lost in the first place.
2. **Row-count indicator.** Per-employee sidebar showing intake row count against scheduled days. A stray row makes someone read 8 days against 6 scheduled. Spotted without hunting.

**Not persisted.** The change log is in-memory only and does not survive a refresh. It
is a working-session tool, not an audit archive. If a durable record is wanted later, it
would be a download, not storage.

**Scoping constraint.** The log must **not** survive an OCR re-run. Reverting a change into a regenerated row set corrupts state — the row IDs the log references no longer exist. Scope the log to the current parse, clear on new batch, and warn before clearing.

**Revert of a revert** is itself a logged entry. No special-casing.

---

## 5. Intake Flags

The current single "Name unsure" flag fired on 75 of 165 rows (45%) in the 7/19 Nirvana/Zion intake and 13 of 36 (36%) at Hefner. At that rate the flag carries no signal.

The cause is that two unrelated failures raise the same flag. Split them:

| Flag | Meaning | Resolution |
|---|---|---|
| `OCR_LOW_CONFIDENCE` | Handwriting could not be read reliably | Manual — show source image crop alongside |
| `NOT_IN_ROSTER` | Name parsed cleanly but matched no roster entry or alias | One-click "add as alias to…" |

With the alias table populated, `NOT_IN_ROSTER` resolves silently for known variants and `OCR_LOW_CONFIDENCE` should fall to a low single-digit percentage. At that point the flag means something again.

Confidence threshold for `OCR_LOW_CONFIDENCE` is currently unstated in the codebase. Recommend surfacing it as a settings value — **[THRESHOLD]** — so it can be tuned against observed false-positive rate rather than guessed at.

---

## 6. Calculation Rule Corrections

### 6.1 MN-supersedes — not implemented, decision required

The handoff doc states manual-entry (MN) rows supersede TC/EC rows for the same employee and date. **No such rule exists in the code.** `syncActualsFromReview` concatenates the pairs of every approved row for the same employee and date regardless of source.

The additive behavior has produced correct figures so far because the observed cases were genuinely two punch pairs, not corrections — and because the span-based hours formula caps the damage a duplicate pair can do.

A genuine overlapping MN correction will not supersede the row it corrects. Two options:

| Option | Effect |
|---|---|
| Implement overlap-supersede | An MN pair overlapping an existing pair replaces it. Non-overlapping stays additive. |
| Leave additive | Simpler. Relies on the span cap and on the operator deleting the bad row manually. |

**This changes paid hours. Do not implement either way without an explicit decision.** See `docs/DECISIONS.md` #11.

### 6.1a Hours formula — do not change

Hours are span-based: `billable = max(0, span − max(mandatoryBreak, actualGap))`. This is correct and deliberate. The span basis prevents duplicate or overlapping punches from inflating a day. Any proposal to replace it with a sum of worked pairs is a regression.

The mandatory break is a per-entity user setting with per-day overrides that bypass the floor. It is business policy configured at runtime. Never change, default, or "correct" a break value in code.

### 6.2 Zero-hour row retention

Rows at 0.00 hours must be retained through to the deck. Observed in real weeks: a 0.00-hour employee appeared in the plain export and was missing from the deck, and two employees were dropped entirely from a later deck.

Departure is expressed by `active = false` on the roster, not by silent omission from output. An employee at 0.00 who is still active is a fact worth seeing.

### 6.3 Export values must be numeric

Confirmed across **all eleven exports**, not just the deck.

Every currency **and hours** cell in every export is written as a pre-formatted text string (`'$' + n.toFixed(2)`) with number format `General`. Nothing sums in Excel, and the L-column cross-check formulas return text rather than numbers.

Write numeric values with number format `$#,##0.00`. This is a one-line change with disproportionate benefit — it makes the deck auditable in Excel.

---

## 7. Deck Export

Add a seventh export: **Combined Report (Deck)**. Six deterministic transforms separate the current plain export from the finished deck. None require judgment.

### 7.1 Fills

| Element | Fill | Font |
|---|---|---|
| Title (row 1, merged A:J) | none | Arial 14 bold, centered |
| Header row | `E8E8E4` | Arial 11 bold, centered |
| NIRVANA 11TH body | `E8F0DC` | Arial 10 |
| ZION body | `DCE6F1` | Arial 10 |
| HEFNER body | `FCE4D6` | Arial 10 |
| Cash column (H) — Nirvana | `BDD7EE` | Arial 10, right |
| Cash column (H) — Zion, Hefner | `9DC3E6` | Arial 10, right |
| Subtotal rows | `BFBFBF` | Arial 11 bold |
| Grand total row | `A6A6A6` | Arial 12 bold |

The cash-column override on H applies to body rows only and takes precedence over the entity fill.

*Note: Nirvana's cash fill differs from Zion's and Hefner's. This is consistent across all three weeks examined, so it is being specified as observed. Confirm whether it is intentional — see Section 11.*

### 7.2 Subtotal and grand total structure

Plain export writes a single value in column J. Deck requires: **merge A:E**, label left, and independent sums in **F, G and H**. Grand total is the sum of the three subtotals, not a re-sum of body rows.

### 7.3 Column widths

Plain export omits these. Deck sets: A 17, B 22, C 15, D 10, E 9, F 13, G 12, H 11, I 15, J 10, L 23.3.

### 7.4 Orphan name resolution

Replace parsed name with `canonical_name` from the roster. Removes the `(orphan)` suffix — a recent deck shipped with an uncleaned orphan name.

### 7.5 Final-pass method override

Apply `final_pass_method` where set. Currently affects three employees, all → Contract Check.

### 7.6 Cash Total cross-check block

Column L, positioned against each entity's block: a bold label on entity fill at Arial 12 centered (`Nirvana Cash Total`, `Zion Cash Total`, `Hefner Cash Total`), with the entity's cash subtotal directly beneath.

---

## 8. Ledger

The current ledger mixes two different measures under one label. The plain export's column J subtotal is a sum of **Rounded Final**; the deck's subtotals are sums of **Actual**. A ledger entry previously recorded as a correction was in fact the same deck's two different sums.

**Rounded Final is not a whole number.** Only the Cash column is whole-dollar; Deposit rows carry cents straight through. Rounded Final is a mix by construction and always will be.

Report five measures per entity and in total:

| Measure | Definition | Nature |
|---|---|---|
| Actual | Σ Hours × Rate | Cents-exact — earned |
| Deposit | Σ column G | Cents-exact — through the bank |
| **Cash** | Σ column H | **Whole dollars — counted from the till** |
| Paid | Deposit + Cash | What left the business |
| Delta | Paid − Actual | Rounding drift |

The whole number is **Cash**, not Rounded Final.

**Delta alert.** Expected range is a couple of dollars per week at current headcount; the proposed band is in `docs/REFERENCE_WEEKS.md`. Raise a warning outside it — a jump indicates a rounding defect, not a business event.

---

## 9. Schedule Validation Module

Automates the manual validation currently run per week.

**In scope:**

1. **Coverage.** Minute-resolution staffing count against the entity minimum, evaluated only within store open hours. Report contiguous windows below minimum with day, time range, and observed count.
2. **Shift arithmetic.** Each shift's computed duration against its stated Hours cell. Report mismatches with both values.
3. **Roster completeness.** Employees in the roster with no schedule row, and schedule rows with no roster entry.

**Explicitly out of scope — do not implement:** rest-interval checks and overtime flags. Both are non-factors.

**Hours notation.** The schedule sheets use `h.mm` (6.15 = 6h15m) inconsistently — one row wrote 7.5 as decimal for 7h30m, which in h.mm should read 7.30. The row cannot be summed as written. On ingest, normalize to **decimal hours** and write back in decimal (7.25, 6.25, 7.50).

**Store hours** (per handoff):

| Day | Open |
|---|---|
| Sun | 8:00AM – 10:15PM |
| Mon–Wed | 7:00AM – 12:00AM |
| Thu–Sat | 7:00AM – 1:00AM |

Minimum staffing: **3** during all open hours.

---

## 10. Build Sequence

Ordered by dependency, not by value. Items in a phase can be built in parallel.

| Phase | Contents | Rationale |
|---|---|---|
| **0** | Remove the plain-text password and dead session flag (§9B.1) | Security. Minutes of work. Do first. |
| **1** | Mutable session (§1) + mutation dispatcher (§4) + roster registry (§2) + test harness (§9B.5) | Foundation. The dispatcher must land with the session, not after. |
| **2** | Schedule editing (§3.1), incremental intake (§3.2), rename cascade (§3.3) | All three fall out of Phase 1 with modest additional work. |
| **3** | Change log panel (§4), reassignment toast, row-count indicator | Dispatcher already emits the events; this is the UI over them. |
| **4** | Flag split (§5), MN overlap rule (§6.1), zero-hour retention (§6.2), numeric cells (§6.3) | Independent of each other. Small, high-value. |
| **5** | Deck export (§7), ledger (§8) | Deck depends on the roster for §7.4 and §7.5. |
| **6** | Schedule validation module (§9) | Standalone. Lowest coupling, defer without cost. |

**Progress:**

- [ ] Phase 0 — remove password and dead session flag
- [ ] Phase 1 — mutable session, mutation dispatcher, roster registry, test harness
- [ ] Phase 2 — schedule editing, incremental intake, rename cascade
- [ ] Phase 3 — change log panel, reassignment toast, row-count indicator
- [ ] Phase 4 — flag split, zero-hour retention, numeric cells, dead-code fixes (§9B.3)
- [ ] Phase 5 — deck export, ledger
- [ ] Phase 6 — schedule validation module

Phase 4 items are individually small enough to slot into any earlier phase if convenient. §6.3 in particular is a one-line change.

---

## 9B. Defects From the Baseline Survey

Found while surveying the codebase. Not yet fixed.

### 9B.1 Security — do first (Phase 0)

| Item | Detail |
|---|---|
| Plain-text password | `payroll2026` at index.html:2402, in a public repository. The login gate is disabled, so nothing is currently exposed, but it must be removed. |
| Dead session flag | `pv26_unlocked` in `sessionStorage` (index.html:2414, 2426) — dead code behind the disabled gate. Remove with the password. |

### 9B.2 Data leaving the system

The OCR prompt sends the **full roster and every employee's scheduled shifts to Google** as
disambiguation anchors. This is undocumented and is employee data leaving the operator's
control. Decision required before changing — removing it will degrade name matching. See
`docs/DECISIONS.md` #12.

### 9B.3 Dead and broken code

| Item | Detail | Phase |
|---|---|---|
| Time Card Data export | Avg In/Out Diff columns always empty — export reads `avgInDiffMin`/`avgOutDiffMin`, calc sets `avgInDiff`/`avgOutDiff` (3955 vs 1678). Screen is right, export is dead. | 4 |
| `collectAllFlags` | No-show/unscheduled/orphan rollup computed nowhere, shown nowhere. Dead. | 4 |
| Week filter | Silently disabled when a schedule lacks its date row — nothing is filtered and data aggregates by day-of-week instead of date. | 4 |
| `resolveDisplayName` | Fuzzy containment can match across employees (1607–1612). This is the mechanism behind the known two-employee conflation. | 4 |
| Fuzzy-matched rows | Once approved, silently pay under the *suggested* schedule name while displaying the OCR text. | 4 |
| Legacy combined-xlsx import | Bypasses the review/approval step entirely. | 4 |
| Entity-name matching | Legacy combined import filters rows by exact entity-name match; mismatches are silently excluded from payroll. `FORMATS.md` documents the opposite and is stale. | 4 |

### 9B.4 Coverage validation does not exist

There is **no minimum-coverage validation**. Only overstaffing flags exist, with hardcoded
thresholds (≥4 before 4:30 PM, ≥5 after) that do not match the documented 3-staff minimum.
Section 9 of this spec is therefore new work, not a modification.

### 9B.5 Test suite

`tests/break_and_sort.test.js` **copies** the break and sort helpers rather than importing
them — it will drift silently from the real code and pass while production is broken.
`tests/integration_smoke.test.js` loads the real script from `index.html` into a sandbox and
is the sound one.

No runner and no `package.json`. Node.js is not installed on the development machine.

Phase 1 should: install Node, add a `package.json` with a test script, rewrite
`break_and_sort.test.js` to import rather than copy, and add the three reference weeks as
fixtures so `/regression` is executable rather than manual.

### 9B.6 Documentation

`FORMATS.md` is stale. It documents the schedule `.xlsx` layout and the 10-column combined
actuals `.xlsx`, but describes entity-name matching incorrectly and covers none of the three
newer re-importable schemas (Actuals Intake V1, Payroll Settings V1/V2). Update it in the
phase that touches import.

`README.md` advertises that everything lives in browser `localStorage`. Correct it — only
credentials and preferences do.

---

## 9A. Additional Requirements

Raised after the original spec. Fold into the phases indicated.

### 9A.1 Collapsible flags (Phase 3)

Flags currently render at full height and consume excessive vertical space on punch
rows. Render a **one-line preview** with a "show more" expander.

Collapsed line: severity icon, flag type, employee name. Expanded: full detail plus the
source image crop for OCR flags.

Expansion state is per-flag and does not persist across sessions.

### 9A.2 Shift merge threshold (Phase 4)

See `docs/DOMAIN.md` → Shift merging. Two thresholds, both exposed in settings, both
overridable per instance from the intake grid.

### 9A.3 Add payment type (Phase 4)

Custom payment types persist in the settings file alongside the roster. A settings file
referencing a type that is not defined in it is an import error, not a silent fallback.

A `+ Add Type` control on the payment method settings.

A payment type is **not** a label. Each type must declare:

| Property | Purpose |
|---|---|
| Name | Display label |
| Populates Deposit column | boolean |
| Populates Cash column | boolean |
| Rounding | none (cents preserved) / whole dollars |
| Fixed amount source | none / settings field / full balance |
| Deck fill color | hex, for the export |

A type added without these properties will silently produce wrong math. Require them in
the dialog.

Adding `Contract Check` as a real stored type retires the manual final-pass override in
§7.5. Prefer that over keeping the override.

### 9A.4 Date field input (Phase 4)

The date field in "add manual rows" loses focus after a single character. Symptom is
consistent with a controlled input that reformats on every keystroke and resets cursor
position.

Fix so digits can be typed continuously. Target format: **[DATE_FORMAT — confirm MM/DD/YY]**.
Accept typed digits without separators and format on blur, not on each keystroke.

---

## 11. Parameters Requiring Confirmation

| Ref | Item |
|---|---|
| §2 | Complete alias list — requires 6–8 additional weeks of intake files |
| §2 | Which employees carry a `final_pass_method` override beyond the three currently known |
| §5 | `[THRESHOLD]` — OCR confidence cutoff for `OCR_LOW_CONFIDENCE` |
| §7.1 | Whether Nirvana's lighter cash fill (`BDD7EE`) vs Zion/Hefner (`9DC3E6`) is intentional |
| §8 | Delta alert band — proposed value in `docs/REFERENCE_WEEKS.md`, not confirmed |
| §9 | Whether Zion and Hefner carry the same 3-staff minimum and store hours as Nirvana 11th |
| §9A.2 | `[MERGE_THRESHOLD]` — 90 min proposed |
| §9A.2 | `[SEPARATE_THRESHOLD]` — 4 h proposed |
| §9A.4 | `[DATE_FORMAT]` — MM/DD/YY assumed |
| §6.1 | Whether to implement MN overlap-supersede or leave additive |
| §9B.2 | Whether the roster and schedule should keep going to Google in OCR prompts |
| §9B.4 | Correct coverage thresholds, per entity |

---

## 12. Open Item Outside This Spec

**Two conflated employees, week of 07/05.** One week's hours appear to have been paid to the wrong one of two similarly-named employees who share an entity, rate and pay method. One of the two has since left, so this is closing the books rather than a live exposure, but it should be resolved before that period is considered final. Details in `docs/REFERENCE_WEEKS.md`.
