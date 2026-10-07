// FC-00028: no hardcoded year in OCR. Prompts carry the pay week's own dates (or today + the
// New Year rule); OCR'd dates clearly in the wrong year are moved to the nearest plausible
// year and flagged.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

const NY_WEEK = ['Dec 27 2026', 'Dec 28 2026', 'Dec 29 2026', 'Dec 30 2026', 'Dec 31 2026', 'Jan 1 2027', 'Jan 2 2027'];

test('test_prompts_have_no_hardcoded_year', () => {
  const api = loadApp();
  api._setOcrTodayForTests('2027-03-10');
  const tc = api.tcPrompt([], [], '');
  const ec = api.ecPrompt([], [], '');
  assert.doesNotMatch(tc, /is the year 2026/);
  assert.doesNotMatch(ec, /Assume year 2026/);
  assert.match(tc, /Today is 2027-03-10/);
  assert.match(ec, /Today is 2027-03-10/);
});

test('test_prompts_use_schedule_week_across_new_year', () => {
  const api = loadApp();
  const g = api._ocrYearGuidance(NY_WEEK);
  assert.match(g, /2026-12-27 to 2027-01-02/);
  assert.match(g, /2026 \/ 2027/);
  assert.match(api.ecPrompt([], NY_WEEK, ''), /2026-12-27 to 2027-01-02/);
});

test('test_correct_ocr_year_moves_only_clear_misreads', () => {
  const api = loadApp();
  // Jan 2 read as 2026 in a week centered on Dec 30 2026 -> 2027.
  assert.deepEqual(api._correctOcrYear('2026-01-02', '2026-12-30'), { iso: '2027-01-02', from: 2026 });
  // Dec 28 read as 2027 in the same week -> 2026.
  assert.deepEqual(api._correctOcrYear('2027-12-28', '2026-12-30'), { iso: '2026-12-28', from: 2027 });
  // Correct dates are untouched.
  assert.deepEqual(api._correctOcrYear('2027-01-01', '2026-12-30'), { iso: '2027-01-01', from: null });
  assert.deepEqual(api._correctOcrYear('2026-08-10', '2026-08-12'), { iso: '2026-08-10', from: null });
  // A plausible-but-off date within 4 months is left for the reviewer (Outside week flag).
  assert.equal(api._correctOcrYear('2026-10-01', '2026-08-12').from, null);
});

test('test_process_review_row_corrects_and_flags_year', () => {
  const api = loadApp();
  const ent = resetToSingleEntity(api, { id: 0, name: 'NY Co', employees: [{ name: 'Ann', shifts: [] }], dateLabels: NY_WEEK });
  const row = api.processReviewRow({ empName: 'Ann', date: '2026-01-01', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.95, source: 'TC', originalName: 'a.jpg' }, ent);
  assert.equal(row.date, '2027-01-01');
  assert.equal(row.dayIdx, 5, 'Jan 1 2027 is a Friday');
  assert.ok(row.flags.some(f => /Year corrected \(OCR read 2026\)/.test(f)));
  assert.ok(!row.flags.includes('Outside week'), 'corrected date lands inside the week');
});

test('test_process_review_row_without_schedule_uses_today', () => {
  const api = loadApp();
  api._setOcrTodayForTests('2027-01-04');
  const ent = resetToSingleEntity(api, { id: 0, name: 'No Sched', employees: [] });
  const row = api.processReviewRow({ empName: 'Ann', date: '2027-12-30', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.95, source: 'EC', originalName: 'b.png' }, ent);
  assert.equal(row.date, '2026-12-30', 'December date read in early January belongs to the previous year');
});

test('test_manual_and_imported_rows_never_year_corrected', () => {
  const api = loadApp();
  const ent = resetToSingleEntity(api, { id: 0, name: 'NY Co', employees: [{ name: 'Ann', shifts: [] }], dateLabels: NY_WEEK });
  const row = api.processReviewRow({ empName: 'Ann', date: '2026-01-01', clockIn1: '09:00', clockOut1: '17:00', confidence: 1, source: 'MN', originalName: '(manual)' }, ent);
  assert.equal(row.date, '2026-01-01');
});
