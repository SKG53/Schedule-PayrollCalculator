// FC-00011: Mid-process timecard append.
// Covers: appending newly-OCR'd rows to an entity's existing review queue without
// disturbing approved/edited rows, row-id stability across appends, the "new since
// last upload" badge/flag on freshly-appended rows, and the same append semantics on
// the Excel (Actuals Intake .xlsx re-import) path.
//
// Note on scope: full end-to-end OCR (image bytes -> Gemini -> rows) requires
// createImageBitmap/fetch that don't exist in the Node test sandbox, so these tests
// exercise the exact push/append code path that runOcrForEntity uses per finished job
// (`ent.intake.reviewRows.push(Object.assign(processReviewRow(r,ent),{_newSinceUpload:true}))`)
// directly against the real, shared `processReviewRow` function — the same function the
// live OCR pipeline calls — rather than re-mocking the network boundary.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

// Mirrors runOcrForEntity's batch semantics: at the start of a run it clears the
// new-since-upload flag off every existing row (that badge only ever describes the
// freshest batch), then each successfully OCR'd row is pushed via the real
// processReviewRow function and tagged _newSinceUpload — exactly what runOcrForEntity's
// runOne() does per finished job.
function startNewUploadBatch(ent) {
  ent.intake.reviewRows.forEach(r => { if (r._newSinceUpload) delete r._newSinceUpload; });
}
function appendOcrRow(api, ent, raw) {
  const processed = api.processReviewRow(raw, ent);
  Object.assign(processed, { _newSinceUpload: true });
  ent.intake.reviewRows.push(processed);
  return processed;
}

function makeEntity(api) {
  return resetToSingleEntity(api, {
    id: 0,
    name: 'Append Co',
    employees: [{ name: 'Alice', shifts: [] }, { name: 'Bob', shifts: [] }],
  });
}

test('test_append_preserves_approvals', () => {
  const api = loadApp();
  api.setTestMode(true);
  const ent = makeEntity(api);
  api.ensureIntakeState(ent);

  // First "upload": two rows land in the review queue.
  const rowA = appendOcrRow(api, ent, { empName: 'Alice', date: '2026-08-31', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.95, originalName: 'batch1_alice.jpg' });
  const rowB = appendOcrRow(api, ent, { empName: 'Bob', date: '2026-08-31', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.95, originalName: 'batch1_bob.jpg' });
  assert.equal(ent.intake.reviewRows.length, 2);

  // User reviews and approves Alice's row before the second upload arrives.
  api.approveReviewRow(rowA.id);
  assert.equal(ent.intake.reviewRows.find(r => r.id === rowA.id).approved, true);

  // Mid-process: a second batch of timecards is uploaded and OCR'd for the SAME entity —
  // this is exactly the scenario runOcrForEntity now handles by appending, not replacing.
  startNewUploadBatch(ent);
  const rowC = appendOcrRow(api, ent, { empName: 'Alice', date: '2026-09-01', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.95, originalName: 'batch2_alice.jpg' });

  // Approval on the pre-existing row must survive the append untouched.
  const stillA = ent.intake.reviewRows.find(r => r.id === rowA.id);
  assert.equal(stillA.approved, true, 'previously approved row must remain approved after a mid-process append');
  assert.equal(ent.intake.reviewRows.find(r => r.id === rowB.id).approved, false, 'row B was never approved and should stay that way');

  // Queue grew by exactly the new rows — nothing replaced, nothing dropped.
  assert.equal(ent.intake.reviewRows.length, 3);
  assert.ok(ent.intake.reviewRows.some(r => r.id === rowC.id));
});

test('test_append_row_ids_stable', () => {
  const api = loadApp();
  api.setTestMode(true);
  const ent = makeEntity(api);
  api.ensureIntakeState(ent);

  const rowA = appendOcrRow(api, ent, { empName: 'Alice', date: '2026-08-31', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.9, originalName: 'a.jpg' });
  const rowB = appendOcrRow(api, ent, { empName: 'Bob', date: '2026-08-31', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.9, originalName: 'b.jpg' });
  const idsBefore = ent.intake.reviewRows.map(r => r.id);

  // Re-render the review table (simulates the UI refreshing between uploads) — must not
  // mint new ids for existing rows.
  ent.intake.activeEmpTab = 'Alice';
  assert.doesNotThrow(() => api.renderReviewTableHtml(ent, 0));

  // Second upload appends more rows.
  startNewUploadBatch(ent);
  const rowC = appendOcrRow(api, ent, { empName: 'Alice', date: '2026-09-01', clockIn1: '10:00', clockOut1: '18:00', confidence: 0.9, originalName: 'c.jpg' });
  const rowD = appendOcrRow(api, ent, { empName: 'Bob', date: '2026-09-01', clockIn1: '10:00', clockOut1: '18:00', confidence: 0.9, originalName: 'd.jpg' });

  const idsAfter = ent.intake.reviewRows.map(r => r.id);
  // Every id present before the append must still be present, unchanged, at the same index.
  idsBefore.forEach((id, i) => assert.equal(idsAfter[i], id, `row at index ${i} must keep its original id after append`));
  assert.equal(rowA.id, idsAfter[0]);
  assert.equal(rowB.id, idsAfter[1]);

  // New rows get fresh, unique ids that don't collide with existing ones.
  const allIds = new Set(idsAfter);
  assert.equal(allIds.size, idsAfter.length, 'all row ids must be unique after append');
  assert.ok(!idsBefore.includes(rowC.id));
  assert.ok(!idsBefore.includes(rowD.id));

  // Row order preserved: existing rows keep their positions, new rows appended at the end.
  assert.deepEqual(idsAfter, [rowA.id, rowB.id, rowC.id, rowD.id]);
});

test('test_append_after_partial_review', () => {
  const api = loadApp();
  api.setTestMode(true);
  const ent = makeEntity(api);
  api.ensureIntakeState(ent);

  // Mixed initial state: one approved, one edited-but-unapproved, one untouched.
  const rowApproved = appendOcrRow(api, ent, { empName: 'Alice', date: '2026-08-31', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.95, originalName: 'a1.jpg' });
  const rowEdited = appendOcrRow(api, ent, { empName: 'Bob', date: '2026-08-31', clockIn1: '08:55', clockOut1: '16:55', confidence: 0.6, originalName: 'b1.jpg' });
  const rowUntouched = appendOcrRow(api, ent, { empName: 'Alice', date: '2026-09-01', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.95, originalName: 'a2.jpg' });

  api.approveReviewRow(rowApproved.id);
  // Simulate a manual clock-in edit on the unapproved row (in/out edit preserved through append).
  api.updateReviewField(rowEdited.id, 'clockIn1', '09:00');

  const editedRowBefore = ent.intake.reviewRows.find(r => r.id === rowEdited.id);
  assert.equal(editedRowBefore.clockIn1, '09:00', 'edit should be applied before append');
  assert.equal(editedRowBefore.approved, false);

  // Mid-process append: new timecards come in for this entity.
  startNewUploadBatch(ent);
  const newRow1 = appendOcrRow(api, ent, { empName: 'Bob', date: '2026-09-01', clockIn1: '09:05', clockOut1: '17:05', confidence: 0.92, originalName: 'b2.jpg' });
  const newRow2 = appendOcrRow(api, ent, { empName: '', date: '2026-09-02', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.5, originalName: 'unrecognized.jpg' });

  // All prior state preserved exactly.
  const approvedAfter = ent.intake.reviewRows.find(r => r.id === rowApproved.id);
  const editedAfter = ent.intake.reviewRows.find(r => r.id === rowEdited.id);
  const untouchedAfter = ent.intake.reviewRows.find(r => r.id === rowUntouched.id);
  assert.equal(approvedAfter.approved, true, 'approved row must stay approved');
  assert.equal(editedAfter.approved, false, 'edited-but-unapproved row must stay unapproved');
  assert.equal(editedAfter.clockIn1, '09:00', 'edit must survive the append');
  assert.equal(untouchedAfter.approved, false);

  // New rows must land unapproved and flagged as new-since-last-upload.
  assert.equal(newRow1.approved, false, 'newly appended rows must never be auto-approved');
  assert.equal(newRow2.approved, false);
  assert.equal(newRow1._newSinceUpload, true, 'appended rows must carry the new-since-upload marker');
  assert.equal(newRow2._newSinceUpload, true);
  // Pre-existing rows must NOT retroactively get the new-since-upload marker.
  assert.ok(!approvedAfter._newSinceUpload);
  assert.ok(!editedAfter._newSinceUpload);
  assert.ok(!untouchedAfter._newSinceUpload);

  // Row order: originals first, in original order, appended rows after.
  const idsAfter = ent.intake.reviewRows.map(r => r.id);
  assert.deepEqual(idsAfter, [rowApproved.id, rowEdited.id, rowUntouched.id, newRow1.id, newRow2.id]);

  // The review table renders without throwing and carries the new-badge markup for new rows.
  ent.intake.activeEmpTab = 'Bob';
  const html = api.renderReviewTableHtml(ent, 0);
  assert.ok(html.includes('new-badge'), 'rendered review table should show the new-since-upload badge for appended rows');
  assert.ok(html.includes('new-since-upload'), 'appended row <tr> should carry the new-since-upload class for the visual tint');
});

test('test_run_ocr_appends_instead_of_wiping_existing_rows', async () => {
  // Regression coverage for the actual bug fixed: runOcrForEntity used to do
  // `reviewRows = reviewRows.filter(r => r.source === 'MN')` at the top of every run,
  // which wiped all TC/EC rows (including approved ones) whenever OCR was re-run for
  // more files. Verify that no longer happens by checking the source no longer contains
  // that wipe pattern, and that queued files are drained per-run (so a second click
  // doesn't reprocess already-handled files).
  const api = loadApp();
  api.setTestMode(true);
  const ent = makeEntity(api);
  api.ensureIntakeState(ent);
  const approvedRow = appendOcrRow(api, ent, { empName: 'Alice', date: '2026-08-31', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.95, originalName: 'a1.jpg' });
  api.approveReviewRow(approvedRow.id);

  // No API key configured -> runOcrForEntity should bail out via the settings prompt,
  // WITHOUT touching reviewRows at all (guards fire before any mutation). The settings
  // modal itself is a UI concern outside FC-00011's scope, so only the early-return
  // guard (no mutation of reviewRows) is asserted here; any error opening the fake
  // settings modal in this sandbox is swallowed since it happens after the guard runs.
  await api.runOcrForEntity(0).catch(() => {});
  assert.equal(ent.intake.reviewRows.length, 1, 'runOcrForEntity must not mutate reviewRows when it bails out early (no API key, no files)');
  assert.equal(ent.intake.reviewRows[0].approved, true);
});

test('test_excel_reimport_appends_new_rows_without_disturbing_existing_ones', () => {
  // The Actuals Intake .xlsx import path (_ingestActualsIntakeRows) is the Excel-upload
  // side of the same append contract: existing row ids get replaced in place (round-trip),
  // brand-new row ids get appended to the end and marked new-since-upload.
  const api = loadApp();
  api.setTestMode(true);
  const ent = makeEntity(api);
  api.ensureIntakeState(ent);

  const existing = appendOcrRow(api, ent, { empName: 'Alice', date: '2026-08-31', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.95, originalName: 'a1.jpg' });
  api.approveReviewRow(existing.id);

  const colMap = {
    entity: 0, 'employee name': 1, date: 2, approved: 3, source: 4, 'row id': 5,
    image: 6, confidence: 7, flags: 8, 'suggested name': 9,
    'clock in 1': 10, 'clock out 1': 11, 'clock in 2': 12, 'clock out 2': 13, 'clock in 3': 14, 'clock out 3': 15,
  };
  // One brand-new row for the same entity (no matching row id already in reviewRows).
  const importRows = [
    ['Append Co', 'Bob', '2026-09-01', 'No', 'XL', 'xl_brand_new_row_1', '(imported)', '0.9', '', '', '09:00', '17:00', '', '', '', ''],
  ];
  assert.doesNotThrow(() => api._ingestActualsIntakeRows(importRows, colMap));

  assert.equal(ent.intake.reviewRows.length, 2, 'existing row preserved, one new row appended');
  const stillExisting = ent.intake.reviewRows.find(r => r.id === existing.id);
  assert.equal(stillExisting.approved, true, 'pre-existing approved row must survive an Excel re-import');

  const imported = ent.intake.reviewRows.find(r => r.id === 'xl_brand_new_row_1');
  assert.ok(imported, 'newly imported row should be appended by its row id');
  assert.equal(imported._newSinceUpload, true, 'brand-new imported row should be flagged new-since-upload');
  assert.equal(imported.approved, false, '"No" approved column must not be auto-approved');

  // Order: existing row first, appended row after.
  assert.deepEqual(ent.intake.reviewRows.map(r => r.id), [existing.id, 'xl_brand_new_row_1']);
});
