// FC-00027: an entity with actuals but no schedule must appear in every payroll export and
// both previews. It used to compute on screen and then silently vanish from the files.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

const WEEK = ['Aug 9 2026', 'Aug 10 2026', 'Aug 11 2026', 'Aug 12 2026', 'Aug 13 2026', 'Aug 14 2026', 'Aug 15 2026'];
const day = (empName, entityName) => ({ empName, entityName, date: '2026-08-10', dayIdx: 1, pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] });

function setup() {
  const api = loadApp();
  resetToSingleEntity(api, {
    id: 0, name: 'Sched Co', employees: [{ name: 'Ann', shifts: ['', '9AM - 5PM', '', '', '', '', ''] }],
    dateLabels: WEEK, breakMinutesSet: true, actualDays: [day('Ann', 'Sched Co')],
  });
  api._syncEntityCode(api.entities[0]);
  api.entities.push({
    id: 1, name: 'NoSched Co', code: '', employees: [], dateLabels: ['', '', '', '', '', '', ''],
    newDateLabels: ['', '', '', '', '', '', ''], newWeekStartVal: '', breakMinutes: 0, breakMinutesSet: true,
    actualDays: [day('Jane', 'NoSched Co')], intake: null,
  });
  api._syncEntityCode(api.entities[1]);
  api.wageRates[api.wKey(0, 'Ann')] = 15;
  api.wageRates[api.wKey(1, 'Jane')] = 20;
  api.payMethod[api.wKey(1, 'Jane')] = 'cash';
  return api;
}

test('test_collect_export_data_includes_no_schedule_entity', () => {
  const api = setup();
  const data = api._collectExportData();
  assert.deepEqual(data.map(d => d.entityName), ['Sched Co', 'NoSched Co']);
  const jane = data[1].rows.find(r => r._empName === 'Jane');
  assert.ok(jane, 'actuals-only employee must be exported');
  assert.equal(jane._breakdown.actualFinal, 160);
  assert.equal(jane._breakdown.cash, 160);
});

test('test_combined_excel_and_pdf_carry_no_schedule_entity', async () => {
  const api = setup();
  await api.exportCombinedExcel();
  const ws = api.__lastExcelWorkbook.worksheets[0];
  const janeRow = ws.rows.find(r => r && r[2] && /^Jane/.test(String(r[2].value)));
  assert.ok(janeRow, 'Jane in the Combined Excel');
  const grand = ws.rows.filter(r => r && r[1] && r[1].value === 'GRAND TOTAL').pop();
  assert.equal(grand[6].value, 120 + 160, 'grand total = 8h x $15 + 8h x $20');

  await api.exportCashPdf();
  const call = api.__lastAutoTableCalls[api.__lastAutoTableCalls.length - 1];
  assert.ok(call.options.body.some(r => typeof r[1] === 'string' && r[1].startsWith('Jane')), 'Jane in the Cash-Only PDF');
});

test('test_previews_include_no_schedule_entity', () => {
  const api = setup();
  const model = api._fc13PreviewModel();
  assert.ok(model.rows.some(r => r.kind === 'data' && /^Jane/.test(r.cells[1])), 'combined preview shows Jane');
  assert.ok(model.rows.some(r => r.kind === 'subtotal' && r.cells[0] === 'NoSched Co subtotal'));
  api.renderPayroll();
  const host = api.__sandbox.document.getElementById('allEntityPreviewHost');
  assert.match(host.innerHTML, /NoSched Co/, 'all-entity preview shows the no-schedule entity');
});

test('test_break_confirmation_covers_no_schedule_entity', async () => {
  const api = setup();
  api.entities[1].breakMinutesSet = false;
  let asked = '';
  api.__sandbox.confirm = (msg) => { asked = msg; return false; };
  const before = api.__lastExcelWorkbook;
  await api.exportCombinedExcel();
  assert.match(asked, /NoSched Co/, 'unconfirmed break on an actuals-only entity must prompt');
  assert.equal(api.__lastExcelWorkbook, before, 'declining the prompt still cancels the export as before');
});

test('test_empty_entity_still_skipped', () => {
  const api = setup();
  api.entities.push({ id: 2, name: 'Empty Co', code: '', employees: [], dateLabels: ['', '', '', '', '', '', ''],
    newDateLabels: ['', '', '', '', '', '', ''], newWeekStartVal: '', breakMinutes: 0, breakMinutesSet: true, actualDays: [], intake: null });
  assert.ok(!api._collectExportData().some(d => d.entityName === 'Empty Co'), 'an entity with no rows at all exports nothing');
});
