# FC-00016 — Timecard thumbnail per Actuals row

**Date:** 2026-09-01 · **Slice:** M · **Risk:** Low · **Status:** done · **Affected entities:** All

## What
Each row of the Actuals Intake review table shows a small thumbnail (32-40px) of the source timecard image, left of the filename. Click the thumbnail → modal opens the full-size image so the user can verify OCR against the source.

## Why
User needs to cross-check OCR output against the original photo — especially when a name looks wrong or times seem off. Previously the source was invisible after upload.

## Where in UI
Tab 2 (Actuals Intake) review table, Image column.

## Touches
display, ocr (read-only)

## Risk
Low — display-only; image blobs already in memory.

## Reversibility
Fully reversible.

## Definition of Done
Shipped as specified. 85/85 tests passing (78 pre-existing + 7 new).

## Out of scope
Editing/annotating the image. Re-running OCR from the modal (already available in-row). Zoom/pan beyond browser default. Persistent image storage.

## Assumptions
1. Thumbnails only for OCR'd rows (via `ent.intake._ocrJobs`). Manual rows get placeholder icon.
2. `URL.createObjectURL(job.file)` cached on the job (`job._thumbUrl`).
3. Revoked only on `clearIntake` — not on every re-render.
4. Modal mounted once in page shell, opened via `openImgModal(url)`, closes on backdrop click / Esc / X.

## Tests
- `test_thumbnail_renders_when_job_present`
- `test_thumbnail_missing_job_shows_placeholder`
- `test_thumbnail_url_cached_on_job`
- `test_thumb_urls_revoked_on_clear_intake`
- `test_modal_opens_with_correct_src`
- `test_modal_closes_on_esc`
- `test_find_job_for_row`

## Slice
M

## Affected entities
All

## Shipped as
Merge commit `e9be50e` (feature commit `16254e4`)
