// FC-00009: In-tool schedule OCR.
// Covers: the no-API-key guard (same toast/openSettings pattern as timecard OCR), a
// successful extraction populating entities[idx].employees through the same dispatcher
// path (parseSchedule) the .xlsx upload uses, the confirm()-before-overwrite guard when
// a schedule is already loaded, warnings surfaced as a toast, overnight-shift handling,
// and the JSON->rows mapping helper in isolation.
//
// The Gemini fetch call itself is mocked (per the brief) — no network access. Because the
// Node test sandbox has no createImageBitmap, prepareImageForOcr() takes its existing
// fallback branch (fileToBase64 via FileReader.readAsDataURL), which load-app.js's
// FileReader mock now implements for exactly this reason.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, resetToSingleEntity } = require('./load-app');

function fakeImageFile(name) {
  return { name: name || 'schedule.png', type: 'image/png', size: 12345 };
}

function mockGeminiResponse(api, payload, opts) {
  opts = opts || {};
  const calls = [];
  api.__sandbox.fetch = async (url, reqOpts) => {
    calls.push({ url, body: reqOpts && reqOpts.body ? JSON.parse(reqOpts.body) : null });
    if (opts.httpError) {
      return { ok: false, status: opts.httpError, text: async () => 'boom' };
    }
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
    };
  };
  return calls;
}

test('test_schedule_ocr_no_key_message', async () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'No Key Co', employees: [] });
  // No pv26_api_key set — _prefGet must return null/empty.
  assert.equal(api._prefGet('pv26_api_key'), null);

  let fetchCalled = false;
  api.__sandbox.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };

  await api.runScheduleOcrForEntity(0, fakeImageFile(), 1);

  assert.equal(fetchCalled, false, 'must not call fetch when no API key is set');
  const toast = api.__sandbox.document.getElementById('toast');
  assert.ok(toast.innerHTML.includes('No Gemini API key set'), 'shows the same no-key toast as timecard OCR');
  assert.equal(toast.className, 'show err');
});

test('test_schedule_ocr_parses_valid_json_response', async () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Extract Co', employees: [] });
  api._prefSet('pv26_api_key', 'FAKEKEY');

  const payload = {
    week_start_hint: '2026-08-30',
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    employees: [
      { name: 'Alice Johnson', shifts: [
        { day: 'Mon', start: '09:00', end: '17:00' },
        { day: 'Tue', start: '09:00', end: '17:00' },
      ] },
      { name: 'Bob Smith', shifts: [
        { day: 'Mon', start: '08:00', end: '16:00' },
      ] },
    ],
  };
  const calls = mockGeminiResponse(api, payload);

  await api.runScheduleOcrForEntity(0, fakeImageFile(), 1);

  assert.equal(calls.length, 1, 'exactly one Gemini call for a single-attempt success');
  const ent = api.entities[0];
  assert.equal(ent.employees.length, 2);
  const alice = ent.employees.find(e => e.name === 'Alice Johnson');
  const bob = ent.employees.find(e => e.name === 'Bob Smith');
  assert.ok(alice, 'Alice should be populated');
  assert.ok(bob, 'Bob should be populated');
  // Sun=0, Mon=1, Tue=2 ... shifts array is per-day in that order.
  assert.equal(alice.shifts[0], 'OFF');
  assert.equal(alice.shifts[1], '09:00-17:00');
  assert.equal(alice.shifts[2], '09:00-17:00');
  assert.equal(alice.shifts[3], 'OFF');
  assert.equal(bob.shifts[1], '08:00-16:00');
  assert.equal(bob.shifts[2], 'OFF');

  // Populated via the real schedule table renderer without throwing (standard editable
  // table — no separate edit UI needed per the DoD).
  assert.doesNotThrow(() => api.renderTable(0));

  // Went through the same roster dispatcher actions the .xlsx upload path uses.
  assert.ok(api.session.log.some(e => e.type === 'rosterAdd' && e.meta && e.meta.empName === 'Alice Johnson'));
});

test('test_schedule_ocr_confirms_before_overwrite', async () => {
  const api = loadApp();
  api.setTestMode(true);
  const ent = resetToSingleEntity(api, {
    id: 0, name: 'Existing Schedule Co',
    employees: [{ name: 'Existing Employee', shifts: ['OFF', '09:00-17:00', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'] }],
  });
  api._prefSet('pv26_api_key', 'FAKEKEY');

  let confirmCalled = false;
  api.__sandbox.confirm = (msg) => { confirmCalled = true; assert.match(msg, /Replace existing schedule/); return false; };

  const calls = mockGeminiResponse(api, { employees: [{ name: 'New Person', shifts: [{ day: 'Mon', start: '09:00', end: '17:00' }] }] });

  await api.runScheduleOcrForEntity(0, fakeImageFile(), 1);

  assert.equal(confirmCalled, true, 'must confirm before overwriting an existing schedule');
  assert.equal(calls.length, 0, 'must not call the OCR API at all when the user declines the overwrite');
  assert.equal(ent.employees.length, 1);
  assert.equal(ent.employees[0].name, 'Existing Employee', 'existing schedule must be untouched');
});

test('test_schedule_ocr_overwrites_when_confirmed', async () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, {
    id: 0, name: 'Existing Schedule Co',
    employees: [{ name: 'Old Employee', shifts: ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'] }],
  });
  api._prefSet('pv26_api_key', 'FAKEKEY');
  api.__sandbox.confirm = () => true; // user accepts overwrite

  mockGeminiResponse(api, { employees: [{ name: 'New Employee', shifts: [{ day: 'Wed', start: '10:00', end: '18:00' }] }] });

  await api.runScheduleOcrForEntity(0, fakeImageFile(), 1);

  const ent = api.entities[0];
  assert.equal(ent.employees.length, 1);
  assert.equal(ent.employees[0].name, 'New Employee', 'old schedule fully replaced');
  assert.equal(ent.employees[0].shifts[3], '10:00-18:00');
});

test('test_schedule_ocr_surfaces_warnings_toast_on_success', async () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Warn Co', employees: [] });
  api._prefSet('pv26_api_key', 'FAKEKEY');

  mockGeminiResponse(api, {
    employees: [{ name: 'Casey', shifts: [{ day: 'Fri', start: '09:00', end: '17:00' }] }],
    warnings: ['AM/PM unclear for Casey on Friday'],
  });

  await api.runScheduleOcrForEntity(0, fakeImageFile(), 1);

  const toast = api.__sandbox.document.getElementById('toast');
  assert.ok(toast.innerHTML.includes('AM/PM unclear'), 'warnings from the OCR payload surface as a toast');
});

test('test_schedule_ocr_retries_on_failure_then_succeeds', async () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Retry Co', employees: [] });
  api._prefSet('pv26_api_key', 'FAKEKEY');

  let attempt = 0;
  api.__sandbox.fetch = async () => {
    attempt++;
    if (attempt < 2) return { ok: false, status: 503, text: async () => 'transient error' };
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ employees: [{ name: 'Retried Employee', shifts: [] }] }) }] } }] }),
    };
  };

  // Use the real retry loop (maxAttempts=2) but avoid the real 12s OCR_RETRY_DELAY_MS wait.
  const realSetTimeout = api.__sandbox.setTimeout;
  api.__sandbox.setTimeout = (fn) => { fn(); return 0; };
  try {
    await api.runScheduleOcrForEntity(0, fakeImageFile(), 2);
  } finally {
    api.__sandbox.setTimeout = realSetTimeout;
  }

  assert.equal(attempt, 2, 'first attempt fails, second attempt (within maxAttempts) succeeds');
  assert.equal(api.entities[0].employees.length, 1);
  assert.equal(api.entities[0].employees[0].name, 'Retried Employee');
});

test('test_schedule_ocr_fails_all_attempts_shows_error_toast', async () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Fail Co', employees: [] });
  api._prefSet('pv26_api_key', 'FAKEKEY');

  api.__sandbox.fetch = async () => ({ ok: false, status: 500, text: async () => 'server error' });
  const realSetTimeout = api.__sandbox.setTimeout;
  api.__sandbox.setTimeout = (fn) => { fn(); return 0; };
  try {
    await api.runScheduleOcrForEntity(0, fakeImageFile(), 2);
  } finally {
    api.__sandbox.setTimeout = realSetTimeout;
  }

  // Note: the test's setTimeout override (used to skip the real 12s retry delay) also
  // fires showToast's own auto-hide timer immediately, so by the time we inspect the
  // toast its className has already been stripped back from 'show err' to 'err' — that's
  // a side effect of the accelerated timer, not a real behavior change. innerHTML still
  // reflects the last message shown, which is what matters here.
  const toast = api.__sandbox.document.getElementById('toast');
  assert.ok(toast.innerHTML.includes('Schedule OCR failed'), 'error toast matches the timecard OCR failure pattern');
  assert.equal(api.entities[0].employees.length, 0, 'no partial schedule is applied on failure');
});

test('test_schedule_ocr_json_to_rows_shape_matches_excel_upload', () => {
  const api = loadApp();
  const rows = api.scheduleOcrJsonToRows({
    employees: [
      { name: 'Dana', shifts: [{ day: 'Sun', start: '20:00', end: '02:00' }] }, // overnight
      { name: '  ' }, // blank name — must be skipped
      { name: 'Eli', shifts: [] }, // no shifts -> all OFF
    ],
  });
  // Header row must be exactly what parseSchedule()'s "Name" + day-column detection expects.
  assert.deepEqual(rows[0], ['Name', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  assert.equal(rows.length, 3, 'blank-named employee is dropped, Dana + Eli remain');
  const dana = rows.find(r => r[0] === 'Dana');
  assert.equal(dana[1], '20:00-02:00');
  for (let d = 2; d <= 7; d++) assert.equal(dana[d], 'OFF');
  const eli = rows.find(r => r[0] === 'Eli');
  for (let d = 1; d <= 7; d++) assert.equal(eli[d], 'OFF');

  // Feeding this straight into parseSchedule (the .xlsx upload's own ingestion function)
  // must work exactly like a real Excel import would.
  const api2 = loadApp();
  api2.setTestMode(true);
  resetToSingleEntity(api2, { id: 0, name: 'Shape Co', employees: [] });
  api2.parseSchedule(rows, 0);
  const overnightShift = api2.entities[0].employees.find(e => e.name === 'Dana').shifts[0];
  assert.equal(overnightShift, '20:00-02:00');
  const parsed = api2.parseShift ? api2.parseShift(overnightShift) : null;
  // parseShift isn't exported, but calcHours-style overnight math is exercised indirectly —
  // just confirm the raw shift string round-trips through parseSchedule untouched.
  assert.ok(overnightShift.includes('-'));
});

test('test_schedule_ocr_rejects_empty_extraction', async () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Empty Co', employees: [] });
  api._prefSet('pv26_api_key', 'FAKEKEY');

  mockGeminiResponse(api, { employees: [] });

  await api.runScheduleOcrForEntity(0, fakeImageFile(), 1);

  const toast = api.__sandbox.document.getElementById('toast');
  assert.ok(toast.innerHTML.includes('Schedule OCR failed'), 'an empty employees[] is treated as an OCR failure, not a silent no-op');
  assert.equal(api.entities[0].employees.length, 0);
});

test('test_schedule_ocr_uses_same_tc_model_as_timecards', async () => {
  const api = loadApp();
  api.setTestMode(true);
  resetToSingleEntity(api, { id: 0, name: 'Model Co', employees: [] });
  api._prefSet('pv26_api_key', 'FAKEKEY');
  api._prefSet('pv26_tc_model', 'gemini-2.5-flash');

  const calls = mockGeminiResponse(api, { employees: [{ name: 'Sam', shifts: [] }] });
  await api.runScheduleOcrForEntity(0, fakeImageFile(), 1);

  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('gemini-2.5-flash'), 'schedule OCR reuses getTcModel(), same as timecard OCR');
});
