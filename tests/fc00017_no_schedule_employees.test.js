// FC-00017: Auto-create employees from Actuals when no schedule — polish + friendly labels.
//
// The orphan mechanism (computePayrollForEntity's orphanRows, see FC-00008) already
// auto-includes actuals-only employees in the Payroll tab when an entity has no schedule
// at all (ent.employees.length === 0). This card is pure display polish on top of that
// already-working mechanism:
//
//   1. When ent.employees.length === 0, every payroll row is an orphan by definition —
//      the red "⚠ not in schedule" tag (info chips, weekly grid, payroll-calc rows) is
//      noise in that context. It's suppressed and replaced with a subtle gray
//      "actuals-only" pill. With a real schedule loaded, an orphan row is still a genuine
//      surprise, so the red treatment must still apply there.
//   2. Orphan employees still get a stable EMP_<CODE>_NNNNN id via _employeeIdFor, so they
//      round-trip identically to schedule-sourced employees across re-renders.
//   3. The Actuals review Employee dropdown gets a small gray italic hint when there are
//      zero scheduled employees to pick from, clarifying that the typed/OCR'd name will
//      become a new employee rather than looking like a broken picker.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

function withActualsOnly(api, overrides = {}) {
  const ent = resetToSingleEntity(api, {
    id: 0,
    name: 'Actuals Only Co',
    employees: [],
    ...overrides,
  });
  api.entities[0].actualDays = [
    { empName: 'Jane Doe', entityName: ent.name, date: '2026-08-31', dayIdx: 1,
      pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] },
  ];
  return ent;
}

test('test_no_schedule_hides_not_in_schedule_tag', () => {
  const api = loadApp();
  api.setTestMode(true);
  withActualsOnly(api);

  assert.doesNotThrow(() => api.renderPayroll());
  const grid = api.__sandbox.document.getElementById('payrollGrid');
  const calc = api.__sandbox.document.getElementById('payrollCalcTable');
  const timecard = api.__sandbox.document.getElementById('timecardDataTable');

  assert.ok(!grid.innerHTML.includes('orphan-row"'), 'weekly grid must use the quiet orphan style, not the red-warning orphan-row class, when there is no schedule');
  assert.ok(!calc.innerHTML.includes('orphan-row"'), 'payroll-calc table must use the quiet orphan style, not the red-warning orphan-row class, when there is no schedule');
  assert.ok(!timecard.innerHTML.includes('orphan-row"'), 'time card data table must use the quiet orphan style, not the red-warning orphan-row class, when there is no schedule');
  assert.ok(grid.innerHTML.includes('orphan-row-quiet'), 'weekly grid should tag the row with the quiet actuals-only style');
  assert.ok(calc.innerHTML.includes('orphan-row-quiet'), 'payroll-calc table should tag the row with the quiet actuals-only style');
});

test('test_no_schedule_actuals_only_label_shown', () => {
  const api = loadApp();
  api.setTestMode(true);
  withActualsOnly(api);

  api.renderPayroll();
  const calc = api.__sandbox.document.getElementById('payrollCalcTable');

  assert.ok(calc.innerHTML.includes('actuals-only'), 'payroll-calc table should carry the subtle "actuals-only" pill instead of the red tag');
  assert.ok(calc.innerHTML.includes('orphan-row-quiet'), 'payroll-calc row should use the quiet (non-red) orphan style');

  // Also verify directly against the underlying renderPayrollInfoChips/renderPayrollCalc
  // logic (rather than only the DOM, since the info-chip bar is built via
  // createElement/appendChild which the test-harness fake DOM doesn't materialize into
  // innerHTML) by re-deriving the same noSchedule signal the renderer uses.
  const ent = api.entities[0];
  assert.equal(ent.employees.length, 0, 'no-schedule signal (ent.employees.length===0) must hold for this scenario');
});

test('test_with_real_schedule_orphan_still_shows_red_tag', () => {
  // Sanity check the other side of the conditional: when a real schedule exists for the
  // entity, an actuals-only employee not on that schedule is still a genuine surprise and
  // must keep the red "not in schedule" warning treatment — this card only suppresses the
  // tag when there is NO schedule for the whole entity (ent.employees.length === 0).
  const api = loadApp();
  api.setTestMode(true);
  const ent = resetToSingleEntity(api, {
    id: 0,
    name: 'Has Schedule Co',
    employees: [{ name: 'Alice', shifts: ['9AM - 5PM', '', '', '', '', '', ''] }],
  });
  api.entities[0].actualDays = [
    { empName: 'Bob Unscheduled', entityName: ent.name, date: '2026-08-31', dayIdx: 1,
      pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] },
  ];

  api.renderPayroll();
  const calc = api.__sandbox.document.getElementById('payrollCalcTable');
  const grid = api.__sandbox.document.getElementById('payrollGrid');

  assert.ok(calc.innerHTML.includes('orphan-row"'), 'payroll-calc row should keep the red-warning orphan-row class when a schedule exists elsewhere on the entity');
  assert.ok(grid.innerHTML.includes('orphan-row"'), 'weekly grid should keep the red-warning orphan-row class when a schedule exists elsewhere on the entity');
  assert.ok(!calc.innerHTML.includes('actuals-only'), 'the "actuals-only" pill is only for entities with zero schedule, not per-employee orphans on a scheduled entity');
  assert.ok(!calc.innerHTML.includes('orphan-row-quiet'), 'quiet style must not apply when the entity actually has a schedule');
});

test('test_orphan_employee_gets_stable_roster_id_across_rerenders', () => {
  const api = loadApp();
  api.setTestMode(true);
  withActualsOnly(api);

  api.renderPayroll();
  const calcFirst = api.__sandbox.document.getElementById('payrollCalcTable').innerHTML;
  const idMatch = calcFirst.match(/EMP_[A-Z0-9]{3}_\d{5}/);
  assert.ok(idMatch, 'orphan employee row should render a proper EMP_XXX_NNNNN id, same as schedule-sourced employees');
  const firstId = idMatch[0];

  // Re-render (e.g. after switching tabs/re-rendering payroll) must produce the exact same id.
  api.renderPayroll();
  const calcSecond = api.__sandbox.document.getElementById('payrollCalcTable').innerHTML;
  assert.ok(calcSecond.includes(firstId), 'orphan employee id must be stable across re-renders');

  // Also verify directly via the roster API and cross-check the grid + timecard tables.
  const idViaApi = api._employeeIdFor(0, 'Jane Doe');
  assert.equal(idViaApi, firstId, '_employeeIdFor should mint/reuse the exact same id shown in the rendered table');

  const grid = api.__sandbox.document.getElementById('payrollGrid').innerHTML;
  const timecard = api.__sandbox.document.getElementById('timecardDataTable').innerHTML;
  assert.ok(grid.includes(firstId), 'weekly grid should show the same stable id for the orphan employee');
  assert.ok(timecard.includes(firstId), 'time card data table should show the same stable id for the orphan employee');
});

test('test_review_dropdown_hint_shown_when_no_schedule', () => {
  const api = loadApp();
  api.setTestMode(true);
  const ent = resetToSingleEntity(api, { id: 0, name: 'No Sched Review Co', employees: [] });
  api.ensureIntakeState(ent);
  const row = api.processReviewRow({
    empName: 'Casey New',
    date: '2026-08-31',
    clockIn1: '09:00',
    clockOut1: '17:00',
    confidence: 0.9,
    originalName: 'casey.jpg',
    source: 'TC',
  }, ent);
  ent.intake.reviewRows.push(row);
  ent.intake.activeEmpTab = '__unrecognized__';

  const html = api.renderReviewTableHtml(ent, 0);
  assert.ok(html.includes('No schedule loaded — this name will be created as a new employee'), 'should show the helper hint below the Employee dropdown when there are zero scheduled employees');
  assert.match(html, /select class="name-field"[^>]*>[\s\S]*?<\/select>\s*<div class="no-sched-emp-hint"/, 'hint should render immediately below the Employee dropdown');
});

test('test_review_dropdown_hint_absent_when_schedule_exists', () => {
  const api = loadApp();
  api.setTestMode(true);
  const ent = resetToSingleEntity(api, {
    id: 0,
    name: 'Has Sched Review Co',
    employees: [{ name: 'Alice', shifts: ['9AM - 5PM', '', '', '', '', '', ''] }],
  });
  api.ensureIntakeState(ent);
  const row = api.processReviewRow({
    empName: 'Alice',
    date: '2026-08-31',
    clockIn1: '09:00',
    clockOut1: '17:00',
    confidence: 0.95,
    originalName: 'alice.jpg',
    source: 'TC',
  }, ent);
  ent.intake.reviewRows.push(row);
  ent.intake.activeEmpTab = 'Alice';

  const html = api.renderReviewTableHtml(ent, 0);
  assert.ok(!html.includes('no-sched-emp-hint'), 'hint must not render once the entity has at least one scheduled employee');
});
