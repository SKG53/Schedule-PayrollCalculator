# FC-00031 — Fix documentation drift, `npm test` and `.gitignore`

**Date:** 2026-10-07 · **Slice:** S · **Risk:** Low · **Status:** done · **Affected entities:** N/A (docs/infra)

## What
Bring the repository's own documentation and tooling back in line with the code.

## Why
Several documents described behavior that is no longer true, `npm test` failed, and one `.gitignore` line ignored nothing. Stale docs are how the next session reintroduces a fixed bug.

## Fix
- `package.json`: `"test": "node --test \"tests/*.test.js\""` (Node 21+). `npm test` runs the full suite.
- `.gitignore`: the literal `node_modules/\npackage-lock.json` line split into two real patterns.
- `README.md`: real live URL; deployment via the `gh-pages` workflow (Pages source = `gh-pages` / root, not `main`); test command; file list.
- `FORMATS.md`: Entity column must match an entity name (it said the opposite); no sample files in the repo; table of the re-importable output schemas.
- `docs/BUILD_SPEC.md`: status line and an item-level progress table replace the "not started" checkboxes; §9B.3, §9B.5, §9B.6 marked resolved where they are.
- `docs/BASELINE.md`: status line, `package.json` note, test-harness item resolved, item ordering.
- `docs/DECISIONS.md`: open #16 (employee identity across weeks) and #17 (week-filter visibility) added.
- `docs/features/FC-00025-…` backfilled for commit `548112b`; FEATURE_LOG updated.

## Where in UI
None.

## Touches
docs, infra

## Risk
Low — no `index.html` change.

## Reversibility
Fully reversible via one revert commit.

## Definition of Done
1. `npm test` passes on Node 21+.
2. `git check-ignore node_modules/x package-lock.json` matches both.
3. No document claims behavior the code does not have (spot-checked items above).
4. FC-00025 card exists and is in the log.

## Out of scope
Rewriting BUILD_SPEC analysis sections. Any code change.

## Assumptions
1. Live URL is `https://skg53.github.io/Schedule-PayrollCalculator/` (project Pages site served from `gh-pages`).

## Open questions
None.

## Tests
None new — docs/infra only. Suite count unchanged.

## Slice
S

## Affected entities
N/A
