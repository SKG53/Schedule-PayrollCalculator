// FC-00022: Rename persists everywhere and keeps the employee ID.
//
// The rosterRename reducer relabelled the roster record, but employee names are also stored
// by value outside the roster — schedule rows, intake review rows, loaded actuals. Those kept
// the old name, so the next wKey(entId, oldName) lookup missed keyToId and
// ensureRosterRecord minted a NEW id for an empty record: the rename appeared not to stick
// and the employee's id (and wage / method / deposit / notes) was lost on screen.
//
// These tests rename from each page's entry point and assert: same id, name updated
// everywhere, no new record minted, pay data intact, and the settings-file round-trip
// carries the new name on the same id.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

const WEEK = ['Aug 9 2026', 'Aug 10 2026', 'Aug 11 2026', 'Aug 12 2026', 'Aug 13 2026', 'Aug 14 2026', 'Aug 15 2026'];
const SHIFTS = ['OFF', '9AM - 5PM', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'];
const OLD = 'Bob Smith';
const NEW = 'Robert Smith';

function setup() {
  const api = loadApp();
  api.setTestMode(true);
  const ent = resetToSingleEntity(api, {
    id: 0,
    name: 'Test Zion',
    employees: [{ name: OLD, shifts: SHIFTS.slice() }, { name: 'Flo Flat', shifts: SHIFTS.slice() }],
    dateLabels: WEEK,
    breakMinutesSet: true,
    actualDays: [
      { empName: OLD, entityName: 'Test Zion', date: '2026-08-10', dayIdx: 1, pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] },
    ],
  });
  api._syncEntityCode(ent);
  api.ensureIntakeState(ent);
  const row = api.processReviewRow({
    empName: OLD, date: '2026-08-10', clockIn1: '09:00', clockOut1: '17:00', confidence: 0.95, originalName: 'x.jpg',
  }, ent);
  ent.intake.reviewRows.push(row);
  ent.intake.activeEmpTab = OLD;

  const id = api.wKey(0, OLD);
  api.dispatch({ type: 'wage', screen: 'payroll', target: { kind: 'employee', entity: 0, id, field: 'rate' }, from: null, to: 17.5, meta: { empName: OLD } });
  api.setPayMethod(0, OLD, 'both');
  api.setSplitDeposit(0, OLD, 100, { typed: true, isWhole: true });
  api.setAliases(0, OLD, ['Bobby S']);
  api.setRosterNotes(0, OLD, 'test note');
  api.setBreakOverride(0, OLD, 1, 20);

  const flatId = api.wKey(0, 'Flo Flat');
  api.dispatch({ type: 'flatWage', screen: 'payroll', target: { kind: 'employee', entity: 0, id: flatId, field: 'flat' }, from: null, to: 500, meta: { empName: 'Flo Flat' } });

  return { api, ent, row, id, flatId, recordCount: Object.keys(api.session.roster.byId).length };
}

function assertRenamed(ctx, label) {
  const { api, ent, row, id, recordCount } = ctx;
  const msg = (m) => `[${label}] ${m}`;
  // Identity
  assert.equal(api.wKey(0, NEW), id, msg('new name must resolve to the same id'));
  assert.equal(api.getRosterRecord(0, NEW).canonical_name, NEW, msg('record carries the new name'));
  // A stale reference to the old name resolves to the same record, never a fresh one.
  assert.equal(api.wKey(0, OLD), id, msg('old name must not mint a new id'));
  assert.equal(api.getRosterRecord(0, NEW).canonical_name, NEW, msg('old-name lookup must not rename the record back'));
  assert.equal(Object.keys(api.session.roster.byId).length, recordCount, msg('no new roster record minted'));
  // Name updated everywhere it is stored by value
  assert.equal(ent.employees[0].name, NEW, msg('schedule row'));
  assert.equal(row.empName, NEW, msg('intake review row'));
  assert.equal(ent.intake.activeEmpTab, NEW, msg('intake active sub-tab'));
  assert.equal(ent.actualDays[0].empName, NEW, msg('loaded actuals'));
  // Pay data intact
  assert.equal(api.wageRates[id], 17.5, msg('wage'));
  assert.equal(api.getPayMethod(0, NEW), 'both', msg('pay method'));
  assert.equal(api.getSplitDeposit(0, NEW), 100, msg('deposit'));
  assert.ok(api.getAliases(0, NEW).includes('Bobby S'), msg('aliases carried over'));
  assert.ok(api.getAliases(0, NEW).includes(OLD), msg('old name kept as alias'));
  assert.equal(api.getRosterNotes(0, NEW), 'test note', msg('notes'));
  assert.equal(api.getBreakOverride(0, NEW, 1), 20, msg('break override'));
  // Payroll computation sees one employee under the new name, with the worked hours.
  const res = api.computePayrollForEntity(0).results;
  const names = res.map(r => r.name);
  assert.ok(names.includes(NEW), msg('payroll shows the new name'));
  assert.ok(!names.includes(OLD), msg('payroll no longer shows the old name'));
  const bob = res.find(r => r.name === NEW);
  assert.equal(bob.isOrphan, false, msg('not an orphan'));
  assert.ok(bob.days[1].workedH > 0, msg('worked hours still attached'));
}

test('test_rename_from_payroll_inline', () => {
  const ctx = setup();
  assert.equal(ctx.api.renameEmployeeViaDispatcher(0, OLD, NEW, 'payroll'), true);
  ctx.api.renderPayroll();
  assertRenamed(ctx, 'payroll');
});

test('test_rename_from_roster_button', () => {
  const ctx = setup();
  ctx.api.__sandbox.prompt = () => NEW;
  assert.equal(ctx.api.openRenameEmployeeModal(0, OLD), true);
  assertRenamed(ctx, 'roster');
});

test('test_rename_from_actuals_intake', () => {
  const ctx = setup();
  // The intake per-employee bar exposes the shared click-to-edit rename control.
  const html = ctx.api.renderReviewTableHtml(ctx.ent, 0);
  assert.match(html, /class="editable-name"[^>]*data-screen="intake"/, 'intake must offer inline rename');
  assert.equal(ctx.api.renameEmployeeViaDispatcher(0, OLD, NEW, 'intake'), true);
  ctx.api.renderIntake();
  assertRenamed(ctx, 'intake');
});

test('test_rename_from_schedules_table', () => {
  const ctx = setup();
  const doc = ctx.api.__sandbox.document;
  doc.getElementById('schedWrap').style.display = '';
  const fakeRow = (idx, name) => ({
    dataset: { empIdx: String(idx) },
    querySelector: (sel) => (sel === '.name-input' ? { value: name }
      : /data-day="(\d)"/.test(sel) ? { value: SHIFTS[+sel.match(/data-day="(\d)"/)[1]] } : null),
  });
  doc.getElementById('schedTable').querySelectorAll = () => [fakeRow(0, NEW), fakeRow(1, 'Flo Flat')];
  ctx.api.readTableState();
  assertRenamed(ctx, 'schedules');
});

test('test_rename_survives_rerender_and_tab_switch', () => {
  const ctx = setup();
  ctx.api.renameEmployeeViaDispatcher(0, OLD, NEW, 'payroll');
  ['intake', 'payroll', 'schedule', 'payroll'].forEach(t => ctx.api.setTab(t));
  ctx.api.renderIntake();
  ctx.api.renderPayroll();
  assertRenamed(ctx, 'tab-switch');
});

test('test_rename_flat_employee_keeps_flat_amount', () => {
  const ctx = setup();
  ctx.api.renameEmployeeViaDispatcher(0, 'Flo Flat', 'Florence Flat', 'payroll');
  assert.equal(ctx.api.wKey(0, 'Florence Flat'), ctx.flatId);
  assert.equal(ctx.api.flatWages[ctx.flatId], 500);
  assert.equal(ctx.ent.employees[1].name, 'Florence Flat');
});

test('test_rename_settings_round_trip_keeps_id', () => {
  const ctx = setup();
  ctx.api.renameEmployeeViaDispatcher(0, OLD, NEW, 'payroll');
  const rows = ctx.api._gatherPayrollSettingsRows(false);
  const r = rows.find(x => x.employeeId === ctx.id);
  assert.ok(r, 'exported row for the renamed id');
  assert.equal(r.employee, NEW);
  assert.ok(!rows.some(x => x.employee === OLD), 'no stale row under the old name');

  // Fresh session loading the renamed schedule + the exported settings file: the new name
  // resolves to the exported id and every pay field lands on that record.
  const api2 = loadApp();
  api2.setTestMode(true);
  const ent2 = resetToSingleEntity(api2, { id: 0, name: 'Test Zion', employees: [{ name: NEW, shifts: SHIFTS.slice() }], dateLabels: WEEK, breakMinutesSet: true });
  api2._syncEntityCode(ent2);
  const headers = api2.PAYROLL_SETTINGS_HEADERS;
  const colMap = {};
  headers.forEach((h, i) => { colMap[h.toLowerCase()] = i; });
  const byHeader = {
    Entity: r.entity, Employee: r.employee, 'Wage/hour': String(r.wage), Type: r.type, 'Flat Amount': String(r.flat),
    'Pay Method': r.method, 'Deposit Amount': String(r.deposit), 'Deposit Typed As': r.depositTypedAs,
    'Employee ID': r.employeeId, Aliases: r.aliases, Active: r.active, 'Final Pass Method': r.finalPassMethod, Notes: r.notes,
  };
  api2._ingestPayrollSettings([headers.map(h => byHeader[h] ?? '')], colMap, false);
  assert.equal(api2.wKey(0, NEW), ctx.id, 'imported id keeps the new name');
  assert.equal(Object.keys(api2.session.roster.byId).length, 1, 'no second record for the same person');
  assert.ok(api2.getAliases(0, NEW).includes(OLD), 'old name travels as an alias');
  assert.equal(api2.wageRates[ctx.id], 17.5);
  assert.equal(api2.getPayMethod(0, NEW), 'both');
  assert.equal(api2.getSplitDeposit(0, NEW), 100);
  assert.equal(api2.getRosterNotes(0, NEW), 'test note');
});

test('test_rename_revert_restores_old_name_same_id', () => {
  const ctx = setup();
  ctx.api.renameEmployeeViaDispatcher(0, OLD, NEW, 'payroll');
  const entry = ctx.api.session.log.filter(e => e.type === 'rosterRename').pop();
  ctx.api.revert(entry.id);
  assert.equal(ctx.api.wKey(0, OLD), ctx.id);
  assert.equal(ctx.api.getRosterRecord(0, OLD).canonical_name, OLD);
  assert.equal(ctx.ent.employees[0].name, OLD);
  assert.equal(ctx.row.empName, OLD);
  assert.equal(ctx.api.session.roster.keyToId['0|robert smith'], undefined, 'reverted name no longer keyed');
});
