// ============================================================================
//  test_fl_engine.js — CHARACTERISATION harness for the FL flooring engine.
//
//  This engine is what the app is named for, and until now it had ZERO test
//  assertions. v3 moves it. This suite pins what it does TODAY so that any
//  later refactor has to answer one question: did the layout the user sees
//  change? A green run means no. A red run means yes — and the diff says how.
//
//  It is a CHARACTERISATION suite, not a specification. Where the engine has a
//  defect, the defect is PINNED and labelled KNOWN DEFECT, not corrected. The
//  point is a faithful record of current behaviour before the code moves.
//
//  The engine is deterministic: no Math.random, no clock. Randomness comes from
//  a seeded LCG (buildLayout) fed from the fixed SEEDS list, so identical
//  inputs give byte-identical output in any process. That is what makes the
//  golden pins below possible — verified across separate node processes.
//
//  Run:  node test_fl_engine.js
// ============================================================================

var E = require('./engine_source.js');
var FL = E.load('fl');

var pass=0, fail=0;
function ok(name, cond, extra){ if(cond){pass++; console.log("  ok  "+name);} else {fail++; console.log("FAIL  "+name+(extra?"  "+extra:""));} }
function near(a,b,t){ return Math.abs(a-b)<=(t==null?0.01:t); }
function eq(a,b){ return JSON.stringify(a)===JSON.stringify(b); }

// ---------------------------------------------------------------------------
//  cfg construction — replicates readInputs()'s row/rip maths WITHOUT the DOM.
//  index.html:2190-2204. Kept here rather than sliced because readInputs() is
//  the first DOM-bound function in the module; this is the only duplicated
//  logic in the suite and it is pinned by the derivation tests below.
// ---------------------------------------------------------------------------
function mkCfg(o){
  var gap=o.gap, runIn=o.roomRunIn-2*gap, acrossIn=o.roomAcrossIn-2*gap;
  var P=o.plankLen, W=o.plankWid, minRip=o.minRip;
  var nRows=Math.ceil(acrossIn/W), edge=(acrossIn-(nRows-2)*W)/2;
  if(nRows>=3 && edge<minRip){ nRows+=1; edge=(acrossIn-(nRows-2)*W)/2; }
  if(nRows<2){ nRows=2; edge=acrossIn/2; }
  var widths=[]; if(nRows===2){widths=[acrossIn/2,acrossIn/2];}
  else{ widths.push(edge); for(var k=0;k<nRows-2;k++) widths.push(W); widths.push(edge); }
  return {runIn:runIn,acrossIn:acrossIn,plankLen:P,plankWid:W,minOff:o.minOff,
          minReuse:o.minReuse,minRip:minRip,gap:gap,perBox:o.perBox,rotate:o.rotate,
          nRows:nRows,widths:widths,edgeRip:edge};
}
function starts(rows){ return rows.map(function(r){ return r.start; }); }

// the engine's own ranking comparator (index.html:2125-2131), reproduced so the
// suite can MEASURE tie exposure rather than assume it
function rank(a,b){ return (a.violations-b.violations)||(a.relaxed-b.relaxed)||
  (b.period-a.period)||(a.waste-b.waste)||(b.unique-a.unique); }
function tieCount(cands){
  var t=0;
  for(var x=0;x<cands.length;x++) for(var y=x+1;y<cands.length;y++) if(rank(cands[x],cands[y])===0) t++;
  return t;
}

// ---------------------------------------------------------------------------
//  FIXTURES — golden pins captured from the shipped engine.
//
//  `ties` is the number of candidate pairs the ranking comparator cannot
//  separate. Where ties exist the winner is decided by insertion (seed) order,
//  so pinning the ORDER would be brittle: those fixtures pin invariants only.
//  The suite re-measures ties at run time and refuses to order-pin if any
//  appear, so it cannot silently become brittle later.
// ---------------------------------------------------------------------------
var FIXTURES = [
  { key:'kitchen', why:"the audit's sample room — demo and test share one source of truth",
    roomRunIn:156, roomAcrossIn:132, gap:0.25, plankLen:60, plankWid:9,
    minOff:16, minReuse:20, minRip:2, perBox:8, rotate:4,
    nRows:15, edgeRip:7.25, cands:16, ties:0,
    starts:[60,32.5,16,53,35.5,14,54,36.5,18.5,59,39,17,56.5,34.5,14.5],
    metrics:{seed:88,guard:true,violations:0,relaxed:0,waste:296.5,unique:15,period:15},
    box:{planks:50,boxes:7,perBox:8}, sha:'f2b63670853b129c', suggest:15, locked:false },

  { key:'lock', why:"the geometry lock — legal on every rule and still a staircase",
    roomRunIn:240, roomAcrossIn:132, gap:0, plankLen:48, plankWid:9,
    minOff:16, minReuse:20, minRip:2, perBox:8, rotate:4,
    nRows:15, edgeRip:7.5, cands:10, ties:1,
    starts:[48,32,16,48,32,16,48,32,16,48,32,16,48,32,16],
    metrics:{seed:3,guard:true,violations:0,relaxed:0,waste:240,unique:3,period:3},
    box:{planks:85,boxes:11,perBox:8}, sha:'78406620e685e7c3', suggest:15, locked:true },

  { key:'tight', why:"over-constrained — exercises the relax loop and the minimise-the-violation fallback",
    roomRunIn:300, roomAcrossIn:216, gap:0, plankLen:36, plankWid:9,
    minOff:24, minReuse:20, minRip:2, perBox:8, rotate:4,
    nRows:24, edgeRip:9, cands:8, ties:0,
    starts:[36,18,9,31.5,20.5,8.5,32.5,20.5,8.5,32.5,20.5,8.5,32.5,20.5,8.5,32.5,20.5,8.5,32.5,20.5,8.5,32.5,20.5,8.5],
    metrics:{seed:1234,guard:false,violations:45,relaxed:23,waste:371.5,unique:7,period:24},
    box:{planks:224,boxes:28,perBox:8}, sha:'d84298c10f21c085', suggest:11, locked:false },

  { key:'tworow', why:"two-row room — the nRows===2 width branch",
    roomRunIn:156, roomAcrossIn:18, gap:0.25, plankLen:60, plankWid:9,
    minOff:16, minReuse:20, minRip:2, perBox:8, rotate:4,
    nRows:2, edgeRip:8.75, cands:12, ties:0,
    starts:[60,35],
    metrics:{seed:17,guard:true,violations:0,relaxed:0,waste:36,unique:2,period:2},
    box:{planks:7,boxes:1,perBox:8}, sha:'9aad031a8e0d3469', suggest:15, locked:false },

  { key:'narrow', why:"room narrower than one plank — the nRows<2 clamp",
    roomRunIn:120, roomAcrossIn:7, gap:0, plankLen:48, plankWid:9,
    minOff:12, minReuse:20, minRip:2, perBox:8, rotate:4,
    nRows:2, edgeRip:3.5, cands:7, ties:0,
    starts:[48,23.5],
    metrics:{seed:1234,guard:false,violations:0,relaxed:0,waste:24.5,unique:2,period:2},
    box:{planks:7,boxes:1,perBox:8}, sha:'05b4ddd2427ed19d', suggest:11, locked:false }
];

// ===========================================================================
console.log("\nGOLDENS — the layout the user is shown");
// ===========================================================================
FIXTURES.forEach(function(f){
  var cfg = mkCfg(f);
  var cands = FL.generateCandidates(cfg);
  var best = cands[0];
  var box = FL.boxPlan(best.rows, cfg);
  var measuredTies = tieCount(cands);

  ok(f.key+": nRows "+f.nRows+" / edgeRip "+f.edgeRip,
     cfg.nRows===f.nRows && near(cfg.edgeRip,f.edgeRip), "got "+cfg.nRows+" / "+cfg.edgeRip);
  ok(f.key+": "+f.cands+" candidates after dedup", cands.length===f.cands, "got "+cands.length);
  ok(f.key+": tie exposure still "+f.ties, measuredTies===f.ties, "got "+measuredTies);

  // Order-pinning is only sound where the comparator separates every pair.
  if (measuredTies===0){
    ok(f.key+": start sequence unchanged", eq(starts(best.rows), f.starts),
       JSON.stringify(starts(best.rows)));
    ok(f.key+": winning seed/guard "+f.metrics.seed+"/"+f.metrics.guard,
       best.seed===f.metrics.seed && best.guard===f.metrics.guard,
       best.seed+"/"+best.guard);
  } else {
    // Ties -> the winner depends on insertion order. Pin the SET, not the order.
    ok(f.key+": start sequence present among candidates (tie-exposed, set-pinned)",
       cands.some(function(c){ return eq(starts(c.rows), f.starts); }),
       JSON.stringify(starts(best.rows)));
  }

  ok(f.key+": metrics unchanged",
     best.violations===f.metrics.violations && best.relaxed===f.metrics.relaxed &&
     near(best.waste,f.metrics.waste) && best.unique===f.metrics.unique &&
     best.period===f.metrics.period,
     JSON.stringify({v:best.violations,r:best.relaxed,w:best.waste,u:best.unique,p:best.period}));
  ok(f.key+": boxPlan "+f.box.planks+" planks / "+f.box.boxes+" boxes", eq(box,f.box), JSON.stringify(box));
  ok(f.key+": isLocked "+f.locked, FL.isLocked(best,cfg)===f.locked);
  ok(f.key+": suggestOffset "+JSON.stringify(f.suggest), eq(FL.suggestOffset(cfg), f.suggest),
     JSON.stringify(FL.suggestOffset(cfg)));
  // backstop: catches anything the readable projection above does not cover
  ok(f.key+": full-structure digest "+f.sha, E.digest(cands)===f.sha, E.digest(cands));
});

// ===========================================================================
console.log("\nDETERMINISM — the property the goldens rest on");
// ===========================================================================
var dcfg = mkCfg(FIXTURES[0]);
ok("same cfg twice in-process -> identical",
   E.digest(FL.generateCandidates(dcfg))===E.digest(FL.generateCandidates(dcfg)));

// deep-freeze: if a future optimisation starts mutating cfg in place, this
// throws (strict mode) or silently diverges — either way the suite says so.
(function(){
  var frozen = mkCfg(FIXTURES[0]);
  Object.freeze(frozen.widths); Object.freeze(frozen);
  var out;
  try { out = FL.generateCandidates(frozen); }
  catch(e){ ok("frozen cfg accepted (engine does not mutate its input)", false, e.message); return; }
  ok("frozen cfg accepted (engine does not mutate its input)", true);
  ok("frozen cfg gives the same result", E.digest(out)===FIXTURES[0].sha, E.digest(out));
})();

// ===========================================================================
console.log("\nHARD RULES — audited independently of the builder");
// ===========================================================================
FIXTURES.forEach(function(f){
  var cfg=mkCfg(f), best=FL.generateCandidates(cfg)[0];
  ok(f.key+": audit() agrees with the pinned violation count",
     FL.audit(best.rows,cfg)===f.metrics.violations, "audit="+FL.audit(best.rows,cfg));
});
(function(){
  var cfg=mkCfg(FIXTURES[0]), rows=FL.generateCandidates(cfg)[0].rows;
  var adjBad=0, backBad=0;
  for(var i=1;i<rows.length;i++){
    if(FL.clearance(rows[i].start, rows[i-1].joints, cfg.runIn, cfg.plankLen) < cfg.minOff-0.001) adjBad++;
    if(i>=2 && FL.clearance(rows[i].start, rows[i-2].joints, cfg.runIn, cfg.plankLen) < cfg.minOff-0.001) backBad++;
  }
  ok("kitchen: every row clears the row above by >= minOff", adjBad===0, "bad="+adjBad);
  ok("kitchen: every row clears the row TWO above by >= minOff", backBad===0, "bad="+backBad);
})();
ok("clearance() treats a null neighbour as unconstrained (row 2 path)",
   FL.clearance(30, null, 155.5, 60)===Infinity);
ok("clearance() treats an empty neighbour as unconstrained",
   FL.clearance(30, [], 155.5, 60)===Infinity);

// ===========================================================================
console.log("\nCONSTRUCTION RULES — enforced by build, not by audit");
// ===========================================================================
(function(){
  var cfg=mkCfg(FIXTURES[0]), rows=FL.generateCandidates(cfg)[0].rows;
  ok("row 1 is always a full plank, never relaxed",
     rows[0].start===cfg.plankLen && rows[0].relaxed===false &&
     rows[0].src==="full planks, cut the last one to fit", JSON.stringify(rows[0].src));
  var freshBad = rows.filter(function(r){
    return r.src.indexOf("offcut")<0 && (r.start<6 || r.start>cfg.plankLen); });
  ok("every FRESH start sits in [MIN_FRESH=6, plankLen]", freshBad.length===0,
     JSON.stringify(freshBad.map(function(r){return r.start;})));
  // skip-a-row reuse only, and never row 3
  var reuse = rows.filter(function(r){ return r.src.indexOf("offcut")>=0; });
  var badRef = reuse.filter(function(r){
    var m=/row (\d+)'s offcut/.exec(r.src); return !m || (r.n - Number(m[1]))!==2; });
  ok("offcut reuse is skip-a-row only (row n uses row n-2)", badRef.length===0,
     JSON.stringify(reuse.map(function(r){return r.n+":"+r.src;})));
  ok("row 3 never reuses row 1's offcut",
     !rows.some(function(r){ return r.n===3 && r.src.indexOf("offcut")>=0; }));
  var tooShort = reuse.filter(function(r){
    var src=rows[r.n-3]; return src && src.offcut < cfg.minReuse; });
  ok("offcuts below minReuse are never reused", tooShort.length===0);
})();

// the four src literals are load-bearing: wasteOf and boxPlan PARSE them
(function(){
  var seen={};
  FIXTURES.forEach(function(f){
    var cfg=mkCfg(f);
    FL.generateCandidates(cfg)[0].rows.forEach(function(r){ seen[r.src]=1; });
  });
  var known={
    "full planks, cut the last one to fit":1,
    "fresh plank cut to length":1,
    "fresh plank cut to length — clearance relaxed":1
  };
  var unknown=Object.keys(seen).filter(function(s){
    return !known[s] && !/^start with row \d+'s offcut$/.test(s); });
  ok("row.src only ever takes the four known literals", unknown.length===0, JSON.stringify(unknown));
})();

// ===========================================================================
console.log("\nTHE GEOMETRY LOCK — the engine's most important claim");
// ===========================================================================
(function(){
  var cfg=mkCfg(FIXTURES[1]);
  var best=FL.generateCandidates(cfg)[0];
  ok("48\" plank + 16\" offset: every rule passes", best.violations===0 && best.relaxed===0);
  ok("48\" plank + 16\" offset: but the pattern repeats every 3 rows", best.period===3, "period="+best.period);
  ok("48\" plank + 16\" offset: starts cycle 48,32,16",
     eq(starts(best.rows).slice(0,6), [48,32,16,48,32,16]), JSON.stringify(starts(best.rows).slice(0,6)));
  ok("isLocked() catches it — legal is not the same as good", FL.isLocked(best,cfg)===true);
  ok("suggestOffset() offers a way out", typeof FL.suggestOffset(cfg)==='number');
})();

// ===========================================================================
console.log("\nRANKING + DEDUP");
// ===========================================================================
FIXTURES.forEach(function(f){
  var cands=FL.generateCandidates(mkCfg(f));
  var monotone=true;
  for(var i=1;i<cands.length;i++) if(rank(cands[i-1],cands[i])>0) monotone=false;
  ok(f.key+": candidates are in ranking order", monotone);
  var keys=cands.map(function(c){ return starts(c.rows).map(function(s){return Math.round(s*2);}).join(","); });
  ok(f.key+": no two candidates share a start sequence (Reshuffle always changes something)",
     new Set(keys).size===keys.length, keys.length+" -> "+new Set(keys).size);
});

// ===========================================================================
console.log("\nDERIVATION — the row/rip maths readInputs() performs");
// ===========================================================================
FIXTURES.forEach(function(f){
  var cfg=mkCfg(f);
  var sum=cfg.widths.reduce(function(a,b){ return a+b; },0);
  ok(f.key+": widths sum to acrossIn", near(sum,cfg.acrossIn,0.001), sum+" vs "+cfg.acrossIn);
  ok(f.key+": widths length === nRows", cfg.widths.length===cfg.nRows);
  ok(f.key+": first and last row are both edgeRip",
     near(cfg.widths[0],cfg.edgeRip) && near(cfg.widths[cfg.widths.length-1],cfg.edgeRip));
});

// ===========================================================================
console.log("\nKNOWN DEFECTS — pinned as CURRENT behaviour, not endorsed");
// ===========================================================================
// See docs/STAGGER-V3-AUDIT-2026-07-26.md. These assertions describe what the
// engine does today. When the defect is fixed, THESE TESTS SHOULD FAIL — flip
// them to assert the corrected behaviour at that point. That is the intent.
(function(){
  // legalStarts() searches s from MIN_FRESH(6) upward, so a plank under 6"
  // yields no candidates; the over-constrained fallback then dereferences null.
  // The UI guard at index.html:2216 only rejects plankLen <= minOff, so
  // plankLen 4 with minOff 3 sails past it and throws on row 2.
  var tiny = mkCfg({roomRunIn:156,roomAcrossIn:132,gap:0.25,plankLen:4,plankWid:3,
                    minOff:3,minReuse:20,minRip:2,perBox:8,rotate:4});
  ok("KNOWN DEFECT: UI guard (plankLen <= minOff) does NOT catch plankLen 4 / minOff 3",
     !(tiny.plankLen <= tiny.minOff));
  var threw=null;
  try { FL.generateCandidates(tiny); } catch(e){ threw=e; }
  ok("KNOWN DEFECT: plank shorter than MIN_FRESH throws TypeError instead of erroring cleanly",
     threw && threw.constructor.name==='TypeError', threw?threw.message:"did not throw");
})();
(function(){
  // The rip bump adds ONE row and re-computes edge, with no re-check. If one
  // row is not enough, the returned cfg still breaks the warranty floor the
  // engine just tried to enforce — and the UI then flags a config it produced.
  var cfg = mkCfg({roomRunIn:100,roomAcrossIn:100,gap:0.25,plankLen:60,plankWid:9,
                   minOff:16,minReuse:20,minRip:8,perBox:8,rotate:4});
  ok("KNOWN DEFECT: rip bump is applied once with no re-check — edgeRip can stay below minRip",
     cfg.edgeRip < cfg.minRip, "edgeRip="+cfg.edgeRip+" minRip="+cfg.minRip);
})();

// ===========================================================================
console.log("\nADVERSARIAL");
// ===========================================================================
ok("joints() returns [] when the first piece already spans the room",
   eq(FL.joints(200, 155.5, 60), []));
ok("rowPieces() on a start longer than the room yields one oversize piece",
   eq(FL.rowPieces(200, 155.5, 60), [200]));
ok("boxPlan clamps a zero perBox to 1, never divides by zero", (function(){
  var cfg=mkCfg(FIXTURES[0]); cfg.perBox=0;
  var b=FL.boxPlan(FL.generateCandidates(cfg)[0].rows, cfg);
  return b.perBox===1 && b.boxes===b.planks;
})());
ok("suggestOffset returns null when there is no room below the floor", (function(){
  var cfg=mkCfg(FIXTURES[0]); cfg.minOff=8; cfg.plankWid=9;
  return FL.suggestOffset(cfg)===null;
})());
ok("engine source is the shipped app, not a stale copy", /slice:index\.html|module:/.test(FL.__source), FL.__source);

console.log("\n"+pass+" passed, "+fail+" failed\n");
process.exit(fail?1:0);
