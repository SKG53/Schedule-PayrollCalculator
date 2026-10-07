// FC-00032: the week filter stays (only the loaded schedule's week is paid) but is never silent.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

const WEEK = ['Aug 9 2026', 'Aug 10 2026', 'Aug 11 2026', 'Aug 12 2026', 'Aug 13 2026', 'Aug 14 2026', 'Aug 15 2026'];
const day = (empName, date, dayIdx) => ({ empName, entityName: 'Week Co', date, dayIdx, pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] });

function setup(dateLabels = WEEK) {
  const api = loadApp();
  resetToSingleEntity(api, {
    id: 0, name: 'Week Co', employees: [{ name: 'Ann', shifts: ['', '9AM - 5PM', '', '', '', '', ''] }],
    dateLabels, breakMinutesSet: true,
    actualDays: [day('Ann', '2026-08-10', 1), day('Ann', '2026-08-03', 1)],
  });
  api.wageRates[api.wKey(0, 'Ann')] = 10;
  return api;
}

test('test_filter_still_excludes_out_of_week_punches', () => {
  const api = setup();
  const c = api.computePayrollForEntity(0);
  assert.equal(c.results[0].actualHours, 8, 'only the in-week day is paid');
  assert.deepEqual(c.excludedActuals, [{ empName: 'Ann', date: '2026-08-03', hours: 8 }]);
  assert.equal(c.weekInfo.start, '2026-08-09');
  assert.equal(c.weekInfo.end, '2026-08-15');
});

test('test_payroll_tab_shows_excluded_banner', () => {
  const api = setup();
  api.renderPayrollEntityContent(0);
  const html = api.__sandbox.document.getElementById('payrollEntityContent').innerHTML;
  assert.match(html, /1 approved punch day is outside this schedule's week \(08\/09\/26 – 08\/15\/26\) and NOT counted/);
  assert.match(html, /Ann — 08\/03\/26 \(8\.00 h worked\)/);
});

test('test_preview_and_export_toast_report_exclusion', async () => {
  const api = setup();
  api.renderFc00013PreviewPanel();
  assert.match(api.__sandbox.document.getElementById('fc13PreviewHost').innerHTML, /Not in this export: 1 punch day outside the schedule week \(8\.00 h\)/);
  await api.exportCombinedExcel();
  assert.match(api.__sandbox.document.getElementById('toast').innerHTML, /NOT included: 1 punch day outside the schedule week/);
});

test('test_no_date_row_warning', () => {
  const api = setup(['', '', '', '', '', '', '']);
  const c = api.computePayrollForEntity(0);
  assert.equal(c.weekInfo.noDateRow, true);
  assert.equal(c.excludedActuals.length, 0, 'filter off — nothing excluded');
  api.renderPayrollEntityContent(0);
  assert.match(api.__sandbox.document.getElementById('payrollEntityContent').innerHTML, /no date row, so the week filter is OFF/);
});

test('test_no_banner_when_everything_in_week', () => {
  const api = setup();
  api.entities[0].actualDays.pop();
  api.renderPayrollEntityContent(0);
  assert.doesNotMatch(api.__sandbox.document.getElementById('payrollEntityContent').innerHTML, /week-filter-banner/);
});
