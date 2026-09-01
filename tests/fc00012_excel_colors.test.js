// FC-00012: Bake color scheme into Excel exports.
//
// The Combined/Cash-Only/Deposit-Only Excel exports must come out with the exact
// per-entity color palette that used to be applied by hand (FFE8F0DC for Nirvana 11th,
// FFDCE6F1 for Zion, FFFCE4D6 for Hefner, with a bluer FFBDD7EE/FF9DC3E6 tint on the Cash
// column) — see FC_00012_BRIEF.md and the reference file
// Nirvana_Zion_Hefner_0809to0815_AllEmployeesPayroll_Colors.xlsx. Palette is hardcoded,
// looked up by ent.code (FC-00007), with a DEFAULT fallback for unknown codes.
//
// These tests exercise the real `_exportExcel` writer end-to-end against the ExcelJS mock
// in tests/load-app.js (which now records real fill/value state per cell instead of
// no-op'ing), so they observe exactly what a live export would paint onto the workbook.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

// Builds a 3-entity fixture — one Nirvana 11th, one Zion, one Hefner — each with a simple
// hourly employee on Cash, plus a flat-amount employee on Hefner, mirroring the reference
// report's shape closely enough to exercise every palette + the flat-row special case.
function makeThreeEntityFixture(api) {
  const nirvana = resetToSingleEntity(api, {
    id: 0,
    name: 'Nirvana 11th',
    employees: [{ name: 'Balu', shifts: ['', '9AM - 5PM', '', '', '', '', ''] }],
    dateLabels: ['', 'Mon Aug 10 2026', '', '', '', '', ''],
    breakMinutes: 0,
    breakMinutesSet: true,
    actualDays: [{
      empName: 'Balu', entityName: 'Nirvana 11th', date: '2026-08-10', dayIdx: 1,
      pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }],
    }],
  });
  api._syncEntityCode(nirvana);
  api.wageRates[api.wKey(0, 'Balu')] = 15;
  api.payMethod[api.wKey(0, 'Balu')] = 'cash';

  const zion = { id: 1, name: 'Zion', code: '',
    employees: [{ name: 'Varshitha', shifts: ['', '9AM - 5PM', '', '', '', '', ''] }],
    dateLabels: ['', 'Mon Aug 10 2026', '', '', '', '', ''],
    newDateLabels: ['', '', '', '', '', '', ''], newWeekStartVal: '',
    breakMinutes: 0, breakMinutesSet: true,
    actualDays: [{
      empName: 'Varshitha', entityName: 'Zion', date: '2026-08-10', dayIdx: 1,
      pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }],
    }] };
  api._syncEntityCode(zion);
  api.entities.push(zion);
  api.wageRates[api.wKey(1, 'Varshitha')] = 15;
  api.payMethod[api.wKey(1, 'Varshitha')] = 'cash';

  const hefner = { id: 2, name: 'Hefner', code: '',
    employees: [
      { name: 'Faisal', shifts: ['', '9AM - 5PM', '', '', '', '', ''] },
      { name: 'Shumaila', shifts: ['', '', '', '', '', '', ''] },
    ],
    dateLabels: ['', 'Mon Aug 10 2026', '', '', '', '', ''],
    newDateLabels: ['', '', '', '', '', '', ''], newWeekStartVal: '',
    breakMinutes: 0, breakMinutesSet: true,
    actualDays: [{
      empName: 'Faisal', entityName: 'Hefner', date: '2026-08-10', dayIdx: 1,
      pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }],
    }] };
  api._syncEntityCode(hefner);
  api.entities.push(hefner);
  api.wageRates[api.wKey(2, 'Faisal')] = 15;
  api.payMethod[api.wKey(2, 'Faisal')] = 'cash';
  api.payMethod[api.wKey(2, 'Shumaila')] = 'cash';
  // Shumaila is a flat-amount employee (no hourly wage/schedule) — exercised by
  // getFlatWageRows, matching how the reference report shows "SHUMAILA (flat)".
  api.flatWages[api.wKey(2, 'Shumaila')] = 400;
  api.flatWagesDisplayNames['shumaila'] = 'Shumaila';

  return { nirvana, zion, hefner };
}

// Reads every fill argb actually painted onto a worksheet, keyed by "row,col".
function fillMapFor(ws) {
  const map = {};
  for (let r = 1; r < ws.rows.length; r++) {
    const row = ws.rows[r];
    if (!row) continue;
    for (let c = 1; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const argb = cell.fill && cell.fill.fgColor ? cell.fill.fgColor.argb : undefined;
      if (argb) map[`${r},${c}`] = argb;
    }
  }
  return map;
}

function findRowIndex(ws, predicate) {
  for (let r = 1; r < ws.rows.length; r++) {
    const row = ws.rows[r];
    if (!row) continue;
    if (predicate(row)) return r;
  }
  return -1;
}

test('test_export_applies_entity_palette', async () => {
  const api = loadApp();
  makeThreeEntityFixture(api);

  await api.exportCombinedExcel();
  // The mock records every created worksheet on the workbook instance _exportExcel just
  // built; grab it back via the API's most-recently-constructed-workbook pointer.
  const wb = api.__lastExcelWorkbook;
  assert.ok(wb, 'expected _exportExcel to have constructed a workbook the test can inspect');
  const sheet = wb.worksheets.find(w => w.name === 'Report');
  assert.ok(sheet, 'expected a Report worksheet');

  const fills = fillMapFor(sheet);

  // Locate each entity's first data row by its Entity-column (col 1) text and assert the
  // palette's body fill landed there, and that the Cash column (col 8) got the cash tint.
  const nirvanaRow = findRowIndex(sheet, row => row[1] && row[1].value === 'Nirvana 11th');
  const zionRow = findRowIndex(sheet, row => row[1] && row[1].value === 'Zion');
  const hefnerRow = findRowIndex(sheet, row => row[1] && row[1].value === 'Hefner' && /Faisal/.test(row[2].value || ''));
  assert.ok(nirvanaRow > 0 && zionRow > 0 && hefnerRow > 0, 'expected to find one data row per entity');

  assert.equal(fills[`${nirvanaRow},1`], api.FC12_PALETTES.N11.body, 'Nirvana 11th body fill');
  assert.equal(fills[`${nirvanaRow},8`], api.FC12_PALETTES.N11.cash, 'Nirvana 11th Cash column fill');
  assert.equal(fills[`${zionRow},1`], api.FC12_PALETTES.ZIO.body, 'Zion body fill');
  assert.equal(fills[`${zionRow},8`], api.FC12_PALETTES.ZIO.cash, 'Zion Cash column fill');
  assert.equal(fills[`${hefnerRow},1`], api.FC12_PALETTES.HEF.body, 'Hefner body fill');
  assert.equal(fills[`${hefnerRow},8`], api.FC12_PALETTES.HEF.cash, 'Hefner Cash column fill');

  // Header row (row 3: title, blank, header) gets the shared header fill for every palette.
  const headerRow = findRowIndex(sheet, row => row[1] && row[1].value === 'Entity');
  assert.equal(fills[`${headerRow},1`], 'FFE8E8E4', 'header fill');

  // Subtotal rows use the gray subtotal fill, not the entity body color.
  const nirvanaSubtotalRow = findRowIndex(sheet, row => row[1] && /subtotal/i.test(row[1].value || ''));
  assert.ok(nirvanaSubtotalRow > 0);
  assert.equal(fills[`${nirvanaSubtotalRow},1`], api.FC12_PALETTES.N11.subtotal, 'subtotal fill matches the palette (currently the shared gray)');

  // Cash-Only export: the Cash Portion column (last column) gets the palette's cash tint,
  // and the body columns get the palette's body color.
  await api.exportCashExcel();
  const wbCash = api.__lastExcelWorkbook;
  const sheetCash = wbCash.worksheets.find(w => w.name === 'Report');
  const fillsCash = fillMapFor(sheetCash);
  const zionCashRow = findRowIndex(sheetCash, row => row[1] && row[1].value === 'Zion');
  assert.ok(zionCashRow > 0);
  assert.equal(fillsCash[`${zionCashRow},1`], api.FC12_PALETTES.ZIO.body, 'cashOnly body fill');
  const lastCol = sheetCash.rows[zionCashRow].length - 1;
  assert.equal(fillsCash[`${zionCashRow},${lastCol}`], api.FC12_PALETTES.ZIO.cash, 'cashOnly Cash Portion column gets the cash tint');

  // Deposit-Only export: no special cash tint — every body column (including the Deposit
  // Portion column) is just the palette's plain body color.
  api.payMethod[api.wKey(1, 'Varshitha')] = 'deposit';
  await api.exportDepositExcel();
  const wbDep = api.__lastExcelWorkbook;
  const sheetDep = wbDep.worksheets.find(w => w.name === 'Report');
  const fillsDep = fillMapFor(sheetDep);
  const zionDepRow = findRowIndex(sheetDep, row => row[1] && row[1].value === 'Zion');
  assert.ok(zionDepRow > 0);
  const lastColDep = sheetDep.rows[zionDepRow].length - 1;
  assert.equal(fillsDep[`${zionDepRow},1`], api.FC12_PALETTES.ZIO.body, 'depositOnly body fill');
  assert.equal(fillsDep[`${zionDepRow},${lastColDep}`], api.FC12_PALETTES.ZIO.body, 'depositOnly Deposit column is body-colored, not specially tinted');

  // Timecard/PayrollCalc exports stay uncolored — no fills applied to data rows at all.
  await api.exportTimecardExcel();
  const wbTc = api.__lastExcelWorkbook;
  const sheetTc = wbTc.worksheets.find(w => w.name === 'Report');
  const fillsTc = fillMapFor(sheetTc);
  const nirvanaTcRow = findRowIndex(sheetTc, row => row[1] && row[1].value === 'Nirvana 11th');
  assert.ok(nirvanaTcRow > 0);
  assert.equal(fillsTc[`${nirvanaTcRow},1`], undefined, 'timecard export must remain uncolored');
});

test('test_export_flat_employee_row_shape', async () => {
  const api = loadApp();
  makeThreeEntityFixture(api);

  await api.exportCombinedExcel();
  const wb = api.__lastExcelWorkbook;
  const sheet = wb.worksheets.find(w => w.name === 'Report');

  const flatRowIdx = findRowIndex(sheet, row => row[2] && typeof row[2].value === 'string' && row[2].value.includes('(flat)'));
  assert.ok(flatRowIdx > 0, 'expected to find the flat employee row');
  const row = sheet.rows[flatRowIdx];

  // Name gets " (flat)" suffix (col 2 = Employee).
  assert.equal(row[2].value, 'Shumaila (flat)');
  // Hours cell (col 4) is blank for a flat employee.
  assert.equal(row[4].value, '', 'Hours must be blank for a flat-amount employee');
  // Rate cell (col 5) reads the literal text "flat".
  assert.equal(row[5].value, 'flat', 'Rate must read the text "flat"');
  // Still gets Hefner's palette body fill like every other Hefner row.
  assert.equal(row[1].fill.fgColor.argb, api.FC12_PALETTES.HEF.body, 'flat row still gets its entity palette');
});

test('test_export_unknown_entity_code_falls_back_to_default_palette', async () => {
  const api = loadApp();
  const ent = resetToSingleEntity(api, {
    id: 0,
    name: 'Some New Client LLC',
    employees: [{ name: 'Pat', shifts: ['', '9AM - 5PM', '', '', '', '', ''] }],
    dateLabels: ['', 'Mon Aug 10 2026', '', '', '', '', ''],
    breakMinutes: 0,
    breakMinutesSet: true,
    actualDays: [{
      empName: 'Pat', entityName: 'Some New Client LLC', date: '2026-08-10', dayIdx: 1,
      pairs: [{ in: 9, out: 17, outAdj: 17, minutes: 480 }],
    }],
  });
  api._syncEntityCode(ent);
  assert.notEqual(ent.code, 'N11');
  assert.notEqual(ent.code, 'ZIO');
  assert.notEqual(ent.code, 'HEF');
  api.wageRates[api.wKey(0, 'Pat')] = 15;
  api.payMethod[api.wKey(0, 'Pat')] = 'cash';

  await api.exportCombinedExcel();
  const wb = api.__lastExcelWorkbook;
  const sheet = wb.worksheets.find(w => w.name === 'Report');
  const patRow = findRowIndex(sheet, row => row[1] && row[1].value === 'Some New Client LLC');
  assert.ok(patRow > 0);
  assert.equal(sheet.rows[patRow][1].fill.fgColor.argb, api.FC12_PALETTES.DEFAULT.body, 'unknown entity code falls back to DEFAULT body fill');
  assert.equal(sheet.rows[patRow][8].fill.fgColor.argb, api.FC12_PALETTES.DEFAULT.cash, 'unknown entity code falls back to DEFAULT cash fill');
});
