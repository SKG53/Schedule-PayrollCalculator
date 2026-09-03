// FC-00020: Add Contract Check as 4th pay type.
//
// Contract Check is a pay-type LABEL sibling to Deposit/Cash/Deposit + Cash — value
// 'contract', label 'Contract Check'. No new subtotal column, no new palette bucket, no
// special math: it uses the same rounding treatment as Deposit (full amount, 2dp, no
// split). Sort order: Cash -> Both -> Deposit -> Contract (Contract sorts LAST). Export
// column allocation: Contract Check lands in the Deposit column of exports (it's a
// non-cash payment), and is skipped entirely from Cash-Only exports. See
// FC_00020_BRIEF.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

const WEEK_LABELS = ['Aug 9 2026', 'Aug 10 2026', 'Aug 11 2026', 'Aug 12 2026', 'Aug 13 2026', 'Aug 14 2026', 'Aug 15 2026'];

function makeColMap(headers) {
  const colMap = {};
  headers.forEach((h, i) => { colMap[h.toLowerCase()] = i; });
  return colMap;
}

function makeSettingsRow(headers, values) {
  return headers.map(h => Object.prototype.hasOwnProperty.call(values, h) ? values[h] : '');
}

// Single entity with 4 employees, one per pay type, each with a worked shift so payroll
// math actually runs (not an orphan / zero-hours row).
function makeFourPayTypeFixture(api) {
  const ent = resetToSingleEntity(api, {
    id: 0,
    name: 'Nirvana 11th',
    employees: [
      { name: 'CashEmp', shifts: ['', '9AM - 5PM', '', '', '', '', ''] },
      { name: 'BothEmp', shifts: ['', '9AM - 5PM', '', '', '', '', ''] },
      { name: 'DepositEmp', shifts: ['', '9AM - 5PM', '', '', '', '', ''] },
      { name: 'ContractEmp', shifts: ['', '9AM - 5PM', '', '', '', '', ''] },
    ],
    dateLabels: WEEK_LABELS,
    breakMinutes: 0,
    breakMinutesSet: true,
    actualDays: [
      { empName: 'CashEmp', entityName: 'Nirvana 11th', date: '2026-08-10', dayIdx: 1, pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] },
      { empName: 'BothEmp', entityName: 'Nirvana 11th', date: '2026-08-10', dayIdx: 1, pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] },
      { empName: 'DepositEmp', entityName: 'Nirvana 11th', date: '2026-08-10', dayIdx: 1, pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] },
      { empName: 'ContractEmp', entityName: 'Nirvana 11th', date: '2026-08-10', dayIdx: 1, pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] },
    ],
  });
  api._syncEntityCode(ent);
  api.wageRates[api.wKey(0, 'CashEmp')] = 15;
  api.wageRates[api.wKey(0, 'BothEmp')] = 15;
  api.wageRates[api.wKey(0, 'DepositEmp')] = 15;
  api.wageRates[api.wKey(0, 'ContractEmp')] = 15;
  api.payMethod[api.wKey(0, 'CashEmp')] = 'cash';
  api.payMethod[api.wKey(0, 'BothEmp')] = 'both';
  api.payMethod[api.wKey(0, 'DepositEmp')] = 'deposit';
  api.payMethod[api.wKey(0, 'ContractEmp')] = 'contract';
  return ent;
}

// ---- DoD #2: methodLabel('contract') === 'Contract Check' ----
test('test_contract_check_method_label', () => {
  const api = loadApp();
  assert.equal(api.methodLabel('contract'), 'Contract Check');
  // Sanity: the other three labels are untouched by this change.
  assert.equal(api.methodLabel('cash'), 'Cash');
  assert.equal(api.methodLabel('deposit'), 'Deposit');
  assert.equal(api.methodLabel('both'), 'Deposit + Cash');
});

// ---- DoD #4: sort order — Cash(0) -> Both(1) -> Deposit(2) -> Contract(3), Contract last ----
test('test_contract_check_sort_order_last', () => {
  const api = loadApp();
  const ent = makeFourPayTypeFixture(api);
  const rows = [
    { schedName: 'ContractEmp', name: 'ContractEmp' },
    { schedName: 'DepositEmp', name: 'DepositEmp' },
    { schedName: 'BothEmp', name: 'BothEmp' },
    { schedName: 'CashEmp', name: 'CashEmp' },
  ];
  const sorted = api.sortRowsByPayType(ent.id, rows);
  const order = sorted.map(r => r.name);
  assert.deepEqual(order, ['CashEmp', 'BothEmp', 'DepositEmp', 'ContractEmp'],
    'expected Cash -> Both -> Deposit -> Contract, with Contract Check sorting last');

  // Rank values themselves match the DoD spec exactly.
  assert.equal(api._payTypeRankForRow(ent.id, { name: 'CashEmp' }), 0);
  assert.equal(api._payTypeRankForRow(ent.id, { name: 'BothEmp' }), 1);
  assert.equal(api._payTypeRankForRow(ent.id, { name: 'DepositEmp' }), 2);
  assert.equal(api._payTypeRankForRow(ent.id, { name: 'ContractEmp' }), 3);

  // The export-side sort comparator (_paytypeExportSortFn) must agree with the UI sort order.
  const exportRows = [
    { _breakdown: { method: 'contract' } },
    { _breakdown: { method: 'deposit' } },
    { _breakdown: { method: 'both' } },
    { _breakdown: { method: 'cash' } },
  ];
  const exportSorted = exportRows.slice().sort(api._paytypeExportSortFn);
  assert.deepEqual(exportSorted.map(r => r._breakdown.method), ['cash', 'both', 'deposit', 'contract']);
});

// ---- DoD #7, test 3: contract-check amount flows to the Deposit column in the combined export ----
test('test_contract_check_flows_to_deposit_column_in_combined_export', () => {
  const api = loadApp();
  makeFourPayTypeFixture(api);
  const data = api._collectExportData();
  assert.equal(data.length, 1);
  const rows = data[0].rows;
  const contractRow = rows.find(r => r._empName === 'ContractEmp');
  assert.ok(contractRow, 'expected the Contract Check employee row to be present');
  assert.equal(contractRow._breakdown.method, 'contract');
  // Full pay amount (8h * $15 = $120) lands in the deposit column; cash column stays 0.
  assert.equal(contractRow._breakdown.deposit, 120);
  assert.equal(contractRow._breakdown.cash, 0);
  assert.equal(contractRow._breakdown.actualFinal, 120);
  assert.equal(contractRow._breakdown.roundingDiff, 0);

  // Sanity: the other three pay types are unaffected by this change.
  const depositRow = rows.find(r => r._empName === 'DepositEmp');
  assert.equal(depositRow._breakdown.deposit, 120);
  assert.equal(depositRow._breakdown.cash, 0);
  const cashRow = rows.find(r => r._empName === 'CashEmp');
  assert.equal(cashRow._breakdown.cash, 120);
  assert.equal(cashRow._breakdown.deposit, 0);
});

// ---- DoD #7: Deposit-Only export includes Contract Check rows ----
test('test_contract_check_included_in_deposit_only_export', () => {
  const api = loadApp();
  makeFourPayTypeFixture(api);
  const data = api._collectExportData();
  const rows = data[0].rows;
  const filtered = api._filterRowsForKind(rows, 'depositOnly');
  const names = filtered.map(r => r._empName).sort();
  assert.deepEqual(names, ['BothEmp', 'ContractEmp', 'DepositEmp'],
    'Deposit-Only export must include Contract Check alongside Deposit and Both, but not Cash');
});

// ---- DoD #7: Cash-Only export skips Contract Check rows entirely ----
test('test_contract_check_skipped_in_cash_only_export', () => {
  const api = loadApp();
  makeFourPayTypeFixture(api);
  const data = api._collectExportData();
  const rows = data[0].rows;
  const filtered = api._filterRowsForKind(rows, 'cashOnly');
  const names = filtered.map(r => r._empName).sort();
  assert.deepEqual(names, ['BothEmp', 'CashEmp'],
    'Cash-Only export must include Cash and Both only; Contract Check (a non-cash payment) must be skipped');
});

// ---- DoD #1/#3: computePayBreakdown treats 'contract' with Deposit-style math (no split) ----
test('test_contract_check_pay_breakdown_math_matches_deposit', () => {
  const api = loadApp();
  const ent = makeFourPayTypeFixture(api);
  const { results } = api.computePayrollForEntity(0);
  const contractResult = results.find(r => (r.schedName || r.name) === 'ContractEmp');
  assert.ok(contractResult, 'expected a payroll result row for ContractEmp');
  const bd = api.computePayBreakdown(contractResult, ent.id);
  assert.equal(bd.method, 'contract');
  assert.equal(bd.deposit, 120);
  assert.equal(bd.cash, 0);
  assert.equal(bd.final, 120);
  assert.equal(bd.roundedFinal, 120);
  assert.equal(bd.roundingDiff, 0);
});

// ---- DoD #5/#6: settings-file round-trip — export writes 'Contract Check', import reads it back ----
test('test_contract_check_settings_export_import_round_trip', () => {
  const api = loadApp();
  makeFourPayTypeFixture(api);
  const rows = api._gatherPayrollSettingsRows(false);
  const contractSettingsRow = rows.find(r => r.employee === 'ContractEmp');
  assert.ok(contractSettingsRow, 'expected a settings row for ContractEmp');
  assert.equal(contractSettingsRow.method, 'Contract Check', 'export must write the Contract Check label');

  // Round-trip: import a fresh settings row with "Contract Check" as the Pay Method value
  // and confirm it sets payMethod back to the internal 'contract' enum value.
  const headers = api.PAYROLL_SETTINGS_HEADERS;
  const colMap = makeColMap(headers);
  const importRow = makeSettingsRow(headers, {
    Entity: 'Nirvana 11th',
    Employee: 'NewContractHire',
    'Wage/hour': '20',
    Type: 'Hourly',
    'Pay Method': 'Contract Check',
  });
  api._ingestPayrollSettings([importRow], colMap, false);
  assert.equal(api.getPayMethod(0, 'NewContractHire'), 'contract',
    'importing "Contract Check" in the Pay Method column must set the internal enum to \'contract\'');
});

// ---- DoD #6: backward compat — old 3-pay-type settings files still load correctly ----
test('test_old_three_pay_type_settings_file_still_loads', () => {
  const api = loadApp();
  resetToSingleEntity(api, { id: 0, name: 'Nirvana 11th', employees: [], breakMinutesSet: true });
  // Simulate an old settings file exported before FC-00020 existed: only Deposit/Cash/Both
  // ever appear as Pay Method values, and the header row has no knowledge of 'contract'.
  const legacyHeaders = ['Entity', 'Employee', 'Wage/hour', 'Type', 'Pay Method'];
  const colMap = makeColMap(legacyHeaders);
  const depRow = makeSettingsRow(legacyHeaders, { Entity: 'Nirvana 11th', Employee: 'OldDeposit', 'Wage/hour': '15', Type: 'Hourly', 'Pay Method': 'Deposit' });
  const cashRow = makeSettingsRow(legacyHeaders, { Entity: 'Nirvana 11th', Employee: 'OldCash', 'Wage/hour': '15', Type: 'Hourly', 'Pay Method': 'Cash' });
  const bothRow = makeSettingsRow(legacyHeaders, { Entity: 'Nirvana 11th', Employee: 'OldBoth', 'Wage/hour': '15', Type: 'Hourly', 'Pay Method': 'Deposit + Cash' });
  api._ingestPayrollSettings([depRow, cashRow, bothRow], colMap, false);

  assert.equal(api.getPayMethod(0, 'OldDeposit'), 'deposit');
  assert.equal(api.getPayMethod(0, 'OldCash'), 'cash');
  assert.equal(api.getPayMethod(0, 'OldBoth'), 'both');
  // And their labels still resolve correctly post-import.
  assert.equal(api.methodLabel(api.getPayMethod(0, 'OldDeposit')), 'Deposit');
  assert.equal(api.methodLabel(api.getPayMethod(0, 'OldCash')), 'Cash');
  assert.equal(api.methodLabel(api.getPayMethod(0, 'OldBoth')), 'Deposit + Cash');
});

// ---- DoD #3: the payroll row toggle group renders a 4th "Contract Check" button after "Deposit + Cash" ----
test('test_contract_check_button_renders_in_toggle_group_after_deposit_plus_cash', () => {
  const api = loadApp();
  makeFourPayTypeFixture(api);
  api.renderPayrollEntityContent(0);
  // The pay-method toggle group renders into the Payroll Calculation sub-tab's own table
  // element (#payrollCalcTable), not directly into #payrollEntityContent.
  const host = api.__sandbox.document.getElementById('payrollCalcTable');
  const html = host.innerHTML;

  assert.ok(html.includes(">Contract Check</button>"), 'expected a Contract Check button in the pay-method toggle group');
  assert.ok(html.includes("setPayMethodForRow(0,'contract')") || /setPayMethodForRow\(\d+,'contract'\)/.test(html),
    'expected the Contract Check button to set payMethod to \'contract\' via setPayMethodForRow');

  // Ordering: "Deposit + Cash</button>" must appear before the Contract Check button in the
  // same toggle group (DoD #3: 4th button sits after "DEPOSIT + CASH").
  const bothIdx = html.indexOf('Deposit + Cash</button>');
  const contractIdx = html.indexOf('Contract Check</button>');
  assert.ok(bothIdx >= 0 && contractIdx >= 0, 'both buttons must be present');
  assert.ok(contractIdx > bothIdx, 'Contract Check button must come after Deposit + Cash in the toggle group');

  // The Contract Check employee's row must show its button selected.
  const selectedContractBtn = /<button class="selected" onclick="setPayMethodForRow\(\d+,'contract'\)"/;
  assert.ok(selectedContractBtn.test(html), 'ContractEmp row must render the Contract Check button as selected');
});
