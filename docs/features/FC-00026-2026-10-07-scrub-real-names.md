# FC-00026 — Remove real employee names from the repository

**Date:** 2026-10-07 · **Slice:** S · **Risk:** Low · **Status:** done · **Affected entities:** N/A (repo hygiene)

## What
Replace every real employee name in tracked files with fabricated names, and (as a separate, owner-run step) rewrite Git history so no past commit carries them either.

## Why
The repository is public. Test fixtures, one code comment and one documentation example carried real employee names copied from payroll files. That defeats the point of a tool that holds no payroll data (CLAUDE.md rule 4).

## Where in UI
None.

## Touches
docs, tests, infra

## Risk
Low — fixture and comment text only; no runtime behavior changes. Test count and assertions are unchanged apart from the names.

## Reversibility
The working-tree change is fully reversible. The history rewrite is **not** reversible once force-pushed; that step is owner-run and documented outside the repo.

## Definition of Done
1. `git grep` for the local scrub list returns nothing on `main`.
2. Fixture names are obviously fabricated (Alice, Bob, Avery, Blake, Devon, Emery, Allie).
3. The FC-00012 test no longer names a real payroll file.
4. CLAUDE.md rule 4 states that fixtures must use fabricated names.
5. All tests pass with the same count as before.
6. History rewrite executed by the owner with `git filter-repo`; verification grep over `git log --all -p` is empty.

## Out of scope
Changing any test logic. Any `index.html` behavior.

## Assumptions
1. The scrub list lives only on the owner's machine, never in the repo.
2. Entity names (store names) are not treated as personal data.

## Open questions
None.

## Tests
No new tests. Existing 152 pass.

## Slice
S

## Affected entities
N/A
