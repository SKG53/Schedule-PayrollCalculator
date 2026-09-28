// FC-00023: Never block export.
//
// _blockExportIfDuplicates() used to abort every export entry point (schedule, manager,
// payroll Excel/PDF, actuals intake, settings) whenever two records in one entity shared a
// display name. Exports must always write their file; duplicate detection stays as an
// informational banner / inline flag only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, resetToSingleEntity } = require('./load-app');

const WEEK = ['Aug 9 2026', 'Aug 10 2026', 'Aug 11 2026', 'Aug 12 2026', 'Aug 13 2026', 'Aug 14 2026', 'Aug 15 2026'];
const SHIFTS = ['OFF', '9AM - 5PM', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'];

// One entity with a duplicate display name AND a flagged, needs-review intake row.
function setup() {
  const api = loadApp();
  const ent = resetToSingleEntity(api, {
    id: 0,
    name: 'Test Nirvana',
    employees: [{ name: 'Dana Kim', shifts: SHIFTS.slice() }, { name: 'Dana Kimberly', shifts: SHIFTS.slice() }],
    dateLabels: WEEK,
    breakMinutesSet: true,
    actualDays: [
      { empName: 'Dana Kim', entityName: 'Test Nirvana', date: '2026-08-10', dayIdx: 1, pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }] },
    ],
  });
  api._syncEntityCode(ent);
  api.wageRates[api.wKey(0, 'Dana Kim')] = 15;
  api.wageRates[api.wKey(0, 'Dana Kimberly')] = 16;
  api.renameEmployeeViaDispatcher(0, 'Dana Kimberly', 'Dana Kim', 'payroll');
  assert.equal(api.hasDuplicateNames(0), true, 'fixture must contain a duplicate');

  api.ensureIntakeState(ent);
  const flagged = api.processReviewRow({
    empName: 'Dana Kim', date: '2026-08-10', clockIn1: '09:00', clockOut1: '', confidence: 0.5, originalName: 'x.jpg',
  }, ent);
  ent.intake.reviewRows.push(flagged);
  assert.equal(flagged.needsReview, true, 'fixture must contain a flagged row');
  ent.intake.ocrDone = true;

  // Keep readTableState from rebuilding the schedule out of the empty fake DOM.
  api.__sandbox.document.getElementById('schedWrap').style.display = 'none';

  // Record every file an export writes: Excel via downloadBlob's <a download>, PDF via doc.save().
  const written = [];
  const doc = api.__sandbox.document;
  const origCreate = doc.createElement;
  doc.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === 'a') el.click = () => { if (el.download) written.push(el.download); };
    return el;
  };
  const origPdf = api.__sandbox.window.jspdf.jsPDF;
  api.__sandbox.window.jspdf = {
    jsPDF: function (opts) {
      const d = origPdf(opts);
      d.save = (name) => written.push(name);
      return d;
    },
  };
  return { api, written };
}

const EXPORTS = [
  'exportEmployee',
  'exportManager',
  'exportCashExcel', 'exportCashPdf',
  'exportDepositExcel', 'exportDepositPdf',
  'exportCombinedExcel', 'exportCombinedPdf',
  'exportTimecardExcel', 'exportTimecardPdf',
  'exportPayrollCalcExcel', 'exportPayrollCalcPdf',
  'exportFullExcel', 'exportFullPdf',
  'exportActualsIntakeExcel', 'exportActualsIntakePdf',
];

EXPORTS.forEach(name => {
  test(`test_${name}_writes_file_with_duplicates_and_flags`, async () => {
    const { api, written } = setup();
    await api[name]();
    assert.equal(written.length, 1, `${name} must write exactly one file despite duplicates/flags`);
  });
});

test('test_exportPayrollSettingsExcel_writes_file_with_duplicates', async () => {
  const { api, written } = setup();
  await api.exportPayrollSettingsExcel(false);
  assert.equal(written.length, 1);
});

test('test_duplicate_warning_is_informational', () => {
  const { api } = setup();
  const banner = api._dupBannerHtml();
  const flag = api._dupFlagHtml(0, 'Dana Kim');
  assert.match(banner, /double-check/);
  assert.match(flag, /Possible duplicate/);
  [banner, flag].forEach(h => {
    assert.doesNotMatch(h, /blocked|resolve before export/i);
  });
});

test('test_no_export_gate_remains', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /_blockExportIfDuplicates/);
  assert.doesNotMatch(html, /Cannot export/);
});
