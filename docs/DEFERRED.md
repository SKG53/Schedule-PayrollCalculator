# Deferred Backlog

Ideas that are not part of any active Feature Card. Not committed, not scheduled, but not forgotten. If any of these become priority, promote them to a card in `docs/features/`.

## From original handoff (Schedule_Payroll_Development_Handoff_v3.md)

- **Group D features** (Handoff Group D — details in the v3 handoff): batch of quality-of-life improvements not chosen for the first waves.
- **alert()/confirm() cleanup** — replace remaining browser dialogs with in-tool toast/modal patterns for a more polished feel. FC-00007 introduced some new `confirm()` calls that would be candidates for this cleanup.
- **MN overlap-supersede** — when a schedule contains overlapping shifts around midnight, the tool currently produces two separate shift rows. Deferred: unify into one shift where clearly a continuation.
- **Contract Check pay method** — an additional pay-method category beyond Cash / Deposit / Both. Was scoped but never approved.
- **Shift merge thresholds** — configurable threshold for auto-merging back-to-back shifts (currently hardcoded).
- **UI modernization** — full visual refresh (spacing, typography, dark mode).
- **Structural refactor** — split the monolithic `index.html` into modules. Would be a very large card; ripple risk high; deferred until the current feature set stabilizes.

## Post-2026-09-01 additions

- **User-editable palette colors** (full color picker) — considered as FC-00014's original spec, replaced by 10 presets. Full picker deferred as candidate FC-XXXXX if presets prove insufficient.
- **Schedule OCR: multi-week extraction** — FC-00009 handles the first week of a multi-week image. If users routinely upload multi-week images, add a card.
- **Schedule OCR: handwriting** — best-effort in current Gemini call, no guarantee. If accuracy is unacceptable, add a card that swaps model / adds review step.
- **PDF-only print settings** (margins, page-break policy config) — FC-00015 uses defaults. Add a card if power-users need control.
