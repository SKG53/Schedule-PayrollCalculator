// FC-00015: Colored PDF export mirroring Excel.
//
// _exportPdf's combined/cashOnly/depositOnly modes must paint the exact same per-entity
// color palette that _exportExcel bakes into the Excel exports (FC-00012/FC-00014),
// resolved through _paletteForEntity(ent) so user-selected FC-00014 presets flow through
// PDF too — not the raw FC12_PALETTES constant. See FC_00015_BRIEF.md.
//
// These tests exercise the real `_exportPdf` writer end-to-end against the jsPDF/autoTable
// mock in tests/load-app.js, which now actually invokes `didParseCell` for every head/body
// cell (recording the resulting fillColor) instead of no-op'ing, so they observe exactly
// what a live export's autoTable() call would paint.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

// Builds a 2-entity fixture — one Nirvana 11th (hardcoded default palette), one Zion — each
// with a simple hourly Cash employee, mirroring the FC-00012 Excel-colors fixture closely
// enough to exercise every palette role (body/cash/subtotal/grand).
function makeTwoEntityFixture(api) {
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

  return { nirvana, zion };
}

// The autoTable mock exposes __lastAutoTableCalls (one entry per doc.autoTable() call).
// Grabs the parsed body cells for the most recent call.
function lastCallParsedCells(api) {
  const calls = api.__lastAutoTableCalls;
  assert.ok(calls && calls.length > 0, 'expected at least one autoTable() call');
  return calls[calls.length - 1].parsedCells;
}

test('test_pdf_export_applies_palette_via_didparse', async () => {
  const api = loadApp();
  makeTwoEntityFixture(api);

  await api.exportCombinedPdf();
  const cells = lastCallParsedCells(api);

  // Body-section cells only (head cells never get a fillColor from didParseCell — they
  // keep the static headStyles fill instead).
  const bodyCells = cells.filter(c => c.section === 'body');
  assert.ok(bodyCells.length > 0, 'expected body cells to have been parsed');

  const nirvanaBodyFill = api._argbToRgbTriplet(api._paletteForEntity(api.entities[0]).body);
  const nirvanaCashFill = api._argbToRgbTriplet(api._paletteForEntity(api.entities[0]).cash);
  const zionBodyFill = api._argbToRgbTriplet(api._paletteForEntity(api.entities[1]).body);
  const zionSubtotalFill = api._argbToRgbTriplet(api._paletteForEntity(api.entities[1]).subtotal);
  const grandFill = api._argbToRgbTriplet(api.FC14_PRESETS.Plain.grand);

  // Column 0 (Entity) of Nirvana's first data row -> body fill.
  const nirvanaRow0Col0 = bodyCells.find(c => c.rowIndex === 0 && c.colIndex === 0);
  assert.ok(nirvanaRow0Col0, 'expected a parsed cell at row 0 col 0');
  assert.deepEqual(nirvanaRow0Col0.fillColor, nirvanaBodyFill, 'Nirvana body fill via didParseCell');

  // Combined mode's Cash column is index 7 (0-based) -> cash tint, not plain body.
  const nirvanaRow0Col7 = bodyCells.find(c => c.rowIndex === 0 && c.colIndex === 7);
  assert.ok(nirvanaRow0Col7, 'expected a parsed cell at row 0 col 7 (Cash column)');
  assert.deepEqual(nirvanaRow0Col7.fillColor, nirvanaCashFill, 'Nirvana Cash column fill via didParseCell');

  // Nirvana subtotal row (row index 1: data row 0, subtotal row 1) -> subtotal fill + bold.
  const nirvanaSubtotal = bodyCells.find(c => c.rowIndex === 1 && c.colIndex === 0);
  assert.ok(nirvanaSubtotal, 'expected a parsed cell at the Nirvana subtotal row');
  assert.deepEqual(nirvanaSubtotal.fillColor, api._argbToRgbTriplet(api._paletteForEntity(api.entities[0]).subtotal), 'Nirvana subtotal fill via didParseCell');
  assert.equal(nirvanaSubtotal.fontStyle, 'bold', 'subtotal row is bold');

  // Zion's data row is row index 2 (after Nirvana's data row + subtotal row).
  const zionRow = bodyCells.find(c => c.rowIndex === 2 && c.colIndex === 0);
  assert.ok(zionRow, 'expected a parsed cell at the Zion data row');
  assert.deepEqual(zionRow.fillColor, zionBodyFill, 'Zion body fill via didParseCell');

  // Zion subtotal row (row index 3) -> Zion's subtotal fill, not Nirvana's.
  const zionSubtotal = bodyCells.find(c => c.rowIndex === 3 && c.colIndex === 0);
  assert.ok(zionSubtotal, 'expected a parsed cell at the Zion subtotal row');
  assert.deepEqual(zionSubtotal.fillColor, zionSubtotalFill, 'Zion subtotal fill via didParseCell');

  // Grand total row (row index 4, the last row) -> the shared Plain-preset grand fill.
  const grandRow = bodyCells.find(c => c.rowIndex === 4 && c.colIndex === 0);
  assert.ok(grandRow, 'expected a parsed cell at the grand total row');
  assert.deepEqual(grandRow.fillColor, grandFill, 'grand total fill via didParseCell');
  assert.equal(grandRow.fontStyle, 'bold', 'grand total row is bold');
});

test('test_pdf_export_uses_user_selected_fc00014_preset', async () => {
  // FC-00015 DoD #3: palette resolution must go through _paletteForEntity (which consults
  // entityPalettes, the FC-00014 user-selection map), not the raw FC12_PALETTES constant —
  // so a user-selected preset override actually changes the PDF's fill colors.
  const api = loadApp();
  const { nirvana } = makeTwoEntityFixture(api);

  // Sanity: Nirvana 11th's hardcoded default is 'Green', not 'Sunset'.
  assert.equal(api.getEntityPalette(nirvana), 'Green');
  api.setEntityPalette(nirvana.id, 'Sunset');
  assert.equal(api.getEntityPalette(nirvana), 'Sunset');

  await api.exportCombinedPdf();
  const bodyCells = lastCallParsedCells(api).filter(c => c.section === 'body');

  const sunsetBodyFill = api._argbToRgbTriplet(api.FC14_PRESETS.Sunset.body);
  const defaultGreenBodyFill = api._argbToRgbTriplet(api.FC14_PRESETS['Green'].body);

  const nirvanaRow0Col0 = bodyCells.find(c => c.rowIndex === 0 && c.colIndex === 0);
  assert.ok(nirvanaRow0Col0);
  assert.deepEqual(nirvanaRow0Col0.fillColor, sunsetBodyFill, 'PDF picks up the user-selected Sunset preset');
  assert.notDeepEqual(nirvanaRow0Col0.fillColor, defaultGreenBodyFill, 'PDF must not fall back to the hardcoded default once a preset is chosen');
});

test('test_pdf_cashonly_and_depositonly_apply_palette_correctly', async () => {
  const api = loadApp();
  makeTwoEntityFixture(api);

  // Cash-Only: last column (Cash Portion) gets the cash tint.
  await api.exportCashPdf();
  const cashCells = lastCallParsedCells(api).filter(c => c.section === 'body');
  const spec = api._columnsFor('cashOnly');
  const lastColIdx = spec.headers.length - 1;
  const nirvanaCashPortion = cashCells.find(c => c.rowIndex === 0 && c.colIndex === lastColIdx);
  assert.ok(nirvanaCashPortion);
  assert.deepEqual(nirvanaCashPortion.fillColor, api._argbToRgbTriplet(api._paletteForEntity(api.entities[0]).cash), 'cashOnly Cash Portion column gets the cash tint');
  const nirvanaCashBody = cashCells.find(c => c.rowIndex === 0 && c.colIndex === 0);
  assert.deepEqual(nirvanaCashBody.fillColor, api._argbToRgbTriplet(api._paletteForEntity(api.entities[0]).body), 'cashOnly body fill');

  // Deposit-Only: no cash tint anywhere — every body column (including Deposit Portion,
  // the last column) is just the plain body color, matching the Excel writer's behavior.
  api.payMethod[api.wKey(1, 'Varshitha')] = 'deposit';
  await api.exportDepositPdf();
  const depCells = lastCallParsedCells(api).filter(c => c.section === 'body');
  const depSpec = api._columnsFor('depositOnly');
  const depLastColIdx = depSpec.headers.length - 1;
  const zionDepositPortion = depCells.find(c => c.rowIndex === 0 && c.colIndex === depLastColIdx);
  assert.ok(zionDepositPortion);
  assert.deepEqual(zionDepositPortion.fillColor, api._argbToRgbTriplet(api._paletteForEntity(api.entities[1]).body), 'depositOnly Deposit Portion column is body-colored, not specially tinted');
});

test('test_pdf_uncolored_modes_no_palette', async () => {
  // FC-00015 DoD #2: timecard and payrollCalc PDF exports must remain uncolored (mirrors
  // FC-00012's Excel scope) — no per-entity PALETTE fill is ever applied via the
  // didParseCell hook for those modes, even though the same hook function runs for every
  // section. Note: subtotal/grand rows in every mode (including timecard/payrollCalc) keep
  // their pre-existing plain gray shading ([240,239,233]/[224,222,213], set directly on the
  // row content objects, not via the palette hook) — that shading predates FC-00015 and is
  // unrelated to entity palettes, so this test targets DATA rows only, where a palette fill
  // would show up if the hook wrongly colorized these modes.
  const api = loadApp();
  makeTwoEntityFixture(api);

  await api.exportTimecardPdf();
  // Data rows are every row except the last two (subtotal, grand) per entity block; with
  // one entity + one employee that's just row 0.
  const tcDataCells = lastCallParsedCells(api).filter(c => c.section === 'body' && c.rowIndex === 0);
  assert.ok(tcDataCells.length > 0, 'expected timecard data-row cells to have been parsed');
  assert.ok(tcDataCells.every(c => c.fillColor === undefined), 'timecard PDF export data rows must remain uncolored — no palette fillColor from didParseCell');

  await api.exportPayrollCalcPdf();
  const pcDataCells = lastCallParsedCells(api).filter(c => c.section === 'body' && c.rowIndex === 0);
  assert.ok(pcDataCells.length > 0, 'expected payrollCalc data-row cells to have been parsed');
  assert.ok(pcDataCells.every(c => c.fillColor === undefined), 'payrollCalc PDF export data rows must remain uncolored — no palette fillColor from didParseCell');
});

test('test_argb_to_rgb_triplet_conversion', () => {
  const api = loadApp();
  assert.deepEqual(api._argbToRgbTriplet('FFAABBCC'), [0xAA, 0xBB, 0xCC]);
  assert.deepEqual(api._argbToRgbTriplet('FF000000'), [0, 0, 0]);
  assert.deepEqual(api._argbToRgbTriplet('FFFFFFFF'), [255, 255, 255]);
  // Alpha byte is ignored/dropped regardless of its value.
  assert.deepEqual(api._argbToRgbTriplet('00A6A6A6'), [0xA6, 0xA6, 0xA6]);
});

test('test_pdf_flat_employee_row_shape_preserved', async () => {
  // FC-00015 DoD #1 last bullet: flat employees keep the same display shape in PDF as
  // Excel — name gets " (flat)" suffix, Hours blank, Rate literal "flat" — and still get
  // their entity's palette body fill like every other row for that entity.
  const api = loadApp();
  const { zion } = makeTwoEntityFixture(api);
  api.payMethod[api.wKey(1, 'Shumaila')] = 'cash';
  api.flatWages[api.wKey(1, 'Shumaila')] = 400;
  api.flatWagesDisplayNames['shumaila'] = 'Shumaila';

  await api.exportCombinedPdf();
  const calls = api.__lastAutoTableCalls;
  const lastCall = calls[calls.length - 1];
  const flatRow = lastCall.options.body.find(row => typeof row[1] === 'string' && row[1].includes('(flat)'));
  assert.ok(flatRow, 'expected to find the flat employee row in the PDF body');
  assert.equal(flatRow[1], 'Shumaila (flat)');
  assert.equal(flatRow[3], '', 'Hours must be blank for a flat-amount employee');
  assert.equal(flatRow[4], 'flat', 'Rate must read the text "flat"');
});
