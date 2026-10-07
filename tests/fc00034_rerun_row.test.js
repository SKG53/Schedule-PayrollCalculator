// FC-00034: re-run OCR for one review row (one employee + date) instead of the whole image.
// The fresh reading replaces that row's times in place, the row returns to an unedited OCR
// row (reviewer edits can go on top again), is unapproved, and no other row is touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

const WEEK = ['Aug 9 2026', 'Aug 10 2026', 'Aug 11 2026', 'Aug 12 2026', 'Aug 13 2026', 'Aug 14 2026', 'Aug 15 2026'];

function setup(kind = 'TC') {
  const api = loadApp();
  const ent = resetToSingleEntity(api, {
    id: 0, name: 'Reread Co',
    employees: [{ name: 'Ann', shifts: ['', '9AM - 5PM', '9AM - 5PM', '', '', '', ''] }, { name: 'Bo', shifts: ['', '9AM - 5PM', '', '', '', '', ''] }],
    dateLabels: WEEK, breakMinutes: 0, breakMinutesSet: true,
  });
  api._syncEntityCode(ent);
  api.ensureIntakeState(ent);
  ent.intake.activeEmpTab = 'Ann';
  api._prefSet('pv26_api_key', 'FAKEKEY');
  ent.intake._ocrJobs = [{ id: 'job_1', name: 'card.jpg', kind, file: { name: 'card.jpg', type: 'image/jpeg' }, status: 'done' }];
  const toast = () => api.__sandbox.document.getElementById('toast');
  return { api, ent, toast };
}
const ocr = (api, ent, o, kind = 'TC') => {
  const r = api.processReviewRow(Object.assign({ empName: 'Ann', date: '2026-08-10', confidence: 0.95, source: kind, originalName: 'card.jpg', imageJobId: 'job_1' }, o), ent);
  ent.intake.reviewRows.push(r);
  return r;
};
// Fake Gemini: records each prompt and answers with `reply` (an array of OCR elements).
function fakeGemini(api, reply) {
  const prompts = [];
  api.__sandbox.fetch = async (url, init) => {
    prompts.push(JSON.parse(init.body).contents[0].parts[0].text);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }) };
  };
  return prompts;
}
const el = (o) => Object.assign({ empName: 'Ann', date: '2026-08-10', clockIn1: '', clockOut1: '', confidence: 0.97, notes: '' }, o);

test('test_row_reread_replaces_only_that_row_in_place', async () => {
  const { api, ent } = setup();
  const r = ocr(api, ent, { clockIn1: '09:00', clockOut1: '07:00' }); // misread out
  const other = ocr(api, ent, { date: '2026-08-11', clockIn1: '09:00', clockOut1: '17:00' });
  const bo = ocr(api, ent, { empName: 'Bo', clockIn1: '09:05', clockOut1: '17:02' });
  api.approveReviewRow(other.id);
  const prompts = fakeGemini(api, [el({ clockIn1: '09:00', clockOut1: '17:00' })]);
  await api.rerunOcrForRow(0, r.id);
  assert.equal(ent.intake.reviewRows.length, 3, 'no rows added or removed');
  assert.equal(ent.intake.reviewRows[0], r, 'same row object, same id');
  assert.equal(r.clockOut1, '17:00');
  assert.equal(r.source, 'TC');
  assert.equal(r.approved, false);
  assert.ok(r.flags.some(f => /Re-read from image/.test(f)));
  assert.deepEqual(r._ocr, { date: '2026-08-10', clockIn1: '09:00', clockOut1: '17:00', clockIn2: '', clockOut2: '', clockIn3: '', clockOut3: '' }, 'new OCR baseline');
  assert.equal(other.approved, true, 'other rows untouched');
  assert.equal(bo.clockIn1, '09:05');
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /FOCUS — RE-READ ONE ENTRY ONLY/);
  assert.match(prompts[0], /"Ann" on 2026-08-10/);
  assert.match(prompts[0], /Out 7:00 AM/, 'prompt names the current (wrong) reading');
});

test('test_manual_edits_after_reread_still_become_manual', async () => {
  const { api, ent } = setup();
  const r = ocr(api, ent, { clockIn1: '09:00', clockOut1: '07:00' });
  fakeGemini(api, [el({ clockIn1: '09:00', clockOut1: '16:55' })]);
  await api.rerunOcrForRow(0, r.id);
  api.commitTimeInput({ value: '1700' }, r.id, 'clockOut1');
  assert.equal(r.source, 'MN', 'edit on top of the re-read is a manual entry (FC-00029)');
  assert.equal(r.clockOut1, '17:00');
});

test('test_reread_of_edited_row_asks_first', async () => {
  const { api, ent } = setup();
  const r = ocr(api, ent, { clockIn1: '09:00', clockOut1: '17:00' });
  api.commitTimeInput({ value: '1730' }, r.id, 'clockOut1');
  const prompts = fakeGemini(api, [el({ clockIn1: '09:00', clockOut1: '17:10' })]);
  api.__sandbox.confirm = () => false;
  await api.rerunOcrForRow(0, r.id);
  assert.equal(r.clockOut1, '17:30', 'declined: reviewer value kept');
  assert.equal(r.source, 'MN');
  assert.equal(prompts.length, 0, 'no OCR call when declined');
  api.__sandbox.confirm = () => true;
  await api.rerunOcrForRow(0, r.id);
  assert.equal(r.clockOut1, '17:10');
  assert.equal(r.source, 'TC');
  assert.equal(r._reviewerEdited, false);
});

test('test_no_matching_entry_leaves_row_unchanged', async () => {
  const { api, ent, toast } = setup();
  const r = ocr(api, ent, { clockIn1: '09:00', clockOut1: '17:00' });
  api.approveReviewRow(r.id);
  fakeGemini(api, []);
  await api.rerunOcrForRow(0, r.id);
  assert.equal(r.clockOut1, '17:00');
  assert.equal(r.approved, true);
  assert.match(toast().innerHTML, /no entry/);
  assert.match(toast().className, /err/);
});

test('test_easyclocking_picks_nearest_clock_in_on_same_date', async () => {
  const { api, ent } = setup('EC');
  const r = ocr(api, ent, { clockIn1: '13:00', clockOut1: '13:05' }, 'EC');
  fakeGemini(api, [el({ clockIn1: '08:58', clockOut1: '12:01' }), el({ clockIn1: '12:58', clockOut1: '17:03' }), el({ date: '2026-08-11', clockIn1: '13:00', clockOut1: '18:00' })]);
  await api.rerunOcrForRow(0, r.id);
  assert.equal(r.clockIn1, '12:58');
  assert.equal(r.clockOut1, '17:03');
  assert.equal(r.source, 'EC');
});

test('test_single_reading_with_other_date_is_used_and_flagged', () => {
  const { api } = setup();
  const pick = api._pickRowReread({ date: '2026-08-10', clockIn1: '09:00' }, [{ date: '2026-08-11', clockIn1: '09:00' }]);
  assert.equal(pick.row.date, '2026-08-11');
  assert.match(pick.note, /returned date 2026-08-11/);
  assert.equal(api._pickRowReread({ date: '2026-08-10' }, [{ date: '2026-08-11' }, { date: '2026-08-12' }]), null);
});

test('test_missing_image_is_reported_not_guessed', async () => {
  const { api, ent, toast } = setup();
  const r = ocr(api, ent, { clockIn1: '09:00', clockOut1: '17:00' });
  ent.intake._ocrJobs = [];
  const prompts = fakeGemini(api, [el({ clockIn1: '10:00', clockOut1: '18:00' })]);
  await api.rerunOcrForRow(0, r.id);
  assert.equal(prompts.length, 0);
  assert.equal(r.clockIn1, '09:00');
  assert.match(toast().innerHTML, /not in this session/);
});

test('test_row_button_only_on_ocr_rows', () => {
  const { api, ent } = setup();
  ocr(api, ent, { clockIn1: '09:00', clockOut1: '17:00' });
  ent.intake.reviewRows.push({ id: 'manual_1', source: 'MN', empName: 'Ann', date: '2026-08-10', dayIdx: 1, clockIn1: '09:00', clockOut1: '17:00', clockIn2: '', clockOut2: '', clockIn3: '', clockOut3: '', confidence: 1, flags: [], needsReview: false, approved: false, originalName: '(manual)' });
  const html = api.renderReviewTableHtml(ent, 0);
  assert.equal((html.match(/rerunOcrForRow\(/g) || []).length, 1, 'one button: the OCR row, not the manual row');
  assert.match(html, /↻ This row/);
});
