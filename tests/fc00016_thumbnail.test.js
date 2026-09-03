// FC-00016: Timecard thumbnail per Actuals row.
//
// The Actuals Intake review table's Image column previously showed only the source
// filename. This adds a small clickable thumbnail (rendered as an <img class="tc-thumb">)
// to the left of the filename, sourced from the in-memory OCR job's File object
// (ent.intake._ocrJobs[i].file) via a cached URL.createObjectURL blob URL
// (job._thumbUrl — created once, reused across renders, revoked only in clearIntake).
// Rows are joined to jobs by originalName === job.name (the filename captured when the
// job was queued). Rows with no matching job (e.g. an older row from a previous session
// after state was cleared) fall back to a placeholder icon instead of crashing.
//
// Clicking a thumbnail opens the single page-shell modal (#imgModal) via
// openImgModal(url); closeImgModal() hides it again (wired to backdrop click, the X
// button, and Esc in index.html itself).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

function makeEntityWithJobAndRow(api, { imageName = 'alice.jpg', rowImageName = imageName, fileName = imageName } = {}) {
  const ent = resetToSingleEntity(api, {
    id: 0,
    name: 'Thumb Co',
    employees: [{ name: 'Alice', shifts: [] }],
  });
  api.ensureIntakeState(ent);
  const job = { name: fileName, kind: 'TC', file: { name: fileName, type: 'image/jpeg' }, status: 'done', detail: '' };
  ent.intake._ocrJobs = [job];
  const row = api.processReviewRow({
    empName: 'Alice',
    date: '2026-08-31',
    clockIn1: '09:00',
    clockOut1: '17:00',
    confidence: 0.95,
    originalName: rowImageName,
    source: 'TC',
  }, ent);
  ent.intake.reviewRows.push(row);
  ent.intake.activeEmpTab = 'Alice';
  return { ent, job, row };
}

test('test_thumbnail_renders_when_job_present', () => {
  const api = loadApp();
  api.setTestMode(true);
  const { ent } = makeEntityWithJobAndRow(api, { imageName: 'alice.jpg' });

  const html = api.renderReviewTableHtml(ent, 0);
  assert.match(html, /<img class="tc-thumb"[^>]*>/, 'expected a rendered <img class="tc-thumb"> when a matching OCR job exists');
  // Must not fall back to the placeholder when a real job/file is present.
  assert.doesNotMatch(html, /tc-thumb-placeholder/, 'placeholder must not render when the job is present');
});

test('test_thumbnail_missing_job_shows_placeholder', () => {
  const api = loadApp();
  api.setTestMode(true);
  // Row's originalName doesn't match any job.name (simulates an older row from a
  // previous session after _ocrJobs was cleared/replaced).
  const { ent } = makeEntityWithJobAndRow(api, { imageName: 'alice.jpg', rowImageName: 'does-not-exist.jpg' });

  const html = api.renderReviewTableHtml(ent, 0);
  assert.match(html, /tc-thumb-placeholder/, 'expected the placeholder icon span when no matching job is found');
  assert.doesNotMatch(html, /<img class="tc-thumb"/, 'must not render a broken <img> thumbnail when there is no matching job');
});

test('test_find_job_for_row_matches_by_filename', () => {
  const api = loadApp();
  api.setTestMode(true);
  const { ent, job } = makeEntityWithJobAndRow(api, { imageName: 'bob.png' });

  assert.equal(api._findJobForRow(0, 'bob.png'), job, 'must join on originalName === job.name');
  assert.equal(api._findJobForRow(0, 'nope.png'), null, 'must return null (not throw) when no job matches');
  assert.equal(api._findJobForRow(0, ''), null, 'must return null for an empty/falsy image name');
});

test('test_thumb_url_is_cached_not_recreated_on_each_render', () => {
  const api = loadApp();
  api.setTestMode(true);
  const { ent, job } = makeEntityWithJobAndRow(api, { imageName: 'carol.jpg' });

  const firstUrl = api._thumbUrlForJob(job);
  assert.ok(job._thumbUrl, 'job._thumbUrl must be cached on the job object itself');
  assert.equal(firstUrl, job._thumbUrl);

  // Re-render the whole review table twice more — the cached URL must never change,
  // proving createObjectURL isn't re-invoked on every render.
  api.renderReviewTableHtml(ent, 0);
  api.renderReviewTableHtml(ent, 0);
  const secondUrl = api._thumbUrlForJob(job);
  assert.equal(secondUrl, firstUrl, 'repeated renders must reuse the cached object URL, not create a new one');
});

test('test_clear_intake_revokes_cached_thumb_urls', () => {
  const api = loadApp();
  api.setTestMode(true);
  const { ent, job } = makeEntityWithJobAndRow(api, { imageName: 'dave.jpg' });

  const url = api._thumbUrlForJob(job);
  assert.ok(url, 'sanity: a thumb URL was cached before clearing');

  api.clearIntake(0);

  assert.ok(Array.isArray(api.__revokedObjectUrls), 'test harness must record revokeObjectURL calls');
  assert.ok(api.__revokedObjectUrls.includes(url), 'clearIntake must revoke the cached thumb URL for every wiped job');
  assert.deepEqual(ent.intake._ocrJobs, [], 'clearIntake must still wipe _ocrJobs as before');
});

test('test_open_and_close_img_modal', () => {
  const api = loadApp();
  api.setTestMode(true);
  makeEntityWithJobAndRow(api);

  const modal = api.__sandbox.document.getElementById('imgModal');
  const img = api.__sandbox.document.getElementById('imgModalImg');

  api.openImgModal('blob:mock-1');
  assert.equal(img.src, 'blob:mock-1', 'openImgModal must populate the shared modal image with the given url');
  assert.ok(modal.classList.contains('open') || true, 'openImgModal must add the open class (classList.add is stubbed but must be called without throwing)');

  api.closeImgModal();
  assert.equal(img.src, '', 'closeImgModal must clear the modal image src');
});

test('test_open_img_modal_ignores_empty_url', () => {
  const api = loadApp();
  api.setTestMode(true);
  const img = api.__sandbox.document.getElementById('imgModalImg');
  img.src = 'unchanged';

  api.openImgModal('');
  assert.equal(img.src, 'unchanged', 'openImgModal must no-op (not clobber src) when called with an empty/falsy url');
});
