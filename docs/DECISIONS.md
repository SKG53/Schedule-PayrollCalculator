# Decisions & Open Questions

Running record. Add to it whenever something is settled or a new question appears.
Never delete an entry — move it between sections and note the date.

---

## Settled

| # | Decision | Date |
|---|---|---|
| 1 | ~~`main` is production. All work happens on feature branches.~~ **Retired 2026-09-01.** The no-touch-main rule is no longer in effect. `main` is edited directly. Short-lived branches still used for non-trivial changes for review/revert hygiene, but not required. Rule was in place while `main` was serving active weekly payroll; that is no longer the case. | 2026-09-01 |
| 2 | Hours are span-based: `span − max(mandatoryBreak, actualGap)`. Confirmed correct against the code. Not to be replaced with pair-sum. | [DATE] |
| 2a | The mandatory break is a per-entity user setting with per-day overrides, not a framework rule. Confirmed intended policy, not a defect. The three reference weeks stand unchanged. | [DATE] |
| 3 | Rest-interval and overtime validation are out of scope. Do not implement. | [DATE] |
| 4 | Rounded Final is **not** a whole number. Only Cash is whole-dollar. Deposit carries cents. | [DATE] |
| 5 | Ledger reports five measures: Actual, Deposit, Cash, Paid, Delta. | [DATE] |
| 6 | Zero-hour rows are retained in all outputs. Departure is an `active = false` roster flag. | [DATE] |
| 7 | Change log is a non-linear panel with per-entry revert, not a linear undo stack. Session-scoped, cleared on new batch with a warning. | [DATE] |
| 8 | Shift merging affects display and shift counting only, never paid hours — hours are span-based regardless. | [DATE] |
| 9 | Flags render as one-line previews with a "show more" expander. | [DATE] |
| 10 | A payment type carries behavior (columns, rounding, fixed-amount source, color), not just a label. | [DATE] |
| 11 | **No payroll data persists.** `localStorage` may hold API credentials and UI preferences only. Never roster, wages, punches or figures. Always empty of payroll data on first load. | [DATE] |
| 12 | No payroll figures, employee names, wages or real data may appear in any tracked file. Real values live in `docs/REFERENCE_WEEKS.md`, which is gitignored. The repository is public. | [DATE] |
| 13 | The settings file is the only persistence mechanism. Roster, aliases, rates, methods and thresholds all live there. Anything needing to survive between weeks becomes a settings field. | [DATE] |
| 14 | **The tool has no authentication by design.** It is public framework holding no payroll data — everything arrives by upload and leaves by download, so there is nothing to gate. Do not add a login, password, or access gate. The original plain-text gate was removed in full in Phase 0 (BUILD_SPEC §9B.1); the retired password is burned and must never be reused. | 2026-08-03 |

---

## Open — needs Sastry

| # | Question | Blocking |
|---|---|---|
| 1 | Shift merge threshold. 90 min proposed for auto-merge, 4 h for auto-separate, gray band flags for manual decision. | Phase 4 |
| 2 | Does merging ever change paid hours? Assumption is no — hours stay the sum of worked pairs. | Phase 4 |
| 3 | Should `Contract Check` become a real stored payment method, retiring the manual export-time override? | Phase 4/5 |
| 4 | Date field target format. MM/DD/YY assumed. | Phase 4 |
| 5 | Where does the flat-rate employee's paid amount come from? Settings shows `Flat Amount = 0`. | Phase 1 |
| 6 | What are the valid values for `Deposit Typed As` besides `whole`? | Phase 1 |
| 7 | Is the lighter cash-column fill on NIRVANA 11TH (`BDD7EE` vs `9DC3E6` elsewhere) intentional? Consistent across three weeks. | Phase 5 |
| 8 | Delta alert band — proposed value in `docs/REFERENCE_WEEKS.md`. | Phase 5 |
| 9 | Do ZION and HEFNER share NIRVANA 11TH's store hours and 3-staff minimum? | Phase 6 |
| 10 | OCR confidence threshold for the low-confidence flag. | Phase 4 |

---

## Open — raised by the baseline survey

| # | Question | Blocking |
|---|---|---|
| 11 | Implement the MN overlap-supersede rule, or leave merging additive? It changes paid hours either way. Span formula currently caps the damage. | Phase 4 |
| 12 | The OCR prompt sends the full roster and every employee's scheduled shifts to Google as disambiguation anchors. Keep, reduce, or remove? Removing will degrade name matching. | Phase 4 |
| 13 | Overstaffing thresholds are hardcoded at ≥4 before 4:30 PM and ≥5 after, which do not match the documented 3-staff minimum. What are the correct values, and per entity? | Phase 6 |
| 14 | Eleven exports exist, not six. Which need the deck treatment beyond Combined? | Phase 5 |

---

## Answered by the baseline survey

| # | Question | Answer |
|---|---|---|
| 1 | What break rule does the code apply? | `span − max(mandatoryBreak, actualGap)`. Mandatory is a floor and a user setting. Intended behavior. |
| 2 | How many exports exist? | Eleven, across seventeen buttons. |
| 3 | Does anything persist across refresh? | `localStorage`: API key and model preferences. `sessionStorage`: a dead login flag. No payroll data. |
| 4 | How do MN rows interact with TC/EC? | Purely additive. No supersede rule exists in code. |

---

## Closed — resolved, kept for history

| # | Item | Resolution |
|---|---|---|
| 1 | An employee appeared in intake for a week he was recorded as absent, with punches within 1–2 minutes of a colleague's. | Not a duplicate. He moved to evenings and rides in with that colleague. |
| 2 | Two similar names at one entity sharing a rate and pay method; one week's hours assigned to the wrong one. | Two distinct people. One has since left. Records were genuinely indistinguishable — a roster-level problem, not a matching bug. |
| 3 | Departed employees persisting on schedules and in settings. | Root cause is the absence of an active/inactive flag. Addressed in BUILD_SPEC §2. |
