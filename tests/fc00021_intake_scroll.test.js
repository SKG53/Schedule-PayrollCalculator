// FC-00021: Intake "snap-left" fix.
//
// Committing a cell in the Actuals Intake review table (time blur, date change/blur,
// employee select) goes through updateReviewField -> refreshReviewTable, which rebuilds
// '#reviewTable_<idx>' via innerHTML. That replaces the '.review-wrap' scroll container,
// so its scrollLeft/scrollTop reset to 0 and the table jumps left. The fix captures both
// offsets before the rebuild (refreshReviewTable and renderIntake) and restores them on
// the new container immediately after.
//
// The fake DOM in load-app.js has no real layout, so these tests plant a '.review-wrap'
// stand-in on '#reviewTable_0' and swap in a fresh (scroll 0,0) one whenever the table's
// innerHTML is rebuilt — exactly what a real browser does.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, resetToSingleEntity } = require('./load-app');

function setup() {
  const api = loadApp();
  api.setTestMode(true);
  const ent = resetToSingleEntity(api, {
    id: 0,
    name: 'Scroll Co',
    employees: [{ name: 'Alice', shifts: [] }, { name: 'Bob', shifts: [] }],
  });
  api.ensureIntakeState(ent);
  const row = api.processReviewRow({
    empName: 'Alice',
    date: '2026-08-31',
    clockIn1: '09:00',
    clockOut1: '17:00',
    confidence: 0.95,
    originalName: 'alice.jpg',
  }, ent);
  ent.intake.reviewRows.push(row);
  ent.intake.activeEmpTab = 'Alice';

  const doc = api.__sandbox.document;
  const table = doc.getElementById('reviewTable_0');
  const state = { wrap: { scrollLeft: 0, scrollTop: 0 }, rebuilds: 0 };
  const rebuild = () => { state.wrap = { scrollLeft: 0, scrollTop: 0 }; state.rebuilds++; };
  let tableHtml = '';
  Object.defineProperty(table, 'innerHTML', {
    get: () => tableHtml,
    set: (v) => { tableHtml = v; rebuild(); },
    configurable: true,
  });
  table.querySelector = (sel) => (sel === '.review-wrap' ? state.wrap : null);
  // renderIntake rebuilds the whole intake container, which (in a browser) also replaces
  // the review table's scroll container.
  const container = doc.getElementById('intakeContent');
  let containerHtml = '';
  Object.defineProperty(container, 'innerHTML', {
    get: () => containerHtml,
    set: (v) => { containerHtml = v; rebuild(); },
    configurable: true,
  });
  return { api, ent, row, state };
}

function scrollTo(state, left, top) {
  state.wrap.scrollLeft = left;
  state.wrap.scrollTop = top;
}

test('test_refresh_review_table_preserves_wrap_scroll', () => {
  const { api, state } = setup();
  scrollTo(state, 640, 120);
  api.refreshReviewTable(0);
  assert.equal(state.rebuilds, 1, 'table should actually have been rebuilt');
  assert.equal(state.wrap.scrollLeft, 640);
  assert.equal(state.wrap.scrollTop, 120);
});

test('test_time_commit_does_not_move_table', () => {
  const { api, row, state } = setup();
  scrollTo(state, 500, 30);
  api.commitTimeInput({ value: '930' }, row.id, 'clockIn1');
  assert.equal(row.clockIn1, '09:30');
  assert.deepEqual({ l: state.wrap.scrollLeft, t: state.wrap.scrollTop }, { l: 500, t: 30 });
});

test('test_date_commit_does_not_move_table', () => {
  const { api, row, state } = setup();
  scrollTo(state, 410, 0);
  api.commitDateInput({ value: '2026-09-01' }, row.id, 'date');
  assert.equal(row.date, '2026-09-01');
  assert.deepEqual({ l: state.wrap.scrollLeft, t: state.wrap.scrollTop }, { l: 410, t: 0 });
});

test('test_name_commit_does_not_move_table', () => {
  const { api, row, state } = setup();
  scrollTo(state, 275, 15);
  api.updateReviewField(row.id, 'empName', 'Bob');
  assert.equal(row.empName, 'Bob');
  assert.deepEqual({ l: state.wrap.scrollLeft, t: state.wrap.scrollTop }, { l: 275, t: 15 });
});

test('test_render_intake_preserves_wrap_scroll', () => {
  const { api, state } = setup();
  scrollTo(state, 333, 44);
  api.renderIntake();
  assert.ok(state.rebuilds >= 1, 'renderIntake should rebuild the container');
  assert.deepEqual({ l: state.wrap.scrollLeft, t: state.wrap.scrollTop }, { l: 333, t: 44 });
});

test('test_scroll_into_view_only_on_new_row_and_inline_nearest', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const calls = html.match(/scrollIntoView\([^)]*\)/g) || [];
  assert.ok(calls.length > 0);
  calls.forEach(c => assert.match(c, /inline:'nearest'/, 'every scrollIntoView must use inline:nearest: ' + c));
  // Ordinary cell-commit paths must never scroll anything into view.
  const src = (name) => {
    const start = html.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name + ' not found');
    const end = html.indexOf('\nfunction ', start + 1);
    return html.slice(start, end);
  };
  ['updateReviewField', 'updateReviewFieldLight', 'commitTimeInput', 'commitDateInput', 'refreshReviewTable', 'renderIntake']
    .forEach(fn => assert.doesNotMatch(src(fn), /scrollIntoView/, fn + ' must not call scrollIntoView'));
});
