// FC-00019: Palette dropdown color swatches + strip entity names.
//
// Two changes to the FC-00014 palette picker:
//   1. The native <select> is replaced with a custom lightweight dropdown (trigger + popover)
//      that shows a 20x20px body-color swatch beside each preset name.
//   2. Preset names that baked in an entity's brand name are stripped: 'Nirvana Green' -> 'Green',
//      'Zion Blue' -> 'Blue', 'Hefner Peach' -> 'Peach'. The other 7 presets are unchanged.
// Old settings files that still carry the pre-rename names must keep loading correctly via a
// legacy-name map applied on import. See FC_00019_BRIEF.md.
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

function makeSingleEntityFixture(api, overrides = {}) {
  const ent = resetToSingleEntity(api, Object.assign({
    id: 0,
    name: 'Nirvana 11th',
    employees: [{ name: 'Balu', shifts: ['', '9AM - 5PM', '', '', '', '', ''] }],
    dateLabels: ['', 'Mon Aug 10 2026', '', '', '', '', ''],
    breakMinutes: 0,
    breakMinutesSet: true,
  }, overrides));
  api._syncEntityCode(ent);
  return ent;
}

// ---- DoD #1: renamed presets, other 7 untouched ----
test('test_presets_renamed_strip_entity_names', () => {
  const api = loadApp();
  const names = api.FC14_PRESET_NAMES;
  ['Green', 'Blue', 'Peach'].forEach(n => assert.ok(names.includes(n), `expected renamed preset "${n}"`));
  ['Nirvana Green', 'Zion Blue', 'Hefner Peach'].forEach(n => assert.ok(!names.includes(n), `old entity-branded name "${n}" must be gone`));
  ['Lavender', 'Slate', 'Sunset', 'Sage', 'Sky', 'Mint', 'Plain'].forEach(n => assert.ok(names.includes(n), `expected unchanged preset "${n}"`));
  assert.equal(names.length, 10, 'still exactly 10 presets');
  // Colors must be identical to the pre-rename values — only the keys changed.
  assert.equal(api.FC14_PRESETS['Green'].body, 'FFE8F0DC');
  assert.equal(api.FC14_PRESETS['Blue'].body, 'FFDCE6F1');
  assert.equal(api.FC14_PRESETS['Peach'].body, 'FFFCE4D6');
});

// ---- DoD #1/#2: entity-code defaults resolve to the renamed presets ----
test('test_entity_code_defaults_use_renamed_presets', () => {
  const api = loadApp();
  const n11 = makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  assert.equal(api.getEntityPalette(n11), 'Green');
  assert.equal(api._paletteForEntity(n11), api.FC14_PRESETS['Green']);
});

// ---- DoD #5, test 1: picker popover renders one swatch per option ----
test('test_palette_picker_renders_swatch_per_option', () => {
  const api = loadApp();
  const ent = makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  api.renderPayrollEntityContent(0);
  const host = api.__sandbox.document.getElementById('payrollEntityContent');
  const html = host.innerHTML;

  // Exactly 10 option rows, one per preset.
  const optionMatches = html.match(/<div class="palette-picker-option[^"]*"/g) || [];
  assert.equal(optionMatches.length, 10, 'expected 10 palette-picker-option rows in the popover');

  // No native <select>/<option> left over — the custom picker fully replaces it.
  assert.ok(!/<select/i.test(html), 'native <select> must be fully replaced');
  assert.ok(!/<option/i.test(html), 'native <option> must be fully replaced');

  // Each option contains a swatch with the correct inline background for that preset.
  api.FC14_PRESET_NAMES.forEach(name => {
    const expectedBg = '#' + api.FC14_PRESETS[name].body.slice(2);
    const re = new RegExp(
      `<div class="palette-picker-option[^"]*"[^>]*data-preset="${name}"[^>]*>\\s*<span class="swatch" style="background:${expectedBg}"`
    );
    assert.ok(re.test(html), `expected a swatch with background ${expectedBg} for preset "${name}"`);
  });

  // The trigger itself also shows the current selection's swatch (20x20px per CSS class).
  assert.ok(/class="palette-picker-trigger"/.test(html), 'expected the picker trigger element');
  const triggerBg = '#' + api.FC14_PRESETS[api.getEntityPalette(ent)].body.slice(2);
  assert.ok(html.includes(`<span class="swatch" style="background:${triggerBg}"></span><span class="palette-picker-name">`),
    'trigger swatch must reflect the currently selected preset body color');
});

// ---- DoD #5, test 2: legacy settings-file preset name maps to the renamed preset ----
test('test_old_setting_name_maps_to_new', () => {
  const api = loadApp();
  makeSingleEntityFixture(api, { name: 'Nirvana 11th' });

  const headers = api.PAYROLL_SETTINGS_HEADERS;
  const colMap = makeColMap(headers);
  const row = makeSettingsRow(headers, {
    Entity: 'Nirvana 11th',
    Employee: 'Balu',
    'Wage/hour': '15',
    Type: 'Hourly',
    'Pay Method': 'Cash',
    Palette: 'Nirvana Green', // old, pre-FC-00019 name
  });

  api._ingestPayrollSettings([row], colMap, false);

  assert.equal(api.session.entityPalettes[0], 'Green', 'legacy name must resolve to the renamed preset key');
  const ent = api.entities.find(e => e.id === 0);
  assert.equal(api.getEntityPalette(ent), 'Green');
  assert.equal(api._paletteForEntity(ent).body, api.FC14_PRESETS['Green'].body, 'resolved entity must use the correct (unchanged) body fill');
});

// ---- Legacy-name map covers all three renamed presets, both directions of lookup ----
test('test_legacy_name_map_covers_all_renamed_presets', () => {
  const api = loadApp();
  assert.equal(api._fc19ResolveLegacyPresetName('Nirvana Green'), 'Green');
  assert.equal(api._fc19ResolveLegacyPresetName('Zion Blue'), 'Blue');
  assert.equal(api._fc19ResolveLegacyPresetName('Hefner Peach'), 'Peach');
  // Names untouched by the rename (or already-new names) pass through unchanged.
  assert.equal(api._fc19ResolveLegacyPresetName('Green'), 'Green');
  assert.equal(api._fc19ResolveLegacyPresetName('Sunset'), 'Sunset');
  assert.equal(api._fc19ResolveLegacyPresetName('Not A Real Preset'), 'Not A Real Preset');
});

// ---- Export always writes the new name, never the legacy one, even after a legacy import ----
test('test_settings_export_writes_new_name_after_legacy_import', () => {
  const api = loadApp();
  makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  const headers = api.PAYROLL_SETTINGS_HEADERS;
  const colMap = makeColMap(headers);
  const row = makeSettingsRow(headers, {
    Entity: 'Nirvana 11th', Employee: 'Balu', 'Wage/hour': '15', Type: 'Hourly', 'Pay Method': 'Cash',
    Palette: 'Zion Blue', // legacy name, deliberately mismatched vs N11's own default, to prove it round-trips
  });
  api._ingestPayrollSettings([row], colMap, false);
  assert.equal(api.session.entityPalettes[0], 'Blue');

  const rows = api._gatherPayrollSettingsRows(false);
  assert.ok(rows.length > 0);
  rows.forEach(r => assert.equal(r.palette, 'Blue', 'export must always write the new (non-legacy) preset name'));
});

// ---- Backward compat: a settings file without the Palette column still imports fine ----
test('test_settings_import_without_palette_column_still_resolves_renamed_default', () => {
  const api = loadApp();
  const ent = makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  const legacyHeaders = ['Entity', 'Employee', 'Wage/hour', 'Type', 'Pay Method'];
  const colMap = makeColMap(legacyHeaders);
  const row = makeSettingsRow(legacyHeaders, { Entity: 'Nirvana 11th', Employee: 'Balu', 'Wage/hour': '15', Type: 'Hourly', 'Pay Method': 'Cash' });
  api._ingestPayrollSettings([row], colMap, false);
  assert.equal(api.session.entityPalettes[0], undefined, 'no Palette column means no explicit selection is set');
  assert.equal(api.getEntityPalette(ent), 'Green', 'falls back to the renamed code default');
});

// ---- Picker toggle open/close behavior ----
// Note: the test sandbox's fake `document` (tests/load-app.js) does not parse innerHTML into
// a real DOM tree -- getElementById returns independent cached stub nodes, not the elements
// described by rendered HTML strings. These tests exercise the actual toggle/close functions
// (the same ones the onclick markup wires up to) directly against getElementById, which is
// exactly how the real browser DOM resolves the same ids at click/keydown time.
test('test_picker_toggle_opens_and_closes_popover', () => {
  const api = loadApp();
  makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  api.renderPayrollEntityContent(0);
  const pop = api.__sandbox.document.getElementById('fc19PalettePopover0');
  pop.style.display = 'none'; // established starting state, as rendered by _fc19PalettePickerHtml

  api._fc19TogglePalettePicker({ stopPropagation() {} }, 0, 0);
  assert.equal(pop.style.display, 'block', 'first toggle opens the popover');

  api._fc19TogglePalettePicker({ stopPropagation() {} }, 0, 0);
  assert.equal(pop.style.display, 'none', 'second toggle closes the popover again');
});

// ---- Click outside (i.e. the global document click handler) closes any open popover ----
test('test_click_outside_closes_popover', () => {
  const api = loadApp();
  makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  api.renderPayrollEntityContent(0);
  const pop = api.__sandbox.document.getElementById('fc19PalettePopover0');
  pop.style.display = 'none';

  api._fc19TogglePalettePicker({ stopPropagation() {} }, 0, 0);
  assert.equal(pop.style.display, 'block');

  // Simulate the outside-click path directly: closeAll behaves like the registered
  // document 'click' handler does whenever the click target isn't inside a .palette-picker.
  api._fc19CloseAllPalettePickers();
  assert.equal(pop.style.display, 'none', 'closeAll (as invoked by an outside click) must close the popover');
});

// ---- Escape key closes any open popover ----
test('test_escape_key_closes_popover', () => {
  const api = loadApp();
  makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  api.renderPayrollEntityContent(0);
  const pop = api.__sandbox.document.getElementById('fc19PalettePopover0');
  pop.style.display = 'none';

  api._fc19TogglePalettePicker({ stopPropagation() {} }, 0, 0);
  assert.equal(pop.style.display, 'block');

  // The registered keydown handler calls _fc19CloseAllPalettePickers() on Escape; exercise
  // that same effect directly since this sandbox document doesn't dispatch real events.
  api._fc19CloseAllPalettePickers();
  assert.equal(pop.style.display, 'none', 'Escape (closeAll) must close the popover');
});

// ---- Selecting an option applies the palette via the existing dispatcher path ----
test('test_picker_option_click_dispatches_through_setEntityPalette', () => {
  const api = loadApp();
  makeSingleEntityFixture(api, { name: 'Nirvana 11th' });
  assert.equal(api.session.entityPalettes[0], undefined);

  api.renderPayrollEntityContent(0);
  const html = api.__sandbox.document.getElementById('payrollEntityContent').innerHTML;
  assert.ok(html.includes('onclick="_fc19PickPalette(event,this)"'),
    'options must wire up through _fc19PickPalette, passing the clicked element (not a quoted preset-name literal, which would break the onclick="..." attribute)');

  // Directly exercise the click handler as the real DOM would: evt.target is the clicked
  // option element itself, which carries data-preset and sits inside the popover carrying
  // data-entity-id.
  const popover = { getAttribute: (k) => (k === 'data-entity-id' ? '0' : null) };
  const optionEl = {
    getAttribute: (k) => (k === 'data-preset' ? 'Sunset' : null),
    closest: (sel) => (sel === '.palette-picker-popover' ? popover : null),
  };
  const fakeEvt = { stopPropagation() {} };
  api._fc19PickPalette(fakeEvt, optionEl);

  assert.equal(api.session.entityPalettes[0], 'Sunset', 'option click must set the palette via setEntityPalette/dispatch');
  assert.equal(api.getEntityPalette(api.entities[0]), 'Sunset');
});
