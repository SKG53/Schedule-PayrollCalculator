// FC-00014: Configurable palette (10 presets per entity).
//
// Users pick from 10 named palette presets per entity via a dropdown on the Payroll page.
// The choice is stored in session.entityPalettes (key: entity id -> preset name), falls back
// to a per-entity-code default when absent, and flows through BOTH the FC-00012 Excel export
// and the FC-00013 preview via the shared _paletteForEntity(ent) lookup. It also round-trips
// through the Payroll Settings .xlsx via a new 'Palette' column. See FC_00014_BRIEF.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

function makeColMap(headers) {
  const colMap = {};
  headers.forEach((h, i) => { colMap[h.toLowerCase()] = i; });
  return colMap;
}

function makeSettingsRow(headers, values) {
  return headers.map(h => Object.prototype.hasOwnProperty.call(values, h) ? values[h] : '');
}

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

function makeSingleEntityFixture(api, overrides = {}) {
  const ent = resetToSingleEntity(api, Object.assign({
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
  }, overrides));
  api._syncEntityCode(ent);
  api.wageRates[api.wKey(0, 'Balu')] = 15;
  api.payMethod[api.wKey(0, 'Balu')] = 'cash';
  return ent;
}

// ---- DoD: 10 named presets, each a full palette object ----
test('test_ten_presets_defined_and_distinct', () => {
  const api = loadApp();
  const names = api.FC14_PRESET_NAMES;
  assert.equal(names.length, 10, 'expected exactly 10 named presets');
  const uniqueBodies = new Set(names.map(n => api.FC14_PRESETS[n].body));
  assert.equal(uniqueBodies.size, 10, 'expected all 10 presets to have visually distinct body fills');
  names.forEach(n => {
    const pal = api.FC14_PRESETS[n];
    ['body', 'cash', 'header', 'subtotal', 'grand'].forEach(role => {
      assert.match(pal[role], /^FF[0-9A-F]{6}$/, `${n}.${role} must be an 8-char ARGB hex string`);
    });
  });
});

// ---- DoD: per-entity default preset map (N11/ZIO/HEF/other) ----
test('test_per_entity_code_defaults_match_fc12_originals', () => {
  const api = loadApp();
  const n11 = makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  assert.equal(api.getEntityPalette(n11), 'Green');
  assert.equal(api._paletteForEntity(n11), api.FC14_PRESETS['Green']);

  const zion = { id: 1, name: 'Zion', code: '' };
  api._syncEntityCode(zion);
  api.entities.push(zion);
  assert.equal(api.getEntityPalette(zion), 'Blue');

  const hefner = { id: 2, name: 'Hefner', code: '' };
  api._syncEntityCode(hefner);
  api.entities.push(hefner);
  assert.equal(api.getEntityPalette(hefner), 'Peach');

  const other = { id: 3, name: 'Some New Client LLC', code: '' };
  api._syncEntityCode(other);
  api.entities.push(other);
  assert.notEqual(other.code, 'N11');
  assert.notEqual(other.code, 'ZIO');
  assert.notEqual(other.code, 'HEF');
  assert.equal(api.getEntityPalette(other), 'Plain', 'unknown entity code defaults to Plain');
});

// ---- DoD #8: test_palette_selection_stored_per_entity ----
test('test_palette_selection_stored_per_entity', () => {
  const api = loadApp();
  const n11 = makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  const zion = { id: 1, name: 'Zion', code: '', employees: [] };
  api._syncEntityCode(zion);
  api.entities.push(zion);

  assert.equal(api.session.entityPalettes[0], undefined, 'no explicit selection yet');
  api.setEntityPalette(0, 'Sunset');
  assert.equal(api.session.entityPalettes[0], 'Sunset', 'selection stored in session.entityPalettes keyed by entity id');
  assert.equal(api.getEntityPalette(n11), 'Sunset');
  // Other entity's default is untouched by this entity's selection.
  assert.equal(api.getEntityPalette(zion), 'Blue');

  // Switching again overwrites the stored choice (not additive).
  api.setEntityPalette(0, 'Mint');
  assert.equal(api.session.entityPalettes[0], 'Mint');
  assert.equal(Object.keys(api.session.entityPalettes).length, 1);

  // Invalid preset name is a no-op (ignored, not stored).
  api.setEntityPalette(0, 'Not A Real Preset');
  assert.equal(api.session.entityPalettes[0], 'Mint', 'invalid preset name must not overwrite a valid selection');
});

// ---- DoD #8: test_export_uses_selected_palette ----
test('test_export_uses_selected_palette', async () => {
  const api = loadApp();
  makeSingleEntityFixture(api, { name: 'Nirvana 11th' });

  // Default export uses the N11 code default (Nirvana Green).
  await api.exportCombinedExcel();
  let sheet = api.__lastExcelWorkbook.worksheets.find(w => w.name === 'Report');
  let fills = fillMapFor(sheet);
  let dataRow = findRowIndex(sheet, row => row[1] && row[1].value === 'Nirvana 11th');
  assert.ok(dataRow > 0);
  assert.equal(fills[`${dataRow},1`], api.FC14_PRESETS['Green'].body, 'default export uses the code default palette');

  // Select a non-default preset, then export again — the export must reflect the new choice.
  api.setEntityPalette(0, 'Lavender');
  await api.exportCombinedExcel();
  sheet = api.__lastExcelWorkbook.worksheets.find(w => w.name === 'Report');
  fills = fillMapFor(sheet);
  dataRow = findRowIndex(sheet, row => row[1] && row[1].value === 'Nirvana 11th');
  assert.ok(dataRow > 0);
  assert.equal(fills[`${dataRow},1`], api.FC14_PRESETS['Lavender'].body, 'export must use the selected Lavender preset body fill');
  assert.equal(fills[`${dataRow},8`], api.FC14_PRESETS['Lavender'].cash, 'export must use the selected Lavender preset cash fill');

  const subtotalRow = findRowIndex(sheet, row => row[1] && /subtotal/i.test(row[1].value || ''));
  assert.ok(subtotalRow > 0);
  assert.equal(fills[`${subtotalRow},1`], api.FC14_PRESETS['Lavender'].subtotal, 'subtotal row must also use the selected preset');

  // The FC-00013 preview must reflect the same selection (both consumers share _paletteForEntity).
  const html = api.renderPayrollExportPreviewHtml();
  assert.ok(html.includes(`#${api.FC14_PRESETS['Lavender'].body.slice(2)}`), 'preview HTML must contain the selected preset body color');
});

// ---- DoD #8: test_settings_round_trip_palette ----
test('test_settings_round_trip_palette', () => {
  const api = loadApp();
  makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  api.setEntityPalette(0, 'Sage');

  const rows = api._gatherPayrollSettingsRows(false);
  assert.ok(rows.length > 0);
  assert.ok(rows.every(r => r.palette === 'Sage'), 'every employee row for the entity carries the selected preset name');
  assert.ok(api.PAYROLL_SETTINGS_HEADERS.includes('Palette'), 'PAYROLL_SETTINGS_HEADERS must include a Palette column');

  // Simulate export -> fresh session -> re-import, using the real header-driven ingest path.
  const headers = api.PAYROLL_SETTINGS_HEADERS;
  const colMap = makeColMap(headers);
  const row = makeSettingsRow(headers, {
    Entity: 'Nirvana 11th',
    Employee: 'Balu',
    'Wage/hour': '15',
    Type: 'Hourly',
    'Pay Method': 'Cash',
    Palette: 'Sage',
  });

  const fresh = loadApp();
  resetToSingleEntity(fresh, {
    id: 0,
    name: 'Nirvana 11th',
    employees: [{ name: 'Balu', shifts: ['', '', '', '', '', '', ''] }],
  });
  fresh._syncEntityCode(fresh.entities[0]);
  assert.equal(fresh.getEntityPalette(fresh.entities[0]), 'Green', 'fresh session starts at the code default');

  fresh._ingestPayrollSettings([row], colMap, false);
  assert.equal(fresh.session.entityPalettes[0], 'Sage', 'import must restore the palette selection into session.entityPalettes');
  assert.equal(fresh.getEntityPalette(fresh.entities[0]), 'Sage', 'restored selection must be resolvable via getEntityPalette');
});

// ---- Backward compat: settings files without a Palette column import fine ----
test('test_settings_import_without_palette_column_keeps_default', () => {
  const api = loadApp();
  resetToSingleEntity(api, {
    id: 0,
    name: 'Zion',
    employees: [{ name: 'Varshitha', shifts: ['', '', '', '', '', '', ''] }],
  });
  api._syncEntityCode(api.entities[0]);
  api.setEntityPalette(0, 'Mint'); // pre-existing selection should NOT be clobbered by a V1/V2-shaped file

  const legacyHeaders = ['Entity', 'Employee', 'Wage/hour', 'Type', 'Flat Amount', 'Pay Method', 'Deposit Amount', 'Deposit Typed As'];
  const colMap = makeColMap(legacyHeaders);
  const row = makeSettingsRow(legacyHeaders, {
    Entity: 'Zion', Employee: 'Varshitha', 'Wage/hour': '18', Type: 'Hourly', 'Pay Method': 'Cash',
  });

  api._ingestPayrollSettings([row], colMap, false);
  assert.equal(api.session.entityPalettes[0], 'Mint', 'absent Palette column must leave the existing selection untouched');
});

// ---- Backward compat / thin shim: _fc12PaletteFor(entCode) still works for legacy callers ----
test('test_fc12PaletteFor_shim_resolves_selected_palette_by_code', () => {
  const api = loadApp();
  const n11 = makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  assert.equal(api._fc12PaletteFor('N11'), api.FC14_PRESETS['Green']);
  api.setEntityPalette(0, 'Sky');
  assert.equal(api._fc12PaletteFor('N11'), api.FC14_PRESETS['Sky'], 'shim must reflect a live selection, not just the hardcoded default');
  assert.equal(api._fc12PaletteFor('__GRAND__'), api.FC12_PALETTES.DEFAULT);
  assert.equal(api._fc12PaletteFor('UNKNOWNCODE'), api.FC12_PALETTES.DEFAULT);
});

// ---- UI: palette picker renders in renderPayrollEntityContent with the current selection ----
// FC-00019 replaced the native <select> with a custom picker widget (trigger + popover); this
// test now asserts on that markup instead of <select>/<option> tags.
test('test_palette_dropdown_renders_in_payroll_entity_content', () => {
  const api = loadApp();
  makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  api.renderPayrollEntityContent(0);
  const host = api.__sandbox.document.getElementById('payrollEntityContent');
  assert.ok(host.innerHTML.includes('Color palette'), 'expected a labeled palette picker');
  assert.ok(host.innerHTML.includes('_fc19TogglePalettePicker(event,0'), 'picker trigger must wire to this entity id');
  assert.ok(host.innerHTML.includes('class="palette-picker-trigger"'), 'expected the custom picker trigger markup');
  assert.ok(host.innerHTML.includes('class="palette-picker-popover"'), 'expected the custom picker popover markup');
  api.FC14_PRESET_NAMES.forEach(name => {
    assert.ok(host.innerHTML.includes(`>${name}<`), `picker must list preset "${name}"`);
  });
});
