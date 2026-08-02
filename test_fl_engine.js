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

/* The engine's own ranking comparator, reproduced so the suite can MEASURE tie
   exposure rather than assume it. It MUST track the engine: when the eye rule
   and the row-end floor were added as ranking keys, this copy went stale and the
   suite reported the candidates as out of order — the assertion caught its own
   duplication, which is the argument for keeping that assertion.

   Order: an unlayable end beats everything, then the seam rule, then the eye. */
function rank(a,b){ return (a.endHard-b.endHard)||(a.violations-b.violations)||
  (a.eye-b.eye)||(a.relaxed-b.relaxed)||
  (b.period-a.period)||(a.waste-b.waste)||(b.unique-a.unique)||(a.endSoft-b.endSoft); }
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
/* RE-GOLDENED 2026-07-31 — the eye rule and row-end minimums.
   Every `starts` and `sha` below moved, on purpose. The previous layouts
   contained the offence: the kitchen's steps ran 20, 17.5, 18, 19.5, 20, 22
   across rows 6-11 — six courses of near-identical step, the staircase Edwin
   photographed — and row 14 ended on a 1" cut. Both are now rule violations, so
   the layouts had to change; a green suite against the old goldens would have
   been a suite defending the defect.
   `eye` / `endHard` / `endSoft` are the new pins. eye is SEVERITY-weighted: each
   run of 3+ similar-magnitude steps contributes (length - 2), so a marginal
   three-course wobble scores 1 and a fourteen-course staircase scores 12; endHard counts rows ending under 2"; endSoft under 6". */
var FIXTURES = [
  { key:'kitchen', why:"the audit's sample room — demo and test share one source of truth",
    roomRunIn:156, roomAcrossIn:132, gap:0.25, plankLen:60, plankWid:9,
    minOff:16, minReuse:20, minRip:2, perBox:8, rotate:4,
    nRows:15, edgeRip:7.25, cands:16, ties:0,
    starts:[60,32.5,16.5,55,35.5,12.5,52.5,33,8.5,49.5,27,7,51,28.5,11],
    metrics:{seed:250,guard:true,violations:0,relaxed:0,waste:297,unique:15,period:15},
    eye:0, endHard:0, endSoft:2,
    box:{planks:52,boxes:7,perBox:8}, sha:'4feb4d8193f9986c', suggest:15, locked:false },

  // The other two demo rooms. Added as goldens BEFORE they appeared in the UI,
  // so a room card's numbers and its test come from one source rather than being
  // typed twice. All three use the app's OWN defaults (60"x9", gap 1/4) — a
  // fixture on parameters the app never sets proves nothing about what the user
  // is shown.
  { key:'greatroom', why:"demo room 2 — 20'x16', the big open floor",
    roomRunIn:240, roomAcrossIn:192, gap:0.25, plankLen:60, plankWid:9,
    minOff:16, minReuse:20, minRip:2, perBox:8, rotate:4,
    nRows:22, edgeRip:5.75, cands:16, ties:0,
    starts:[60,32,16,53.5,37.5,19,59.5,35.5,16.5,54.5,38,18.5,57,41,17.5,59.5,42,19.5,60,41,18.5,57],
    metrics:{seed:1234,guard:true,violations:0,relaxed:0,waste:492.5,unique:17,period:22},
    eye:0, endHard:0, endSoft:3,
    box:{planks:104,boxes:13,perBox:8}, sha:'a2a234d87999ff3f', suggest:15, locked:false },

  { key:'hallway', why:"demo room 3 — 24'x4', 6:1, the fit-to-screen proof case",
    roomRunIn:288, roomAcrossIn:48, gap:0.25, plankLen:60, plankWid:9,
    minOff:16, minReuse:20, minRip:2, perBox:8, rotate:4,
    nRows:6, edgeRip:5.75, cands:16, ties:1,
    starts:[60,26,44,6.5,24.5,41],
    metrics:{seed:250,guard:true,violations:0,relaxed:0,waste:102,unique:6,period:6},
    eye:0, endHard:0, endSoft:1,
    box:{planks:34,boxes:5,perBox:8}, sha:'309ec2a3ee61e15a', suggest:15, locked:false },

  { key:'lock', why:"the geometry lock — legal on every rule and still a staircase",
    roomRunIn:240, roomAcrossIn:132, gap:0, plankLen:48, plankWid:9,
    minOff:16, minReuse:20, minRip:2, perBox:8, rotate:4,
    nRows:15, edgeRip:7.5, cands:10, ties:1,
    starts:[48,32,16,48,32,16,48,32,16,48,32,16,48,32,16],
    metrics:{seed:3,guard:true,violations:0,relaxed:0,waste:240,unique:3,period:3},
    eye:12, endHard:0, endSoft:0,
    box:{planks:85,boxes:11,perBox:8}, sha:'9ca43fdd41c55107', suggest:15, locked:true },

  { key:'tight', why:"over-constrained — exercises the relax loop and the minimise-the-violation fallback",
    roomRunIn:300, roomAcrossIn:216, gap:0, plankLen:36, plankWid:9,
    minOff:24, minReuse:20, minRip:2, perBox:8, rotate:4,
    nRows:24, edgeRip:9, cands:7, ties:0,
    starts:[36,18,27,6,17,29,6,17,30,6,18,30,6,18,30,6,18,30,6,18,30,6,18,30],
    metrics:{seed:3,guard:false,violations:45,relaxed:23,waste:444,unique:7,period:24},
    eye:14, endHard:0, endSoft:0,
    box:{planks:223,boxes:28,perBox:8}, sha:'be935977b8192f25', suggest:11, locked:false },

  { key:'tworow', why:"two-row room — the nRows===2 width branch",
    roomRunIn:156, roomAcrossIn:18, gap:0.25, plankLen:60, plankWid:9,
    minOff:16, minReuse:20, minRip:2, perBox:8, rotate:4,
    nRows:2, edgeRip:8.75, cands:13, ties:0,
    starts:[60,33],
    metrics:{seed:3,guard:true,violations:0,relaxed:0,waste:38,unique:2,period:2},
    eye:0, endHard:0, endSoft:1,
    box:{planks:7,boxes:1,perBox:8}, sha:'ddb8b9279bc23a79', suggest:15, locked:false },

  { key:'narrow', why:"room narrower than one plank — the nRows<2 clamp",
    roomRunIn:120, roomAcrossIn:7, gap:0, plankLen:48, plankWid:9,
    minOff:12, minReuse:20, minRip:2, perBox:8, rotate:4,
    nRows:2, edgeRip:3.5, cands:7, ties:0,
    starts:[48,24],
    metrics:{seed:1234,guard:false,violations:0,relaxed:0,waste:24,unique:2,period:2},
    eye:0, endHard:0, endSoft:0,
    box:{planks:6,boxes:1,perBox:8}, sha:'e88d6bc6dffa4334', suggest:11, locked:false }
];


// Look fixtures up BY KEY, never by index. This suite used to index the array
// directly for the kitchen and the lock, so inserting a fixture above them
// silently repointed nine assertions at a different room — a green suite testing
// the wrong thing. Adding the demo rooms is exactly the edit that would have
// done it, which is why the lookup changed in the same commit.
function fx(key){
  var f = FIXTURES.filter(function(x){ return x.key === key; })[0];
  if (!f){ console.log("FAIL  no fixture named '"+key+"'"); process.exit(1); }
  return f;
}

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
  ok(f.key+": "+f.eye+" eye offence(s) — runs of 3+ similar steps",
     best.eye===f.eye, "got "+best.eye);
  ok(f.key+": no row ends under 2\"", best.endHard===0 && f.endHard===0, "got "+best.endHard);
  ok(f.key+": "+f.endSoft+" row(s) end under the preferred 6\"",
     best.endSoft===f.endSoft, "got "+best.endSoft);
  ok(f.key+": isLocked "+f.locked, FL.isLocked(best,cfg)===f.locked);
  ok(f.key+": suggestOffset "+JSON.stringify(f.suggest), eq(FL.suggestOffset(cfg), f.suggest),
     JSON.stringify(FL.suggestOffset(cfg)));
  // backstop: catches anything the readable projection above does not cover
  ok(f.key+": full-structure digest "+f.sha, E.digest(cands)===f.sha, E.digest(cands));
});


/* ---------------------------------------------------------------------------
   L FIXTURES — banded fields, pinned the same way the rectangles are.

   These went in BEFORE any screen could route an L here, so the engine's answer
   and the test's expectation come from one place. They are keyed like the rest;
   never index this array.

   `runs` is the per-row run length. It is the whole point: the sequence carries
   straight through the corner — row 6 of `lclean` starts at 17.5", not back at a
   full plank — which is what "one continuous field, no restart" means in
   numbers rather than prose.
   --------------------------------------------------------------------------- */
var L_BASE = { plankLen:60, plankWid:9, minOff:16, minReuse:20, minRip:2,
               gap:0.25, perBox:8, rotate:4 };
var L_FIXTURES = [
  // Bands are MEASURED ROOM dimensions. bandedCfg subtracts the expansion gap
  // from each band's run and from the field depth, exactly as readInputs() does
  // for a rectangle — an L laid hard against its walls while a rectangle of the
  // same room was not would be a quiet, expensive difference.
  { key:'lclean', why:"notch lands on a course line — nothing to scribe",
    bands:[{depthIn:45,runIn:240,runStartIn:0},{depthIn:45,runIn:120,runStartIn:0}],
    nRows:10, scribeCount:0, layable:true, scribe:null,
    runs:[239.5,239.5,239.5,239.5,239.5,119.5,119.5,119.5,119.5,119.5],
    widths:[8.75,9,9,9,9,9,9,9,9,8.75],
    cands:16, ties:0,
    starts:[60,32,16,53.5,37.5,19,59.5,35.5,16.5,54.5],
    metrics:{seed:1234,guard:true,violations:0,relaxed:0,waste:271,unique:10,period:10},
    eye:0, endHard:0, endSoft:1,
    box:{planks:38,boxes:5,perBox:8}, sha:'9ffeb8f2465986b6' },

  { key:'lscribe', why:"notch falls mid-course — the board runs through and is scribed",
    bands:[{depthIn:30,runIn:240,runStartIn:0},{depthIn:54,runIn:120,runStartIn:0}],
    nRows:10, scribeCount:1, layable:true,
    runs:[239.5,239.5,239.5,239.5,119.5,119.5,119.5,119.5,119.5,119.5],
    widths:[5.75,9,9,9,9,9,9,9,9,5.75],
    scribe:{ row:4, keepFrom:119.75, keepTo:239.75, depth:6 },
    cands:16, ties:0,
    starts:[60,32,16,53.5,37.5,19,59.5,35.5,16.5,54.5],
    metrics:{seed:1234,guard:true,violations:0,relaxed:0,waste:271,unique:10,period:10},
    eye:0, endHard:0, endSoft:1,
    box:{planks:36,boxes:5,perBox:8}, sha:'be110f117abb37d1' }
];
function lfx(key){
  var f = L_FIXTURES.filter(function(x){ return x.key === key; })[0];
  if (!f){ console.log("FAIL  no L fixture named '"+key+"'"); process.exit(1); }
  return f;
}

// ===========================================================================
console.log("\nL GOLDENS — the banded field");
// ===========================================================================
L_FIXTURES.forEach(function(f){
  var cfg = FL.bandedCfg(f.bands, L_BASE);
  var cands = FL.generateCandidates(cfg);
  var best = cands[0];
  var box = FL.boxPlan(best.rows, cfg);

  ok(f.key+": "+f.nRows+" rows ("+f.why+")", cfg.nRows===f.nRows, "got "+cfg.nRows);
  ok(f.key+": row widths unchanged", eq(cfg.widths, f.widths), JSON.stringify(cfg.widths));
  ok(f.key+": per-row runs unchanged",
     eq(cfg.rowRuns.map(function(r){ return r.runIn; }), f.runs),
     JSON.stringify(cfg.rowRuns.map(function(r){ return r.runIn; })));
  ok(f.key+": "+f.scribeCount+" scribed course(s)", cfg.plan.scribeCount===f.scribeCount,
     "got "+cfg.plan.scribeCount);
  // Courses are never split, so a corner cannot produce a rip below the floor.
  ok(f.key+": layable by construction — no course is split",
     cfg.plan.layable===true && cfg.plan.slivers===0);
  if (f.scribe){
    var sc = cfg.plan.rows[f.scribe.row-1].scribe;
    ok(f.key+": row "+f.scribe.row+" is the scribed course", !!sc);
    ok(f.key+": ...whole to "+f.scribe.keepFrom+'", scribed out to '+f.scribe.keepTo+'"',
       sc && near(sc.keepFrom,f.scribe.keepFrom) && near(sc.keepTo,f.scribe.keepTo),
       sc ? sc.keepFrom+"->"+sc.keepTo : 'none');
    ok(f.key+": ...the scribed piece is "+f.scribe.depth+'" deep',
       sc && near(sc.depth, f.scribe.depth), sc ? String(sc.depth) : 'none');
  } else {
    ok(f.key+": no course meets the corner mid-width, so nothing is scribed",
       cfg.plan.scribeCount===0);
  }

  ok(f.key+": "+f.cands+" candidates after dedup", cands.length===f.cands, "got "+cands.length);
  ok(f.key+": tie exposure still "+f.ties, tieCount(cands)===f.ties);
  ok(f.key+": start sequence unchanged", eq(starts(best.rows), f.starts),
     JSON.stringify(starts(best.rows)));
  ok(f.key+": metrics unchanged",
     best.violations===f.metrics.violations && best.relaxed===f.metrics.relaxed &&
     near(best.waste,f.metrics.waste) && best.unique===f.metrics.unique &&
     best.period===f.metrics.period,
     JSON.stringify({v:best.violations,r:best.relaxed,w:best.waste,u:best.unique,p:best.period}));
  ok(f.key+": boxPlan "+f.box.planks+" planks", eq(box,f.box), JSON.stringify(box));
  ok(f.key+": "+f.eye+" eye offence(s) across the corner", best.eye===f.eye, "got "+best.eye);
  ok(f.key+": no row ends under 2\"", best.endHard===0, "got "+best.endHard);
  ok(f.key+": "+f.endSoft+" row(s) end under the preferred 6\"",
     best.endSoft===f.endSoft, "got "+best.endSoft);
  ok(f.key+": full-structure digest "+f.sha, E.digest(cands)===f.sha, E.digest(cands));

  // The continuity requirement, in numbers: the first row of the SECOND band
  // must not restart at a full plank. That restart is exactly what the rejected
  // per-band adapter did, and exactly what broke the seam rule.
  var k = -1;
  for (var i=1;i<f.runs.length;i++) if (f.runs[i] !== f.runs[i-1]){ k = i; break; }
  ok(f.key+": the leg does NOT restart at a full plank (row "+(k+1)+" starts "+best.rows[k].start+'")',
     Math.abs(best.rows[k].start - L_BASE.plankLen) > 0.001);
});

// ===========================================================================
console.log("\nDETERMINISM — the property the goldens rest on");
// ===========================================================================
var dcfg = mkCfg(fx('kitchen'));
ok("same cfg twice in-process -> identical",
   E.digest(FL.generateCandidates(dcfg))===E.digest(FL.generateCandidates(dcfg)));

// deep-freeze: if a future optimisation starts mutating cfg in place, this
// throws (strict mode) or silently diverges — either way the suite says so.
(function(){
  var frozen = mkCfg(fx('kitchen'));
  Object.freeze(frozen.widths); Object.freeze(frozen);
  var out;
  try { out = FL.generateCandidates(frozen); }
  catch(e){ ok("frozen cfg accepted (engine does not mutate its input)", false, e.message); return; }
  ok("frozen cfg accepted (engine does not mutate its input)", true);
  ok("frozen cfg gives the same result", E.digest(out)===fx('kitchen').sha, E.digest(out));
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
  var cfg=mkCfg(fx('kitchen')), rows=FL.generateCandidates(cfg)[0].rows;
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
  var cfg=mkCfg(fx('kitchen')), rows=FL.generateCandidates(cfg)[0].rows;
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
  var cfg=mkCfg(fx('lock'));
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
console.log("\nKNOWN DEFECTS — pinned as CURRENT behaviour, not endorsed  (1 of 2 now FIXED)");
// ===========================================================================
// See docs/STAGGER-V3-AUDIT-2026-07-26.md. These assertions describe what the
// engine does today. When the defect is fixed, THESE TESTS SHOULD FAIL — flip
// them to assert the corrected behaviour at that point. That is the intent, and
// it has now happened once: the plank-under-MIN_FRESH crash below is FIXED and
// its assertions have been flipped. The rip-bump defect is still pinned.
/* FIXED 2026-08-02 — FLIPPED, as the header above always said it would be.

   Was: "plank shorter than MIN_FRESH throws TypeError instead of erroring
   cleanly." `legalStarts` searches row starts from MIN_FRESH up to P, so P < 6
   left that range EMPTY — no legal start anywhere — and pickFresh's
   over-constrained fallback did `(best || bestAny).s` on two nulls. The UI
   guard missed it because it asked a different question: `plankLen <= minOff`
   is about whether a stagger is expressible, and 4 with an offset of 3 passes
   that happily. Two limits, one of them checked, and the gap was reachable from
   Setup — a white screen for somebody standing in a room.

   Now: `unlayable(cfg)` states both limits in one place, generateCandidates
   refuses before it lays anything, and generate() asks it rather than keeping a
   second opinion. These assertions describe the correction. */
(function(){
  var tiny = mkCfg({roomRunIn:156,roomAcrossIn:132,gap:0.25,plankLen:4,plankWid:3,
                    minOff:3,minReuse:20,minRip:2,perBox:8,rotate:4});

  // The old guard's shape is kept as evidence of WHY a second rule was needed:
  // this config really does sail past the offset test. It is the reason the
  // check moved rather than gaining a clause in place.
  ok("the offset rule alone still would not catch plankLen 4 / minOff 3",
     !(tiny.plankLen <= tiny.minOff));

  var threw=null;
  try { FL.generateCandidates(tiny); } catch(e){ threw=e; }
  ok("a plank under MIN_FRESH is refused, not crashed on",
     threw && threw.constructor.name === 'Error', threw ? threw.constructor.name : "did not throw");
  ok("...and it is no longer a TypeError from a null dereference",
     threw && threw.constructor.name !== 'TypeError');
  /* The message must carry MIN_FRESH's ACTUAL value, read from the engine —
     not a 6 written into this file. Same rule as the deck verdict and the band
     count: a sentence that states a number has to stay true when the number
     moves, and a test that hardcodes it cannot tell the difference. */
  var MF = FL.getMinFresh();
  ok("...and the message names the limit it hit",
     threw && new RegExp("plank under " + MF).test(threw.message),
     threw ? threw.message.slice(0,60) : "");
  ok("...with MIN_FRESH interpolated, so the copy tracks the constant",
     MF === 6 ? threw.message.indexOf("6") > 0 : threw.message.indexOf(String(MF)) > 0,
     "MIN_FRESH=" + MF);

  // The two limits are separate, and each keeps its own reason.
  var offsetBound = mkCfg({roomRunIn:156,roomAcrossIn:132,gap:0.25,plankLen:3,plankWid:3,
                           minOff:4,minReuse:20,minRip:2,perBox:8,rotate:4});
  var t2=null; try { FL.generateCandidates(offsetBound); } catch(e){ t2=e; }
  ok("a plank shorter than the offset still reports the offset rule",
     t2 && /minimum joint offset/.test(t2.message), t2 ? t2.message.slice(0,50) : "did not throw");

  // The boundary is exactly MIN_FRESH: 6 lays, 5.5 does not. A fix that moved
  // the boundary would be refusing floors that lay today.
  function atLen(P){
    var c = mkCfg({roomRunIn:156,roomAcrossIn:132,gap:0.25,plankLen:P,plankWid:9,
                   minOff:1,minReuse:20,minRip:2,perBox:8,rotate:4});
    try { FL.generateCandidates(c); return true; } catch(e){ return false; }
  }
  ok("a 6″ plank still lays — the boundary did not move inward", atLen(6));
  ok("...and 5.5″ does not", !atLen(5.5));

  // Nothing that lays today may start refusing. The room fixtures are the real
  // proof (every golden above still passes), this is the explicit statement.
  ok("a normal room is untouched by the new check", atLen(60));
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
  var cfg=mkCfg(fx('kitchen')); cfg.perBox=0;
  var b=FL.boxPlan(FL.generateCandidates(cfg)[0].rows, cfg);
  return b.perBox===1 && b.boxes===b.planks;
})());
ok("suggestOffset returns null when there is no room below the floor", (function(){
  var cfg=mkCfg(fx('kitchen')); cfg.minOff=8; cfg.plankWid=9;
  return FL.suggestOffset(cfg)===null;
})());
ok("engine source is the shipped app, not a stale copy", /slice:index\.html|module:/.test(FL.__source), FL.__source);

console.log("\n"+pass+" passed, "+fail+" failed\n");
process.exit(fail?1:0);
