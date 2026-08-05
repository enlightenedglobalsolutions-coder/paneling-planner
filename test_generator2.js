// ============================================================================
//  test_generator2.js — the paneling generator, round 2.
//
//  THE JOB THIS COMES FROM. A real pine ceiling, Aug 4 2026: run 261.75″
//  (21′-9¾″), trusses 24″ o.c. first at 18″, 12′ stock, 29 rows, joints must
//  land on trusses. The generator produced a layout that CYCLED. Edwin caught
//  it on the ceiling — not on a screen — and rescued the remaining rows by
//  hand. Both sequences are pinned below.
//
//  WHY TWO FIXTURES AND NOT ONE. A rule that only rejects the bad layout can be
//  satisfied by a generator that refuses everything; a rule that only accepts
//  the good one can be satisfied by a generator that accepts everything. Every
//  checker here is driven against BOTH, and a rule that cannot separate them is
//  reported as not doing any work. That two-sided calibration has already earned
//  its keep — see THE STEP-48 FINDING below, where it disproved a reading of the
//  spec that would have rejected the hand rescue.
//
//  WHAT IS EXPECTED TO FAIL, AND WHY THAT IS THE POINT. The last section drives
//  the SHIPPED generator on the real config and asserts it satisfies all five
//  rules. It does not yet — that is the rebuild. Until then this suite is RED on
//  purpose and run_tests.sh exits non-zero, which means no deploy. That is
//  deliberate: a red gate is the honest state of a generator known to produce a
//  cycling ceiling.
//
//  Run:  node test_generator2.js     (or ./run_tests.sh)
// ============================================================================

var E = require('./engine_source.js');
var P = E.load('panel');

var pass=0, fail=0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok  "+name); }
  else { fail++; console.log("FAIL  "+name+(extra!=null?"  "+extra:"")); }
}

// ---------------------------------------------------------------------------
//  CONFIG — the real job. Every number here is from the spec, not invented.
// ---------------------------------------------------------------------------
var RUN_IN   = 261.75;    // 21′-9¾″
var OC       = 24;        // truss spacing
var OFFSET   = 18;        // first truss
var STOCK    = 144;       // 12′
var ROWS     = 29;
P.setLongestStock(STOCK);
var TRUSSES  = P.buildTrusses(RUN_IN, OFFSET, OC);

/* The spec numbers trusses t1..t9 = 42″..234″. That is the SAME index the
   engine uses for interior joints (1..nT-2), which is what makes the fixtures
   transcribable at all — assert it rather than trusting the coincidence. */
ok("the spec's t1..t9 are the engine's interior truss indices",
   TRUSSES[1]===42 && TRUSSES[9]===234 && TRUSSES.length===11,
   "t1="+TRUSSES[1]+" t9="+TRUSSES[9]+" nT="+TRUSSES.length);

// A{1,3,8} B{5} ... -> [[1,3,8],[5],...]
function parseRows(s){
  return s.trim().split(/\s+(?=[A-Z]+\{)/).map(function(tok){
    var m = tok.match(/^([A-Z]+)\{([^}]*)\}$/);
    if(!m) throw new Error("bad fixture token: "+tok);
    return m[2].length ? m[2].split(',').map(Number) : [];
  });
}
var NAMES = "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z AA AB AC".split(" ");
function show(rows, from){ return rows.map(function(j,i){ return NAMES[(from||0)+i]+"{"+j.join(",")+"}"; }).join(" "); }

// ---------------------------------------------------------------------------
//  THE TWO FIXTURES
// ---------------------------------------------------------------------------
// The app's actual output. Rows A–H were already installed on the ceiling; the
// generator's proposal runs from I. Pinned as the spec transcribes it.
var MUST_FAIL = parseRows(
  "A{1,3,8} B{5} C{2,7} D{4,9} E{1,6} F{3,8} G{5} H{2,7,9} I{5} J{1,3,8} " +
  "K{5} L{2,7,9} M{5} N{1,3,8} O{5} P{2,7} Q{4,9} R{1,6} S{3,8} T{5} U{2,7,9}");

// The hand rescue, rows I–AC, laid against three installed courses.
var INSTALLED = parseRows("F{3,8} G{5} H{2,7,9}");
var MUST_PASS = parseRows(
  "I{4,6} J{1,3,8} K{5,9} L{4,7} M{2,8} N{3,6} O{5} P{1,7} Q{4,9} R{2,6} " +
  "S{3,8} T{1,5} U{2,7} V{4,8} W{3,6} X{5,9} Y{1,7} Z{4,6} AA{2,8} AB{5,7} AC{3,9}");

// ===========================================================================
console.log("\nTHE CYCLING LAYOUT IS GONE  (was: it is real app output)");
// ===========================================================================
/* FLIPPED WHEN THE REBUILD LANDED, and the history matters — read it before
   deciding this assertion is trivial.

   Before the rebuild this section asserted the opposite: that the shipped
   generator, run on this exact config, REPRODUCED the spec's rows I–U byte for
   byte, in 2 of the 6 options a user is shown, laid against the same installed
   G{5} H{2,7,9}. That was the load-bearing evidence for the whole piece of work.
   A fixture somebody typed to be bad proves nothing about a generator; one the
   generator actually emitted proves the defect is reachable and names the code
   path to change. It was verified, at rank #3 and #5 of 6.

   That evidence has served its purpose and cannot be re-run — the engine that
   produced it no longer exists. What survives is the fixture itself, which is
   still pinned, still parsed, and still driven through the checkers in the
   CALIBRATION section below. What this section now asserts is the other side of
   the same fact: the rebuilt generator does not produce that layout, or anything
   that repeats the way it did. */
(function(){
  var opts = P.generateOptions(TRUSSES, RUN_IN, STOCK, ROWS);
  ok("the generator still offers six options", opts.length===6, opts.length+" options");

  var matches = [];
  opts.forEach(function(o, i){
    if (show(o.rowJoints.slice(8,21), 8) === show(MUST_FAIL.slice(8,21), 8)) matches.push(i+1);
  });
  ok("no option reproduces the cycling rows I–U any more",
     matches.length === 0, matches.length ? "still produced by option(s) "+matches.join(",") : "");

  // The specific shape of the old failure, asserted directly rather than only
  // via the fixture: no option may run the forced two-piece row on alternating
  // rows, which is what "every 2nd row was identical" actually looked like.
  opts.forEach(function(o, i){
    var alt = 0;
    for (var r=2; r<o.rowJoints.length; r++){
      if (o.rowJoints[r].length===1 && o.rowJoints[r-2].length===1
          && o.rowJoints[r].join(",")===o.rowJoints[r-2].join(",")) alt++;
    }
    ok("option "+(i+1)+" never repeats the forced row on alternating courses", alt===0, alt+" alternating repeats");
  });
})();

// ===========================================================================
console.log("\nCALIBRATION — the checkers must SEPARATE the two fixtures");
// ===========================================================================
(function(){
  var bad  = P.checkFiveRules(TRUSSES, RUN_IN, STOCK, MUST_FAIL, [], OC);
  var good = P.checkFiveRules(TRUSSES, RUN_IN, STOCK, MUST_PASS, INSTALLED, OC);

  ok("the must-fail fixture is REJECTED", !P.passesFiveRules(bad));
  ok("the must-pass fixture is ACCEPTED", P.passesFiveRules(good),
     JSON.stringify({r2:good.r2.length, r3:good.r3.length, r4:good.r4.length,
                     forced:good.forced+"/"+good.forcedCap, illegalMid:good.illegalMid}));

  // --- rule 1: vocabulary -------------------------------------------------
  ok("R1 legal middles are every o.c. multiple from 2 bays to stock",
     P.midVocabulary(OC, STOCK).join(",") === "48,72,96,120,144");
  ok("R1 the app used only two of the five",
     bad.vocabUsed.join(",") === "48,120", bad.vocabUsed.join(","));
  ok("R1 the hand rescue used all five",
     good.vocabUsed.join(",") === "48,72,96,120,144", good.vocabUsed.join(","));
  ok("R1 neither fixture used an ILLEGAL middle — the pool was never the problem",
     bad.illegalMid.length===0 && good.illegalMid.length===0);

  // --- rule 2: truss exclusion -------------------------------------------
  ok("R2 the app reuses a truss within two rows, four times",
     bad.r2.length===4, bad.r2.length+" violations");
  ok("R2 ...and every one of them is t5, the forced row repeating",
     bad.r2.every(function(v){ return v.trusses.join(",")==="5"; }));
  ok("R2 the hand rescue never does", good.r2.length===0, good.r2.length+" violations");
  /* The soft half is soft BECAUSE of this number. Three-row separation is
     preferred, not required — the rescue breaches it seven times, so a hard
     3-row rule would reject the layout that must pass. */
  ok("R2 'prefer 3+' must stay a preference — the rescue breaches it",
     good.r2soft > 0, good.r2soft+" three-row breaches in the layout that must pass");

  // --- rule 3: staircase --------------------------------------------------
  ok("R3 neither fixture marches one truss per row", bad.r3.length===0 && good.r3.length===0);

  // --- rule 4: signature spacing -----------------------------------------
  ok("R4 the app repeats a row makeup within five rows, repeatedly",
     bad.r4.length >= 10, bad.r4.length+" repeats");
  ok("R4 the hand rescue never repeats one", good.r4.length===0, good.r4.length+" repeats");
  ok("R4 the echo check must stay SOFT — the rescue has echoes of its own",
     good.r4echo > 0, good.r4echo+" fixed-rhythm echoes in the layout that must pass");

  // --- rule 5: forced rows ------------------------------------------------
  ok("R5 exactly one two-piece row is possible on this run",
     P.forcedRows(TRUSSES, RUN_IN, STOCK).join(",") === "5");
  ok("R5 ...and it is 138″ + 123.75″, as the spec computes it",
     P.segLengths(TRUSSES, [5], RUN_IN).join(" + ") === "138 + 123.75");
  ok("R5 the app leans on it far past the cap",
     bad.forced > bad.forcedCap, bad.forced+" forced rows, cap "+bad.forcedCap);
  ok("R5 the hand rescue stays inside it",
     good.forced <= good.forcedCap, good.forced+" forced rows, cap "+good.forcedCap);
  ok("R5 the cap is ~1 per 8 rows", P.forcedRowCap(29)===4 && P.forcedRowCap(21)===3);

  // Every rule must earn its place: one that fires the same on both fixtures
  // is not separating anything, and should be questioned rather than kept for
  // symmetry. R3 is the honest exception — see the next section.
  var separates = [
    ["R1", bad.vocabUsed.length !== good.vocabUsed.length],
    ["R2", (bad.r2.length>0) !== (good.r2.length>0)],
    ["R4", (bad.r4.length>0) !== (good.r4.length>0)],
    ["R5", (bad.forced>bad.forcedCap) !== (good.forced>good.forcedCap)]
  ];
  separates.forEach(function(s){
    ok("rule "+s[0]+" separates the two fixtures", s[1]);
  });
})();

// ===========================================================================
console.log("\nTHE STEP-48 FINDING — the fixture decides the reading of rule 3");
// ===========================================================================
/* Rule 3 reads: "reject any row completing p, p±24″, p±48″ across 3
   consecutive rows (either direction)."

   That admits two readings. As a 24″-per-row march it is one arithmetic run and
   the hand rescue is clean. Read as ALSO banning a 48″-per-row march (p, p±48,
   p±96) it rejects the hand rescue seven times — J→K→L is t3→t5→t7.

   The fixture that must pass settles it: step-24 only. Both directions are
   pinned here so the stricter reading cannot come back in as a "tightening"
   without this failing and saying why. */
(function(){
  var all = INSTALLED.concat(MUST_PASS), base = INSTALLED.length;
  function marches(step){
    var n=0;
    for(var i=Math.max(2,base);i<all.length;i++){
      all[i-2].forEach(function(p){
        [step,-step].forEach(function(d){
          if(all[i-1].indexOf(p+d)>=0 && all[i].indexOf(p+2*d)>=0) n++;
        });
      });
    }
    return n;
  }
  ok("the hand rescue has no 24″-per-row march", marches(1)===0);
  ok("...but it DOES have 48″-per-row marches", marches(2) > 0, marches(2)+" of them");
  ok("...so rule 3 is step-24 only, or the fixture that must pass cannot",
     marches(2) > 0 && P.rule3Violations(MUST_PASS, INSTALLED).length === 0);
  ok("the shipped checker implements the step-24 reading",
     P.completesStaircase([7],[5],[3]) === false && P.completesStaircase([5],[4],[3]) === true);
})();

// ===========================================================================
console.log("\nTHE INTERLEAVED CYCLE layoutPeriod() CANNOT SEE");
// ===========================================================================
/* Why the shipped ranking scored a cycling ceiling as varied. layoutPeriod asks
   for a whole-sequence period — s[k] === s[k-p] for EVERY k. The real failure
   was every SECOND row being the identical {5} while the odd rows cycled a
   six-row pool. No single p describes that. */
(function(){
  var per = P.layoutPeriod(MUST_FAIL);
  ok("layoutPeriod reports the cycling layout as effectively non-repeating",
     per > MUST_FAIL.length/2, "period "+per+" over "+MUST_FAIL.length+" rows");
  ok("...while rule 4 sees it immediately",
     P.rule4Violations(MUST_FAIL, []).length >= 10);

  // The spec's own reading of the cycle, pinned so the diagnosis stays checkable.
  function eq(a,b){ return MUST_FAIL[NAMES.indexOf(a)].join(",")===MUST_FAIL[NAMES.indexOf(b)].join(","); }
  ok("every second row from I is the identical forced row",
     ["I","K","M","O"].every(function(n){ return MUST_FAIL[NAMES.indexOf(n)].join(",")==="5"; }));
  ok("...and the odd rows cycle a six-row pool (J=A, L=H, P=C, Q=D, R=E, S=F)",
     eq("J","A") && eq("L","H") && eq("P","C") && eq("Q","D") && eq("R","E") && eq("S","F"));
})();

// ===========================================================================
console.log("\nTHE TARGET — the definition of done for the rebuild");
// ===========================================================================
/* These drive the SHIPPED generator on the real job and ask for the five rules.
   They were RED when written, on purpose, and closing the deploy gate was the
   point: a generator known to produce a cycling ceiling should not be
   shippable. They are green as of the round-2 rebuild. */
(function(){
  var opts = P.generateOptions(TRUSSES, RUN_IN, STOCK, ROWS);
  var results = opts.map(function(o){
    return P.checkFiveRules(TRUSSES, RUN_IN, STOCK, o.rowJoints, [], OC);
  });
  var clean = results.filter(P.passesFiveRules).length;

  ok("TARGET: the top-ranked option satisfies all five rules",
     P.passesFiveRules(results[0]),
     "r2="+results[0].r2.length+" r3="+results[0].r3.length+" r4="+results[0].r4.length
     +" forced="+results[0].forced+"/"+results[0].forcedCap
     +" vocab=["+results[0].vocabUsed.join(",")+"]");

  ok("TARGET: every option offered satisfies all five rules",
     clean === opts.length, clean+" of "+opts.length+" options clean");

  ok("TARGET: the generator reaches the whole vocabulary, not two of five",
     results[0].vocabUsed.length >= 4, "["+results[0].vocabUsed.join(",")+"]");

  ok("TARGET: no option leans on the forced row past its cap",
     results.every(function(r){ return r.forced <= r.forcedCap; }),
     results.map(function(r){ return r.forced+"/"+r.forcedCap; }).join(" "));

  // The label must be earned. Today it says "stagger · A" regardless of whether
  // the layout repeats; the spec requires the claim to be backed by the checks.
  ok("TARGET: a layout's label is earned by the checks, not asserted",
     opts.every(function(o, i){
       return P.passesFiveRules(results[i]) || !/non-repeating/i.test(o.label);
     }));
})();

// ===========================================================================
console.log("\nTHE SHUFFLE SWEEP — rules 2–5 on EVERY candidate, not just the winner");
// ===========================================================================
/* The spec asks for this explicitly, and the reason is the failure it comes
   from: the cycling layout was not the top-ranked option, it was option 3 and
   option 5 of six. A generator judged only on its winner can hand somebody a
   repeating ceiling the moment they tap Shuffle.

   So: every option, across a spread of real geometries. The run lengths and
   spacings are the ones the app actually sees — the real job, the ceiling
   fixture, the app's own defaults — plus deliberately awkward ones, because a
   rule that only holds on tidy numbers is not a rule. */
(function(){
  var CASES = [
    { tag:"the real job 261.75″",   run:261.75, off:18, oc:24, cap:144, rows:29 },
    { tag:"ceiling fixture 262″",   run:262,    off:18, oc:24, cap:192, rows:30 },
    { tag:"app default 261.75″",    run:261.75, off:18, oc:24, cap:192, rows:29 },
    { tag:"awkward 330.5″",         run:330.5,  off:20, oc:24, cap:192, rows:22 },
    { tag:"16″ o.c. 240″",          run:240,    off:16, oc:16, cap:144, rows:24 },
    { tag:"long run 420″",          run:420,    off:18, oc:24, cap:192, rows:18 },
    { tag:"short-ish 180″",         run:180,    off:18, oc:24, cap:144, rows:16 },
    { tag:"odd offset 300.5″",      run:300.5,  off:11, oc:24, cap:168, rows:26 }
  ];
  var totalOpts=0, dirty=[], narrowVocab=[], slow=null, fullReach=0;

  CASES.forEach(function(c){
    P.setLongestStock(c.cap);
    var tr = P.buildTrusses(c.run, c.off, c.oc);
    var t0 = Date.now();
    var opts = P.generateOptions(tr, c.run, c.cap, c.rows);
    var ms = Date.now() - t0;
    if (!slow || ms > slow.ms) slow = { tag:c.tag, ms:ms };

    /* ACHIEVABLE, not theoretical. midVocabulary() answers "what lengths does
       the o.c. and the stock permit" — but a short run cannot fit the long ones
       between its interior trusses at all. On the 180″ case the theoretical set
       is 5 and only 3 can ever appear, so measuring against the theoretical set
       marks the generator down for geometry rather than for behaviour. The
       candidate pool is the honest denominator: it is exactly the set of middles
       that some legal row could produce. */
    var pool=[]; for (var n=1;n<=4;n++) pool = pool.concat(P.candidateRows(tr, c.run, c.cap, n, 2));
    var ach={}; pool.forEach(function(r){ P.rowMiddles(tr,r,c.run).forEach(function(m){ ach[m]=1; }); });
    var full = Object.keys(ach).length;
    opts.forEach(function(o, i){
      totalOpts++;
      var chk = P.checkFiveRules(tr, c.run, c.cap, o.rowJoints, [], c.oc);
      if (!P.passesFiveRules(chk)){
        // A jointless run has no rules to break — it is legitimately exempt.
        var jointless = o.rowJoints.every(function(r){ return r.length===0; });
        if (!jointless) dirty.push(c.tag+" opt"+(i+1)+" r2="+chk.r2.length+" r3="+chk.r3.length
                                   +" r4="+chk.r4.length+" forced="+chk.forced+"/"+chk.forcedCap);
      }
      /* R1 is a REACH, not a legality — tracked separately so a narrow layout is
         visible without being called a violation. The bar is two thirds of what
         the geometry can actually produce: measured, six of the seven cases
         reach 100% and only the 180″ run falls to 2 of 3, where five interior
         trusses and sixteen rows leave the search very little room. */
      if (chk.vocabUsed.length && full && chk.vocabUsed.length < Math.ceil(full*2/3)){
        narrowVocab.push(c.tag+" opt"+(i+1)+" ["+chk.vocabUsed.join(",")+"] of "+full+" achievable");
      }
      if (chk.vocabUsed.length === full) fullReach++;
    });

    // Every option a user can shuffle to must be a DIFFERENT layout. Six cards
    // that cycle back to the same ceiling is the same failure in miniature.
    var sigs = {}, dupes = 0;
    opts.forEach(function(o){ var k=JSON.stringify(o.rowJoints); if(sigs[k]) dupes++; sigs[k]=1; });
    ok(c.tag+": all "+opts.length+" options are distinct layouts", dupes===0, dupes+" duplicates");
  });

  ok("every option across every geometry satisfies rules 2–5",
     dirty.length===0, dirty.slice(0,5).join(" | "));
  ok("...and none collapses to under two thirds of the achievable vocabulary",
     narrowVocab.length===0, narrowVocab.slice(0,5).join(" | "));
  /* The number that would actually have caught the original defect. The shipped
     generator reached 2 of 5 on the real job — 40% — on every one of its six
     options. Most layouts reaching EVERYTHING is the positive form of the same
     measurement, and it is worth pinning as a ratio rather than a pass/fail so a
     slow drift downward is visible. */
  ok("most options reach the whole achievable vocabulary",
     fullReach >= totalOpts*0.8, fullReach+" of "+totalOpts+" options at full reach");
  ok("the sweep actually exercised a real number of layouts",
     totalOpts >= 30, totalOpts+" options checked");
  /* This runs on a phone. The search backtracks, so a pathological geometry
     could in principle grind — the node budget is what stops it, and this is
     the assertion that would notice if the budget stopped being enough. */
  ok("no geometry takes longer than a second to generate",
     slow.ms < 1000, slow.tag+" took "+slow.ms+"ms");
})();

// ===========================================================================
console.log("\nTHE INSTALLED BOUNDARY — rules apply across rows already on the ceiling");
// ===========================================================================
/* The whole reason this defect was found mid-job. Three courses were already up,
   and the rules have to reach backwards across that line or the first generated
   row can legally land on the last installed row's truss. */
(function(){
  P.setLongestStock(STOCK);
  var fresh = P.generateOptions(TRUSSES, RUN_IN, STOCK, 12);
  var cont  = P.generateOptions(TRUSSES, RUN_IN, STOCK, 12, { prevRows: INSTALLED });

  ok("a continuing layout is offered", cont.length > 0);
  cont.forEach(function(o, i){
    var chk = P.checkFiveRules(TRUSSES, RUN_IN, STOCK, o.rowJoints, INSTALLED, OC);
    ok("continuation opt"+(i+1)+" respects the installed courses",
       P.passesFiveRules(chk),
       "r2="+chk.r2.length+" r3="+chk.r3.length+" r4="+chk.r4.length);
  });

  // And it genuinely differs from the fresh-start layout — otherwise prevRows
  // is being accepted and ignored, which would pass every check above.
  ok("prevRows actually changes the layout, rather than being accepted and ignored",
     JSON.stringify(fresh[0].rowJoints) !== JSON.stringify(cont[0].rowJoints));

  // The specific thing that cannot happen: row 1 sharing a truss with the last
  // installed course. Checked directly, because it is the seam you would see.
  ok("no continuation opens on a truss from the last installed course",
     cont.every(function(o){ return P.trussConflicts(o.rowJoints[0], [INSTALLED[2]]).length===0; }));
  ok("...nor from the one before it",
     cont.every(function(o){ return P.trussConflicts(o.rowJoints[0], [INSTALLED[1]]).length===0; }));
})();

// run_tests.sh greps for a line matching ^N passed, M failed — keep this format.
console.log("\nengine source: panel=" + P.__source);
console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
