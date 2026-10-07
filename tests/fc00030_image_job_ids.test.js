// FC-00030: review rows are joined to their source image by a unique job id, not filename.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

function setup() {
  const api = loadApp();
  const ent = resetToSingleEntity(api, { id: 0, name: 'Img Co', employees: [{ name: 'Ann', shifts: [] }, { name: 'Bob', shifts: [] }] });
  api.ensureIntakeState(ent);
  const jobA = { id: 'job_a', name: 'image.png', kind: 'TC', file: { name: 'image.png', type: 'image/png' }, status: 'done' };
  const jobB = { id: 'job_b', name: 'image.png', kind: 'TC', file: { name: 'image.png', type: 'image/png' }, status: 'done' };
  ent.intake._ocrJobs = [jobA, jobB];
  const mk = (emp, jobId, date) => {
    const r = api.processReviewRow({ empName: emp, date, clockIn1: '09:00', clockOut1: '17:00', confidence: 0.95, source: 'TC', originalName: 'image.png', imageJobId: jobId }, ent);
    ent.intake.reviewRows.push(r); return r;
  };
  const rowA = mk('Ann', 'job_a', '2026-08-10');
  const rowB = mk('Bob', 'job_b', '2026-08-10');
  return { api, ent, jobA, jobB, rowA, rowB };
}

test('test_rows_carry_job_id', () => {
  const { rowA, rowB } = setup();
  assert.equal(rowA.imageJobId, 'job_a');
  assert.equal(rowB.imageJobId, 'job_b');
});

test('test_same_filename_resolves_to_correct_job', () => {
  const { api, jobA, jobB, rowA, rowB } = setup();
  assert.equal(api._findJobForRow(0, rowA), jobA);
  assert.equal(api._findJobForRow(0, rowB), jobB);
  assert.equal(api._findJobForRow(0, 'image.png'), null, 'an ambiguous filename resolves to nothing rather than the wrong image');
  assert.equal(api._findJobForRow(0, 'job_b'), jobB, 'a job id resolves directly');
});

test('test_thumbnails_differ_for_same_named_images', () => {
  const { api, ent } = setup();
  ent.intake.activeEmpTab = 'Ann';
  const a = api.renderReviewTableHtml(ent, 0).match(/<img class="tc-thumb" src="([^"]+)"/)[1];
  ent.intake.activeEmpTab = 'Bob';
  const b = api.renderReviewTableHtml(ent, 0).match(/<img class="tc-thumb" src="([^"]+)"/)[1];
  assert.notEqual(a, b);
});

test('test_rerun_one_image_keeps_same_named_image_rows', async () => {
  const { api, ent, rowA, rowB } = setup();
  api._prefSet('pv26_api_key', 'FAKEKEY');
  api.__sandbox.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }) });
  await api.rerunOcrForImage(0, 'job_a', 1);
  assert.ok(!ent.intake.reviewRows.some(r => r.id === rowA.id), 'job_a rows replaced');
  assert.ok(ent.intake.reviewRows.some(r => r.id === rowB.id), 'job_b rows (same filename) untouched');
});

test('test_jobs_accumulate_across_batches', () => {
  const { api, ent, jobA, jobB } = setup();
  const jobC = { id: 'job_c', name: 'later.jpg', kind: 'TC', file: { name: 'later.jpg', type: 'image/jpeg' }, status: 'queued' };
  api.renderOcrFileList(0, [jobC]);
  assert.deepEqual(ent.intake._ocrJobs.map(j => j.id), ['job_a', 'job_b', 'job_c'], 'a later batch is appended, earlier jobs kept');
  assert.equal(api._findJobForRow(0, { imageJobId: 'job_a' }), jobA);
});

test('test_legacy_rows_without_job_id_still_match_unique_filename', () => {
  const { api, ent } = setup();
  const job = { id: 'job_u', name: 'unique.jpg', kind: 'TC', file: { name: 'unique.jpg', type: 'image/jpeg' }, status: 'done' };
  ent.intake._ocrJobs.push(job);
  assert.equal(api._findJobForRow(0, { originalName: 'unique.jpg' }), job);
});
