// ============================================================================
//  test_eye.js — no pattern the eye can follow, and no chip at the wall.
//
//  TWO TRADE RULES, SOLVED TOGETHER because they are not independent: forcing a
//  row's end length moves that row's joints, which changes its step, which is
//  exactly what the eye rule judges. Fixed one after the other, the second undoes
//  the first. So the end rule filters what is LEGAL and the eye rule chooses
//  among what survives.
//
//  THE EYE RULE. A run of three or more consecutive steps of similar magnitude
//  is a pattern. Magnitude only — direction is ignored, because an equal-step
//  zigzag (left, right, left by similar amounts) tracks as easily as a diagonal.
//  Three already fails; Edwin's ceiling is "usually two or three".
//
//  WHY THE ENGINE DREW IT. It maximised clearance on every row, and the largest
//  achievable clearance is nearly the same number every time — so the steps
//  clustered. The kitchen's shipped layout stepped 20, 17.5, 18, 19.5, 20, 22
//  across rows 6-11: six courses of near-identical step. That is the staircase
//  Edwin photographed, and it was in the goldens.
//
//  ROW ENDS. The last cut is never under 2", and 6"+ is preferred. MIN_FRESH
//  already forbade STARTING a row under 6" — the same instinct at the other end
//  of the row, which had no counterpart until now.
//
//  Run:  node test_eye.js     (or ./run_tests.sh)
// ============================================================================

var E  = require('./engine_source.js');
var FL = E.load('fl');

var pass=0, fail=0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok  "+name); }
  else { fail++; console.log("FAIL  "+name+(extra!=null?"  "+extra:"")); }
}
function near(a,b,t){ return Math.abs(a-b)<=(t==null?0.01:t); }

var BASE = { plankLen:60, plankWid:9, minOff:16, minReuse:20, minRip:2,
             gap:0.25, perBox:8, rotate:4 };
function mkCfg(o){
  var gap=o.gap, runIn=o.roomRunIn-2*gap, acrossIn=o.roomAcrossIn-2*gap;
  var P=o.plankLen, W=o.plankWid, minRip=o.minRip;
  var nRows=Math.ceil(acrossIn/W), edge=(acrossIn-(nRows-2)*W)/2;
  if(nRows>=3 && edge<minRip){ nRows+=1; edge=(acrossIn-(nRows-2)*W)/2; }
  if(nRows<2){ nRows=2; edge=acrossIn/2; }
  var widths=[]; if(nRows===2){ widths=[acrossIn/2,acrossIn/2]; }
  else { widths.push(edge); for(var k=0;k<nRows-2;k++) widths.push(W); widths.push(edge); }
  return {runIn:runIn,acrossIn:acrossIn,plankLen:P,plankWid:W,minOff:o.minOff,
          minReuse:o.minReuse,minRip:minRip,gap:gap,perBox:o.perBox,rotate:o.rotate,
          nRows:nRows,widths:widths,edgeRip:edge};
}
function room(len, across, o){
  o = o || {};
  return mkCfg({ roomRunIn:len, roomAcrossIn:across, gap:o.gap==null?BASE.gap:o.gap,
                 plankLen:o.plankLen||BASE.plankLen, plankWid:BASE.plankWid,
                 minOff:o.minOff||BASE.minOff, minReuse:BASE.minReuse,
                 minRip:BASE.minRip, perBox:BASE.perBox, rotate:BASE.rotate });
}

// ===========================================================================
console.log("\nTHE MEASURE — a step is a magnitude, not a direction");
// ===========================================================================
(function(){
  var P = 60;
  ok("a step is the phase difference between two row starts",
     near(FL.phaseStep(10, 26, P), 16));
  // Wrapping matters: joints repeat every plank, so 50 -> 10 is a 20" step, not 40".
  ok("...wrapped to the nearest joint, so 50->10 is 20\" not 40\"",
     near(Math.abs(FL.phaseStep(50, 10, P)), 20), String(FL.phaseStep(50,10,P)));
  ok("...and it is signed", FL.phaseStep(26,10,P) < 0 && FL.phaseStep(10,26,P) > 0);

  /* THE ZIGZAG. This is the case a same-direction check would miss entirely, and
     it is why the rule is on magnitude alone. Left 18, right 18, left 18 draws a
     herringbone the eye follows just as readily as a staircase. */
  var zig = [{start:0},{start:18},{start:0},{start:18}].map(function(r,i){ return r; });
  var mags = FL.stepMags(zig, P);
  ok("an equal-step ZIGZAG has constant magnitude", mags.every(function(m){ return near(m,18); }),
     JSON.stringify(mags));
  ok("...so the rule catches it, though every step reverses direction",
     FL.longestSimilarRun(mags, FL.eyeTol(P)) >= FL.getEyeRun());
})();

// ===========================================================================
console.log("\nTHE TOLERANCE — proportional to the plank, and pinned");
// ===========================================================================
(function(){
  /* What counts as "the same step to the eye" scales with the joint spacing, and
     the joint spacing IS the plank length. 5% of the plank, floored so a very
     short plank does not make the rule absurdly strict. Chosen by measurement:
     at this tolerance several existing kitchen candidates already passed, so the
     rule is achievable, while the photographed staircase (spread 4.5" over six
     steps) is caught. */
  ok("tolerance is 3\" at a 60\" plank", near(FL.eyeTol(60), 3));
  ok("...2.4\" at 48\"", near(FL.eyeTol(48), 2.4));
  ok("...and floored at 1.5\" for short planks", near(FL.eyeTol(24), 1.5));
  ok("three similar steps is already a failure", FL.getEyeRun() === 3);

  // The photographed staircase, as data.
  var staircase = [60,32.5,16,53,35.5,14,54,36.5,18.5,59,39,17,56.5,34.5,14.5]
                    .map(function(v){ return {start:v}; });
  var m = FL.stepMags(staircase, 60);
  ok("the layout Edwin photographed IS caught by this rule",
     FL.eyeOffences(staircase, 60) > 0,
     "longest run "+FL.longestSimilarRun(m, FL.eyeTol(60)));
  ok("...its worst run is six courses long",
     FL.longestSimilarRun(m, FL.eyeTol(60)) >= 6,
     String(FL.longestSimilarRun(m, FL.eyeTol(60))));
})();

// ===========================================================================
console.log("\nROW ENDS — 2\" is a rule, 6\" is a preference");
// ===========================================================================
(function(){
  ok("the hard floor is 2\"", FL.getEndMin() === 2);
  ok("the preference is 6\"", FL.getEndPref() === 6);

  // The rule reaches ROW 1, whose start used to be hardcoded to a full plank —
  // so a run that made the first course end on a chip had no way to fix itself.
  var bad = room(122, 60);          // 121.5" run, 60" plank -> tail would be 1.5"
  ok("row 1 would have ended on a 1.5\" chip at a full-plank start",
     FL.tailLen(60, bad.runIn, 60) < 2, FL.tailLen(60,bad.runIn,60).toFixed(2));
  var b = FL.generateCandidates(bad)[0];
  ok("...so row 1 no longer starts at a full plank there",
     Math.abs(b.rows[0].start - 60) > 0.001, String(b.rows[0].start));
  ok("...and its last cut clears the floor",
     FL.rowEnd(b.rows[0]) >= FL.getEndMin() - 0.001, FL.rowEnd(b.rows[0]).toFixed(2));

  // legalStarts must not offer a start that ends short.
  var cfg = room(156, 132);
  var starts = FL.legalStarts(FL.absJoints(60, cfg.runIn, 60, 0), null,
                              cfg.minOff, cfg.runIn, 60, false, 0);
  ok("legalStarts never offers a start whose row ends under 2\"",
     starts.every(function(c){ return FL.tailLen(c.s, cfg.runIn, 60) >= 2 - 0.001; }),
     starts.length+" candidates");
  ok("...and it reports each candidate's end length", starts.every(function(c){ return c.end != null; }));
})();

// ===========================================================================
console.log("\nEVERY FIXTURE ROOM OBEYS BOTH RULES");
// ===========================================================================
var ROOMS = [
  { key:'kitchen',   cfg:room(156,132),                 eye:0 },
  { key:'greatroom', cfg:room(240,192),                 eye:0 },
  { key:'hallway',   cfg:room(288,48),                  eye:0 },
  { key:'tworow',    cfg:room(156,18),                  eye:0 },
  { key:'narrow',    cfg:room(120,7,{gap:0,plankLen:48,minOff:12}), eye:0 },
  // The two documented over-constrained rooms. They CANNOT avoid stepping — the
  // lock has exactly one legal answer at 48"/16" — so the rule is not that they
  // pass, but that they lay the least-patterned option available instead of
  // dead-ending. That is asserted below, against every candidate.
  { key:'lock',      cfg:room(240,132,{gap:0,plankLen:48}), eye:null },
  { key:'tight',     cfg:room(300,216,{gap:0,plankLen:36,minOff:24}), eye:null }
];
ROOMS.forEach(function(r){
  var cands = FL.generateCandidates(r.cfg), best = cands[0], P = r.cfg.plankLen;
  ok(r.key+": no row ends under 2\"", best.endHard === 0, "got "+best.endHard);
  if (r.eye === 0){
    ok(r.key+": no run of 3+ similar steps", best.eye === 0,
       "longest run "+FL.longestSimilarRun(FL.stepMags(best.rows,P), FL.eyeTol(P)));
  } else {
    /* Compare within the RANKING TIER, not across the whole set. A candidate
       with a lower eye score but seam violations is not a better floor — joints
       too close together is a structural defect, a visible step is an ugly one,
       and the engine will not trade the first for the second. The lock has
       candidates at eye 8 that carry six seam violations; taking one would be
       the wrong call, and an assertion that demanded it would be wrong too. */
    var peers = cands.filter(function(c){
      return c.endHard === best.endHard && c.violations === best.violations; });
    var bestPeer = Math.min.apply(null, peers.map(function(c){ return c.eye; }));
    ok(r.key+": over-constrained — lays the least patterned SEAM-LEGAL option",
       best.eye === bestPeer, best.eye+" vs best peer "+bestPeer);
    ok(r.key+": ...rather than dead-ending", cands.length > 0 && best.rows.length === r.cfg.nRows);
    ok(r.key+": ...and it does not buy prettiness with seam violations",
       cands.filter(function(c){ return c.eye < best.eye; })
            .every(function(c){ return c.violations > best.violations; }));
  }
});

// ===========================================================================
console.log("\nTHE TWO RULES INTERACT — solved together, not in sequence");
// ===========================================================================
(function(){
  /* The interaction is the whole reason these shipped in one change. Every start
     the generator may pick is already filtered by the END rule; the EYE rule
     then chooses among the survivors. If the eye rule had picked first, the end
     filter would have moved its choice and undone it. Assert the ordering in the
     source, and the outcome in the layouts. */
  var html = require('fs').readFileSync(require('path').join(__dirname,'index.html'),'utf8');
  var i = html.indexOf('function legalStarts(');
  var body = html.slice(i, html.indexOf('function bestFutureClearance(', i) > i
                          ? html.indexOf('function pickFresh(', i) : html.length);
  ok("the END rule is applied inside legalStarts — it decides legality",
     /tailLen\(s, runIn, P\)[\s\S]{0,80}END_MIN/.test(body));

  var j = html.indexOf('function pickFresh(');
  var pf = html.slice(j, html.indexOf('// ---------- one full layout ----------', j));
  ok("the EYE rule is applied in pickFresh — it chooses among the legal",
     /lastSteps[\s\S]{0,400}eyeTol\(P\)/.test(pf));
  ok("...and it falls back rather than dead-ending when nothing is left",
     /if \(open\.length\) cands = open;/.test(pf));

  // Both rules must survive the offcut-reuse branch, which bypasses pickFresh.
  var k = html.indexOf('function buildLayout(seed, cfg, guard){');
  var bl = html.slice(k, html.indexOf('function audit(', k));
  ok("the offcut-reuse branch checks the end rule too", /reuseEnd[\s\S]{0,60}END_MIN/.test(bl));
  ok("...and the eye rule too", /reuseOK[\s\S]{0,200}eyeTol\(P\)/.test(bl));

  // Outcome: a room where the end filter genuinely bites still has no pattern.
  var cfg = room(122, 132);
  var b = FL.generateCandidates(cfg)[0];
  ok("a room whose ends bind still has no eye offence", b.eye === 0, String(b.eye));
  ok("...and no short end", b.endHard === 0, String(b.endHard));
})();

// ===========================================================================
console.log("\nBOTH RULES ACROSS 256 L GEOMETRIES — the corner obeys the same eye");
// ===========================================================================
(function(){
  function bands(d0,r0,d1,r1){
    return [{depthIn:d0,runIn:r0,runStartIn:0},{depthIn:d1,runIn:r1,runStartIn:0}];
  }
  var MAIN=[156,204,240,287.5], LEG=[71.5,108,143.25,180],
      D0=[40,53.5,76.25,100],   D1=[44,61.5,88.75,112];
  var n=0, eye=0, endHard=0, seam=0, worstRun=0, corner=0;
  MAIN.forEach(function(m){ LEG.forEach(function(l){ D0.forEach(function(d0){ D1.forEach(function(d1){
    n++;
    var cfg = FL.bandedCfg(bands(d0,m,d1,l), BASE);
    var best = FL.generateCandidates(cfg)[0], P = BASE.plankLen;
    if (best.eye > 0) eye++;
    if (best.endHard > 0) endHard++;
    if (FL.audit(best.rows, cfg) > 0) seam++;
    var run = FL.longestSimilarRun(FL.stepMags(best.rows,P), FL.eyeTol(P));
    if (run > worstRun) worstRun = run;
    if (cfg.rowRuns) corner++;
  });});});});
  ok("swept "+n+" L geometries", n === 256);
  ok("...every one of them crossing a corner", corner === n, corner+" of "+n);
  ok("no seam violations", seam === 0, String(seam));
  ok("NO eye offence anywhere across the corner", eye === 0, String(eye));
  ok("no row ends under 2\" in any of them", endHard === 0, String(endHard));
  ok("worst similar-step run is "+worstRun+", below the failing "+FL.getEyeRun(),
     worstRun < FL.getEyeRun(), String(worstRun));
})();

// ===========================================================================
console.log("\nRANKING PREFERS THE LEAST-PATTERNED LAYABLE FLOOR");
// ===========================================================================
(function(){
  var cfg = room(156,132);
  var cands = FL.generateCandidates(cfg);
  ok("an unlayable end outranks everything else",
     cands.every(function(c,i){ return i===0 || cands[i-1].endHard <= c.endHard; }));
  ok("...then the seam rule",
     cands.every(function(c,i){ return i===0 || cands[i-1].endHard < c.endHard
                                || cands[i-1].violations <= c.violations; }));
  ok("...then the eye",
     cands.every(function(c,i){ return i===0 || cands[i-1].endHard < c.endHard
                                || cands[i-1].violations < c.violations
                                || cands[i-1].eye <= c.eye; }));
  // The soft preference must not buy a materially worse floor — it ranks last.
  var html = require('fs').readFileSync(require('path').join(__dirname,'index.html'),'utf8');
  var i = html.indexOf('all.sort(function(a,b){');
  var sort = html.slice(i, html.indexOf('});', i));
  ok("endSoft is the LAST tiebreak, below waste",
     sort.indexOf('endSoft') > sort.indexOf('a.waste'));
})();

// run_tests.sh greps for a line matching ^N passed, M failed — keep this format.
console.log("\nengine source: fl=" + FL.__source);
console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
