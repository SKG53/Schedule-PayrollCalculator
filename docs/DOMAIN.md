# Domain Reference

Business facts about how payroll actually works at The Nirvana Group. This is the
authority for calculation behavior. If the code disagrees with this document, the code
is wrong — unless Sastry says otherwise, in which case update this document.

---

## Entities

Three locations, processed together into one combined report:

| Entity | Notes |
|---|---|
| `NIRVANA 11TH` | Retail. Most detailed schedule. |
| `ZION` | Distribution. |
| `HEFNER` | Retail. Includes one flat-rate employee. |

Pay week runs **Sunday through Saturday**.

---

## Data sources

Timecards arrive in three forms. Each row carries a source code.

| Code | Source | Format |
|---|---|---|
| `TC` | Physical punch card | Photographed, OCR'd. Handwriting quality varies. |
| `EC` | EasyClocking | Screenshot of the web report. Machine-printed, high confidence. |
| `MN` | Manual entry | Typed directly into the tool by Sastry. |

A single employee-day can carry up to three punch pairs (IN/OUT).

EasyClocking reports an `LBT` column (lunch break taken) showing the gap between pairs.
Note that EasyClocking's own daily total is a plain sum of worked time and will differ
from the tool wherever the mandatory-break floor fires.

---

## Calculation rules

### Hours — span-based, not pair-sum

Billable hours are computed per employee-day from the **span**, with a break deducted:

```
workedH          = sum of all IN/OUT pairs
spanH            = last OUT − first IN
actualBreakH     = max(0, spanH − workedH)          // observed gap between pairs
effectiveBreakH  = max(mandatoryBreakH, actualBreakH)   // mandatory acts as a FLOOR
billableH        = max(0, spanH − effectiveBreakH)
```

This is deliberate and correct. Do not replace it with a simple sum of worked pairs — the
span basis prevents overlapping or duplicate punches from inflating a day beyond the time
actually elapsed.

**The mandatory break is a floor, not a fixed deduction.** The larger of the mandatory
break and the actual observed gap is deducted. An employee who works one continuous shift
with no gap still loses the mandatory break.

**Mandatory break is a user setting**, configured per entity in the tool, with per-day
overrides. Per-day overrides — including 0 — are exact and bypass the floor entirely.
This is business policy set at runtime, not a rule hardcoded in the framework. Never
change, default, or "correct" a break value in code.

Exports write the **effective** break into the Actual Break Hrs column, so an export can
show a break that does not appear anywhere in the punches. That is expected.

**Overnight shifts.** If OUT ≤ IN, add 24 hours.

### MN precedence — currently additive

All punch sources merge **additively**. `syncActualsFromReview` concatenates the pairs of
every approved row for the same employee and date regardless of source. There is no
overlap-supersede rule in the code.

A genuine overlapping MN correction will therefore not supersede the row it was meant to
correct. The span-based formula caps the damage — a duplicate pair cannot push a day past
its own span — but the rule is unimplemented. Whether to implement it is open; see
`docs/DECISIONS.md`.

MN rows survive OCR re-runs.

### Shift merging

Two pairs on the same day separated by a short gap are one shift with a break. Separated
by a long gap, they are two shifts. This affects display and shift counting. Because
hours are span-based, it does **not** change paid hours.

| Gap | Treatment |
|---|---|
| ≤ [MERGE_THRESHOLD, proposed 90 min] | One shift, gap is an unpaid break |
| [MERGE_THRESHOLD] to [SEPARATE_THRESHOLD, proposed 4h] | Flag for manual decision |
| > [SEPARATE_THRESHOLD] | Two separate shifts |

Must be manually overridable per instance.

### Pay methods

| Method | Deposit column | Cash column | Rounding |
|---|---|---|---|
| `Cash` | — | Full amount | Whole dollars |
| `Deposit` | Full amount | — | Cents preserved |
| `Deposit + Cash` | Fixed amount from settings | Remainder | Cash portion whole |
| `Contract Check` | Full amount | — | Cents preserved |

`Contract Check` does not currently exist as a stored method. It is applied manually at
export time to certain employees who are stored as `Deposit`. See BUILD_SPEC §7.5.

### Ledger measures

| Measure | Formula |
|---|---|
| Actual | Σ (Hours × Rate) |
| Deposit | Σ deposit column |
| Cash | Σ cash column |
| Paid / Rounded Final | Deposit + Cash |
| Delta | Paid − Actual |

Expected delta range is small — a couple of dollars per week at current headcount.
The proposed alert band is in `docs/REFERENCE_WEEKS.md`. Outside that band indicates a
rounding defect.

---

## Verified reference weeks

Three weeks have been fully reconciled by hand and serve as the regression suite. The
expected totals live in **`docs/REFERENCE_WEEKS.md`**, which is gitignored and never
committed.

Those values are frozen. They are the only independent check on the code. Never update
them to match new output.

If `docs/REFERENCE_WEEKS.md` is absent, say so and stop — do not fabricate expected
values and do not skip the regression check silently.

---

## Known name aliases

The OCR and roster matcher produce inconsistent spellings for the same person. The
confirmed alias list is in `docs/REFERENCE_WEEKS.md`.

Note that two distinct employees at the same entity share a rate and pay method and have
been conflated before. Details in the same file.

---

## Settings file — the only persistence

The tool stores nothing between sessions. The settings file is the sole carrier of
anything that must survive from one week to the next: roster, rates, pay methods,
deposit amounts, aliases, active flags, and thresholds.

It is exported at the end of a session and imported at the start of the next. Any new
field that needs to persist gets added to this schema.

### Current export columns:

`Entity | Employee | Wage/hour | Type | Flat Amount | Pay Method | Deposit Amount | Deposit Typed As`

- `Type` is `Hourly` or `Flat`
- `Deposit Typed As` observed value: `whole`. Other values unknown.
- **Known defect:** the flat-rate employee's `Flat Amount` shows as 0 in settings while a
  non-zero amount is actually paid. The flat amount is not persisting.
- **Missing:** no active/inactive flag, which is why departed employees persist in the
  roster indefinitely.

---

## Schedule rules

Store hours for NIRVANA 11TH:

| Day | Open |
|---|---|
| Sunday | 8:00 AM – 10:15 PM |
| Monday – Wednesday | 7:00 AM – 12:00 AM |
| Thursday – Saturday | 7:00 AM – 1:00 AM |

Minimum staffing: **3** during all open hours.

*Store hours and minimums for ZION and HEFNER are unconfirmed.*

### Validation scope

Validate exactly three things:

1. Coverage below minimum, evaluated at minute resolution, within open hours only
2. Each shift's computed duration against its stated Hours cell
3. Roster completeness — roster entries with no schedule row and vice versa

**Do not validate rest intervals or overtime.** Both are explicitly out of scope.

### Hours notation

Schedule sheets currently write hours as `h.mm` (6.15 = 6 hours 15 minutes),
inconsistently mixed with decimal (7.5 for 7 hours 30 minutes, which in h.mm would be
7.30). The row cannot be summed as written.

Normalize to **decimal hours** on ingest and write back in decimal.
