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
  ].forEach(name => assert.equal(typeof api[name], 'function', `${name} should be a function`));

  assert.ok(Array.isArray(api.PAYROLL_SETTINGS_HEADERS));
  assert.ok(Array.isArray(api.PAYROLL_SETTINGS_BREAK_HEADERS));
  assert.equal(api.PAYROLL_SETTINGS_BREAK_HEADERS.length, 15);
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
  api.setBreakOverride(0, 'Alice', 2, 15);

  const withoutBreaks = api._gatherPayrollSettingsRows(false);
  assert.equal(withoutBreaks.length, 1);
  assert.equal(withoutBreaks[0].active, 'No');
  assert.equal(withoutBreaks[0].aliases, '["Alicia"]');
  assert.equal(withoutBreaks[0].dayBreaks, undefined);

  const withBreaks = api._gatherPayrollSettingsRows(true);
  assert.equal(withBreaks.length, 1);
  assert.equal(withBreaks[0].defaultBreak, 30);
  assert.equal(withBreaks[0].dayBreaks[2].minutes, 15);
  assert.equal(withBreaks[0].dayBreaks[2].status, 'Override');
  assert.equal(withBreaks[0].dayBreaks[0].minutes, null);
  assert.equal(withBreaks[0].dayBreaks[0].status, 'Actual');
});
