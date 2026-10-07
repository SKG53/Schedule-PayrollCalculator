// Combined PDF subtotal / grand-total rows must match the Combined Excel export and the
// read-only preview to the penny: summed from actualFinal, written into the Actual Total /
// Deposit / Cash columns, with Rounded Final and Diff left blank. The PDF used to sum
// `final` and write it into the Diff column.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');
const { xlNum, xlHidesZero } = require('./xl-helpers');

const WEEK = ['Aug 9 2026', 'Aug 10 2026', 'Aug 11 2026', 'Aug 12 2026', 'Aug 13 2026', 'Aug 14 2026', 'Aug 15 2026'];
const SHIFT = ['', '9AM - 5PM', '', '', '', '', ''];
const day = (empName, entityName, out) => ({ empName, entityName, date: '2026-08-10', dayIdx: 1, pairs: [{ in: 9, out, outAdj: out, minutes: (out - 9) * 60 }] });

function setup() {
  const api = loadApp();
  const ent = resetToSingleEntity(api, {
    id: 0, name: 'Alpha Test',
    employees: [{ name: 'Ann', shifts: SHIFT }, { name: 'Ben', shifts: SHIFT }, { name: 'Cy', shifts: SHIFT }],
    dateLabels: WEEK, breakMinutesSet: true,
    actualDays: [day('Ann', 'Alpha Test', 17.2), day('Ben', 'Alpha Test', 16.45)],
  });
  api._syncEntityCode(ent);
  api.entities.push({
    id: 1, name: 'Beta Test', employees: [{ name: 'Dee', shifts: SHIFT }, { name: 'Eve', shifts: SHIFT }], dateLabels: WEEK,
    newDateLabels: ['', '', '', '', '', '', ''], newWeekStartVal: '', breakMinutes: 0, breakMinutesSet: true,
    actualDays: [day('Dee', 'Beta Test', 13.1), day('Eve', 'Beta Test', 15.35)], intake: null,
  });
  api._syncEntityCode(api.entities[1]);
  // Cash, split, flat, deposit and contract — the cash rounding makes `final` differ from
  // `actualFinal`, which is exactly what the old PDF got wrong.
  api.wageRates[api.wKey(0, 'Ann')] = 15.37; api.payMethod[api.wKey(0, 'Ann')] = 'cash';
  api.wageRates[api.wKey(0, 'Ben')] = 14.11; api.payMethod[api.wKey(0, 'Ben')] = 'both';
  api.splitAmounts[api.wKey(0, 'Ben')] = { deposit: 50, typed: true, isWhole: true };
  api.flatWages[api.wKey(0, 'Cy')] = 300;
  api.wageRates[api.wKey(1, 'Dee')] = 20.03; api.payMethod[api.wKey(1, 'Dee')] = 'cash';
  api.wageRates[api.wKey(1, 'Eve')] = 18.5; api.payMethod[api.wKey(1, 'Eve')] = 'contract';
  return api;
}

const isTotal = (label) => typeof label === 'string' && (label.endsWith(' subtotal') || label === 'GRAND TOTAL');
const money = (v) => (v === '' || v == null ? '' : '$' + Number(v).toFixed(2));
// Excel shows a formula's result, and a hidden-zero format shows 0 as blank.
const shown = (c) => (!c ? '' : (xlHidesZero(c) && xlNum(c) === 0 ? '' : money(xlNum(c))));

test('test_combined_pdf_totals_match_excel_and_preview', async () => {
  const api = setup();

  await api.exportCombinedExcel();
  const ws = api.__lastExcelWorkbook.worksheets[0];
  // 10 combined columns; 1-based sheet cells -> 0-based display text.
  const excelTotals = ws.rows.filter(r => r && r[1] && isTotal(r[1].value))
    .map(r => Array.from({ length: 10 }, (_, i) => (i === 0 ? r[1].value : shown(r[i + 1]))));

  await api.exportCombinedPdf();
  const call = api.__lastAutoTableCalls[api.__lastAutoTableCalls.length - 1];
  const pdfTotals = call.options.body.filter(r => isTotal(r[0].content))
    .map(r => r.map(c => (c && typeof c === 'object' ? c.content : c)));

  const previewTotals = api._fc13PreviewModel().rows
    .filter(r => r.kind === 'subtotal' || r.kind === 'grand').map(r => r.cells);

  assert.equal(excelTotals.length, 3, 'two entity subtotals + grand total');
  assert.deepEqual(pdfTotals, excelTotals, 'PDF total rows must equal the Excel total rows');
  assert.deepEqual(pdfTotals, previewTotals, 'PDF total rows must equal the preview total rows');
  pdfTotals.forEach(r => {
    assert.notEqual(r[5], '', 'Actual Total column carries the amount');
    assert.equal(r[8], '', 'Rounded Final stays blank');
    assert.equal(r[9], '', 'Diff column stays blank');
  });
});
