---
description: Re-run the three verified reference weeks and confirm no calculation regression
---

Run the regression suite. Do this after any change touching parsing, calculation,
rounding, or export.

The three reference weeks in `docs/REFERENCE_WEEKS.md` were reconciled by hand against
raw intake files and are exact. If a total moves, the change caused it.

That file is gitignored and local only. If it is missing, say so and stop — do not
fabricate expected values and do not skip the check silently.

## Steps

0. If Node.js and a test runner are available, run the suite first. Note that
   `tests/break_and_sort.test.js` copies the break helpers rather than importing them —
   a pass there does not prove production is correct.
1. Process each of the three reference weeks through the current code.
2. Compare against the expected Actual / Deposit / Cash / Delta in
   `docs/REFERENCE_WEEKS.md`, both at grand-total and entity-subtotal level.
3. Compare per-employee hours where the reference data provides them.
4. Confirm the row-level identities still hold: Actual = Hours × Rate,
   Deposit + Cash = Rounded Final, Diff = Rounded Final − Actual.
5. Confirm every export still produces its expected sheets, columns, and formatting, and
   that currency cells are numeric rather than strings.

## Output

Pass or fail per week, with exact deltas where any number moved.

**A failure is a blocker.** Do not proceed to further work, and do not merge. Report it
and stop.

If a total moved because the change was *supposed* to move it, say so explicitly, explain
why, and ask Sastry to confirm before updating the expected values in `docs/DOMAIN.md`.
Never update the expected values silently — they are the only independent check that
exists.

**Report results as pass/fail and deltas only. Do not restate the expected totals in
chat or write them into any tracked file.**
