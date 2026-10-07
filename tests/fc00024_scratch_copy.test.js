// FC-00024: "God mode" — editable scratch copy of the combined preview.
//
// "Make editable copy" snapshots the read-only FC-00013 preview into an independent,
// in-memory table whose every cell is editable. "Export this copy" writes .xlsx/.pdf
// straight from the copy's current cells. Editing or exporting the copy must never touch
// session data, the roster, computePayroll or the read-only preview.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');
const { xlNum } = require('./xl-helpers');

const WEEK = ['Aug 9 2026', 'Aug 10 2026', 'Aug 11 2026', 'Aug 12 2026', 'Aug 13 2026', 'Aug 14 2026', 'Aug 15 2026'];
const SHIFT = ['', '9AM - 5PM', '', '', '', '', ''];
const day = (empName, entityName, out) => ({ empName, entityName, date: '2026-08-10', dayIdx: 1, pairs: [{ in: 9, out, outAdj: out, minutes: (out - 9) * 60 }] });

function setup() {
  const api = loadApp();
  const ent = resetToSingleEntity(api, {
    id: 0, name: 'Alpha Test',
    employees: [{ name: 'Ann', shifts: SHIFT }, { name: 'Ben', shifts: SHIFT }, { name: 'Cy', shifts: SHIFT }],
    dateLabels: WEEK, breakMinutesSet: true,
    actualDays: [day('Ann', 'Alpha Test', 17), day('Ben', 'Alpha Test', 16.5)],
  });
  api._syncEntityCode(ent);
  api.entities.push({
    id: 1, name: 'Beta Test', employees: [{ name: 'Dee', shifts: SHIFT }], dateLabels: WEEK,
    newDateLabels: ['', '', '', '', '', '', ''], newWeekStartVal: '', breakMinutes: 0, breakMinutesSet: true,
    actualDays: [day('Dee', 'Beta Test', 13)], intake: null,
  });
  api._syncEntityCode(api.entities[1]);
  api.wageRates[api.wKey(0, 'Ann')] = 15.25; api.payMethod[api.wKey(0, 'Ann')] = 'cash';
  api.wageRates[api.wKey(0, 'Ben')] = 14; api.payMethod[api.wKey(0, 'Ben')] = 'both';
  api.splitAmounts[api.wKey(0, 'Ben')] = { deposit: 50, typed: true, isWhole: true };
  api.flatWages[api.wKey(0, 'Cy')] = 300;
  api.wageRates[api.wKey(1, 'Dee')] = 20;
  return api;
}

// Everything upstream the scratch copy must never change.
function realState(api) {
  return JSON.stringify({
    wageRates: api.wageRates, payMethod: api.payMethod, splitAmounts: api.splitAmounts, flatWages: api.flatWages,
    roster: api.session.roster, log: api.session.log.length,
    entities: api.entities.map(e => ({ name: e.name, employees: e.employees, actualDays: e.actualDays })),
    payroll: api.entities.map((e, i) => api.computePayrollForEntity(i)),
    preview: api.renderPayrollExportPreviewHtml(),
  });
}

function rowIndex(scratch, kind, firstCell) {
  return scratch.rows.findIndex(r => r.kind === kind && (firstCell == null || r.cells[1] === firstCell || r.cells[0] === firstCell));
}

test('test_make_copy_snapshots_preview_exactly', () => {
  const api = setup();
  assert.equal(api._fc24GetScratch(), null);
  assert.equal(api._fc24MakeCopy(), true);
  const scratch = api._fc24GetScratch();
  const model = api._fc13PreviewModel();
  assert.deepEqual(scratch.rows.map(r => [r.kind, r.cells]), model.rows.map(r => [r.kind, r.cells]));
  assert.deepEqual(scratch.rows.map(r => r.bgs), model.rows.map(r => r.bgs));
  assert.ok(scratch.rows.some(r => r.kind === 'data'), 'fixture must produce data rows');
});

test('test_preview_panel_offers_copy_and_renders_editable_scratch', () => {
  const api = setup();
  api.renderFc00013PreviewPanel();
  const host = api.__sandbox.document.getElementById('fc13PreviewHost');
  assert.match(host.innerHTML, /Make editable copy/);
  assert.doesNotMatch(host.innerHTML, /contenteditable/, 'read-only preview stays read-only');
  api._fc24MakeCopy();
  assert.match(host.innerHTML, /fc24-scratch-panel/);
  assert.match(host.innerHTML, /Export this copy \(\.xlsx\)/);
  assert.match(host.innerHTML, /Export this copy \(\.pdf\)/);
  assert.match(host.innerHTML, /Refresh copy from preview/);
  // Read-only preview table is still present and still has no editable cells.
  const readOnly = host.innerHTML.split('fc24-scratch-panel')[0];
  assert.match(readOnly, /fc13-preview-table/);
  assert.doesNotMatch(readOnly, /contenteditable/);
  // Every non-blank scratch cell is editable.
  const scratch = api._fc24GetScratch();
  const expected = scratch.rows.filter(r => r.kind !== 'blank').reduce((n, r) => n + r.cells.length, 0);
  const scratchHtml = api._fc24ScratchPanelHtml();
  assert.equal((scratchHtml.match(/contenteditable="true"/g) || []).length, expected);
});

test('test_editing_copy_leaves_real_data_untouched', () => {
  const api = setup();
  const before = realState(api);
  api._fc24MakeCopy();
  const s = api._fc24GetScratch();
  const ann = rowIndex(s, 'data', 'Ann');
  s.rows[ann].cells.forEach((_, ci) => api._fc24EditCell(ann, ci, 'X' + ci)); // every cell
  api._fc24EditCell(0, 0, 'MY TITLE');
  api._fc24EditCell(rowIndex(s, 'grand'), 5, '$1.00');
  assert.equal(s.rows[ann].cells[1], 'X1');
  assert.equal(realState(api), before, 'session, roster, payroll and read-only preview must be unchanged');
  // A fresh model is independent of the edited copy.
  assert.notEqual(api._fc13PreviewModel().rows[ann].cells[1], 'X1');
  // The copy survives a Payroll re-render.
  api.renderFc00013PreviewPanel();
  assert.match(api.__sandbox.document.getElementById('fc13PreviewHost').innerHTML, /MY TITLE/);
});

test('test_export_copy_excel_matches_cells', async () => {
  const api = setup();
  api._fc24MakeCopy();
  const s = api._fc24GetScratch();
  const ann = rowIndex(s, 'data', 'Ann');
  api._fc24EditCell(0, 0, 'EDITED TITLE');
  api._fc24EditCell(ann, 1, 'Ann Edited');
  api._fc24EditCell(ann, 3, '7.5');        // Hours
  api._fc24EditCell(ann, 4, '$16.00');     // Rate
  api._fc24EditCell(ann, 7, '$1,234.56');  // Cash
  api._fc24EditCell(ann, 9, '-$0.40');     // Diff
  api._fc24EditCell(ann, 6, 'n/a');        // non-numeric text in a numeric column
  const before = realState(api);
  await api._fc24ExportScratchExcel();
  assert.equal(realState(api), before, 'export must not touch real data');

  const ws = api.__lastExcelWorkbook.worksheets[0];
  assert.equal(ws.rows[1][1].value, 'EDITED TITLE');
  const hdr = ws.rows[3];
  assert.deepEqual(hdr.slice(1).map(c => c.value), s.rows[1].cells);
  const data = ws.rows.find(r => r && r[2] && r[2].value === 'Ann Edited');
  assert.ok(data, 'edited row written');
  assert.equal(data[4].value, 7.5); assert.equal(data[4].numFmt, '0.00');
  assert.equal(data[5].value, 16); assert.match(data[5].numFmt, /\$/);
  assert.equal(data[8].value, 1234.56); assert.match(data[8].numFmt, /\$/);
  assert.equal(data[10].value, -0.4);
  assert.equal(data[7].value, 'n/a');
  // Every scratch row is written, in order: title, blank, then one sheet row per scratch row.
  assert.equal(ws.rows.length - 1, s.rows.length + 1);
  // Grand total row carries its (unedited) snapshot values.
  const g = s.rows[s.rows.length - 1];
  const gRow = ws.rows[ws.rows.length - 1];
  assert.equal(gRow[1].value, 'GRAND TOTAL');
  assert.equal(xlNum(gRow[6]), parseFloat(g.cells[5].replace(/[$,]/g, '')));
  assert.match(gRow[6].value.formula, /^SUM\(/, 'grand total is a live SUM of the subtotals');
});

test('test_export_copy_pdf_matches_cells', async () => {
  const api = setup();
  api._fc24MakeCopy();
  const s = api._fc24GetScratch();
  const ben = rowIndex(s, 'data', 'Ben');
  api._fc24EditCell(ben, 5, '$999.99');
  const saved = [];
  const orig = api.__sandbox.window.jspdf.jsPDF;
  api.__sandbox.window.jspdf = { jsPDF: function (o) { const d = orig(o); d.save = n => saved.push(n); return d; } };
  const before = realState(api);
  await api._fc24ExportScratchPdf();
  assert.equal(realState(api), before);
  assert.equal(saved.length, 1);
  assert.match(saved[0], /_Edited_Copy\.pdf$/);
  const call = api.__lastAutoTableCalls[api.__lastAutoTableCalls.length - 1];
  assert.deepEqual(call.options.head[0], s.rows[1].cells);
  const bodyRows = s.rows.filter(r => r.kind !== 'title' && r.kind !== 'hdr');
  assert.equal(call.options.body.length, bodyRows.length);
  const benBody = call.options.body.find(r => r[1] === 'Ben');
  assert.equal(benBody[5], '$999.99');
});

test('test_refresh_and_discard_copy', () => {
  const api = setup();
  api._fc24MakeCopy();
  const s = api._fc24GetScratch();
  const ann = rowIndex(s, 'data', 'Ann');
  api._fc24EditCell(ann, 1, 'Changed');
  assert.equal(api._fc24RefreshCopy(), true);
  assert.equal(api._fc24GetScratch().rows[ann].cells[1], 'Ann', 'refresh re-snapshots from the live preview');
  assert.equal(api._fc24DiscardCopy(), true);
  assert.equal(api._fc24GetScratch(), null);
  assert.doesNotMatch(api.__sandbox.document.getElementById('fc13PreviewHost').innerHTML, /fc24-scratch-panel/);
});

test('test_cell_parsing_keeps_currency_numeric', () => {
  const api = setup();
  const numCols = [3, 4, 5, 6, 7, 8, 9];
  assert.equal(api._fc24CellFromText('$1,000.50', 5, numCols).v, 1000.5);
  assert.equal(api._fc24CellFromText('8.25', 3, numCols).v, 8.25);
  assert.equal(api._fc24CellFromText('+$0.10', 9, numCols).v, 0.1);
  assert.equal(api._fc24CellFromText('—', 6, numCols), '—');
  assert.equal(api._fc24CellFromText('flat', 4, numCols), 'flat');
  assert.equal(api._fc24CellFromText('123', 1, numCols), '123', 'non-numeric columns stay text');
});
