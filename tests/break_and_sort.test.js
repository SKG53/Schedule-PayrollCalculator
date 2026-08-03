const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

function approx(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: expected ${expected}, got ${actual}`);
}

function makeColMap(headers) {
  const colMap = {};
  headers.forEach((h, i) => { colMap[h.toLowerCase()] = i; });
  return colMap;
}

function makeSettingsRow(headers, values) {
  return headers.map(h => Object.prototype.hasOwnProperty.call(values, h) ? values[h] : '');
}

function seedHourlyWeek(api, { defaultBreakMin = 30, pairs, shift = '7AM - 3PM' }) {
  resetToSingleEntity(api, {
    id: 0,
    name: 'Payroll Entity',
    employees: [{ name: 'Bob', shifts: ['', shift, '', '', '', '', ''] }],
    dateLabels: ['', 'Mon Apr 13 2026', '', '', '', '', ''],
    breakMinutes: defaultBreakMin,
    breakMinutesSet: true,
    actualDays: [{
      empName: 'Bob',
      entityName: 'Payroll Entity',
      date: '2026-04-13',
      dayIdx: 1,
      pairs,
    }],
  });
  api.wageRates[api.wKey(0, 'Bob')] = 20;
}

test('span-based hours formula uses default break as a floor', () => {
  const api = loadApp();

  seedHourlyWeek(api, {
    defaultBreakMin: 30,
    pairs: [
      { in: 7, out: 10, outAdj: 10, minutes: 180 },
      { in: 10.25, out: 15, outAdj: 15, minutes: 285 },
    ],
  });

  const { results } = api.computePayrollForEntity(0);
  assert.equal(results.length, 1);
  approx(results[0].actualHours, 7.5, 'raw break below default should use the 30m floor');
  approx(results[0].actualBreakH, 0.5, 'effective break should be 0.5h');
  approx(results[0].pay, 150, 'pay should use billable hours');
});

test('span-based hours formula uses actual break when it exceeds the default floor', () => {
  const api = loadApp();

  seedHourlyWeek(api, {
    defaultBreakMin: 30,
    pairs: [
      { in: 7, out: 10, outAdj: 10, minutes: 180 },
      { in: 10.75, out: 15, outAdj: 15, minutes: 255 },
    ],
  });

  const { results } = api.computePayrollForEntity(0);
  approx(results[0].actualHours, 7.25, 'raw 45m break should exceed the 30m floor');
  approx(results[0].actualBreakH, 0.75, 'effective break should be 0.75h');
  approx(results[0].pay, 145, 'pay should use billable hours');
});

test('per-day break override is exact, including zero', () => {
  const api = loadApp();

  seedHourlyWeek(api, {
    defaultBreakMin: 30,
    pairs: [
      { in: 7, out: 11, outAdj: 11, minutes: 240 },
      { in: 11.5, out: 15, outAdj: 15, minutes: 210 },
    ],
  });

  let { results } = api.computePayrollForEntity(0);
  approx(results[0].actualHours, 7.5, 'no override should bill 7.5h');

  api.setBreakOverride(0, 'Bob', 1, 0);
  ({ results } = api.computePayrollForEntity(0));
  approx(results[0].actualHours, 8, '0-minute override should mean no break');
  approx(results[0].pay, 160, 'pay should reflect 8 billable hours');

  api.setBreakOverride(0, 'Bob', 1, 60);
  ({ results } = api.computePayrollForEntity(0));
  approx(results[0].actualHours, 7, '60-minute override should bill 7h');
  approx(results[0].pay, 140, 'pay should reflect 7 billable hours');
});

test('pay breakdown rules keep cash whole and deposit cents-exact', () => {
  const api = loadApp();

  const cash = api.computePayBreakdown({ schedName: 'Cash Emp', pay: 123.45 }, 0);
  assert.deepEqual(cash, {
    method: 'deposit',
    total: 123.45,
    deposit: 123.45,
    cash: 0,
    final: 123.45,
    roundedFinal: 123.45,
    actualFinal: 123.45,
    roundingDiff: 0,
  }, 'default pay method should be deposit');

  api.setPayMethod(0, 'Cash Emp', 'cash');
  const cashOnly = api.computePayBreakdown({ schedName: 'Cash Emp', pay: 123.45 }, 0);
  assert.equal(cashOnly.cash, 123);
  assert.equal(cashOnly.deposit, 0);
  assert.equal(cashOnly.roundingDiff, -0.45);

  api.setPayMethod(0, 'Deposit Emp', 'deposit');
  const depositOnly = api.computePayBreakdown({ schedName: 'Deposit Emp', pay: 123.45 }, 0);
  assert.equal(depositOnly.deposit, 123.45);
  assert.equal(depositOnly.cash, 0);
  assert.equal(depositOnly.roundingDiff, 0);
});

test('Deposit + Cash whole-number deposit sends decimal remainder to cash then rounds cash', () => {
  const api = loadApp();

  api.setPayMethod(0, 'Split Emp', 'both');
  api.setSplitDeposit(0, 'Split Emp', 100, { typed: true, isWhole: true });

  const split = api.computePayBreakdown({ schedName: 'Split Emp', pay: 123.45 }, 0);
  assert.equal(split.method, 'both');
  assert.equal(split.deposit, 100);
  assert.equal(split.cash, 23);
  assert.equal(split.roundedFinal, 123);
  assert.equal(split.actualFinal, 123.45);
  assert.equal(split.roundingDiff, -0.45);
});

test('Deposit + Cash decimal deposit preserves Deposit + Cash equals actual total', () => {
  const api = loadApp();

  api.setPayMethod(0, 'Split Emp', 'both');
  api.setSplitDeposit(0, 'Split Emp', 100.25, { typed: true, isWhole: false });

  const split = api.computePayBreakdown({ schedName: 'Split Emp', pay: 123.45 }, 0);
  assert.equal(split.deposit, 100.45);
  assert.equal(split.cash, 23);
  assert.equal(split.roundedFinal, 123.45);
  assert.equal(split.actualFinal, 123.45);
  assert.equal(split.roundingDiff, 0);
});

test('export row filtering includes both-method rows in both cash and deposit files', () => {
  const api = loadApp();
  const rows = [
    { _breakdown: { method: 'cash' }, name: 'Cash' },
    { _breakdown: { method: 'both' }, name: 'Both' },
    { _breakdown: { method: 'deposit' }, name: 'Deposit' },
  ];

  assert.deepEqual(api._filterRowsForKind(rows, 'cashOnly').map(r => r.name), ['Cash', 'Both']);
  assert.deepEqual(api._filterRowsForKind(rows, 'depositOnly').map(r => r.name), ['Both', 'Deposit']);
  assert.deepEqual(api._filterRowsForKind(rows, 'combined').map(r => r.name), ['Cash', 'Both', 'Deposit']);
});

test('settings import with breaks restores defaults, overrides, zero overrides, active, aliases, and flat amount', () => {
  const api = loadApp();
  resetToSingleEntity(api, {
    id: 0,
    name: 'Settings Entity',
    employees: [{ name: 'Alice', shifts: ['', '', '', '', '', '', ''] }],
    breakMinutes: 10,
    breakMinutesSet: true,
  });

  const headers = api.PAYROLL_SETTINGS_HEADERS.concat(api.PAYROLL_SETTINGS_BREAK_HEADERS);
  const colMap = makeColMap(headers);

  const row = makeSettingsRow(headers, {
    Entity: 'Settings Entity',
    Employee: 'Alice',
    'Wage/hour': '',
    Type: 'Flat',
    'Flat Amount': '$125.00',
    'Pay Method': 'Deposit + Cash',
    'Deposit Amount': '$50.00',
    'Deposit Typed As': 'whole',
    'Employee ID': 'e11111111',
    Aliases: '["Alicia"]',
    Active: 'No',
    'Final Pass Method': 'Contract Check',
    Notes: 'seasonal',
    'Default Break (min)': 30,
    'Sun Break': '', 'Sun Break Status': 'Actual',
    'Mon Break': '', 'Mon Break Status': 'Actual',
    'Tue Break': 15, 'Tue Break Status': 'Override',
    'Wed Break': '', 'Wed Break Status': 'Actual',
    'Thu Break': 0, 'Thu Break Status': 'Override',
    'Fri Break': '', 'Fri Break Status': 'Actual',
    'Sat Break': '', 'Sat Break Status': 'Actual',
  });

  api._ingestPayrollSettings([row], colMap, true);

  assert.equal(api.wKey(0, 'Alice'), 'e11111111');
  assert.equal(api.isRosterActive(0, 'Alice'), false);
  assert.deepEqual(api.getAliases(0, 'Alice'), ['Alicia']);
  assert.equal(api.getFinalPassMethod(0, 'Alice'), 'Contract Check');
  assert.equal(api.getRosterNotes(0, 'Alice'), 'seasonal');
  assert.equal(api.entities[0].breakMinutes, 30);
  assert.equal(api.getBreakOverride(0, 'Alice', 2), 15);
  assert.equal(api.getBreakOverride(0, 'Alice', 4), 0);
  assert.equal(api.flatWages[api.wKey(0, 'Alice')], 125);
  assert.equal(api.getPayMethod(0, 'Alice'), 'both');
  assert.deepEqual(api.getSplitMeta(0, 'Alice'), { deposit: 50, typed: true, isWhole: true });
});

test('settings import without breaks leaves existing break state untouched', () => {
  const api = loadApp();
  resetToSingleEntity(api, {
    id: 0,
    name: 'Settings Entity',
    employees: [{ name: 'Alice', shifts: ['', '', '', '', '', '', ''] }],
    breakMinutes: 10,
    breakMinutesSet: true,
  });
  api.setBreakOverride(0, 'Alice', 2, 99);

  const headers = api.PAYROLL_SETTINGS_HEADERS.concat(api.PAYROLL_SETTINGS_BREAK_HEADERS);
  const colMap = makeColMap(headers);

  const row = makeSettingsRow(headers, {
    Entity: 'Settings Entity',
    Employee: 'Alice',
    'Wage/hour': '20',
    Type: 'Hourly',
    'Pay Method': 'Cash',
    Active: 'Yes',
    'Default Break (min)': 30,
    'Sun Break': '', 'Sun Break Status': 'Actual',
    'Mon Break': '', 'Mon Break Status': 'Actual',
    'Tue Break': 15, 'Tue Break Status': 'Override',
    'Wed Break': '', 'Wed Break Status': 'Actual',
    'Thu Break': 0, 'Thu Break Status': 'Override',
    'Fri Break': '', 'Fri Break Status': 'Actual',
    'Sat Break': '', 'Sat Break Status': 'Actual',
  });

  api._ingestPayrollSettings([row], colMap, false);

  assert.equal(api.entities[0].breakMinutes, 10);
  assert.equal(api.getBreakOverride(0, 'Alice', 2), 99);
  assert.equal(api.getPayMethod(0, 'Alice'), 'cash');
});

test('B5 flat settings export/import round-trip preserves amount and stable employee id', () => {
  const api = loadApp();
  resetToSingleEntity(api, {
    id: 0,
    name: 'Flat Entity',
    employees: [{ name: 'Flat Person', shifts: ['', '', '', '', '', '', ''] }],
  });

  const id = api.wKey(0, 'Flat Person');
  api.dispatch({ type: 'flatWage', screen: 'payroll', target: { kind: 'employee', entity: 0, id, field: 'flatWage' }, from: null, to: 200, meta: { empName: 'Flat Person' } });
  api.setPayMethod(0, 'Flat Person', 'both');
  api.setSplitDeposit(0, 'Flat Person', 75, { typed: true, isWhole: true });

  const exported = api._gatherPayrollSettingsRows(false)[0];
  assert.equal(exported.employeeId, id);
  assert.equal(exported.type, 'Flat');
  assert.equal(exported.flat, 200);
  assert.equal(exported.method, 'Deposit + Cash');
  assert.equal(exported.deposit, 75);

  const headers = api.PAYROLL_SETTINGS_HEADERS;
  const row = makeSettingsRow(headers, {
    Entity: exported.entity,
    Employee: exported.employee,
    'Wage/hour': exported.wage,
    Type: exported.type,
    'Flat Amount': `$${exported.flat.toFixed(2)}`,
    'Pay Method': exported.method,
    'Deposit Amount': `$${exported.deposit.toFixed(2)}`,
    'Deposit Typed As': exported.depositTypedAs,
    'Employee ID': exported.employeeId,
    Aliases: exported.aliases,
    Active: exported.active,
    'Final Pass Method': exported.finalPassMethod,
    Notes: exported.notes,
  });

  resetToSingleEntity(api, {
    id: 0,
    name: 'Flat Entity',
    employees: [{ name: 'Flat Person', shifts: ['', '', '', '', '', '', ''] }],
  });
  api._ingestPayrollSettings([row], makeColMap(headers), false);

  assert.equal(api.wKey(0, 'Flat Person'), id);
  assert.equal(api.flatWages[id], 200);
  assert.equal(api.getPayMethod(0, 'Flat Person'), 'both');
  assert.deepEqual(api.getSplitMeta(0, 'Flat Person'), { deposit: 75, typed: true, isWhole: true });
});

test('alias matching resolves before fuzzy fallback without flagging a suggestion', () => {
  const api = loadApp();
  const ent = resetToSingleEntity(api, {
    id: 0,
    name: 'Alias Entity',
    employees: [{ name: 'Bob Smith', shifts: [] }, { name: 'Robert Jones', shifts: [] }],
  });

  const res = api.setAliases(0, 'Bob Smith', ['Bobby']);
  assert.deepEqual(res.rejected, []);

  assert.deepEqual(api.matchEmployeeName('Bobby', ent), { exact: 'Bob Smith', viaAlias: true });
  assert.deepEqual(api.matchEmployeeName('Bob', ent), { suggestion: 'Bob Smith' });
});

test('zero-hour scheduled employee remains in payroll results', () => {
  const api = loadApp();
  resetToSingleEntity(api, {
    id: 0,
    name: 'Zero Entity',
    employees: [{ name: 'No Punch', shifts: ['', '7AM - 3PM', '', '', '', '', ''] }],
    dateLabels: ['', 'Mon Apr 13 2026', '', '', '', '', ''],
    breakMinutes: 30,
    breakMinutesSet: true,
    actualDays: [],
  });

  const { results } = api.computePayrollForEntity(0);
  assert.equal(results.length, 1);
  assert.equal(results[0].schedName, 'No Punch');
  assert.equal(results[0].actualHours, 0);
  assert.equal(results[0].days[1].status, 'noshow');
});
