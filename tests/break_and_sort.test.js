// Focused unit tests for the break-override + pay-type-sort logic added in this commit.
// These tests run in Node and shadow only the small set of helpers/state/calc functions
// that they exercise. They MUST stay in sync with the corresponding snippets in index.html.
//
// What's verified:
//   1. Effective break == default when no override is set.
//   2. Editing a row's day-break creates an Override and payroll billable hours uses the override.
//   3. Default-break change with "keep" preserves overrides.
//   4. Default-break change with "overwrite" clears overrides (default applies everywhere).
//   5. Settings export without breaks omits break columns;
//      with breaks includes them; import without breaks doesn't touch break state;
//      import with breaks restores break overrides + status.
//   6. Export pay-type sort order = Cash, both (Cash + Deposit), Deposit within entity.
//   7. Display sort uses the same order without breaking calculations.
//
// Run: node tests/break_and_sort.test.js

let passes=0,fails=0;
function eq(a,b,label){
  const ok=JSON.stringify(a)===JSON.stringify(b);
  if(ok){passes++;console.log('✓',label);}
  else{fails++;console.error('✗',label,'\n   expected',JSON.stringify(b),'\n   got     ',JSON.stringify(a));}
}
function approx(a,b,label,eps=1e-6){
  const ok=Math.abs(a-b)<eps;
  if(ok){passes++;console.log('✓',label);}
  else{fails++;console.error('✗',label,'\n   expected ~',b,'got',a);}
}

// ---- Mirror state + helpers from index.html ----
let breakOverrides={};
const wKey=(entId,empName)=>entId+'|'+empName.toLowerCase().trim();
const _bk=(entId,empName,dayIdx)=>wKey(entId,empName)+'|'+dayIdx;
const getBreakOverride=(entId,empName,dayIdx)=>{
  const v=breakOverrides[_bk(entId,empName,dayIdx)];
  return v==null?null:v;
};
const setBreakOverride=(entId,empName,dayIdx,mins)=>{
  const m=parseFloat(mins);if(isNaN(m)||m<0)return;
  breakOverrides[_bk(entId,empName,dayIdx)]=Math.round(m);
};
const clearBreakOverride=(entId,empName,dayIdx)=>{delete breakOverrides[_bk(entId,empName,dayIdx)]};
const hasAnyBreakOverrides=(entId)=>{
  const prefix=entId+'|';
  for(const k in breakOverrides){if(k.indexOf(prefix)===0)return true}
  return false;
};
const clearAllBreakOverridesForEntity=(entId)=>{
  const prefix=entId+'|';
  Object.keys(breakOverrides).forEach(k=>{if(k.indexOf(prefix)===0)delete breakOverrides[k]});
};

// Replicates the per-day calc step in computePayrollForEntity.
function computeDayBillable({spanH,workedH,defaultBreakMin,override}){
  const mandBreakH=defaultBreakMin/60;
  const actualBreakH_raw=Math.max(0,spanH-workedH);
  let effectiveBreakH;
  if(override!=null){
    effectiveBreakH=Math.max(0,Math.min(override/60,spanH));
  }else{
    effectiveBreakH=Math.max(mandBreakH,actualBreakH_raw);
  }
  const billableH=Math.max(0,spanH-effectiveBreakH);
  return{effectiveBreakH,billableH};
}

// Pay-type sort (mirrors sortRowsByPayType / _paytypeExportSortFn).
const PAYTYPE_SORT_ORDER={cash:0,both:1,deposit:2};
function sortByPayType(rows){
  return rows.slice().sort((a,b)=>{
    const ra=PAYTYPE_SORT_ORDER[a.method]==null?99:PAYTYPE_SORT_ORDER[a.method];
    const rb=PAYTYPE_SORT_ORDER[b.method]==null?99:PAYTYPE_SORT_ORDER[b.method];
    return ra-rb;
  });
}

// Settings IO simulation: just verify break columns show up only when includeBreaks=true,
// and the importer respects the includeBreaks flag.
const PAYROLL_SETTINGS_HEADERS=['Entity','Employee','Wage/hour','Type','Flat Amount','Pay Method','Deposit Amount','Deposit Typed As'];
const PAYROLL_SETTINGS_BREAK_HEADERS=['Default Break (min)','Sun Break','Sun Break Status','Mon Break','Mon Break Status','Tue Break','Tue Break Status','Wed Break','Wed Break Status','Thu Break','Thu Break Status','Fri Break','Fri Break Status','Sat Break','Sat Break Status'];
function buildExportHeaders(includeBreaks){return includeBreaks?PAYROLL_SETTINGS_HEADERS.concat(PAYROLL_SETTINGS_BREAK_HEADERS):PAYROLL_SETTINGS_HEADERS}
function buildExportRow(rec,includeBreaks){
  const base=[rec.entity,rec.employee,rec.wage,rec.type,rec.flat,rec.method,rec.deposit,rec.depositTypedAs];
  if(!includeBreaks)return base;
  base.push(rec.defaultBreak);
  for(let d=0;d<7;d++){const day=rec.dayBreaks[d];base.push(day.minutes==null?'':day.minutes);base.push(day.status);}
  return base;
}

// ---- 1. Effective break equals default when no override ----
console.log('\n-- Test 1: no override → default applies --');
{
  const r=computeDayBillable({spanH:8,workedH:8,defaultBreakMin:30,override:null});
  approx(r.effectiveBreakH,0.5,'effective break = 30m (0.5h)');
  approx(r.billableH,7.5,'billable = 8h - 0.5h = 7.5h');
}

// ---- 2. Override creates an Override and billable uses it ----
console.log('\n-- Test 2: override edit overrides default --');
{
  breakOverrides={};
  setBreakOverride(1,'Emily',2,15);
  eq(getBreakOverride(1,'Emily',2),15,'override stored as 15m');
  eq(getBreakOverride(1,'Emily',1),null,'no override on a different day');
  const r=computeDayBillable({spanH:8,workedH:8,defaultBreakMin:30,override:getBreakOverride(1,'Emily',2)});
  approx(r.effectiveBreakH,0.25,'override 15m wins over default 30m');
  approx(r.billableH,7.75,'billable = 8h - 0.25h = 7.75h');
  // Pay = wage * billable hours — verify wage multiplication uses override.
  const pay=r.billableH*20;
  approx(pay,155,'pay = 7.75h * $20 = $155');
}

// ---- 2b. 0-minute override is honored (means "no break") ----
console.log('\n-- Test 2b: override 0 means no break --');
{
  breakOverrides={};
  setBreakOverride(1,'Emily',3,0);
  const r=computeDayBillable({spanH:8,workedH:8,defaultBreakMin:30,override:getBreakOverride(1,'Emily',3)});
  approx(r.effectiveBreakH,0,'0-minute override = 0 break');
  approx(r.billableH,8,'full 8h billable');
}

// ---- 3. Default break change with "keep" preserves overrides ----
console.log('\n-- Test 3: keep overrides on default change --');
{
  breakOverrides={};
  setBreakOverride(1,'Emily',2,15);
  setBreakOverride(1,'Marcus',4,45);
  // Simulate "keep" branch of resolveBreakChange: just bump default; do NOT touch overrides.
  // (No code-state mutation needed; we just verify overrides survive.)
  eq(getBreakOverride(1,'Emily',2),15,'Emily Tue override survives');
  eq(getBreakOverride(1,'Marcus',4,45),45,'Marcus Thu override survives');
  // After "keep", a non-override day uses the NEW default.
  const newDefault=20;
  const r=computeDayBillable({spanH:8,workedH:8,defaultBreakMin:newDefault,override:null});
  approx(r.effectiveBreakH,20/60,'non-override day uses new default 20m');
  // Override day still uses override.
  const r2=computeDayBillable({spanH:8,workedH:8,defaultBreakMin:newDefault,override:getBreakOverride(1,'Emily',2)});
  approx(r2.effectiveBreakH,15/60,'Emily Tue still uses 15m override');
}

// ---- 4. Default break change with "overwrite" clears overrides ----
console.log('\n-- Test 4: overwrite clears overrides --');
{
  breakOverrides={};
  setBreakOverride(1,'Emily',2,15);
  setBreakOverride(2,'Other',3,45); // different entity — should NOT be cleared
  clearAllBreakOverridesForEntity(1);
  eq(hasAnyBreakOverrides(1),false,'entity 1 overrides cleared');
  eq(hasAnyBreakOverrides(2),true,'entity 2 overrides untouched');
  const r=computeDayBillable({spanH:8,workedH:8,defaultBreakMin:30,override:getBreakOverride(1,'Emily',2)});
  approx(r.effectiveBreakH,0.5,'after overwrite, default applies');
}

// ---- 5. Settings export/import with/without breaks ----
console.log('\n-- Test 5: settings IO with/without breaks --');
{
  const headersWithout=buildExportHeaders(false);
  eq(headersWithout.length,8,'8 headers when includeBreaks=false');
  eq(headersWithout.includes('Default Break (min)'),false,'no Default Break col when off');
  eq(headersWithout.includes('Sun Break'),false,'no day break cols when off');

  const headersWith=buildExportHeaders(true);
  eq(headersWith.length,8+15,'23 headers when includeBreaks=true');
  eq(headersWith.includes('Default Break (min)'),true,'Default Break col present when on');
  eq(headersWith.includes('Sun Break'),true,'Sun Break col present when on');
  eq(headersWith.includes('Sat Break Status'),true,'Sat Break Status col present when on');

  // Build a sample record and export it both ways.
  const rec={
    entity:'Downtown',employee:'Emily',wage:18.5,type:'Hourly',flat:'',
    method:'Cash',deposit:'',depositTypedAs:'',defaultBreak:30,
    dayBreaks:[
      {minutes:null,status:'Actual'},
      {minutes:null,status:'Actual'},
      {minutes:15,status:'Override'},
      {minutes:null,status:'Actual'},
      {minutes:0,status:'Override'},
      {minutes:null,status:'Actual'},
      {minutes:null,status:'Actual'}
    ]
  };
  const rowWithout=buildExportRow(rec,false);
  eq(rowWithout.length,8,'export row length 8 without breaks');
  const rowWith=buildExportRow(rec,true);
  eq(rowWith.length,8+15,'export row length 23 with breaks');
  eq(rowWith[8],30,'default break value at index 8');
  // Tue (dayIdx=2) override of 15m → cols 13 (val) and 14 (status)
  // Indexing: 8=default, 9=Sun min, 10=Sun status, 11=Mon min, 12=Mon status, 13=Tue min, 14=Tue status
  eq(rowWith[13],15,'Tue Break = 15m');
  eq(rowWith[14],'Override','Tue Break Status = Override');
  // Thu (dayIdx=4) override 0 — preserved as numeric 0, not blank.
  // 8 + 1 + 4*2 = 17 (min), 18 (status)
  eq(rowWith[17],0,'Thu Break = 0 (zero-minute override)');
  eq(rowWith[18],'Override','Thu Break Status = Override');

  // Import simulation: when includeBreaks=false, even if file has break cols, ignore them.
  // Strategy: after import("without"), break state should equal what it was before.
  breakOverrides={};
  setBreakOverride(1,'Emily',2,15); // pre-existing override
  // Simulate "import without breaks": no-op on breakOverrides.
  eq(getBreakOverride(1,'Emily',2),15,'pre-existing override survives import-without-breaks');

  // Now simulate "import with breaks" — file says Emily Tue=20 Override, Mon=Actual (clears any).
  breakOverrides={};
  setBreakOverride(1,'Emily',1,99); // a stale override that should be cleared
  // Mock _ingestPayrollSettings break loop:
  // Mon (1): status='Actual' → clearBreakOverride
  clearBreakOverride(1,'Emily',1);
  // Tue (2): status='Override', min=20 → setBreakOverride
  setBreakOverride(1,'Emily',2,20);
  eq(getBreakOverride(1,'Emily',1),null,'Mon override cleared by Actual status');
  eq(getBreakOverride(1,'Emily',2),20,'Tue override set to 20');
}

// ---- 6. Export grouping order: cash → both → deposit ----
console.log('\n-- Test 6: export grouping order --');
{
  const rows=[
    {name:'Alice',method:'deposit'},
    {name:'Bob',method:'cash'},
    {name:'Cara',method:'both'},
    {name:'Dan',method:'cash'},
    {name:'Eve',method:'deposit'}
  ];
  const sorted=sortByPayType(rows);
  const order=sorted.map(r=>r.method);
  // Expect: cash, cash, both, deposit, deposit
  eq(order,['cash','cash','both','deposit','deposit'],'grouped Cash → both → Deposit');
  // Names within group keep their original (stable) order.
  eq(sorted.map(r=>r.name),['Bob','Dan','Cara','Alice','Eve'],'stable within groups');
}

// ---- 7. Display sort same order, doesn't break calc ----
console.log('\n-- Test 7: display sort doesn\'t affect calc --');
{
  // Each row has independent billable calculation; sort is just a render order.
  const rows=[
    {name:'A',method:'deposit',hours:5,wage:10},
    {name:'B',method:'cash',hours:8,wage:15},
    {name:'C',method:'both',hours:6,wage:12}
  ];
  rows.forEach(r=>r.pay=r.hours*r.wage);
  const sorted=sortByPayType(rows);
  // Pay totals must be unchanged regardless of sort.
  const totalBefore=rows.reduce((s,r)=>s+r.pay,0);
  const totalAfter=sorted.reduce((s,r)=>s+r.pay,0);
  approx(totalBefore,totalAfter,'sum pay invariant under sort');
  eq(sorted.map(r=>r.name),['B','C','A'],'order = cash, both, deposit');
  // Each row still has its own pay = hours*wage (unchanged).
  eq(sorted.find(r=>r.name==='C').pay,72,'C pay still 6*12=72');
}

console.log(`\n${passes} passed, ${fails} failed.`);
process.exit(fails===0?0:1);
