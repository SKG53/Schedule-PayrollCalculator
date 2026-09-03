const fs = require('node:fs');
const path = require('node:path');

function makeElement() {
  const noop = () => {};
  // FC-00009: a couple of real code paths (showScheduleUI, parseSchedule's "records
  // loaded" banner) reach into their container via dz.querySelector('h2'/'p') to update
  // a status line, and never null-check the result because that markup is always present
  // in the real static HTML. Everywhere else in index.html, querySelector() results ARE
  // null-checked (`if(existing)...`) and rely on null-when-absent, so only special-case
  // exactly these two always-present structural tags — every other selector keeps
  // returning null exactly as before.
  const STRUCTURAL_CHILD_TAGS = new Set(['h2', 'p']);
  const childCache = new Map();
  return {
    style: {},
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    options: [],
    className: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    dataset: {},
    appendChild: noop,
    removeChild: noop,
    addEventListener: noop,
    removeEventListener: noop,
    querySelectorAll: () => [],
    querySelector: (sel) => {
      if (!STRUCTURAL_CHILD_TAGS.has(sel)) return null;
      if (!childCache.has(sel)) childCache.set(sel, makeElement());
      return childCache.get(sel);
    },
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
  // Elements are cached per-id so tests can render (e.g. renderFlags/renderIntake) and then
  // inspect the resulting innerHTML on the same fake node, instead of getting a fresh throwaway
  // element on every call. Existing tests never relied on fresh-each-time semantics.
  const elementCache = new Map();
  const fakeDoc = {
    getElementById: (id) => {
      if (!elementCache.has(id)) elementCache.set(id, makeElement());
      return elementCache.get(id);
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => makeElement(),
    body: { appendChild: noop, removeChild: noop },
    addEventListener: noop,
    removeEventListener: noop,
  };

  // FC-00012: exports (_exportExcel) apply per-entity color fills to cells and rely on
  // real column widths, so this mock has to actually record row/cell state instead of
  // returning no-ops. `sheet.rows` is a 1-indexed array of row records (each row record
  // is a 1-indexed array of cell records: { value, fill, font, alignment, border, numFmt }),
  // and `sheet.colWidths` is a 1-indexed array of widths set via `getColumn(i).width = w`.
  function makeCell() {
    return { value: undefined, font: {}, alignment: {}, fill: {}, border: {}, numFmt: '' };
  }
  function workbookSheet() {
    // rows[0] is unused (ExcelJS rows are 1-indexed); rows[1] is the first added row.
    const rows = [null];
    const colWidths = []; // colWidths[colNumber] = width, 1-indexed
    const merges = [];
    const sheet = {
      rows,
      colWidths,
      merges,
      addRow(values) {
        const cells = [undefined]; // 1-indexed within the row too
        (values || []).forEach((v, i) => {
          const cell = makeCell();
          cell.value = v;
          cells[i + 1] = cell;
        });
        rows.push(cells);
        const rowNumber = rows.length - 1;
        const rowApi = {
          number: rowNumber,
          font: {},
          height: 0,
          getCell(ci) {
            if (!cells[ci]) cells[ci] = makeCell();
            return cells[ci];
          },
          eachCell(fn) {
            for (let ci = 1; ci < cells.length; ci++) {
              if (cells[ci] === undefined) continue;
              fn(cells[ci], ci);
            }
          },
        };
        return rowApi;
      },
      mergeCells(r1, c1, r2, c2) {
        merges.push([r1, c1, r2, c2]);
      },
      getColumn(i) {
        return {
          get width() { return colWidths[i]; },
          set width(w) { colWidths[i] = w; },
        };
      },
      columns: [],
      views: [],
    };
    return sheet;
  }

  // FC-00009: a real (in-memory) localStorage-shaped store shared by the bare `localStorage`
  // binding and `window.localStorage` — index.html's _prefGet/_prefSet/_prefRemove read/write
  // through `window.localStorage`, so tests need that path wired to something real (not the
  // no-op stub) to simulate an API key being present/absent.
  const prefStore = new Map();
  const localStorageMock = {
    getItem: (k) => (prefStore.has(k) ? prefStore.get(k) : null),
    setItem: (k, v) => { prefStore.set(k, String(v)); },
    removeItem: (k) => { prefStore.delete(k); },
  };

  const sandbox = {
    document: fakeDoc,
    window: { scrollX: 0, scrollY: 0, scrollTo: () => {}, jspdf: null, localStorage: localStorageMock }, // .jspdf wired to sandbox.jspdf below
    console,
    setTimeout,
    clearTimeout,
    alert: noop,
    confirm: () => true,
    prompt: () => '',
    URL: { createObjectURL: () => 'blob:', revokeObjectURL: noop },
    Blob: class { constructor() {} },
    FileReader: class {
      constructor() { this.onload = null; this.onerror = null; this.result = null; }
      readAsArrayBuffer() {}
      // FC-00009: prepareImageForOcr() falls back to fileToBase64() (which uses
      // readAsDataURL) whenever createImageBitmap isn't available — true in this Node
      // sandbox — so schedule/timecard OCR tests need a real (if minimal) data URL here
      // rather than a no-op, or every OCR test would hang waiting on onload.
      readAsDataURL(file) {
        const b64 = (file && typeof file.__testBase64 === 'string') ? file.__testBase64 : 'ZmFrZQ==';
        this.result = 'data:' + ((file && file.type) || 'image/jpeg') + ';base64,' + b64;
        if (this.onload) this.onload({ target: this });
      }
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    crypto: { subtle: { digest: async () => new ArrayBuffer(32) } },
    TextEncoder: class { encode() { return new Uint8Array(0); } },
    ExcelJS: {
      Workbook: class {
        constructor() {
          this.creator = '';
          this.description = '';
          this.worksheets = [];
          this.xlsx = { writeBuffer: async () => new ArrayBuffer(0) };
          // FC-00012: tests need to inspect the workbook an export just built (fills,
          // column widths, cell values) — track the most recently constructed one on
          // the sandbox so it's reachable from the returned API as __lastExcelWorkbook.
          sandbox.__lastExcelWorkbook = this;
        }
        addWorksheet(name) {
          const ws = workbookSheet();
          ws.name = name;
          this.worksheets.push(ws);
          return ws;
        }
      }
    },
    XLSX: { read: () => ({ SheetNames: [], Sheets: {} }), utils: { sheet_to_json: () => [] } },
    jspdf: null, // replaced below with a real (recording) mock
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    localStorage: localStorageMock,
    navigator: {},
    location: { reload: noop },
  };
  // FC-00015: _exportPdf drives jsPDF + the autoTable plugin directly (doc.autoTable(...)).
  // The mock records every autoTable() call's options (most importantly `didParseCell`,
  // which _exportPdf uses to paint per-entity palette fills) plus every simulated cell it
  // parses through that hook, so tests can assert the exact fillColor applied per row/col
  // without a real PDF renderer. `sandbox.__lastAutoTableCalls` accumulates one entry per
  // doc.autoTable() call across the life of a single loaded app instance.
  sandbox.__lastAutoTableCalls = [];
  function makeJsPdfDoc(opts) {
    const calls = sandbox.__lastAutoTableCalls;
    const doc = {
      __opts: opts,
      internal: { pageSize: { getWidth: () => 792, getHeight: () => 612 } },
      setFont: noop,
      setFontSize: noop,
      text: noop,
      addPage: noop,
      save: noop,
      autoTable(tableOpts) {
        // Simulate autoTable's own didParseCell invocation: for every head + body cell it
        // calls the hook with a `data` object shaped like { section, row, column, cell }
        // so _exportPdf's hook can inspect/mutate cell.styles.fillColor exactly as it would
        // against the real plugin.
        const parsedCells = [];
        const invoke = (section, rowIndex, sourceRow) => {
          (sourceRow || []).forEach((raw, colIndex) => {
            const cell = {
              raw,
              styles: (raw && typeof raw === 'object' && raw.styles) ? Object.assign({}, raw.styles) : {},
            };
            const data = {
              section,
              row: { index: rowIndex, raw: sourceRow },
              column: { index: colIndex },
              cell,
            };
            if (typeof tableOpts.didParseCell === 'function') tableOpts.didParseCell(data);
            parsedCells.push({ section, rowIndex, colIndex, fillColor: cell.styles.fillColor, fontStyle: cell.styles.fontStyle });
          });
        };
        (tableOpts.head || []).forEach((r, i) => invoke('head', i, r));
        (tableOpts.body || []).forEach((r, i) => invoke('body', i, r));
        calls.push({ options: tableOpts, parsedCells });
        doc.lastAutoTable = { finalY: (tableOpts.startY || 56) + 100 };
        return doc;
      },
      lastAutoTable: { finalY: 56 },
    };
    return doc;
  }
  sandbox.jspdf = { jsPDF: function jsPDF(opts) { return makeJsPdfDoc(opts); } };
  sandbox.window.jspdf = sandbox.jspdf; // _exportPdf reads window.jspdf.jsPDF, not the bare `jspdf` binding

  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;

  const returnApi = `
    return {
      DAYS, DAY_SHORT,
      session,
      entities,
      setTab,
      getCurrentTab,
      renderIntake,
      renderPayroll,
      renderFlags,
      renderTable,
      switchEntity,
      addEntity,
      renderPayrollEntityContent,
      renderPayrollExportPreviewHtml,
      renderFc00013PreviewPanel,
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
      entityPalettes,
      PAYROLL_SETTINGS_HEADERS,
      PAYROLL_SETTINGS_BREAK_HEADERS,
      setTestMode,
      dispatch,
      revert,
      recompute,
      ensureRosterRecord,
      getRosterRecord,
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
      getFinalPassMethod,
      setFinalPassMethod,
      getRosterNotes,
      setRosterNotes,
      getAliases,
      setAliases,
      validateAlias,
      resolveAlias,
      matchEmployeeName,
      getFlatWageRows,
      OLD_EMP_ID_RE,
      NEW_EMP_ID_RE,
      migrateLegacyEmployeeIds,
      _migrateRecordId,
      _mintEmployeeId,
      _resolveEntityCode,
      _syncEntityCode,
      _entityCodeFor,
      hasDuplicateNames,
      getDuplicateEntities,
      anyDuplicateNames,
      isDuplicateNameFor,
      _duplicateGroupsForEntity,
      _duplicateEntityNameList,
      renameEmployeeViaDispatcher,
      openRenameEmployeeModal,
      _blockExportIfDuplicates,
      _dupFlagHtml,
      _dupBannerHtml,
      _nameWithId,
      _employeeIdFor,
      exportPayrollSettingsExcel,
      exportActualsIntakeExcel,
      _exportExcel,
      exportCashExcel,
      exportDepositExcel,
      exportCombinedExcel,
      exportTimecardExcel,
      exportPayrollCalcExcel,
      _exportPdf,
      exportCashPdf,
      exportDepositPdf,
      exportCombinedPdf,
      exportTimecardPdf,
      exportPayrollCalcPdf,
      exportFullPdf,
      _argbToRgbTriplet,
      FC12_PALETTES,
      _fc12PaletteFor,
      _applyEntityPalette,
      FC14_PRESETS,
      FC14_PRESET_NAMES,
      FC14_DEFAULT_PRESET_BY_CODE,
      _paletteForEntity,
      getEntityPalette,
      setEntityPalette,
      _collectExportData,
      _columnsFor,
      xlMoney,
      xlHours,
      _cellValue,
      _cellText,
      showToast,
      _rosterKey,
      _withSessionMutation,
      ensureIntakeState,
      processReviewRow,
      runOcrForEntity,
      addIntakeFiles,
      clearIntake,
      approveReviewRow,
      unapproveReviewRow,
      updateReviewField,
      updateReviewFieldLight,
      commitDateInput,
      findReviewRow,
      renderReviewTableHtml,
      refreshReviewTable,
      _ingestActualsIntakeRows,
      importActualsIntakeFile,
      _prefGet,
      _prefSet,
      _prefRemove,
      parseSchedule,
      handleFile,
      startBlank,
      renderScheduleContent,
      showScheduleUI,
      callGeminiVisionJson,
      ocrImage,
      schedulePrompt,
      ocrScheduleImage,
      scheduleOcrJsonToRows,
      runScheduleOcrForEntity,
      handleSchedulePasteEvent,
      pasteScheduleImage,
      OCR_RETRY_DELAY_MS,
      OCR_MAX_AUTO_ATTEMPTS,
    };
  `;

  const keys = Object.keys(sandbox);
  const fn = new Function(...keys, `with(arguments[arguments.length - 1]) { ${js}; ${returnApi} }`);
  const api = fn.apply(null, keys.map(k => sandbox[k]).concat([sandbox]));
  api.__sandbox = sandbox;
  Object.defineProperty(api, '__lastExcelWorkbook', { get: () => sandbox.__lastExcelWorkbook });
  Object.defineProperty(api, '__lastAutoTableCalls', { get: () => sandbox.__lastAutoTableCalls });
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
  clearObject(api.session.roster.byId);
  clearObject(api.session.roster.keyToId);
  api.session.log.length = 0;
  api.session.seq = 0;
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
    api.entityPalettes,
  ].forEach(clearObject);
  return api.entities[0];
}

module.exports = { loadApp, resetToSingleEntity, clearObject };
