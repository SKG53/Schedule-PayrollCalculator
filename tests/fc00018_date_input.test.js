// FC-00018: Fix date-cell input jitter/cursor kicking.
//
// The Actuals Intake review table's Date column used a native <input type="date">
// wired to onchange="updateReviewField(...)" only — a HEAVY update that mutates state
// AND calls renderIntakeTab()/refreshReviewTable() (full table re-render). Because the
// browser fires `change`/`input` events on every intermediate keystroke for some date
// entry methods, the full re-render destroyed and recreated the DOM node the user was
// actively typing into, kicking focus/cursor and losing partial input.
//
// The time fields already solved this exact class of bug with a two-tier pattern:
//   oninput  -> light update (mutate state only, no re-render) so focus is never disturbed
//   onblur   -> full commit + re-render
//
// This fix mirrors that pattern for the date field:
//   oninput           -> updateReviewFieldLight (light, no render)
//   onchange / onblur -> commitDateInput (full commit + render), de-duplicated so a
//                         native date-picker selection (which fires both change and
//                         blur) only triggers one re-render per committed value.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

function makeEntityWithReviewRow(api, rowOverrides = {}) {
  const ent = resetToSingleEntity(api, {
    id: 0,
    name: 'Date Input Co',
    employees: [{ name: 'Alice', shifts: [] }],
  });
  api.ensureIntakeState(ent);
  const row = api.processReviewRow(Object.assign({
    empName: 'Alice',
    date: '2026-08-31',
    clockIn1: '09:00',
    clockOut1: '17:00',
    confidence: 0.95,
    originalName: 'alice.jpg',
  }, rowOverrides), ent);
  ent.intake.reviewRows.push(row);
  ent.intake.activeEmpTab = 'Alice';
  return { ent, row };
}

test('test_date_field_uses_light_input_handler', () => {
  const api = loadApp();
  api.setTestMode(true);
  const { ent } = makeEntityWithReviewRow(api);

  const html = api.renderReviewTableHtml(ent, 0);
  const dateCellMatch = html.match(/<input class="date-field"[^>]*>/);
  assert.ok(dateCellMatch, 'expected a rendered date-field <input> in the review table HTML');
  const dateCellHtml = dateCellMatch[0];

  // Light path must be present (fixes the jitter) rather than relying solely on onchange.
  assert.match(dateCellHtml, /oninput="updateReviewFieldLight\(/, 'date input must use the light oninput handler, not only onchange');
  // A full-commit path must still exist so state/re-render happens once editing is done.
  assert.match(dateCellHtml, /(onchange|onblur)="commitDateInput\(/, 'date input must still commit fully on change or blur');
});

// refreshReviewTable's only externally-observable effect is overwriting the innerHTML of
// the '#reviewTable_<idx>' DOM node. Planting a sentinel string there lets these tests
// detect — without any internal mocking — whether a given update path re-rendered.
function getReviewTableNode(api, idx) {
  return api.__sandbox.document.getElementById('reviewTable_' + idx);
}

test('test_date_light_input_updates_state_without_rerender', () => {
  const api = loadApp();
  api.setTestMode(true);
  const { ent, row } = makeEntityWithReviewRow(api);

  // Sanity: render once so refreshReviewTable/activeEmpTab bookkeeping is initialized.
  api.renderReviewTableHtml(ent, 0);
  const node = getReviewTableNode(api, 0);
  node.innerHTML = 'SENTINEL';

  api.updateReviewFieldLight(row.id, 'date', '2026-09-0');
  assert.equal(row.date, '2026-09-0', 'light update must write the in-progress value onto the row immediately');
  assert.equal(node.innerHTML, 'SENTINEL', 'light update must NOT trigger a full table re-render (that is what caused the cursor-kick bug)');

  api.updateReviewFieldLight(row.id, 'date', '2026-09-05');
  assert.equal(row.date, '2026-09-05');
  assert.equal(node.innerHTML, 'SENTINEL', 'multiple light updates in a row (simulating keystrokes) must never re-render');
});

test('test_date_commit_updates_state_and_rerenders', () => {
  const api = loadApp();
  api.setTestMode(true);
  const { ent, row } = makeEntityWithReviewRow(api);
  api.renderReviewTableHtml(ent, 0);
  const node = getReviewTableNode(api, 0);
  node.innerHTML = 'SENTINEL';

  const fakeInput = { value: '2026-09-05' };
  api.commitDateInput(fakeInput, row.id, 'date');

  assert.equal(row.date, '2026-09-05', 'commit must write the final value to the row (same field/path as before the fix)');
  assert.notEqual(node.innerHTML, 'SENTINEL', 'commit must trigger a full re-render (sentinel must be overwritten)');
});

test('test_date_commit_deduped_for_native_picker_change_plus_blur', () => {
  // Assumption #3 in the brief: the native date-picker fires `change` on selection, and a
  // `blur` typically follows. Both wire to commitDateInput; this must still be exactly one
  // full commit+render for that single picked value, not two renders for one user action.
  const api = loadApp();
  api.setTestMode(true);
  const { ent, row } = makeEntityWithReviewRow(api);
  api.renderReviewTableHtml(ent, 0);
  const node = getReviewTableNode(api, 0);

  const fakeInput = { value: '2026-10-12' };
  // Picker selection: browser fires change, then blur, for the same committed value.
  api.commitDateInput(fakeInput, row.id, 'date');
  assert.equal(row.date, '2026-10-12');

  node.innerHTML = 'SENTINEL_2'; // plant after the first (expected) render
  api.commitDateInput(fakeInput, row.id, 'date');
  assert.equal(node.innerHTML, 'SENTINEL_2', 'change+blur for the same already-committed value must not re-render a second time');

  // A genuinely new value (subsequent edit) must still commit and render again.
  const fakeInput2 = { value: '2026-10-13' };
  api.commitDateInput(fakeInput2, row.id, 'date');
  assert.equal(row.date, '2026-10-13');
  assert.notEqual(node.innerHTML, 'SENTINEL_2', 'a distinct new value must still trigger its own commit + re-render');
});

test('test_date_field_flags_recomputed_on_commit_not_on_light_update', () => {
  // recomputeRowFlags (e.g. 'Outside week') only runs inside the heavy updateReviewField/
  // commitDateInput path, matching pre-existing time-field behavior — light updates must
  // not eagerly flag an in-progress, possibly-invalid partial date.
  const api = loadApp();
  api.setTestMode(true);
  const { ent, row } = makeEntityWithReviewRow(api, { date: '' });
  api.renderReviewTableHtml(ent, 0);
  assert.ok(row.flags.includes('Date missing'));

  api.updateReviewFieldLight(row.id, 'date', '2026-08-31');
  assert.equal(row.date, '2026-08-31');
  assert.ok(row.flags.includes('Date missing'), 'flags must remain stale until a full commit recomputes them');

  api.commitDateInput({ value: '2026-08-31' }, row.id, 'date');
  assert.ok(!row.flags.includes('Date missing'), 'commit must recompute flags against the final value');
});
