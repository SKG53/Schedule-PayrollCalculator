// FC-00029: the reviewer is the final verification. Editing a time/date on an OCR row turns it
// into a manual (MN) entry that keeps the reviewer's values, survives OCR re-runs, and in
// payroll replaces any overlapping TC/EC pair for the same employee and date.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

const WEEK = ['Aug 9 2026', 'Aug 10 2026', 'Aug 11 2026', 'Aug 12 2026', 'Aug 13 2026', 'Aug 14 2026', 'Aug 15 2026'];

function setup() {
  const api = loadApp();
  const ent = resetToSingleEntity(api, {
    id: 0, name: 'Edit Co', employees: [{ name: 'Ann', shifts: ['', '9AM - 5PM', '', '', '', '', ''] }],
    dateLabels: WEEK, breakMinutes: 0, breakMinutesSet: true,
  });
  api._syncEntityCode(ent);
  api.ensureIntakeState(ent);
  ent.intake.activeEmpTab = 'Ann';
  api.wageRates[api.wKey(0, 'Ann')] = 10;
  return { api, ent };
}
const ocr = (api, ent, o) => {
  const r = api.processReviewRow(Object.assign({ empName: 'Ann', date: '2026-08-10', confidence: 0.95, source: 'TC', originalName: 'card.jpg' }, o), ent);
  ent.intake.reviewRows.push(r);
  return r;
};
const hours = (api) => api.computePayrollForEntity(0).results[0].actualHours;

test('test_editing_ocr_time_makes_row_manual_and_keeps_value', () => {
  const { api, ent } = setup();
  const r = ocr(api, ent, { clockIn1: '09:00', clockOut1: '17:00' });
  assert.equal(r.source, 'TC');
  api.commitTimeInput({ value: '1730' }, r.id, 'clockOut1');
  assert.equal(r.clockOut1, '17:30', 'reviewer value kept');
  assert.equal(r.source, 'MN', 'edited OCR row becomes a manual entry');
  assert.equal(r._reviewerEdited, true);
  api.approveReviewRow(r.id);
  api.syncActualsFromReview();
  assert.equal(hours(api), 8.5, 'payroll uses the reviewer value');
});

test('test_setting_value_back_restores_ocr_source', () => {
  const { api, ent } = setup();
  const r = ocr(api, ent, { clockIn1: '09:00', clockOut1: '17:00' });
  api.commitTimeInput({ value: '1730' }, r.id, 'clockOut1');
  api.commitTimeInput({ value: '5:00 PM' }, r.id, 'clockOut1');
  assert.equal(r.source, 'TC');
  assert.equal(r._reviewerEdited, false);
});

test('test_date_edit_also_counts_as_reviewer_edit', () => {
  const { api, ent } = setup();
  const r = ocr(api, ent, { clockIn1: '09:00', clockOut1: '17:00' });
  api.commitDateInput({ value: '2026-08-11' }, r.id, 'date');
  assert.equal(r.source, 'MN');
});

test('test_name_change_alone_is_not_a_time_edit', () => {
  const { api, ent } = setup();
  const r = ocr(api, ent, { empName: 'Anne', clockIn1: '09:00', clockOut1: '17:00' });
  api.updateReviewField(r.id, 'empName', 'Ann');
  assert.equal(r.source, 'TC');
});

test('test_manual_pair_supersedes_overlapping_ocr_pair', () => {
  const { api, ent } = setup();
  const tc = ocr(api, ent, { clockIn1: '09:00', clockOut1: '17:00' });
  const mn = api.processReviewRow({ empName: 'Ann', date: '2026-08-10', clockIn1: '08:30', clockOut1: '16:00', confidence: 1, source: 'MN', originalName: '(manual)' }, ent);
  ent.intake.reviewRows.push(mn);
  api.approveReviewRow(tc.id); api.approveReviewRow(mn.id);
  api.syncActualsFromReview();
  assert.equal(hours(api), 7.5, 'only the manual 08:30-16:00 pair is paid (old additive span would be 8.5)');
  assert.equal(tc._superseded, true);
  assert.ok(!mn._superseded);
});

test('test_non_overlapping_pairs_still_add', () => {
  const { api, ent } = setup();
  const tc = ocr(api, ent, { clockIn1: '09:00', clockOut1: '13:00' });
  const mn = api.processReviewRow({ empName: 'Ann', date: '2026-08-10', clockIn1: '14:00', clockOut1: '17:00', confidence: 1, source: 'MN', originalName: '(manual)' }, ent);
  ent.intake.reviewRows.push(mn);
  api.approveReviewRow(tc.id); api.approveReviewRow(mn.id);
  api.syncActualsFromReview();
  assert.equal(hours(api), 7, 'span 09:00-17:00 minus the 1h actual gap');
  assert.ok(!tc._superseded);
});

test('test_unapproved_manual_row_supersedes_nothing', () => {
  const { api, ent } = setup();
  const tc = ocr(api, ent, { clockIn1: '09:00', clockOut1: '17:00' });
  const mn = api.processReviewRow({ empName: 'Ann', date: '2026-08-10', clockIn1: '08:30', clockOut1: '16:00', confidence: 1, source: 'MN', originalName: '(manual)' }, ent);
  ent.intake.reviewRows.push(mn);
  api.approveReviewRow(tc.id);
  api.syncActualsFromReview();
  assert.equal(hours(api), 8);
  assert.ok(!tc._superseded);
});

test('test_ocr_rerun_keeps_reviewer_edited_rows', async () => {
  const { api, ent } = setup();
  api._prefSet('pv26_api_key', 'FAKEKEY');
  const r = ocr(api, ent, { clockIn1: '09:00', clockOut1: '17:00' });
  api.commitTimeInput({ value: '1730' }, r.id, 'clockOut1');
  const untouched = ocr(api, ent, { date: '2026-08-11', clockIn1: '09:00', clockOut1: '17:00' });
  ent.intake._ocrJobs = [{ id: r.imageJobId, name: 'card.jpg', kind: 'TC', file: { name: 'card.jpg', type: 'image/jpeg' }, status: 'done' }];
  api.__sandbox.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }) });
  await api.rerunOcrForImage(0, r.imageJobId || 'card.jpg', 1);
  assert.ok(ent.intake.reviewRows.some(x => x.id === r.id), 'reviewer-edited row survives the re-run');
  assert.equal(ent.intake.reviewRows.find(x => x.id === r.id).clockOut1, '17:30');
  assert.ok(!ent.intake.reviewRows.some(x => x.id === untouched.id), 'unedited OCR rows from that image are replaced as before');
});

test('test_review_table_shows_edit_and_supersede_badges', () => {
  const { api, ent } = setup();
  const tc = ocr(api, ent, { clockIn1: '09:00', clockOut1: '17:00' });
  const edited = ocr(api, ent, { clockIn1: '09:00', clockOut1: '17:00', originalName: 'card2.jpg' });
  api.commitTimeInput({ value: '0830' }, edited.id, 'clockIn1');
  api.approveReviewRow(tc.id); api.approveReviewRow(edited.id);
  api.syncActualsFromReview();
  const html = api.renderReviewTableHtml(ent, 0);
  assert.match(html, /edited \(was TC\)/);
  assert.match(html, /replaced by manual entry/);
});
