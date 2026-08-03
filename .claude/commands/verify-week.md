---
description: Reconcile a payroll week from raw intake files against the produced report
---

Reconcile a payroll week end to end. Do not trust the tool's own output — recompute
everything independently from the raw intake files, then compare.

Read `docs/DOMAIN.md` first for the calculation rules.

## Steps

**1. Recompute hours from intake.**

Hours are **span-based**, not a sum of worked pairs. For each employee-day, parse every
IN/OUT pair, adding 24 hours where OUT ≤ IN (overnight), then:

```
workedH          = sum of all IN/OUT pairs
spanH            = last OUT − first IN
actualBreakH     = max(0, spanH − workedH)             // observed gap between pairs
effectiveBreakH  = max(mandatoryBreakH, actualBreakH)  // mandatory acts as a FLOOR
billableH        = max(0, spanH − effectiveBreakH)
```

Do **not** substitute a plain sum of worked pairs — it diverges from the tool wherever
the floor fires, and the divergence is expected, not a defect.

The mandatory break is a per-entity user setting. A per-day override — including 0 —
is exact and bypasses the floor entirely. Use the values configured for the week being
reconciled; never assume a default.

Merge all sources **additively**. Every approved row for the same employee and date
contributes its pairs regardless of TC/EC/MN origin. There is no overlap-supersede rule
— do not apply one.

Note that EasyClocking's own daily total is a plain sum of worked time and will differ
from the tool wherever the floor fires. That is not a discrepancy.

**2. Compare against the report.**

Per employee, report any difference in hours. Flag employees present in one source and
absent from the other, in both directions.

**3. Check internal arithmetic of the report.**

Every row:
- Actual = Hours × Rate
- Deposit + Cash = Rounded Final
- Diff = Rounded Final − Actual

Every subtotal = sum of its rows. Grand total = sum of subtotals.

**4. Check the ledger.**

Compute Actual, Deposit, Cash, Paid, and Delta. A delta outside the expected band (see
`docs/REFERENCE_WEEKS.md`) is a defect, not a business event.

**5. Check the roster.**

- Names that resolved to an alias — list them
- Names that matched nothing
- Employees at 0.00 hours who were dropped from any output
- Any employee appearing under more than one spelling in the same week

**6. Check week boundaries.**

Punches dated outside the week window. Overnight shifts crossing the Saturday boundary.

## Output

A single numbered list of exceptions, ordered by dollar exposure. State the dollar
amount for each where one exists.

If everything ties, say so in one line and give the ledger figures. Do not pad.

Anything that cannot be resolved from the files goes at the end as a question, phrased
so it can be answered without re-reading the data.
