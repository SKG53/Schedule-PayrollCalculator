const fs = require('node:fs');
const path = require('node:path');

function makeElement() {
  const noop = () => {};
  return {
    style: {},
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    className: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    dataset: {},
    appendChild: noop,
    removeChild: noop,
    addEventListener: noop,
    removeEventListener: noop,
    querySelectorAll: () => [],
    querySelector: () => null,
    focus: noop,
    click: noop,
    getContext: () => null,
    setAttribute: noop,
    getAttribute: () => null,
  };
}

function loadApp() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not find inline <script> in index.html');

  let js = match[1];
  const initIdx = js.indexOf('// INIT');
  if (initIdx > 0) js = js.slice(0, initIdx);

  const noop = () => {};
  const fakeDoc = {
    getElementById: () => makeElement(),
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => makeElement(),
    body: { appendChild: noop, removeChild: noop },
    addEventListener: noop,
    removeEventListener: noop,
  };

  const workbookSheet = () => ({
    addRow: () => ({
      eachCell: noop,
      getCell: () => ({ font: {}, alignment: {}, fill: {}, border: {}, numFmt: '' }),
      number: 1,
      font: {},
      height: 0,
    }),
    mergeCells: noop,
    getColumn: () => ({ width: 0 }),
    columns: [],
    views: [],
  });

  const sandbox = {
    document: fakeDoc,
    window: {},
    console,
    setTimeout,
    clearTimeout,
    alert: noop,
    confirm: () => true,
    prompt: () => '',
    URL: { createObjectURL: () => 'blob:', revokeObjectURL: noop },
    Blob: class { constructor() {} },
    FileReader: class {
      constructor() { this.onload = null; }
      readAsArrayBuffer() {}
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    crypto: { subtle: { digest: async () => new ArrayBuffer(32) } },
    TextEncoder: class { encode() { return new Uint8Array(0); } },
    ExcelJS: {
      Workbook: class {
        constructor() {
          this.creator = '';
          this.description = '';
          this.xlsx = { writeBuffer: async () => new ArrayBuffer(0) };
        }
        addWorksheet() { return workbookSheet(); }
      }
    },
    XLSX: { read: () => ({ SheetNames: [], Sheets: {} }), utils: { sheet_to_json: () => [] } },
    jspdf: null,
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: {},
    location: { reload: noop },
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;

  const returnApi = `
    return {
      DAYS, DAY_SHORT,
      entities,
      actualDays,
      wageRates,
      wageBlank,
      payMethod,
      splitAmounts,
      flatWages,
      flatWagesDisplayNames,
      breakOverrides,
      rosterActive,
      rosterAliases,
      PAYROLL_SETTINGS_HEADERS,
      PAYROLL_SETTINGS_BREAK_HEADERS,
      wKey,
      roundCash,
      roundDeposit,
      _computeBothBreakdown,
      computePayBreakdown,
      computePayrollForEntity,
      getBreakOverride,
      setBreakOverride,
      clearBreakOverride,
      hasAnyBreakOverrides,
      clearAllBreakOverridesForEntity,
      getPayMethod,
      setPayMethod,
      getSplitDeposit,
      getSplitMeta,
      setSplitDeposit,
      clearSplitDeposit,
      sortRowsByPayType,
      _paytypeExportSortFn,
      _filterRowsForKind,
      methodLabel,
      _gatherPayrollSettingsRows,
      _ingestPayrollSettings,
      isRosterActive,
      setRosterActive,
      getAliases,
      setAliases,
      validateAlias,
      resolveAlias,
      matchEmployeeName,
      getFlatWageRows,
    };
  `;

  const keys = Object.keys(sandbox);
  const fn = new Function(...keys, `with(arguments[arguments.length - 1]) { ${js}; ${returnApi} }`);
  const api = fn.apply(null, keys.map(k => sandbox[k]).concat([sandbox]));
  api.__sandbox = sandbox;
  return api;
}

function clearObject(obj) {
  Object.keys(obj).forEach(k => delete obj[k]);
}

function resetToSingleEntity(api, entity = {}) {
  api.entities.length = 0;
  api.entities.push({
    id: entity.id ?? 0,
    name: entity.name ?? 'Test Entity',
    employees: entity.employees ?? [],
    dateLabels: entity.dateLabels ?? ['', '', '', '', '', '', ''],
    newDateLabels: ['', '', '', '', '', '', ''],
    newWeekStartVal: '',
    breakMinutes: entity.breakMinutes ?? 0,
    breakMinutesSet: entity.breakMinutesSet ?? false,
    actualDays: entity.actualDays ?? [],
    intake: entity.intake ?? null,
  });
  api.actualDays.length = 0;
  [
    api.wageRates,
    api.wageBlank,
    api.payMethod,
    api.splitAmounts,
    api.flatWages,
    api.flatWagesDisplayNames,
    api.breakOverrides,
    api.rosterActive,
    api.rosterAliases,
  ].forEach(clearObject);
  return api.entities[0];
}

module.exports = { loadApp, resetToSingleEntity, clearObject };
