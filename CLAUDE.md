# Schedule & Payroll Calculator

Internal payroll and scheduling tool for The Nirvana Group. Processes weekly timecards
across three entities and produces payroll reports. Used every week to pay real people.

**Live at:** https://skg53.github.io/Schedule-PayrollCalculator/
**Owner:** Sastry (head of the organization)

---

## CRITICAL — read before any code change

### 1. `main` is production

GitHub Pages serves the `main` branch. Anything committed to `main` is live immediately
and is what gets used to run payroll.

- **Never commit to `main`.** Work on a feature branch.
- Merge to `main` only when Sastry explicitly says to.
- If you are on `main` and about to write a file, stop and create a branch first.

### 2. Never remove existing functionality

This tool has behavior that is not documented anywhere and not visible in its exports.
Removing a feature silently is the worst failure mode in this project — it surfaces
weeks later as a wrong paycheck.

- `docs/BASELINE.md` is the inventory of current behavior. Read it before editing.
- If `docs/BASELINE.md` is empty or marked incomplete, **fill it in first** by reading
  the codebase. Do not write code until it exists.
- When you change something covered by the baseline, update the baseline in the same
  commit.

### 3. No payroll data persists

The tool holds **no payroll data** outside of structure. It is always empty of payroll
data on first load. All payroll data enters by file upload and leaves by file download.

| Allowed in `localStorage` | Never persisted |
|---|---|
| API credentials (Gemini key) | Timecards, punches, hours |
| Model selection and UI preferences | Roster, names, wages, rates |
| | Payroll figures of any kind |
| | Settings that belong in the settings file |

Anything that must survive between weeks — roster, rates, pay methods, aliases, active
flags, break settings, thresholds — lives in the **settings file**, which the user exports
and re-imports. If a feature seems to need persistence, add a settings-file field, never
storage.

Session state is in memory only and is gone on refresh. That is correct.

### 4. The repository is public — no real data, ever

Nothing tracked by Git may contain payroll figures, employee names, wages, rates, or any
real business data. This includes documentation, comments, test fixtures, commit
messages, and example values in code.

- Real values live in **`docs/REFERENCE_WEEKS.md`**, which is gitignored.
- Never restate its contents in a tracked file, and never paste them into a commit
  message.
- Never commit a timecard, settings export, payroll report, or screenshot of one.
- Test data and code examples must be fabricated.

Before any `git push`, list what would be pushed and confirm it contains none of the
above. If you are unsure whether a value is real, treat it as real.

### 5. Verify against known-good weeks

`docs/REFERENCE_WEEKS.md` (local, gitignored) contains three fully reconciled payroll
weeks with exact expected totals. After any change touching calculation, parsing, or export, re-run those weeks
and confirm the numbers still match. A change that alters a verified total is a
regression until proven otherwise.

---

## Vocabulary — do not confuse these

These four terms are distinct and were previously conflated in this project. Getting
them wrong produces a wrong ledger.

| Term | Definition | Whole dollars? |
|---|---|---|
| **Actual** | Hours × Rate. What was earned. | No — cents-exact |
| **Deposit** | Paid by bank deposit | No — carries cents |
| **Cash** | Paid from the till | **Yes** — always whole |
| **Rounded Final** | Deposit + Cash | No — mixed by construction |
| **Paid** | Same as Rounded Final | No |
| **Delta** | Paid − Actual. Rounding drift. | No |

**Rounded Final is not a whole number.** Only Cash is. This is the single most common
mistake made in this codebase.

---

## Hard calculation rules

1. **Hours are span-based.** `billable = span − max(mandatoryBreak, actualGap)`. Do not
   replace this with a sum of worked pairs — the span basis stops duplicate or
   overlapping punches from inflating a day. See `docs/DOMAIN.md`.

2. **The mandatory break is a user setting, not a framework rule.** It is configured per
   entity in the tool, with per-day overrides that bypass the floor. Never change,
   default, or "correct" a break value in code.

3. **MN precedence is currently additive.** All sources merge additively; no
   overlap-supersede rule exists. Do not implement one without an explicit decision — it
   changes paid hours.

4. **Overnight shifts.** If OUT is less than or equal to IN, add 24 hours.

5. **Zero-hour rows are retained.** An employee at 0.00 hours still appears in every
   output. Departure is expressed by an `active = false` flag on the roster, never by
   silent omission.

6. **Currency cells in exports must be numeric**, with number format `$#,##0.00`.
   Never write pre-formatted text strings — they cannot be summed in Excel.

---

## Not validated — do not add these

Sastry has explicitly ruled these out. Do not implement, flag, or warn about:

- Rest intervals between shifts
- Overtime thresholds

Schedule validation covers exactly three things: coverage against minimum, shift
arithmetic against stated hours, and roster completeness.

---

## Where things live

| File | Contents | When to read |
|---|---|---|
| `docs/DOMAIN.md` | Entities, pay methods, data sources, calculation rules | Any calculation or parsing work |
| `docs/REFERENCE_WEEKS.md` | Real totals and aliases. **Gitignored — never commit or quote.** | Running `/regression` |
| `docs/BUILD_SPEC.md` | Full enhancement specification, phased | Any feature work |
| `docs/BASELINE.md` | Inventory of existing functionality | Before every code change |
| `docs/DECISIONS.md` | Settled decisions and open questions | When something seems ambiguous |

---

## Working with Sastry

- He is fluent in operations and business. Do not explain basic concepts.
- Be direct. No preamble, no restating the request, no praise.
- Present problems as concise numbered lists, not prose.
- Surface problems he did not ask about. If you find a bug while doing something else,
  say so.
- Disagree when you think he is wrong, with specifics. Hold the position unless he
  gives you new facts.
- State uncertainty as uncertainty. Never present a guess confidently.
- If a parameter is unknown, use a clearly marked placeholder and list it. Never invent
  a value.

---

## Session start

At the beginning of a session, do this before anything else:

1. Confirm which branch you are on. If `main`, create a feature branch.
2. Read `docs/DECISIONS.md` for anything settled or still open.
3. If `docs/BASELINE.md` is incomplete, complete it before writing code.

Then ask what he wants to work on. Do not start work unprompted.

---

## Committing

- One logical change per commit.
- Commit message states what changed and why, in plain English.
- Never commit real employee names, rates, wage data, or payroll figures — see rule 4.
- Commit messages are public too. Describe the change, never the data.
