// FC-00007: Universal rename with visible stable IDs and duplicate-name flag.
// Covers: legacy ID migration (per-record and keyed-store rekeying), rename propagation
// through the dispatcher, duplicate-name detection scoped per entity, and export blocking
// while duplicates exist.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

test('test_id_migration_converts_old_hex_to_new_format', () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Nirvana' });

  // Seed a legacy-format record the way an old exported settings file would: an explicit
  // old-style id passed in as `existingId`.
  const legacyId = 'e11111111';
  const rec = api.ensureRosterRecord(0, 'Alice', legacyId);

  // Touching the record (ensureRosterRecord always does, even on the very first call above)
  // auto-migrates it to the new visible format immediately.
  assert.match(rec.id, api.NEW_EMP_ID_RE, 'record id should be migrated to the new format on first touch');
  assert.doesNotMatch(rec.id, api.OLD_EMP_ID_RE);
  assert.ok(rec.id.startsWith('EMP_N11_'), 'Nirvana should mint under the N11 entity code');

  // The old id should no longer be a live key anywhere in the roster.
  assert.equal(api.session.roster.byId[legacyId], undefined);
  assert.equal(api.session.roster.byId[rec.id], rec);
});

test('test_rename_propagates_via_dispatcher', () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Zion' });

  const before = api.ensureRosterRecord(0, 'Bob Smith');
  const stableId = before.id;
  api.setBreakOverride(0, 'Bob Smith', 2, 15); // goes through dispatch, keyed to the stable id

  const ok = api.renameEmployeeViaDispatcher(0, 'Bob Smith', 'Robert Smith', 'payroll');
  assert.equal(ok, true, 'rename should succeed when confirm() resolves true (sandbox default)');

  const after = api.getRosterRecord(0, 'Robert Smith');
  assert.equal(after.id, stableId, 'the employee id must stay stable across a rename');
  assert.equal(after.canonical_name, 'Robert Smith');

  // Old name key should resolve to nothing new; new name key should resolve to the same record.
  assert.equal(api.session.roster.keyToId[0 + '|' + 'bob smith'.trim()], undefined);
  assert.equal(api.getRosterRecord(0, 'Robert Smith').id, stableId);

  // Break override keyed by the stable id survives the rename untouched.
  assert.equal(api.getBreakOverride(0, 'Robert Smith', 2), 15);

  // Renaming to the same name (case/whitespace-insensitive) is a no-op, not a failed rename.
  const noop = api.renameEmployeeViaDispatcher(0, 'Robert Smith', '  robert smith  ', 'payroll');
  assert.equal(noop, false);
});

test('test_duplicate_name_flag_fires_same_entity', () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Hefner' });

  api.ensureRosterRecord(0, 'Chris Lee');
  api.ensureRosterRecord(0, 'Christopher Lee'); // a second, genuinely distinct record
  assert.equal(api.hasDuplicateNames(0), false);

  // Renaming the second record so its DISPLAY name collides with the first is exactly the
  // scenario FC-00007 must catch: two distinct stable-id records, same visible name, one entity.
  api.renameEmployeeViaDispatcher(0, 'Christopher Lee', 'Chris Lee', 'payroll');
  assert.equal(api.hasDuplicateNames(0), true, 'two distinct records with the same display name in one entity must flag');
  assert.equal(api.isDuplicateNameFor(0, 'Chris Lee'), true);
  assert.equal(api.anyDuplicateNames(), true);

  const groups = api._duplicateGroupsForEntity(0);
  assert.ok(Array.isArray(groups) && groups.length >= 1);
  assert.ok(groups[0].length >= 2);

  const dupEntities = api.getDuplicateEntities();
  assert.ok(dupEntities.some(e => e.id === 0));
});

test('test_duplicate_name_allowed_across_entities', () => {
  const api = loadApp();
  api.setTestMode(true);
  const ent0 = resetToSingleEntity(api, { id: 0, name: 'Nirvana' });
  // Add a second entity with the same employee name — this must NOT be flagged, since
  // duplicate-name detection is scoped per entity.
  api.entities.push({
    id: 1, name: 'Zion', employees: [], dateLabels: ['', '', '', '', '', '', ''],
    newDateLabels: ['', '', '', '', '', '', ''], newWeekStartVal: '',
    breakMinutes: 0, breakMinutesSet: false, actualDays: [], intake: null,
  });

  api.ensureRosterRecord(0, 'Jamie Fox');
  api.ensureRosterRecord(1, 'Jamie Fox');

  assert.equal(api.hasDuplicateNames(0), false, 'same name across different entities is allowed');
  assert.equal(api.hasDuplicateNames(1), false);
  assert.equal(api.anyDuplicateNames(), false);
  assert.equal(api.isDuplicateNameFor(0, 'Jamie Fox'), false);
});

test('test_export_blocked_on_duplicate', async () => {
  const api = loadApp();
  api.setTestMode(true);
  const ent = resetToSingleEntity(api, { id: 0, name: 'Nirvana', employees: [{ name: 'Dana Kim', shifts: ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'] }] });
  api.ensureRosterRecord(0, 'Dana Kim');

  assert.equal(api._blockExportIfDuplicates(), false, 'no duplicates yet — export should not be blocked');

  // Create a second, distinct record, then rename it to collide with the existing one —
  // that's what a real duplicate-name situation looks like (two stable ids, one display name).
  api.ensureRosterRecord(0, 'Dana Kimberly');
  api.renameEmployeeViaDispatcher(0, 'Dana Kimberly', 'Dana Kim', 'payroll');
  assert.equal(api.hasDuplicateNames(0), true);
  assert.equal(api._blockExportIfDuplicates(), true, 'export helper should report duplicates present');

  // The real export entry point bails out immediately when duplicates exist. We only assert
  // it does not throw and does not proceed to build a workbook (no reliable return value, so
  // we assert indirectly: calling it must resolve without needing ExcelJS.Workbook data).
  await assert.doesNotReject(() => api.exportPayrollSettingsExcel(false));
});

test('test_id_format_per_entity_codes', () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Nirvana' });
  api.entities.push({ id: 1, name: 'Zion', employees: [], dateLabels: ['', '', '', '', '', '', ''], newDateLabels: ['', '', '', '', '', '', ''], newWeekStartVal: '', breakMinutes: 0, breakMinutesSet: false, actualDays: [], intake: null });
  api.entities.push({ id: 2, name: 'Hefner', employees: [], dateLabels: ['', '', '', '', '', '', ''], newDateLabels: ['', '', '', '', '', '', ''], newWeekStartVal: '', breakMinutes: 0, breakMinutesSet: false, actualDays: [], intake: null });
  api.entities.push({ id: 3, name: 'Acme Co', employees: [], dateLabels: ['', '', '', '', '', '', ''], newDateLabels: ['', '', '', '', '', '', ''], newWeekStartVal: '', breakMinutes: 0, breakMinutesSet: false, actualDays: [], intake: null });

  const nirvanaRec = api.ensureRosterRecord(0, 'Employee A');
  const zionRec = api.ensureRosterRecord(1, 'Employee B');
  const hefnerRec = api.ensureRosterRecord(2, 'Employee C');
  const acmeRec = api.ensureRosterRecord(3, 'Employee D');

  assert.match(nirvanaRec.id, /^EMP_N11_\d{5}$/);
  assert.match(zionRec.id, /^EMP_ZIO_\d{5}$/);
  assert.match(hefnerRec.id, /^EMP_HEF_\d{5}$/);
  assert.match(acmeRec.id, /^EMP_ACM_\d{5}$/, 'unknown entity names fall back to first 3 alphanumeric chars uppercased');

  // Per-entity counters are independent and sequential starting at 00001.
  const nirvanaRec2 = api.ensureRosterRecord(0, 'Employee A2');
  assert.equal(nirvanaRec.id, 'EMP_N11_00001');
  assert.equal(nirvanaRec2.id, 'EMP_N11_00002');
});

test('test_id_migration_updates_keyed_stores', () => {
  // Prove the explicit migrateLegacyEmployeeIds() batch sweep (DoD #2's "one-pass migration")
  // rekeys every guarded store, not just session.roster.byId/keyToId. Records/keys are seeded
  // directly under an OLD-format id, deliberately bypassing ensureRosterRecord/dispatch (both
  // of which auto-migrate on touch), so this exercises genuinely stale legacy data.
  const freshApi = loadApp();
  freshApi.setTestMode(true);
  resetToSingleEntity(freshApi, { id: 0, name: 'Nirvana' });

  const oldId = 'e00000001';
  const rec = { id: oldId, canonical_name: 'Terry Park', entity: 0, aliases: [], rate: 22.5, pay_method: 'deposit', final_pass_method: '', deposit_amount: null, flat_amount: null, active: true, notes: '' };
  // roster.byId/keyToId are plain objects (not guarded); wageRates/breakOverrides ARE guarded
  // in test mode, so seed those inside _withSessionMutation to satisfy the direct-write guard.
  freshApi.session.roster.byId[oldId] = rec;
  freshApi.session.roster.keyToId[freshApi._rosterKey(0, 'Terry Park')] = oldId;
  freshApi._withSessionMutation(() => {
    freshApi.wageRates[oldId] = 22.5;
    freshApi.breakOverrides[oldId + '|3'] = 10;
  });

  assert.equal(freshApi.wageRates[oldId], 22.5);
  assert.equal(freshApi.breakOverrides[oldId + '|3'], 10);

  const migratedCount = freshApi.migrateLegacyEmployeeIds();
  assert.ok(migratedCount >= 1, 'migration sweep should report at least one migrated record');

  const newId = freshApi.session.roster.byId[oldId] === undefined
    ? Object.keys(freshApi.session.roster.byId).find(k => freshApi.session.roster.byId[k].canonical_name === 'Terry Park')
    : oldId;

  assert.match(newId, freshApi.NEW_EMP_ID_RE);
  assert.equal(freshApi.session.roster.byId[oldId], undefined, 'old id key must be removed from byId');
  assert.equal(freshApi.session.roster.byId[newId].canonical_name, 'Terry Park');

  // keyToId should point the name key at the new id.
  assert.equal(freshApi.session.roster.keyToId[freshApi._rosterKey(0, 'Terry Park')], newId);

  // Guarded keyed stores must be rekeyed too.
  assert.equal(freshApi.wageRates[oldId], undefined);
  assert.equal(freshApi.wageRates[newId], 22.5);
  assert.equal(freshApi.breakOverrides[oldId + '|3'], undefined);
  assert.equal(freshApi.breakOverrides[newId + '|3'], 10);
});
