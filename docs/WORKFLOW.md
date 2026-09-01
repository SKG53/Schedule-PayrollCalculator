# Feature Card Workflow

The rule: **every feature, bugfix, or refactor larger than a trivial one-liner ships as a Feature Card first.** No card, no code. This is what keeps the tool from drifting when multiple hands (Perplexity, Claude Code, future agents) touch it.

## What a Feature Card is

A markdown file at `docs/features/FC-NNNNN-YYYY-MM-DD-slug.md` capturing the full contract for one shipment. It's the source of truth from before code starts until after it merges.

### Required fields (13)

Every card MUST have all of these — no exceptions. If a field is genuinely N/A, write "N/A" and note why.

1. **What** — one-sentence description of the change.
2. **Why** — the pain being solved. No solution language here, just the problem.
3. **Where in UI** — which pages/panels/screens are touched.
4. **Touches** — logical areas: `display`, `roster`, `exports`, `ocr`, `settings`, `schema`, `infra`, `docs`.
5. **Risk** — Low / Medium / Medium-High / High, with one-line reasoning.
6. **Reversibility** — how hard is rollback? "Fully reversible via one revert commit" is ideal.
7. **Definition of Done** — numbered checklist of everything that must be true for the card to close. Every item must be testable or observable.
8. **Out of scope** — explicit list of things NOT touched. Prevents scope creep. If it isn't listed here and it isn't in DoD, it doesn't ship in this card.
9. **Assumptions** — locked decisions the subagent must NOT deviate from. Text of dialog messages, exact palette values, etc.
10. **Open questions (max 3)** — anything unresolved. If more than 3, the card isn't ready; iterate the Q&A more.
11. **Tests** — specific test names to add. Existing test count must not decrease.
12. **Slice** — S / M / L. If L, list candidate sub-slices.
13. **Affected entities** — All / N11 / ZIO / HEF / N/A.

## Lifecycle

`drafting` → `approved` → `in-progress` → `done` | `blocked` | `abandoned`

- **drafting**: card being written, questions unresolved.
- **approved**: user has signed off on all fields.
- **in-progress**: branch cut, code being written.
- **done**: merged to `main`, live, verified.
- **blocked**: waiting on external input; note what's blocking.
- **abandoned**: no longer relevant; note why.

## Enforcement — strict-adjacent

**Default is strict**: cards go through the full Q&A, one question at a time with nudges and cautions, until every field is locked. This prevents silent drift.

**"Just build it" override** applies only when ALL of these are true:
- Change is simple (single function, single file, obvious behavior).
- Change is fully reversible (no schema migration, no external side effect).
- Risk is Low.

If any of those don't hold, revert to strict.

## Card creation Q&A style

Ask one question at a time. For every question:
- **Nudge**: your recommendation with one-line reasoning.
- **Caution**: what could go wrong with the other options.
- **Options**: 2-3 discrete choices (not blank text field).

Never present the raw card template and ask the user to fill it in. Walk them through it.

## File naming

`docs/features/FC-NNNNN-YYYY-MM-DD-slug.md`

- **FC-NNNNN**: 5-digit zero-padded, sequential, never reused.
- **YYYY-MM-DD**: date the card was drafted.
- **slug**: 2-5 lowercase-hyphenated words summarizing the What.

Example: `docs/features/FC-00007-2026-09-01-universal-rename-ids.md`

## Index: `docs/FEATURE_LOG.md`

Every card has one line in the log with:
`FC-ID | date | slice | risk | status | path | title`

Updated at approval time. Also updated when status changes.

## When cards are absorbed by other work

If a card's scope is merged into another card (e.g., FC-00010 was absorbed into FC-00007's rename scope during Q&A), do NOT re-use the number. Leave it retired. The FEATURE_LOG notes the absorption.

## Branch and commit conventions

- Branch: `fc-NNNNN-slug` (matches card filename).
- Commit prefix: `FC-NNNNN: <what changed>` for any commit tied to that card.
- Merge commit: `Merge FC-NNNNN: <title>` with `--no-ff` for a preserved merge trace.
- Push straight to `main` (the "no-touch-main" rule was retired 2026-09-01; see `docs/DECISIONS.md`).

## Deferred backlog

Anything postponed indefinitely (not part of any current card) goes in `docs/DEFERRED.md` with a one-line why. Keeps the ideas alive without polluting the active card list.
