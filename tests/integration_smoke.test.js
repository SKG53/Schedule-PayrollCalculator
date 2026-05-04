// Loads the actual <script> from index.html into a Node sandbox stub'd with the minimum
// DOM/globals needed, then exercises the real helpers (getBreakOverride, sortRowsByPayType,
// _gatherPayrollSettingsRows, computePayrollForEntity-via-stubs).
//
// This is a smoke test — it only verifies the symbols exist and behave correctly for the
// new code paths added in this commit. Many UI handlers reference document/showToast which
// are stubbed.

const fs=require('fs');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
if(!m){console.error('no inline script');process.exit(1)}
let js=m[1];

// Strip the final INIT block (DOM-touching top-level statements).
const initIdx=js.indexOf('// INIT');
if(initIdx>0)js=js.slice(0,initIdx);

// Build a sandbox.
const noop=()=>{};const noopRet={style:{},innerHTML:'',value:'',classList:{add:noop,remove:noop,toggle:noop},appendChild:noop,addEventListener:noop,querySelectorAll:()=>[],focus:noop,getCell:()=>({font:{},alignment:{},fill:{},border:{}}),addRow:()=>({eachCell:noop,getCell:()=>({font:{},alignment:{},fill:{},border:{}}),number:1,height:0,font:{}}),mergeCells:noop,addWorksheet:()=>noopRet,addRow_:noop,xlsx:{writeBuffer:async()=>new ArrayBuffer(0)},columns:[],views:[]};
const fakeDoc={
  getElementById:()=>noopRet,
  querySelectorAll:()=>[],
  querySelector:()=>null,
  createElement:()=>noopRet,
  body:{appendChild:noop,removeChild:noop},
  addEventListener:noop
};
const sandbox={
  document:fakeDoc,
  window:{},
  console,
  setTimeout,
  clearTimeout,
  alert:noop,
  confirm:()=>true,
  prompt:()=>'',
  URL:{createObjectURL:()=>'blob:',revokeObjectURL:noop},
  Blob:class{constructor(){}},
  FileReader:class{constructor(){this.onload=null}readAsArrayBuffer(){}},
  fetch:async()=>({ok:true,json:async()=>({})}),
  crypto:{subtle:{digest:async()=>new ArrayBuffer(32)}},
  TextEncoder:class{encode(){return new Uint8Array(0)}},
  ExcelJS:{Workbook:class{constructor(){this.creator='';this.description='';this.xlsx={writeBuffer:async()=>new ArrayBuffer(0)}}addWorksheet(){return{addRow:()=>({eachCell:noop,getCell:()=>({font:{},alignment:{},fill:{},border:{}}),number:1,font:{},height:0}),mergeCells:noop,getColumn:()=>({width:0}),columns:[],views:[]}}}},
  XLSX:{read:()=>({SheetNames:[],Sheets:{}}),utils:{sheet_to_json:()=>[]}},
  jspdf:null,
  sessionStorage:{getItem:()=>null,setItem:noop,removeItem:noop},
  localStorage:{getItem:()=>null,setItem:noop,removeItem:noop},
  navigator:{},
  location:{reload:noop}
};
sandbox.global=sandbox;sandbox.globalThis=sandbox;

// Eval into sandbox via Function constructor (gives access to all sandbox keys as locals).
const keys=Object.keys(sandbox);
const fn=new Function(...keys,`with(arguments[arguments.length-1]){${js}; return {getBreakOverride,setBreakOverride,clearBreakOverride,hasAnyBreakOverrides,clearAllBreakOverridesForEntity,sortRowsByPayType,_paytypeExportSortFn,PAYROLL_SETTINGS_HEADERS,PAYROLL_SETTINGS_BREAK_HEADERS,_gatherPayrollSettingsRows,computePayrollForEntity,setRowBreakOverride:typeof setRowBreakOverride!=='undefined'?setRowBreakOverride:null,resolveBreakChange:typeof resolveBreakChange!=='undefined'?resolveBreakChange:null,getPayMethod,setPayMethod,entities,wKey,breakOverrides:typeof breakOverrides!=='undefined'?breakOverrides:null,payrollSortMode:typeof payrollSortMode!=='undefined'?payrollSortMode:null,_filterRowsForKind,methodLabel};}`);

let api;
try{
  api=fn.apply(null,keys.map(k=>sandbox[k]).concat([sandbox]));
}catch(e){console.error('Sandbox load error:',e.message);process.exit(1)}

let passes=0,fails=0;
function ok(cond,label){if(cond){passes++;console.log('✓',label);}else{fails++;console.error('✗',label);}}

// 1. Symbols exist
ok(typeof api.getBreakOverride==='function','getBreakOverride is a function');
ok(typeof api.setBreakOverride==='function','setBreakOverride is a function');
ok(typeof api.clearBreakOverride==='function','clearBreakOverride is a function');
ok(typeof api.hasAnyBreakOverrides==='function','hasAnyBreakOverrides is a function');
ok(typeof api.sortRowsByPayType==='function','sortRowsByPayType is a function');
ok(typeof api._paytypeExportSortFn==='function','_paytypeExportSortFn is a function');
ok(Array.isArray(api.PAYROLL_SETTINGS_HEADERS),'PAYROLL_SETTINGS_HEADERS exists');
ok(Array.isArray(api.PAYROLL_SETTINGS_BREAK_HEADERS),'PAYROLL_SETTINGS_BREAK_HEADERS exists');
ok(api.PAYROLL_SETTINGS_BREAK_HEADERS.length===15,'15 break headers (default + 7 days × 2)');
ok(typeof api._gatherPayrollSettingsRows==='function','_gatherPayrollSettingsRows is a function');
ok(typeof api._filterRowsForKind==='function','_filterRowsForKind is a function');

// 2. Break override storage round-trips through real code.
api.setBreakOverride(0,'Alice',2,15);
ok(api.getBreakOverride(0,'Alice',2)===15,'real setBreakOverride/getBreakOverride round-trip');
ok(api.getBreakOverride(0,'Alice',1)===null,'absent override returns null');
api.clearBreakOverride(0,'Alice',2);
ok(api.getBreakOverride(0,'Alice',2)===null,'clearBreakOverride drops the value');
api.setBreakOverride(0,'Alice',2,0);
ok(api.getBreakOverride(0,'Alice',2)===0,'0-minute override is preserved (not coerced to null)');
api.clearBreakOverride(0,'Alice',2);

// 3. Pay-type sort matches expected order.
api.entities[0].id=0;
api.setPayMethod(0,'X','deposit');
api.setPayMethod(0,'Y','cash');
api.setPayMethod(0,'Z','both');
const out=api.sortRowsByPayType(0,[
  {schedName:'X',name:'X'},
  {schedName:'Y',name:'Y'},
  {schedName:'Z',name:'Z'}
]);
ok(out[0].schedName==='Y'&&out[1].schedName==='Z'&&out[2].schedName==='X','sort order: cash → both → deposit');

// 4. _gatherPayrollSettingsRows includes break columns only when includeBreaks=true.
api.entities[0].name='TestEnt';
api.entities[0].employees=[{name:'Alice',shifts:['','','','','','','']}];
api.setBreakOverride(0,'Alice',2,15);
const without=api._gatherPayrollSettingsRows(false);
ok(without.length>0&&without[0].dayBreaks==null,'no dayBreaks field when includeBreaks=false');
const withBreaks=api._gatherPayrollSettingsRows(true);
ok(withBreaks.length>0&&Array.isArray(withBreaks[0].dayBreaks)&&withBreaks[0].dayBreaks.length===7,'dayBreaks has length 7 when includeBreaks=true');
ok(withBreaks[0].dayBreaks[2].minutes===15&&withBreaks[0].dayBreaks[2].status==='Override','Tue override exported as Override');
ok(withBreaks[0].dayBreaks[0].minutes===null&&withBreaks[0].dayBreaks[0].status==='Actual','Sun reports Actual when no override');

// 5. End-to-end: build a synthetic entity, run computePayrollForEntity, verify billable hours
//    use the per-day override (this exercises the real code path inside index.html).
{
  // Reset & seed fresh entity state.
  api.entities.length=0;
  api.entities.push({id:0,name:'E',employees:[{name:'Bob',shifts:['','7AM - 3PM','','','','','']}],dateLabels:['','','','','','',''],actualDays:[
    // Bob worked Monday (dayIdx=1): clocked in 7-11 and 11:30-15:00, span 8h, worked 7.5h, raw break 0.5h.
    {empName:'Bob',entityName:'E',date:'2026-04-13',dayIdx:1,pairs:[{in:7,out:11,outAdj:11,minutes:240},{in:11.5,out:15,outAdj:15,minutes:210}]}
  ],intake:null,breakMinutes:30,breakMinutesSet:true});
  // No override: effective break = max(default 30m, raw 30m) = 30m → billable = 8 - 0.5 = 7.5h.
  let{results}=api.computePayrollForEntity(0);
  ok(results.length===1,'one result row');
  ok(Math.abs(results[0].actualHours-7.5)<1e-6,'no override: billable = 7.5h');
  // Override = 0 minutes → effective break 0 → billable = 8h.
  api.setBreakOverride(0,'Bob',1,0);
  ({results}=api.computePayrollForEntity(0));
  ok(Math.abs(results[0].actualHours-8.0)<1e-6,'override 0m: billable jumps to 8h');
  // Override = 60 minutes → effective break 1h → billable = 7h.
  api.setBreakOverride(0,'Bob',1,60);
  ({results}=api.computePayrollForEntity(0));
  ok(Math.abs(results[0].actualHours-7.0)<1e-6,'override 60m: billable drops to 7h');
}

console.log(`\n${passes} passed, ${fails} failed.`);
process.exit(fails===0?0:1);
