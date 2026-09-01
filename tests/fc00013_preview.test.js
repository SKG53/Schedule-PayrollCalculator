// FC-00013: Live WYSIWYG preview panel on Payroll tab.
//
// renderPayrollExportPreviewHtml() must render a read-only HTML mirror of exactly what
// exportCombinedExcel() produces: same FC12_PALETTES colors, same row order (per-entity
// data rows -> subtotal -> blank separator, repeated per entity, then one grand total),
// same flat-employee treatment (" (flat)" suffix, blank Hours, Rate="flat"). See
// FC_00013_BRIEF.md and the FC-00012 Combined Excel export (_exportExcel) it mirrors.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

// Standard Mon-Sun-style week labels in the exact "Mon D YYYY" shape formatDateCell()
// produces (no weekday prefix) so _exportPeriodStr's toShort() regex matches and the
// preview title renders "MM/DD/YY – MM/DD/YY" instead of falling back to the raw label.
const WEEK_LABELS = ['Aug 9 2026', 'Aug 10 2026', 'Aug 11 2026', 'Aug 12 2026', 'Aug 13 2026', 'Aug 14 2026', 'Aug 15 2026'];

// Builds a 3-entity fixture matching the reference report's shape: Nirvana 11th (1 cash
// hourly employee), Zion (1 cash hourly employee), Hefner (1 cash hourly employee + 1
// flat-amount employee) — 4 employees total across 3 entities.
function makeThreeEntityFixture(api) {
  const nirvana = resetToSingleEntity(api, {
    id: 0,
    name: 'Nirvana 11th',
    employees: [{ name: 'Balu', shifts: ['', '9AM - 5PM', '', '', '', '', ''] }],
    dateLabels: WEEK_LABELS,
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
    dateLabels: WEEK_LABELS,
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
    dateLabels: WEEK_LABELS,
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
  // Shumaila is a flat-amount employee — exercises the " (flat)" row shape.
  api.flatWages[api.wKey(2, 'Shumaila')] = 400;
  api.flatWagesDisplayNames['shumaila'] = 'Shumaila';

  return { nirvana, zion, hefner };
}

test('test_preview_renders_expected_row_count', () => {
  const api = loadApp();
  makeThreeEntityFixture(api);

  const html = api.renderPayrollExportPreviewHtml();
  assert.ok(html.length > 0, 'expected non-empty preview HTML');

  // 4 employees (Balu, Varshitha, Faisal, Shumaila) across 3 entities.
  // N + 3 subtotal + 2 blank-separator + 1 grand + 1 header + 1 title = N + 8 rows.
  const N = 4;
  const rowCount = (html.match(/<tr\b/g) || []).length;
  assert.equal(rowCount, N + 8, `expected ${N + 8} rows (N=${N} data + 3 subtotal + 2 blank + 1 grand + 1 header + 1 title)`);

  const titleRows = (html.match(/fc13-title-row/g) || []).length;
  const hdrRows = (html.match(/fc13-hdr-row/g) || []).length;
  const dataRows = (html.match(/fc13-data-row/g) || []).length;
  const subtotalRows = (html.match(/fc13-subtotal-row/g) || []).length;
  const blankRows = (html.match(/fc13-blank-row/g) || []).length;
  const grandRows = (html.match(/fc13-grand-row/g) || []).length;
  assert.equal(titleRows, 1, 'exactly one title row');
  assert.equal(hdrRows, 1, 'exactly one header row');
  assert.equal(dataRows, N, `exactly ${N} employee data rows`);
  assert.equal(subtotalRows, 3, 'exactly one subtotal row per entity (3 entities)');
  assert.equal(blankRows, 2, 'exactly one blank separator row between entities (2 gaps for 3 entities)');
  assert.equal(grandRows, 1, 'exactly one grand total row');
});

test('test_preview_readonly_no_inputs', () => {
  const api = loadApp();
  makeThreeEntityFixture(api);

  const html = api.renderPayrollExportPreviewHtml();
  assert.ok(html.length > 0);
  assert.ok(!/<input/i.test(html), 'preview must not contain <input>');
  assert.ok(!/<select/i.test(html), 'preview must not contain <select>');
  assert.ok(!/<textarea/i.test(html), 'preview must not contain <textarea>');
  assert.ok(!/contenteditable/i.test(html), 'preview must not contain contenteditable');
});

test('test_preview_title_matches_combined_export_format', () => {
  const api = loadApp();
  makeThreeEntityFixture(api);

  const html = api.renderPayrollExportPreviewHtml();
  assert.match(html, /COMBINED PAYROLL REPORT — \d{2}\/\d{2}\/\d{2} – \d{2}\/\d{2}\/\d{2}/,
    'title row must read "COMBINED PAYROLL REPORT — MM/DD/YY – MM/DD/YY"');
});

test('test_preview_uses_fc12_palette_colors', () => {
  const api = loadApp();
  makeThreeEntityFixture(api);

  const html = api.renderPayrollExportPreviewHtml();
  // FC12_PALETTES ARGB fills, minus the leading alpha byte, must appear as #RRGGBB CSS colors.
  const n11Body = '#' + api.FC12_PALETTES.N11.body.slice(2);
  const n11Cash = '#' + api.FC12_PALETTES.N11.cash.slice(2);
  const zioBody = '#' + api.FC12_PALETTES.ZIO.body.slice(2);
  const hefBody = '#' + api.FC12_PALETTES.HEF.body.slice(2);
  assert.ok(html.includes(n11Body), 'Nirvana 11th body fill must appear in the preview');
  assert.ok(html.includes(n11Cash), 'Nirvana 11th Cash column tint must appear in the preview');
  assert.ok(html.includes(zioBody), 'Zion body fill must appear in the preview');
  assert.ok(html.includes(hefBody), 'Hefner body fill must appear in the preview');
  // Subtotal (BFBFBF) and grand total (A6A6A6) fills are shared across all palettes.
  assert.ok(html.includes('#BFBFBF'), 'subtotal rows use the shared BFBFBF gray');
  assert.ok(html.includes('#A6A6A6'), 'grand total row uses the shared A6A6A6 gray');
  // Header fill E8E8E4.
  assert.ok(html.includes('#E8E8E4'), 'header row uses the shared E8E8E4 fill');
});

test('test_preview_flat_employee_row_shape', () => {
  const api = loadApp();
  makeThreeEntityFixture(api);

  const html = api.renderPayrollExportPreviewHtml();
  assert.ok(html.includes('Shumaila (flat)'), 'flat employee name must be suffixed " (flat)"');
  // Rate cell renders the literal text "flat" for a flat-amount employee.
  assert.match(html, /Shumaila \(flat\)[\s\S]*?<td[^>]*>flat<\/td>/, 'flat employee Rate cell must read "flat"');
});

test('test_preview_cells_have_tooltip_title_attributes', () => {
  const api = loadApp();
  makeThreeEntityFixture(api);

  const html = api.renderPayrollExportPreviewHtml();
  assert.ok(html.includes('Edit entity name in Schedules tab'), 'entity cells get the entity-name tooltip');
  assert.ok(html.includes('Edit above in Payroll Calculation table (rename button or click name)'), 'employee name cells get the rename tooltip');
  assert.ok(html.includes('Edit above in Payroll Calculation table'), 'value cells get the generic edit tooltip');
  assert.ok(html.includes('Auto-calculated'), 'subtotal/grand/header rows get the auto-calculated tooltip');
  assert.ok(html.includes('Edit date range in the schedule for that entity'), 'title row gets the date-range tooltip');
});

test('test_preview_empty_when_no_data', () => {
  const api = loadApp();
  resetToSingleEntity(api, { id: 0, name: 'Empty Co', employees: [] });
  const html = api.renderPayrollExportPreviewHtml();
  assert.equal(html, '', 'no employees anywhere means no preview table at all');
});

test('test_preview_panel_mounts_in_dom_above_toolbar', () => {
  const api = loadApp();
  makeThreeEntityFixture(api);

  api.renderPayrollEntityContent(0);
  const host = api.__sandbox.document.getElementById('fc13PreviewHost');
  assert.ok(host, 'expected renderPayrollEntityContent to mount the fc13PreviewHost element');
  assert.ok(host.innerHTML.includes('fc13-preview-table'), 'mounted panel must contain the preview table');
  assert.ok(host.innerHTML.includes('read-only'), 'mounted panel must display a read-only indicator');
});

test('test_preview_live_updates_when_wage_changes', () => {
  const api = loadApp();
  makeThreeEntityFixture(api);

  const before = api.renderPayrollExportPreviewHtml();
  assert.ok(before.includes('$120.00'), 'expected initial 8h * $15 = $120.00 total to appear');

  api.wageRates[api.wKey(0, 'Balu')] = 20;
  const after = api.renderPayrollExportPreviewHtml();
  assert.ok(after.includes('$160.00'), 'expected updated 8h * $20 = $160.00 total to appear after wage change');
  assert.notEqual(before, after, 'preview HTML must change when underlying payroll data changes');
});
