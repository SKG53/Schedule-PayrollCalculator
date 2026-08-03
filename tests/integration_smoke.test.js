const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

test('loads the real app script and exposes payroll helpers', () => {
  const api = loadApp();

  [
    'computePayrollForEntity',
    'getBreakOverride',
    'setBreakOverride',
    'clearBreakOverride',
    'sortRowsByPayType',
    '_paytypeExportSortFn',
    '_gatherPayrollSettingsRows',
    '_ingestPayrollSettings',
    'matchEmployeeName',
    'setAliases',
    'dispatch',
    'revert',
    'recompute',
    'setTestMode',
    'ensureRosterRecord',
    'getRosterRecord',
  ].forEach(name => assert.equal(typeof api[name], 'function', `${name} should be a function`));

  assert.ok(Array.isArray(api.PAYROLL_SETTINGS_HEADERS));
  assert.ok(api.PAYROLL_SETTINGS_HEADERS.includes('Employee ID'));
  assert.ok(api.PAYROLL_SETTINGS_HEADERS.includes('Final Pass Method'));
  assert.ok(api.PAYROLL_SETTINGS_HEADERS.includes('Notes'));
  assert.ok(Array.isArray(api.PAYROLL_SETTINGS_BREAK_HEADERS));
  assert.equal(api.PAYROLL_SETTINGS_BREAK_HEADERS.length, 15);
  assert.ok(api.session && api.session.roster && Array.isArray(api.session.log));
});

test('real break override helpers preserve zero-minute overrides', () => {
  const api = loadApp();

  api.setBreakOverride(0, 'Alice', 2, 15);
  assert.equal(api.getBreakOverride(0, 'Alice', 2), 15);
  assert.equal(api.getBreakOverride(0, 'Alice', 1), null);

  api.clearBreakOverride(0, 'Alice', 2);
  assert.equal(api.getBreakOverride(0, 'Alice', 2), null);

  api.setBreakOverride(0, 'Alice', 2, 0);
  assert.equal(api.getBreakOverride(0, 'Alice', 2), 0);
});

test('real pay-type sort orders Cash, Deposit + Cash, Deposit', () => {
  const api = loadApp();
  resetToSingleEntity(api, {
    id: 0,
    name: 'Sort Entity',
    employees: [{ name: 'X', shifts: [] }, { name: 'Y', shifts: [] }, { name: 'Z', shifts: [] }],
  });

  api.setPayMethod(0, 'X', 'deposit');
  api.setPayMethod(0, 'Y', 'cash');
  api.setPayMethod(0, 'Z', 'both');

  const sorted = api.sortRowsByPayType(0, [
    { schedName: 'X', name: 'X' },
    { schedName: 'Y', name: 'Y' },
    { schedName: 'Z', name: 'Z' },
  ]);

  assert.deepEqual(sorted.map(r => r.schedName), ['Y', 'Z', 'X']);
  assert.equal(api.methodLabel('both'), 'Deposit + Cash');
});

test('settings row gather uses real active and alias state', () => {
  const api = loadApp();
  resetToSingleEntity(api, {
    id: 0,
    name: 'Settings Entity',
    employees: [{ name: 'Alice', shifts: ['', '', '', '', '', '', ''] }],
    breakMinutes: 30,
    breakMinutesSet: true,
  });

  api.setRosterActive(0, 'Alice', false);
  const aliasResult = api.setAliases(0, 'Alice', ['Alicia']);
  assert.deepEqual(aliasResult.rejected, []);
  api.setFinalPassMethod(0, 'Alice', 'Contract Check');
  api.setRosterNotes(0, 'Alice', 'manual review');
  api.setBreakOverride(0, 'Alice', 2, 15);

  const withoutBreaks = api._gatherPayrollSettingsRows(false);
  assert.equal(withoutBreaks.length, 1);
  assert.match(withoutBreaks[0].employeeId, /^e[0-9a-f]{8}$/);
  assert.equal(withoutBreaks[0].active, 'No');
  assert.equal(withoutBreaks[0].aliases, '["Alicia"]');
  assert.equal(withoutBreaks[0].finalPassMethod, 'Contract Check');
  assert.equal(withoutBreaks[0].notes, 'manual review');
  assert.equal(withoutBreaks[0].dayBreaks, undefined);

  const withBreaks = api._gatherPayrollSettingsRows(true);
  assert.equal(withBreaks.length, 1);
  assert.equal(withBreaks[0].defaultBreak, 30);
  assert.equal(withBreaks[0].dayBreaks[2].minutes, 15);
  assert.equal(withBreaks[0].dayBreaks[2].status, 'Override');
  assert.equal(withBreaks[0].dayBreaks[0].minutes, null);
  assert.equal(withBreaks[0].dayBreaks[0].status, 'Actual');
});

test('roster registry uses stable IDs through rename cascade', () => {
  const api = loadApp();
  resetToSingleEntity(api, {
    id: 0,
    name: 'Roster Entity',
    employees: [{ name: 'Alice', shifts: [] }],
  });

  const id = api.wKey(0, 'Alice');
  api.dispatch({ type: 'rosterRename', screen: 'schedule', target: { kind: 'employee', entity: 0, id, field: 'name' }, from: 'Alice', to: 'Alicia', meta: { empName: 'Alice' } });

  assert.equal(api.wKey(0, 'Alicia'), id);
  assert.equal(api.getRosterRecord(0, 'Alicia').canonical_name, 'Alicia');
  assert.deepEqual(api.getAliases(0, 'Alicia'), ['Alice']);
});

test('test-mode guard blocks direct writes and allows dispatcher writes', () => {
  const api = loadApp();
  resetToSingleEntity(api, {
    id: 0,
    name: 'Guard Entity',
    employees: [{ name: 'Bob', shifts: [] }],
  });
  const id = api.wKey(0, 'Bob');

  api.setTestMode(true);
  try {
    assert.throws(() => { api.wageRates[id] = 20; }, /Direct write to wageRates/);
    assert.doesNotThrow(() => api.dispatch({ type: 'wage', screen: 'payroll', target: { kind: 'employee', entity: 0, id, field: 'wage' }, from: undefined, to: 20, meta: { empName: 'Bob' } }));
  } finally {
    api.setTestMode(false);
  }

  assert.equal(api.wageRates[id], 20);
});

test('non-linear revert logs a compensating change without dropping later entries', () => {
  const api = loadApp();
  resetToSingleEntity(api, {
    id: 0,
    name: 'Log Entity',
    employees: [{ name: 'Alice', shifts: [] }],
  });
  const id = api.wKey(0, 'Alice');

  const e1 = api.dispatch({ type: 'wage', screen: 'payroll', target: { kind: 'employee', entity: 0, id, field: 'wage' }, from: undefined, to: 10, meta: { empName: 'Alice' } });
  const e2 = api.dispatch({ type: 'wage', screen: 'payroll', target: { kind: 'employee', entity: 0, id, field: 'wage' }, from: 10, to: 20, meta: { empName: 'Alice' } });
  const e3 = api.dispatch({ type: 'payMethod', screen: 'payroll', target: { kind: 'employee', entity: 0, id, field: 'payMethod' }, from: 'deposit', to: 'cash', meta: { empName: 'Alice' } });

  const rev = api.revert(e2.id);

  assert.equal(api.wageRates[id], 10);
  assert.equal(api.getPayMethod(0, 'Alice'), 'cash');
  assert.equal(api.session.log.length, 4);
  assert.equal(api.session.log.find(e => e.id === e2.id).reverted, true);
  assert.equal(api.session.log.find(e => e.id === e3.id).reverted, false);
  assert.equal(rev.originalId, e2.id);
  assert.equal(api.session.log[0].id, e1.id);
});
