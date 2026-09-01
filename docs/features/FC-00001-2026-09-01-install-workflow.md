# FC-00001 — Install lean Feature Card workflow

**Date:** 2026-09-01 · **Slice:** S · **Risk:** Low · **Status:** done · **Affected entities:** N/A (infra)

## What
Install the Feature Card workflow docs into the repo. Backfill all cards from the 2026-09-01 session so the process becomes durable.

## Why
Cards exist only in chat history until they land in the repo. Without persistence, the next chat drifts — exactly the problem the workflow was invented to solve.

## Where in UI
No UI change. Docs only.

## Touches
docs, infra

## Risk
Low — docs-only.

## Reversibility
Fully reversible via one revert commit.

## Definition of Done
1. `docs/WORKFLOW.md` created with card template, enforcement rules, lifecycle, file naming, log format, and branch/commit conventions. ✓
2. `docs/features/` folder created with backfilled cards for FC-00001, FC-00002, FC-00007, FC-00008, FC-00009, FC-00011, FC-00012, FC-00013, FC-00014, FC-00015. ✓
3. `docs/FEATURE_LOG.md` created with one line per card, including absorbed/retired numbers (FC-00003–00006 into tool-v2, FC-00010 into FC-00007). ✓
4. `docs/DEFERRED.md` seeded with items from the original handoff plus post-session additions. ✓
5. `CLAUDE.md` updated with a top-of-file Workflow section pointing to `docs/WORKFLOW.md` as the mandatory entry point.
6. All existing tests still pass (docs-only change, so trivially true).

## Out of scope
- Automating card creation.
- Pre-commit hooks enforcing the workflow.
- Any `index.html` changes.

## Assumptions
1. Cards are hand-written markdown, not generated.
2. `FEATURE_LOG.md` maintained manually at approval time.
3. Numbering reserved: FC-00001 = this card; FC-00002 = login removal; FC-00003–00006 = absorbed; FC-00007+ = 2026-09-01 feature work.

## Open questions
None.

## Tests
None — docs only. Existing 73 tests still pass.

## Slice
S

## Affected entities
N/A (infra)
