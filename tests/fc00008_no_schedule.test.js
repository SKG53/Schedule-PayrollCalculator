// FC-00008: Decouple schedule as prerequisite.
// Covers: tab navigation without a schedule (entity name still required), payroll running
// on actuals alone (orphan rows, no scheduled employees), the "Coverage warnings require an
// uploaded schedule." placeholder, the Avg In/Out Diff "—" placeholder + tooltip, OCR name
// matching falling back to roster+alias+fuzzy with an empty schedule, and a schedule added
// later merging in without breaking existing actuals/payroll state.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

test('test_payroll_flow_without_schedule', () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'No Schedule Co', employees: [] });

  // No schedule uploaded (employees stays empty) — add actual days directly, the way
  // OCR-approved rows or an imported Actuals Intake .xlsx would.
  api.entities[0].actualDays = [
    { empName: 'Jane Doe', entityName: 'No Schedule Co', date: '2026-08-31', dayIdx: 1,
      pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] },
    { empName: 'Jane Doe', entityName: 'No Schedule Co', date: '2026-09-01', dayIdx: 2,
      pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] },
  ];

  const { results, orphanRows } = api.computePayrollForEntity(0);

  // No scheduled employees at all, so `results` (schedule-driven rows) must be empty.
  assert.equal(results.length, 0, 'no scheduled employees means no schedule-driven result rows');
  // The actual clock-ins surface as orphan rows — payroll runs on actuals alone.
  assert.equal(orphanRows.length, 1);
  const row = orphanRows[0];
  assert.equal(row.name, 'Jane Doe');
  assert.equal(row.isOrphan, true);
  assert.equal(row.actualHours, 16, 'two 8h days');
  assert.ok(row.pay >= 0, 'pay should compute to a valid non-negative number');
  assert.equal(row.scheduledHours, 0, 'nothing was ever scheduled');

  // Setting a wage and confirming a normal payroll breakdown works end-to-end for the
  // schedule-less employee, same as it would for a scheduled one.
  api.dispatch({
    type: 'wage', screen: 'payroll',
    target: { kind: 'employee', entity: 0, id: api.wKey(0, 'Jane Doe'), field: 'wage' },
    from: undefined, to: 20, meta: { empName: 'Jane Doe' },
  });
  const { orphanRows: withWage } = api.computePayrollForEntity(0);
  assert.equal(withWage[0].wage, 20);
  assert.equal(withWage[0].pay, 16 * 20);

  // Full render pipeline (Payroll tab) must not throw and must actually surface the
  // schedule-less employee in the rendered tables.
  assert.doesNotThrow(() => api.renderPayroll());
  const grid = api.__sandbox.document.getElementById('payrollGrid');
  const timecard = api.__sandbox.document.getElementById('timecardDataTable');
  const calc = api.__sandbox.document.getElementById('payrollCalcTable');
  assert.ok(grid.innerHTML.includes('Jane Doe'), 'weekly grid should show the orphan employee');
  assert.ok(timecard.innerHTML.includes('Jane Doe'), 'time card data should show the orphan employee');
  assert.ok(calc.innerHTML.includes('Jane Doe'), 'payroll calc should show the orphan employee');
  assert.ok(grid.innerHTML.includes('no schedule'), 'weekly diff cell should say "no schedule" for orphan rows');
});

test('test_coverage_placeholder_when_no_schedule', () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Placeholder Co', employees: [] });

  // renderTable drives renderFlags for the active entity (Schedule tab "Issues & Flags").
  assert.doesNotThrow(() => api.renderTable(0));
  const flagsBar = api.__sandbox.document.getElementById('flagsBar');
  assert.equal(
    flagsBar.innerHTML,
    '<span class="flag flag-amber">Coverage warnings require an uploaded schedule.</span>',
    'coverage warnings must show the required placeholder text with no schedule loaded'
  );

  // Once a schedule exists, normal flag logic should resume (no leftover placeholder).
  api.entities[0].employees = [{ name: 'Alice', shifts: ['9AM - 5PM', '9AM - 5PM', '9AM - 5PM', '9AM - 5PM', '9AM - 5PM', 'OFF', 'OFF'] }];
  api.renderTable(0);
  const flagsBarAfter = api.__sandbox.document.getElementById('flagsBar');
  assert.ok(!flagsBarAfter.innerHTML.includes('require an uploaded schedule'), 'placeholder should disappear once a schedule is loaded');
});

test('test_tabs_reachable_without_schedule_but_entity_name_still_required', () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: '', employees: [] });

  // Entity name gate: cannot leave the Schedules tab while unnamed, schedule or no schedule.
  let alerted = false;
  api.__sandbox.alert = () => { alerted = true; };
  api.setTab('intake');
  assert.equal(alerted, true, 'should alert when entity is unnamed');
  assert.equal(api.getCurrentTab(), 'schedule', 'tab switch should be blocked while unnamed');

  // Naming the entity (still zero schedule) unblocks both Tab 2 and Tab 3.
  alerted = false;
  api.entities[0].name = 'Named Co';
  api.setTab('intake');
  assert.equal(alerted, false);
  assert.equal(api.getCurrentTab(), 'intake', 'Actuals Intake should be reachable with zero schedule once named');

  api.setTab('payroll');
  assert.equal(api.getCurrentTab(), 'payroll', 'Payroll should be reachable with zero schedule once named');

  // Intake tab must render actionable content (not the old hard block) for a named,
  // schedule-less entity.
  api.setTab('intake');
  const intakeContent = api.__sandbox.document.getElementById('intakeContent');
  assert.ok(intakeContent.innerHTML.includes('intake-entity-block'), 'intake should render an entity block, not a hard "load a schedule" wall');
  assert.ok(!intakeContent.innerHTML.includes('go to the Schedules tab first'), 'no dead-end message blocking intake for schedule-less entities');
});

test('test_avg_in_out_diff_placeholder_for_orphan_rows', () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Metrics Co', employees: [] });
  api.entities[0].actualDays = [
    { empName: 'Sam Orphan', entityName: 'Metrics Co', date: '2026-08-31', dayIdx: 1,
      pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] },
  ];
  const { orphanRows } = api.computePayrollForEntity(0);
  assert.equal(orphanRows[0].avgInDiff, null, 'orphan rows have no schedule to diff against');
  assert.equal(orphanRows[0].avgOutDiff, null);

  api.renderPayroll();
  const timecard = api.__sandbox.document.getElementById('timecardDataTable');
  // metricStr(null) renders as an em dash placeholder in the Avg In/Out Diff cells.
  assert.ok(timecard.innerHTML.includes('>—<'), 'Avg In/Out Diff cells should render the — placeholder for orphan rows');
  assert.ok(timecard.innerHTML.includes('Requires schedule for comparison.'), 'Avg In/Out Diff column header should carry the required tooltip');
});

test('test_ocr_name_matching_falls_back_without_schedule', () => {
  const api = loadApp();
  api.setTestMode(true);
  const ent = resetToSingleEntity(api, { id: 0, name: 'Match Co', employees: [] });

  // No schedule names to match against — matchEmployeeName must not throw and must
  // return no match rather than erroring on an empty schedule list.
  assert.doesNotThrow(() => api.matchEmployeeName('Random Name', ent));
  assert.deepEqual(api.matchEmployeeName('Random Name', ent), {});

  // Alias fallback still works purely off the roster (keyed by entity id), independent
  // of any scheduled employees.
  api.ensureRosterRecord(0, 'Robert Johnson');
  const aliasResult = api.setAliases(0, 'Robert Johnson', ['Bobby J']);
  assert.deepEqual(aliasResult.rejected, []);
  const resolved = api.resolveAlias(0, 'Bobby J');
  assert.equal(resolved, 'Robert Johnson', 'alias should resolve to canonical name with zero schedule employees');
});

test('test_schedule_added_later_merges_without_breaking_existing_actuals', () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Late Schedule Co', employees: [] });

  // Actuals arrive first, with no schedule at all.
  api.entities[0].actualDays = [
    { empName: 'Casey Lee', entityName: 'Late Schedule Co', date: '2026-08-31', dayIdx: 1,
      pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] },
  ];
  let calc = api.computePayrollForEntity(0);
  assert.equal(calc.orphanRows.length, 1);
  assert.equal(calc.orphanRows[0].name, 'Casey Lee');

  // Wage set while schedule-less should survive the schedule being added later.
  api.dispatch({
    type: 'wage', screen: 'payroll',
    target: { kind: 'employee', entity: 0, id: api.wKey(0, 'Casey Lee'), field: 'wage' },
    from: undefined, to: 18, meta: { empName: 'Casey Lee' },
  });

  // A schedule is uploaded afterward for the same employee.
  api.entities[0].employees = [{ name: 'Casey Lee', shifts: ['9AM - 5PM', '', '', '', '', '', ''] }];
  calc = api.computePayrollForEntity(0);

  // Now matched against the schedule — no longer an orphan, and the actuals + wage carry over.
  assert.equal(calc.orphanRows.length, 0, 'once scheduled, the same actuals should match instead of orphaning');
  assert.equal(calc.results.length, 1);
  assert.equal(calc.results[0].name, 'Casey Lee');
  assert.equal(calc.results[0].actualHours, 8);
  assert.equal(calc.results[0].wage, 18, 'wage set before the schedule existed must be preserved');
  assert.equal(calc.results[0].pay, 8 * 18);

  assert.doesNotThrow(() => api.renderPayroll());
});
