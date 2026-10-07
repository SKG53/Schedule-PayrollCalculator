// FC-00035: unchecking Active on Payroll Calculation leaves that person out of this week's
// preview and every export, and every place that leaves them out says who — loudly when they
// have hours or pay this week.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');
const { xlNum } = require('./xl-helpers');

const WEEK = ['Aug 9 2026', 'Aug 10 2026', 'Aug 11 2026', 'Aug 12 2026', 'Aug 13 2026', 'Aug 14 2026', 'Aug 15 2026'];
const SHIFT = ['', '9AM - 5PM', '', '', '', '', ''];
const day = (empName, out) => ({ empName, entityName: 'Act Co', date: '2026-08-10', dayIdx: 1, pairs: [{ in: 9, out, outAdj: out, minutes: (out - 9) * 60 }] });

function setup() {
  const api = loadApp();
  const ent = resetToSingleEntity(api, {
    id: 0, name: 'Act Co', employees: ['Ann', 'Ben', 'Cy'].map(name => ({ name, shifts: SHIFT })),
    dateLabels: WEEK, newDateLabels: WEEK, breakMinutesSet: true, actualDays: [day('Ann', 17), day('Ben', 13)],
  });
  api._syncEntityCode(ent);
  api.wageRates[api.wKey(0, 'Ann')] = 15;
  api.wageRates[api.wKey(0, 'Ben')] = 20;
  api.wageRates[api.wKey(0, 'Cy')] = 12; // scheduled, no punches: 0 h
  return { api, ent, doc: api.__sandbox.document };
}
const names = (api) => api._collectExportData().flatMap(d => d.rows.map(r => r._empName));

test('test_unchecked_zero_hour_person_left_out_everywhere_with_quiet_note', async () => {
  const { api, doc } = setup();
  api.setRosterActive(0, 'Cy', false);
  assert.deepEqual(names(api).sort(), ['Ann', 'Ben']);
  api.renderPayrollEntityContent(0);
  const fc13 = doc.getElementById('fc13PreviewHost').innerHTML;
  assert.ok(!/>Cy</.test(fc13.split('inactive-excluded-banner')[1].split('</div>').slice(1).join('')), 'Cy not in the preview table');
  assert.match(fc13, /Left out \(Active unchecked\): Cy\./);
  assert.ok(!/Cy/.test(doc.getElementById('allEntityPreviewHost').innerHTML), 'not in the all-entity preview');
  await api.exportCombinedExcel();
  const ws = api.__lastExcelWorkbook.worksheets[0];
  assert.ok(!ws.rows.some(r => r && r[2] && /^Cy/.test(String(r[2].value))), 'not in the Excel export');
  await api.exportCombinedPdf();
  const body = api.__lastAutoTableCalls[api.__lastAutoTableCalls.length - 1].options.body;
  assert.ok(!body.some(r => r.some(c => (c && c.content !== undefined ? c.content : c) === 'Cy')), 'not in the PDF export');
  assert.match(doc.getElementById('toast').innerHTML, /Active unchecked: Cy/);
  assert.match(doc.getElementById('toast').className, /ok/, 'zero-hour exclusion is informational');
});

test('test_unchecked_person_with_hours_is_a_loud_warning', async () => {
  const { api, doc } = setup();
  api.setRosterActive(0, 'Ben', false);
  const s = api._inactiveExclusionSummary();
  assert.equal(s.withPay.length, 1);
  assert.deepEqual({ h: s.withPay[0].hours, p: s.withPay[0].pay }, { h: 4, p: 80 });
  api.renderPayrollEntityContent(0);
  assert.match(doc.getElementById('fc13PreviewHost').innerHTML, /Active unchecked but has hours or pay this week: Ben \(Act Co: 4\.00 h, \$80\.00\)/);
  await api.exportCombinedExcel();
  assert.match(doc.getElementById('toast').className, /err/);
  assert.match(doc.getElementById('toast').innerHTML, /Active unchecked but has hours\/pay: Ben/);
  const grand = api.__lastExcelWorkbook.worksheets[0].rows.find(r => r && r[1] && r[1].value === 'GRAND TOTAL');
  assert.equal(xlNum(grand[6]), 120, 'only Ann (8 h x $15) is paid');
});

test('test_checkbox_toast_payroll_calc_totals_and_recheck', () => {
  const { api, doc } = setup();
  api.renderPayrollEntityContent(0);
  const calcRows = () => doc.getElementById('payrollCalcTable').innerHTML;
  // Row index = position in the rendered Payroll Calculation table.
  const benIdx = calcRows().split('<tr').filter(t => /setRowActive\(/.test(t)).findIndex(t => /Ben/.test(t));
  assert.ok(benIdx >= 0);
  api.setRowActive(benIdx, false);
  assert.match(doc.getElementById('toast').innerHTML, /has 4\.00 h this week — they will not be paid/);
  const html = calcRows();
  assert.match(html, /left out of export/);
  const total = html.split('class="total-row"')[1];
  assert.match(total, /\$120\.00/, 'Payroll Calculation total matches the export (Ann only)');
  api.setRowActive(benIdx, true);
  assert.deepEqual(names(api).sort(), ['Ann', 'Ben', 'Cy']);
});

test('test_settings_export_still_lists_unchecked_people', () => {
  const { api } = setup();
  api.setRosterActive(0, 'Cy', false);
  const rows = api._gatherPayrollSettingsRows(false);
  const cy = rows.find(r => r.name === 'Cy' || r.employeeName === 'Cy' || r.employee === 'Cy');
  assert.ok(cy, 'roster file keeps the person');
  assert.equal(cy.active, 'No');
});
