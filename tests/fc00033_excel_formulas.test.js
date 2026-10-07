// FC-00033: Excel exports carry live formulas, not pasted values. Every derived money/hours
// cell is a formula whose cached result is the tool's own number, subtotals are SUM() over the
// entity's rows, and the grand total sums the subtotals. This file evaluates the written
// formulas with a small Excel-compatible evaluator, so a formula that disagrees with the
// tool's math fails here (the real-workbook LibreOffice check is in the FC-00033 card).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');
const { xlNum } = require('./xl-helpers');

const WEEK = ['Aug 9 2026', 'Aug 10 2026', 'Aug 11 2026', 'Aug 12 2026', 'Aug 13 2026', 'Aug 14 2026', 'Aug 15 2026'];
const SHIFT = ['', '9AM - 5PM', '', '', '', '', ''];
const day = (empName, entityName, out) => ({ empName, entityName, date: '2026-08-10', dayIdx: 1, pairs: [{ in: 9, out, outAdj: out, minutes: (out - 9) * 60 }] });

function setup() {
  const api = loadApp();
  const people = ['Ann', 'Ben', 'Cy', 'Dee', 'Eve', 'Fay', 'Gus'];
  const ent = resetToSingleEntity(api, {
    id: 0, name: 'Alpha Test', employees: people.map(name => ({ name, shifts: SHIFT })),
    dateLabels: WEEK, breakMinutesSet: true,
    actualDays: [day('Ann', 'Alpha Test', 17.2), day('Ben', 'Alpha Test', 16.45), day('Dee', 'Alpha Test', 13.1),
      day('Eve', 'Alpha Test', 15.35), day('Fay', 'Alpha Test', 18.6), day('Gus', 'Alpha Test', 14.75)],
  });
  api._syncEntityCode(ent);
  api.entities.push({
    id: 1, name: 'Beta Test', employees: [{ name: 'Hal', shifts: SHIFT }], dateLabels: WEEK,
    newDateLabels: ['', '', '', '', '', '', ''], newWeekStartVal: '', breakMinutes: 0, breakMinutesSet: true,
    actualDays: [day('Hal', 'Beta Test', 16.3)], intake: null,
  });
  api._syncEntityCode(api.entities[1]);
  const set = (e, n, rate, method) => { api.wageRates[api.wKey(e, n)] = rate; if (method) api.payMethod[api.wKey(e, n)] = method; };
  set(0, 'Ann', 15.37, 'cash');
  set(0, 'Ben', 14.11, 'both'); api.splitAmounts[api.wKey(0, 'Ben')] = { deposit: 50, typed: true, isWhole: true };
  api.flatWages[api.wKey(0, 'Cy')] = 300;
  set(0, 'Dee', 20.03, 'deposit');
  set(0, 'Eve', 18.5, 'contract');
  set(0, 'Fay', 16.25, 'both'); api.splitAmounts[api.wKey(0, 'Fay')] = { deposit: 40.5, typed: true, isWhole: false };
  set(0, 'Gus', 13.33, 'both'); // no deposit typed: all cash
  set(1, 'Hal', 21.07, 'cash');
  return api;
}

// ---- Minimal evaluator for the functions the exports use ----
const colNum = (L) => L.split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
function xround(x, d) { const f = Math.pow(10, d); const y = Math.abs(x) * f; return Math.sign(x) * Math.round(+y.toFixed(9)) / f; }
function evaluate(ws, formula) {
  const cellVal = (L, r) => { const c = ws.rows[r] && ws.rows[r][colNum(L)]; if (!c) return 0; const v = c.value;
    if (v && typeof v === 'object' && 'formula' in v) return evaluate(ws, v.formula);
    return typeof v === 'number' ? v : 0; };
  const range = (L1, r1, L2, r2) => { const out = []; for (let r = r1; r <= r2; r++) for (let c = colNum(L1); c <= colNum(L2); c++) out.push(cellVal(String.fromCharCode(64 + c), r)); return out; };
  const fns = {
    ROUND: (x, d) => xround(x, d), ROUNDDOWN: (x, d) => Math.trunc(x * Math.pow(10, d)) / Math.pow(10, d),
    MIN: (...a) => Math.min(...a.flat()), MAX: (...a) => Math.max(...a.flat()), IF: (c, a, b) => (c ? a : b),
    SUM: (...a) => a.flat().reduce((s, x) => s + x, 0),
  };
  const js = formula
    .replace(/([A-Z]+)(\d+):([A-Z]+)(\d+)/g, (_, a, b, c, d) => `range('${a}',${b},'${c}',${d})`)
    .replace(/\b([A-Z]{1,2})(\d+)\b/g, (_, a, b) => `cellVal('${a}',${b})`)
    .replace(/\b(ROUNDDOWN|ROUND|MIN|MAX|IF|SUM)\(/g, 'fns.$1(');
  return Function('fns', 'cellVal', 'range', `return (${js});`)(fns, cellVal, range);
}
const isFx = (c) => !!(c && c.value && typeof c.value === 'object' && 'formula' in c.value);
function assertAllFormulasAgree(ws, label) {
  let n = 0;
  ws.rows.forEach((row, r) => (row || []).forEach((c, ci) => {
    if (!isFx(c)) return;
    n++;
    const got = Math.round(evaluate(ws, c.value.formula) * 100) / 100;
    assert.equal(got, c.value.result, `${label} R${r}C${ci} ${c.value.formula}: evaluates ${got}, tool cached ${c.value.result}`);
  }));
  return n;
}

test('test_combined_rows_are_formulas_that_reproduce_tool_values', async () => {
  const api = setup();
  await api.exportCombinedExcel();
  const ws = api.__lastExcelWorkbook.worksheets[0];
  const n = assertAllFormulasAgree(ws, 'combined');
  assert.ok(n >= 8 * 4, 'every pay row carries deposit/cash/final/diff formulas');
  const data = api._collectExportData().flatMap(d => d.rows);
  const rowFor = (name) => ws.rows.find(r => r && r[2] && r[2].value === name);
  for (const name of ['Ann', 'Ben', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal']) {
    const r = rowFor(name), b = data.find(x => x._empName === name)._breakdown;
    assert.match(r[6].value.formula, /^ROUND\(D\d+\*E\d+,2\)$/, name + ' Actual Total = hours x rate');
    assert.equal(xlNum(r[6]), b.actualFinal);
    assert.equal(xlNum(r[7]), b.deposit, name + ' deposit');
    assert.equal(xlNum(r[8]), b.cash, name + ' cash');
    assert.equal(xlNum(r[9]), b.roundedFinal, name + ' rounded final');
    assert.equal(typeof r[5].value, 'number', name + ' rate is a number so the formula can use it');
  }
  // Flat amount is an input value; its split still flows from it.
  const cy = rowFor('Cy (flat)');
  assert.equal(cy[6].value, 300);
  assert.ok(isFx(cy[8]), 'flat row cash is still a formula');
  // Zero amounts are numbers shown as a dash, never the text "—".
  const dee = rowFor('Dee');
  assert.equal(xlNum(dee[8]), 0);
  assert.match(dee[8].numFmt, /"—"$/);
});

test('test_subtotals_sum_rows_and_grand_sums_subtotals', async () => {
  const api = setup();
  await api.exportCombinedExcel();
  const ws = api.__lastExcelWorkbook.worksheets[0];
  const subs = ws.rows.map((r, i) => [r, i]).filter(([r]) => r && r[1] && / subtotal$/.test(r[1].value));
  assert.equal(subs.length, 2);
  subs.forEach(([r]) => assert.match(r[6].value.formula, /^SUM\(F\d+:F\d+\)$/));
  const grand = ws.rows.find(r => r && r[1] && r[1].value === 'GRAND TOTAL');
  assert.equal(grand[6].value.formula, 'SUM(' + subs.map(([, i]) => 'F' + i).join(',') + ')');
  assert.equal(grand[7].value.formula, 'SUM(' + subs.map(([, i]) => 'G' + i).join(',') + ')');
});

test('test_editing_an_input_moves_the_totals', async () => {
  const api = setup();
  await api.exportCombinedExcel();
  const ws = api.__lastExcelWorkbook.worksheets[0];
  const grand = ws.rows.find(r => r && r[1] && r[1].value === 'GRAND TOTAL');
  const before = evaluate(ws, grand[6].value.formula);
  const ann = ws.rows.find(r => r && r[2] && r[2].value === 'Ann');
  ann[4].value += 1; // one more hour at $15.37
  assert.equal(Math.round((evaluate(ws, grand[6].value.formula) - before) * 100) / 100, 15.37);
  assert.equal(evaluate(ws, ann[8].value.formula), Math.round(evaluate(ws, ann[6].value.formula)), 'cash re-rounds');
});

test('test_every_report_kind_formulas_agree_and_payroll_calc_totals_not_under_diff', async () => {
  const api = setup();
  for (const kind of ['cashOnly', 'depositOnly', 'timecard', 'payrollCalc', 'full']) {
    await api._exportExcel(kind);
    assertAllFormulasAgree(api.__lastExcelWorkbook.worksheets[0], kind);
  }
  await api._exportExcel('payrollCalc');
  const ws = api.__lastExcelWorkbook.worksheets[0];
  const sub = ws.rows.find(r => r && r[1] && r[1].value === 'Alpha Test subtotal');
  assert.equal(sub[12].value, '', 'Diff column holds no subtotal');
  assert.match(sub[10].value.formula, /^SUM\(J\d+:J\d+\)$/, 'Actual Total subtotal sits under Actual Total');
});

test('test_full_excel_merges_title_once', async () => {
  const api = setup();
  await api._exportExcel('full'); // the mock throws on a second merge of the same range
  const ws = api.__lastExcelWorkbook.worksheets[0];
  assert.equal(ws.merges.filter(m => m[0] === 1).length, 1);
});

test('test_manager_report_totals_are_sums', async () => {
  const api = setup();
  api.entities[0].newDateLabels = WEEK.slice();
  await api.exportManager();
  const ws = api.__lastExcelWorkbook.worksheets[0];
  assertAllFormulasAgree(ws, 'manager');
  const total = ws.rows.find(r => r && r[1] && r[1].value === 'TOTAL');
  assert.match(total[9].value.formula, /^SUM\(B\d+:H\d+\)$/);
  assert.equal(api.__lastExcelWorkbook.calcProperties.fullCalcOnLoad, true);
});
