// ============================================================================
//  test_panel_engine.js — CHARACTERISATION harness for the base paneling engine.
//
//  Like test_fl_engine.js: this engine had ZERO assertions before Stage 1, and
//  v3 moves it. This suite pins what it does TODAY so a later refactor has to
//  answer one question — did the layout change? Defects are PINNED and labelled,
//  not corrected.
//
//  The engine is deterministic (seeded LCG in buildPanelLayout, seeds sd*7919),
//  so goldens are byte-stable across processes.
//
//  IMPORTANT — this engine is NOT contiguous in index.html. assignStock,
//  computeTakeoff and planOffcuts sit OUTSIDE its own "PANELING ENGINE END"
//  marker and all three need rowName(), 500 lines further down. engine_source.js
//  assembles five anchored ranges; if any anchor moves it fails loudly there.
//
//  Dead code deliberately NOT tested (zero callers — removal candidates):
//    minSeg, reachesBoth, rowEvenness, simulateRow.
//
//  Run:  node test_panel_engine.js
// ============================================================================

var E = require('./engine_source.js');
var P = E.load('panel');

var pass=0, fail=0;
function ok(name, cond, extra){ if(cond){pass++; console.log("  ok  "+name);} else {fail++; console.log("FAIL  "+name+(extra?"  "+extra:""));} }
function near(a,b,t){ return Math.abs(a-b)<=(t==null?0.01:t); }
function eq(a,b){ return JSON.stringify(a)===JSON.stringify(b); }

// Replicates readInputs() (index.html:1203-1224) without the DOM.
function mkInp(o){
  var gap=o.gap||0;
  var runIn=o.roomWidthIn-2*gap, depthIn=o.roomDepthIn-2*gap;
  var stock=[8,10,12,14,16].map(function(L){ return {lenIn:L*12, qty:(o.qty&&o.qty[L])||0, ft:L}; });
  return { runIn:runIn, depthIn:depthIn, face:o.face, offset:o.offset, oc:o.oc,
           maxIn:o.maxIn, buffer:o.buffer, rows:Math.max(1,Math.ceil(depthIn/o.face)),
           trusses:P.buildTrusses(runIn,o.offset,o.oc), gap:gap, stock:stock };
}
// Replicates generate()'s LONGEST_STOCK setup (index.html:1247-1249). The engine
// reads this module global and OVERRIDES its own capIn with it, so every caller
// must set it — see the impurity section below.
function primeLongestStock(inp, cap){
  P.setLongestStock(0);
  inp.stock.forEach(function(s){
    if(s.qty>0 && s.lenIn>P.getLongestStock()) P.setLongestStock(Math.min(s.lenIn, inp.maxIn)); });
  if(P.getLongestStock()===0) P.setLongestStock(cap);
}
function runCase(f){
  var inp=mkInp(f), cap=P.capForInputs(inp);
  primeLongestStock(inp, cap);
  var opts=P.generateOptions(inp.trusses, inp.runIn, cap, inp.rows);
  var asg=P.assignStock(inp, opts[0].rowJoints);
  var tk = asg.shortage ? null : P.computeTakeoff(inp, opts[0].rowJoints, asg.rowStock);
  return {inp:inp, cap:cap, opts:opts, asg:asg, tk:tk};
}

// ---------------------------------------------------------------------------
//  FIXTURES — golden pins captured from the shipped engine.
// ---------------------------------------------------------------------------
var FIXTURES = [
  { key:'ceiling', why:"the real Zapach-style ceiling — joints on trusses, runs out of 16ft stock",
    roomWidthIn:262, roomDepthIn:150, face:5, offset:18, oc:24, maxIn:192, buffer:12,
    qty:{12:60,16:20},
    trusses:11, rows:30, cap:192, longest:192, nOpts:6,
    label:"stagger · A", firstRows:[[1,4,8],[6],[2,9],[7]],
    stats:{illegal:0,stacked:0,oneBay:0,twoBackOver:0,cluster:28,reachBoth:true,coverage:9},
    rowStock4:[192,192,192,192],
    shortage:{row:13,rowsLeft:17,len:16},
    takeoff:null, sha:'03249dbed87369fe' },

  { key:'short', why:"run fits one board — the jointless early return",
    roomWidthIn:140, roomDepthIn:96, face:5, offset:12, oc:24, maxIn:192, buffer:10,
    qty:{12:40},
    trusses:6, rows:20, cap:144, longest:144, nOpts:1,
    label:"jointless (full boards)", firstRows:[[],[],[],[]],
    stats:{illegal:0,stacked:0,oneBay:0,twoBackOver:0,reachBoth:true,coverage:0},
    rowStock4:[144,144,144,144], shortage:null,
    takeoff:{totalBoards:20,withBuffer:22,wastePct:2.8,leftover:2,shortEnds:0,rows:20,byLen:{"12":20}},
    sha:'0d9c605201bec3d8' },

  { key:'jointless', why:"short run, long stock — high waste, still legal",
    roomWidthIn:100, roomDepthIn:60, face:6, offset:12, oc:24, maxIn:192, buffer:10,
    qty:{16:20},
    trusses:4, rows:10, cap:192, longest:192, nOpts:1,
    label:"jointless (full boards)", firstRows:[[],[],[],[]],
    stats:{illegal:0,stacked:0,oneBay:0,twoBackOver:0,reachBoth:true,coverage:0},
    rowStock4:[192,192,192,192], shortage:null,
    takeoff:{totalBoards:10,withBuffer:11,wastePct:47.9,leftover:1,shortEnds:0,rows:10,byLen:{"16":10}},
    sha:'d5c5b0588555e5f5' }
];

// ===========================================================================
console.log("\nGOLDENS — the layout the user is shown");
// ===========================================================================
FIXTURES.forEach(function(f){
  var R=runCase(f), o=R.opts[0];
  ok(f.key+": "+f.trusses+" trusses / "+f.rows+" rows / cap "+f.cap,
     R.inp.trusses.length===f.trusses && R.inp.rows===f.rows && R.cap===f.cap,
     R.inp.trusses.length+"/"+R.inp.rows+"/"+R.cap);
  ok(f.key+": LONGEST_STOCK primed to "+f.longest, P.getLongestStock()===f.longest, P.getLongestStock());
  ok(f.key+": "+f.nOpts+" option(s)", R.opts.length===f.nOpts, R.opts.length);
  ok(f.key+": label "+JSON.stringify(f.label), o.label===f.label, JSON.stringify(o.label));
  ok(f.key+": first four rows unchanged", eq(o.rowJoints.slice(0,4), f.firstRows),
     JSON.stringify(o.rowJoints.slice(0,4)));
  ok(f.key+": stats unchanged", eq(o.stats, f.stats), JSON.stringify(o.stats));
  ok(f.key+": rowStock head unchanged", eq(R.asg.rowStock.slice(0,4), f.rowStock4),
     JSON.stringify(R.asg.rowStock.slice(0,4)));
  if(f.shortage){
    ok(f.key+": shortage at row "+f.shortage.row,
       R.asg.shortage && R.asg.shortage.row===f.shortage.row &&
       R.asg.shortage.rowsLeft===f.shortage.rowsLeft && R.asg.shortage.len===f.shortage.len,
       JSON.stringify(R.asg.shortage));
  } else {
    ok(f.key+": no shortage", R.asg.shortage===null, JSON.stringify(R.asg.shortage));
  }
  ok(f.key+": takeoff unchanged", eq(R.tk, f.takeoff), JSON.stringify(R.tk));
  ok(f.key+": full-structure digest "+f.sha, E.digest(R.opts)===f.sha, E.digest(R.opts));
});

// ===========================================================================
console.log("\nDETERMINISM");
// ===========================================================================
(function(){
  var a=runCase(FIXTURES[0]), b=runCase(FIXTURES[0]);
  ok("same inputs twice -> identical options", E.digest(a.opts)===E.digest(b.opts));
  ok("buildPanelLayout is a pure function of its seed", (function(){
    var inp=mkInp(FIXTURES[0]), cap=P.capForInputs(inp);
    var cands=P.candidateRows(inp.trusses, inp.runIn, cap, 2, 2);
    var x=P.buildPanelLayout(7919, inp.trusses, inp.runIn, cap, 8, cands);
    var y=P.buildPanelLayout(7919, inp.trusses, inp.runIn, cap, 8, cands);
    return eq(x,y);
  })());
  ok("different seeds give different layouts", (function(){
    var inp=mkInp(FIXTURES[0]), cap=P.capForInputs(inp);
    var cands=P.candidateRows(inp.trusses, inp.runIn, cap, 2, 2);
    return !eq(P.buildPanelLayout(7919, inp.trusses, inp.runIn, cap, 8, cands),
               P.buildPanelLayout(15838, inp.trusses, inp.runIn, cap, 8, cands));
  })());
  ok("trusses array is not mutated", (function(){
    var inp=mkInp(FIXTURES[0]), before=JSON.stringify(inp.trusses);
    P.generateOptions(inp.trusses, inp.runIn, P.capForInputs(inp), inp.rows);
    return JSON.stringify(inp.trusses)===before;
  })());
})();

// ===========================================================================
console.log("\nTHE HIDDEN GLOBAL — generateOptions is not pure");
// ===========================================================================
// index.html:1026 — generateOptions reads LONGEST_STOCK and OVERRIDES its own
// capIn parameter with it. The same call therefore returns different results
// depending on whether generate() ran first. Pinned so the dependency is
// documented by test rather than discovered by accident.
(function(){
  var inp=mkInp(FIXTURES[0]), cap=P.capForInputs(inp);   // runIn 262, cap 192
  P.setLongestStock(0);
  var unset=P.generateOptions(inp.trusses, inp.runIn, cap, inp.rows);
  // 96 changes minJointsForRun(262, boardIn) from 1 to 2, so the difference is
  // visible. Note 144 does NOT differ from 192 here — ceil(262/144) and
  // ceil(262/192) are both 2 — so the impurity only bites when LONGEST_STOCK
  // crosses a joint-count boundary. That is exactly why it went unnoticed.
  P.setLongestStock(96);
  var set96=P.generateOptions(inp.trusses, inp.runIn, cap, inp.rows);
  ok("KNOWN IMPURITY: same call, different LONGEST_STOCK -> different result",
     E.digest(unset)!==E.digest(set96), E.digest(unset)+" vs "+E.digest(set96));
  P.setLongestStock(144);
  ok("KNOWN IMPURITY: but only across a joint-count boundary (144 == 192 here)",
     E.digest(P.generateOptions(inp.trusses, inp.runIn, cap, inp.rows))===E.digest(unset));
  ok("KNOWN IMPURITY: with LONGEST_STOCK unset it falls back to capIn", unset.length>0);
})();

// ===========================================================================
console.log("\nDEGENERATE RETURNS");
// ===========================================================================
(function(){
  var R=runCase(FIXTURES[1]), o=R.opts[0];
  ok("jointless path returns exactly one option", R.opts.length===1);
  ok("jointless path labels itself", o.label==="jointless (full boards)");
  ok("jointless path uses unit [[]] and unitRows 1", eq(o.unit,[[]]) && o.unitRows===1);
  ok("jointless path stats OMIT cluster (6 keys, not 7)",
     Object.keys(o.stats).length===6 && !('cluster' in o.stats), Object.keys(o.stats).join(','));
})();
(function(){
  // "no legal joint rows" — reports illegal:0 while every row is un-buildable.
  // Only the label distinguishes it. This is the silent-corruption hazard.
  var trusses=P.buildTrusses(600, 0, 24);
  var opts=P.generateOptions(trusses, 600, 40, 6);   // cap far below any spacing
  var o=opts[0];
  ok("KNOWN HAZARD: impossible cap still returns an option, not an error", opts.length===1);
  ok("KNOWN HAZARD: it reports illegal:0 despite un-buildable rows", o.stats.illegal===0);
  ok("KNOWN HAZARD: only the label reveals it",
     /no legal joint rows/.test(o.label), JSON.stringify(o.label));
})();

// ===========================================================================
console.log("\nALIASING — rowJoints arrays are SHARED, reading only");
// ===========================================================================
// buildPanelLayout pushes the same array instance from the candidate pool at
// several row indices, and generateOptions sets unit = rowJoints. Reading is
// safe; any push/sort/splice by a consumer would corrupt other rows AND other
// options at once. Pinned so removing the sharing is a visible decision.
(function(){
  var R=runCase(FIXTURES[0]), o=R.opts[0];
  ok("option.unit IS option.rowJoints (same object)", o.unit===o.rowJoints);
  var ids=o.rowJoints.filter(function(r){ return r.length; });
  var distinct=new Set(ids).size;
  ok("row arrays are shared within an option (distinct < total)",
     distinct < ids.length, distinct+" distinct of "+ids.length);
  var shared=0;
  if(R.opts.length>1){
    o.rowJoints.forEach(function(r){ if(R.opts[1].rowJoints.indexOf(r)>=0) shared++; });
    ok("row arrays are shared ACROSS options too", shared>0, "shared="+shared);
  } else { ok("row arrays are shared ACROSS options too (n/a, single option)", true); }
})();

// ===========================================================================
console.log("\nAUDIT — independent of the builder");
// ===========================================================================
(function(){
  var inp=mkInp(FIXTURES[0]), cap=P.capForInputs(inp);
  // hand-written layout with a KNOWN violation: two adjacent rows share truss 4
  var bad=[[2,4],[4,7],[1,6]];
  var a=P.auditLayout(inp.trusses, inp.runIn, cap, bad);
  ok("auditLayout catches an adjacent shared truss in a hand-written layout",
     a.adjShare>0, JSON.stringify(a));
  var clean=[[1,4],[6,9],[2,7]];
  var b=P.auditLayout(inp.trusses, inp.runIn, clean.length?cap:cap, clean);
  ok("auditLayout passes a hand-written clean layout", b.adjShare===0, JSON.stringify(b));
  ok("auditLayout returns five counters, not a boolean",
     eq(Object.keys(a).sort(), ['adjOneBay','adjShare','cluster','illegal','twoBackOver']),
     Object.keys(a).join(','));
  ok("empty rows impose no constraint on their neighbours",
     P.auditLayout(inp.trusses, inp.runIn, cap, [[],[2,5],[]]).adjShare===0);
})();
FIXTURES.forEach(function(f){
  var R=runCase(f), o=R.opts[0];
  var a=P.auditLayout(R.inp.trusses, R.inp.runIn, R.cap, o.rowJoints);
  ok(f.key+": shipped option has no HARD violations",
     a.adjShare===0 && a.twoBackOver===0 && a.illegal===0, JSON.stringify(a));
});

// ===========================================================================
console.log("\nSTRUCTURE + RANKING");
// ===========================================================================
FIXTURES.forEach(function(f){
  var R=runCase(f), o=R.opts[0];
  ok(f.key+": rowJoints length === rows", o.rowJoints.length===R.inp.rows,
     o.rowJoints.length+" vs "+R.inp.rows);
  var interior = o.rowJoints.every(function(row){
    return row.every(function(j){ return j>=1 && j<=R.inp.trusses.length-2; }); });
  ok(f.key+": no joint ever lands on a wall truss", interior);
  var partitions = o.rowJoints.every(function(row){
    var segs=P.segLengths(R.inp.trusses, row, R.inp.runIn);
    return segs.length===row.length+1 &&
           near(segs.reduce(function(a,b){return a+b;},0), R.inp.runIn, 0.05); });
  ok(f.key+": segments partition the run exactly", partitions);
  var hard=R.opts.map(function(x){ return x.stats.illegal+x.stats.stacked+x.stats.twoBackOver; });
  var monotone=true; for(var i=1;i<hard.length;i++) if(hard[i-1]>hard[i]) monotone=false;
  ok(f.key+": options ranked by hard failures ascending", monotone, JSON.stringify(hard));
  var keys=R.opts.map(function(x){ return JSON.stringify(x.rowJoints); });
  ok(f.key+": options are distinct", new Set(keys).size===keys.length);
  ok(f.key+": at most six options", R.opts.length<=6, R.opts.length);
});

// ===========================================================================
console.log("\nSTOCK + TAKEOFF");
// ===========================================================================
ok("no stock at all -> shortage with NO row/len keys", (function(){
  var inp=mkInp({roomWidthIn:262,roomDepthIn:150,face:5,offset:18,oc:24,maxIn:192,buffer:12,qty:{}});
  var s=P.assignStock(inp, [[1,4],[6,9]]).shortage;
  return s && s.msg==="No stock lengths entered." && !('row' in s) && !('len' in s);
})());
ok("KNOWN QUIRK: rowStock is INCHES but shortage.len is FEET", (function(){
  var R=runCase(FIXTURES[0]);
  return R.asg.rowStock[0]===192 && R.asg.shortage.len===16;
})());
ok("on shortage, rowStock is partial (length === shortage.row)", (function(){
  var R=runCase(FIXTURES[0]);
  return R.asg.rowStock.length===R.asg.shortage.row;
})());
ok("every assigned board can actually build its row", (function(){
  var R=runCase(FIXTURES[1]);
  return R.asg.rowStock.every(function(L,r){
    return L >= P.maxSeg(P.segLengths(R.inp.trusses, R.opts[0].rowJoints[r], R.inp.runIn)) - 0.5; });
})());
FIXTURES.filter(function(f){ return f.takeoff; }).forEach(function(f){
  var R=runCase(f), t=R.tk;
  ok(f.key+": withBuffer >= totalBoards, leftover is the difference",
     t.withBuffer>=t.totalBoards && t.leftover===t.withBuffer-t.totalBoards);
  ok(f.key+": byLen sums to totalBoards",
     Object.keys(t.byLen).reduce(function(a,k){ return a+t.byLen[k]; },0)===t.totalBoards);
  ok(f.key+": wastePct is never negative", t.wastePct>=0, t.wastePct);
  ok(f.key+": byLen keys are FEET, rowStock is INCHES",
     Object.keys(t.byLen).every(function(k){ return Number(k)<50; }), Object.keys(t.byLen).join(','));
});

// ===========================================================================
console.log("\nplanOffcuts");
// ===========================================================================
(function(){
  var R=runCase(FIXTURES[0]);
  var plan=P.planOffcuts(R.inp, R.opts[0].rowJoints.slice(3,7), 192);
  ok("row letters are LOCAL to the array passed in (restart at A)",
     plan.plan.length===0 || plan.plan[0].piece.row==='A',
     plan.plan.length? plan.plan[0].piece.row : 'empty');
  ok("no offcut under 24\" is ever kept",
     plan.leftover.every(function(l){ return l.len>=24; }),
     JSON.stringify(plan.leftover.map(function(l){return l.len;})));
  ok("boardsPerUnit is a positive count", plan.boardsPerUnit>0, plan.boardsPerUnit);
})();

// ===========================================================================
console.log("\nADVERSARIAL");
// ===========================================================================
ok("buildTrusses includes a truss landing exactly on the run",
   P.buildTrusses(240,0,24).slice(-1)[0]===240);
ok("candidateRows returns [] when nothing is legal",
   eq(P.candidateRows(P.buildTrusses(240,0,24), 240, 10, 2, 2), []));
// need=0 still runs the legality check on the empty row, so it yields [[]] only
// when the whole run fits the cap, and [] when it does not.
ok("candidateRows need 0: [[]] when the run fits the cap",
   eq(P.candidateRows(P.buildTrusses(240,0,24), 240, 240, 0, 2), [[]]),
   JSON.stringify(P.candidateRows(P.buildTrusses(240,0,24), 240, 240, 0, 2)));
ok("candidateRows need 0: [] when the run exceeds the cap (empty row is illegal)",
   eq(P.candidateRows(P.buildTrusses(240,0,24), 240, 192, 0, 2), []));
ok("jointCount returns 0 when the run fits one board", P.jointCount(100,192)===0);
ok("segLengths on an empty row is the whole run",
   eq(P.segLengths(P.buildTrusses(240,0,24), [], 240), [240]));
ok("rowName rolls over past Z", P.rowName(26)==='AA' && P.rowName(25)==='Z');
ok("capForInputs falls back to maxIn when no stock has quantity", (function(){
  var inp=mkInp({roomWidthIn:262,roomDepthIn:150,face:5,offset:18,oc:24,maxIn:180,buffer:12,qty:{}});
  return P.capForInputs(inp)===180;
})());

// ===========================================================================
console.log("\nTAKEOFF IS OPTION-SENSITIVE — investigated, not assumed");
// ===========================================================================
/* REPORTED: cycling stagger options changes the label but never the takeoff.
   Investigated before touching anything, because the two obvious fixes point in
   opposite directions and both would have been wrong here.

   NOT a stale recompute: the cycle handler calls applyActiveOption(), which
   recomputes STATE.takeoff, and renderLayout() redraws the block. Verified in
   source and in the browser.

   NOT invariant by design either: computeTakeoff() simulates actually cutting
   THIS layout — rows grouped by assigned stock, cut longest-first with best-fit
   offcut reuse. It genuinely moves when the geometry makes it move, and the
   awkward-run case below proves it (41 boards/7.6% vs 40/5.3%).

   What is true is narrower and less alarming: for the app's DEFAULT inputs it is
   genuinely equal across all six options. Every option covers the same total
   length (29 rows x 261.75"), and with a single 12' stock length the offcut
   reuse absorbs the differing piece counts — option F cuts 84 pieces where the
   others cut 86, and all six still consume 59 boards.

   So the numbers are right and the user's observation is also right. What is
   left is presentational, and that is parked as an open question rather than
   guessed at. These assertions exist so nobody later "optimises" computeTakeoff
   into a lineal estimate and quietly makes it invariant for real. */
(function(){
  function mkInp(o){
    var gap = o.gap==null ? 0.25 : o.gap;
    var runIn = o.widthIn - 2*gap, depthIn = o.depthIn - 2*gap;
    var stock = [8,10,12,14,16].map(function(L){ return {lenIn:L*12, qty:(o.qty[L]||0), ft:L}; });
    return { runIn:runIn, depthIn:depthIn, face:o.face, offset:o.offset, oc:o.oc,
             maxIn:o.maxIn, buffer:o.buffer, rows:Math.max(1,Math.ceil(depthIn/o.face)),
             trusses:P.buildTrusses(runIn, o.offset, o.oc), gap:gap, stock:stock };
  }
  function takeoffs(inp){
    var cap = P.capForInputs(inp), longest = 0;
    inp.stock.forEach(function(s){ if(s.qty>0 && s.lenIn>longest) longest=Math.min(s.lenIn, inp.maxIn); });
    P.setLongestStock(longest || cap);
    var opts = P.generateOptions(inp.trusses, inp.runIn, cap, inp.rows), out = [];
    opts.forEach(function(o){
      inp.unitRows = o.unitRows || 1;
      var a = P.assignStock(inp, o.rowJoints);
      out.push(a.shortage ? null : P.computeTakeoff(inp, o.rowJoints, a.rowStock));
    });
    return { opts:opts, out:out };
  }

  // 1) It DOES move, on geometry that makes it move.
  var awkward = takeoffs(mkInp({widthIn:27*12+7, depthIn:11*12, face:6, offset:20, oc:24,
                                maxIn:192, buffer:12, qty:{8:60,12:60,16:60}}));
  var boards = awkward.out.filter(Boolean).map(function(t){ return t.totalBoards; });
  ok("takeoff varies across options when the cut does ("+boards.join(',')+")",
     new Set(boards).size > 1, boards.join(','));
  var wastes = awkward.out.filter(Boolean).map(function(t){ return t.wastePct; });
  ok("...and so does the waste ("+wastes.join(',')+")", new Set(wastes).size > 1);

  // 2) On the app's DEFAULT inputs it does not — and the options are still
  //    genuinely different layouts, which is what makes the report reasonable.
  var def = takeoffs(mkInp({widthIn:21*12+10.25, depthIn:12*12, face:5, offset:18, oc:24,
                            maxIn:192, buffer:12, qty:{12:60}}));
  var sigs = def.opts.map(function(o){ return JSON.stringify(o.rowJoints); });
  ok("default inputs still produce 6 DISTINCT layouts", new Set(sigs).size === def.opts.length,
     new Set(sigs).size+" of "+def.opts.length);
  var pieces = def.opts.map(function(o){
    return o.rowJoints.reduce(function(s,j){ return s+j.length+1; }, 0); });
  ok("...that even differ in total piece count ("+pieces.join(',')+")",
     new Set(pieces).size > 1);
  var defBoards = def.out.filter(Boolean).map(function(t){ return t.totalBoards; });
  ok("...yet all consume the same boards, which is the reported symptom",
     new Set(defBoards).size === 1, defBoards.join(','));

  // 3) It is a real simulation, not a lineal estimate wearing a costume.
  var t0 = def.out.filter(Boolean)[0];
  var covered = def.opts.length ? (mkInp({widthIn:21*12+10.25, depthIn:12*12, face:5, offset:18,
                                          oc:24, maxIn:192, buffer:12, qty:{12:60}}).runIn * t0.rows) : 0;
  var consumed = t0.totalBoards * 144;
  ok("waste% is derived from boards actually consumed vs area covered",
     Math.abs(t0.wastePct - Math.round(((consumed-covered)/consumed)*1000)/10) < 0.05,
     t0.wastePct+" vs "+(Math.round(((consumed-covered)/consumed)*1000)/10));
  ok("boards are counted per stock length, not as one lineal total",
     Object.keys(t0.byLen).length >= 1 && t0.byLen[12] === t0.totalBoards);
  ok("the buffer is applied on top, not baked in",
     t0.withBuffer === Math.ceil(t0.totalBoards*1.12) && t0.leftover === t0.withBuffer-t0.totalBoards);
})();

ok("engine source is the shipped app, not a stale copy",
   /slice:index\.html|module:/.test(P.__source), P.__source);

console.log("\n"+pass+" passed, "+fail+" failed\n");
process.exit(fail?1:0);
