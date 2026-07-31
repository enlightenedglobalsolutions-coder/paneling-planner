// ============================================================================
//  test_deck.js — the Reshuffle deck: does the next card LOOK different?
//
//  Reshuffle's whole value is that tapping it visibly changes the floor. It did
//  not. The engine ranks candidates by quality, and near the top of that ranking
//  the layouts are near-identical: consecutive cards differed by a mean row-start
//  distance of 0.05"-0.42" across every fixture room. On screen that is nothing.
//  The button worked and appeared broken.
//
//  Two things were tried and rejected before the deck, both recorded here so
//  nobody re-tries them:
//
//    - Coarser dedup bins (3"). MEASURED NOT TO WORK: dedup keys on the JOINED
//      row-start sequence, so two layouts 0.3" apart still have one row
//      straddling a bin edge and both survive. On the kitchen it changed
//      nothing at all (16 candidates before and after, same 0.30" worst gap);
//      elsewhere it discarded real candidates and LEFT the near-duplicates.
//    - Ungated greedy selection. It maximises distance by reaching for bad
//      layouts, pulling card 1's waste up 27% in one room and 83% in another.
//      Hence the waste ceiling, and hence `wasteRatio` is pinned below.
//
//  NOTE (2026-07-31): the eye rule reduced the headroom here. Constraining step
//  magnitudes makes candidates structurally more alike, so the deck has less
//  distance to work with: the kitchen went 5 cards / 8.70" worst gap -> 4 / 3.73",
//  the great room 5 / 11.07" -> 4 / 4.57". Both still clear the 3" visibility
//  floor, so Shuffle still visibly changes the floor — by less than it did. That
//  is a real cost of the eye rule and it is recorded, not smoothed over.
//
//  WHERE THIS RUNS MATTERS. The deck sits ABOVE the engine — it reorders what
//  the viewer cycles through and never changes what the engine produced. That
//  is why the whole feature moved ZERO goldens. `card 0 is untouched` below is
//  the assertion that keeps it true: every golden in test_fl_engine.js pins
//  cands[0], so the day the deck starts reordering position 0, that test fails
//  here FIRST, with a message that says why, instead of 105 assertions failing
//  in the other suite with no explanation.
//
//  Run:  node test_deck.js     (or ./run_tests.sh)
// ============================================================================

var E  = require('./engine_source.js');
var FL = E.load('fl');
var D  = E.load('deck');

var pass=0, fail=0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok  "+name); }
  else { fail++; console.log("FAIL  "+name+(extra!=null?"  "+extra:"")); }
}

// Same cfg construction as test_fl_engine.js (readInputs() is DOM-bound, so its
// row/rip maths is reproduced rather than sliced). Kept identical on purpose:
// these rooms must be the same rooms that suite pins.
function mkCfg(o){
  var gap=o.gap, runIn=o.roomRunIn-2*gap, acrossIn=o.roomAcrossIn-2*gap;
  var P=o.plankLen, W=o.plankWid, minRip=o.minRip;
  var nRows=Math.ceil(acrossIn/W), edge=(acrossIn-(nRows-2)*W)/2;
  if(nRows>=3 && edge<minRip){ nRows+=1; edge=(acrossIn-(nRows-2)*W)/2; }
  if(nRows<2){ nRows=2; edge=acrossIn/2; }
  var widths=[]; if(nRows===2){ widths=[acrossIn/2,acrossIn/2]; }
  else{ widths.push(edge); for(var k=0;k<nRows-2;k++) widths.push(W); widths.push(edge); }
  return {runIn:runIn,acrossIn:acrossIn,plankLen:P,plankWid:W,minOff:o.minOff,
          minReuse:o.minReuse,minRip:minRip,gap:gap,perBox:o.perBox,rotate:o.rotate,
          nRows:nRows,widths:widths,edgeRip:edge};
}

// ---------------------------------------------------------------------------
//  ROOMS — the five test_fl_engine fixtures plus the two Stage 2.5b demo rooms.
//
//  `gapBefore` is the worst consecutive distance in plain RANK order — the bug,
//  pinned as a number so the improvement is evidence and not a claim.
//  `deck`/`gapAfter` are what ships. `wasteRatio` is the worst waste any card
//  in the deck carries relative to card 0, and it is pinned because the ceiling
//  is the only thing stopping the selector from reaching for bad layouts.
// ---------------------------------------------------------------------------
var VISIBLE_MIN = D.getVisibleMin();     // 3" — the floor for "reads as different"

var ROOMS = [
  { key:'kitchen',   why:"the demo room",
    dims:{roomRunIn:156,roomAcrossIn:132,gap:0.25,plankLen:60,plankWid:9,minOff:16,minReuse:20,minRip:2,perBox:8,rotate:4},
    cands:16, deck:4, gapBefore:1.60, gapAfter:3.73,  wasteRatio:1.493 },

  { key:'lock',      why:"the geometry lock — the worst case, 0.07\" between cards",
    dims:{roomRunIn:240,roomAcrossIn:132,gap:0,plankLen:48,plankWid:9,minOff:16,minReuse:20,minRip:2,perBox:8,rotate:4},
    cands:10, deck:4, gapBefore:0.07, gapAfter:10.67, wasteRatio:1.479 },

  { key:'tight',     why:"over-constrained — few candidates, so a short deck is correct",
    dims:{roomRunIn:300,roomAcrossIn:216,gap:0,plankLen:36,plankWid:9,minOff:24,minReuse:20,minRip:2,perBox:8,rotate:4},
    cands:7, deck:2, gapBefore:0.08, gapAfter:15.63, wasteRatio:1.000 },

  { key:'tworow',    why:"two rows — least room to differ",
    dims:{roomRunIn:156,roomAcrossIn:18,gap:0.25,plankLen:60,plankWid:9,minOff:16,minReuse:20,minRip:2,perBox:8,rotate:4},
    cands:13, deck:2, gapBefore:0.25, gapAfter:4.50,  wasteRatio:1.237 },

  { key:'narrow',    why:"THE GUARD CASE — nothing here reads as different, so the deck is 1 and Reshuffle must hide",
    dims:{roomRunIn:120,roomAcrossIn:7,gap:0,plankLen:48,plankWid:9,minOff:12,minReuse:20,minRip:2,perBox:8,rotate:4},
    cands:7, deck:1, gapBefore:0.25, gapAfter:null,  wasteRatio:1.000 },

  // The two demo rooms use the app's OWN default plank — 60"x9", gap 1/4 — not a
  // size invented for the test. An earlier draft of this file pinned them at 48"
  // and got a 4-card hallway; the shipped app deals ONE. Fixtures that quietly
  // use parameters the app never sets prove nothing about what the user sees.
  { key:'greatroom', why:"Stage 2.5b demo room — 20'x16' at the app's default plank",
    dims:{roomRunIn:240,roomAcrossIn:192,gap:0.25,plankLen:60,plankWid:9,minOff:16,minReuse:20,minRip:2,perBox:8,rotate:4},
    cands:16, deck:4, gapBefore:1.73, gapAfter:4.57, wasteRatio:1.422 },

  // SECOND GUARD CASE, and a different guard from `narrow`. The hallway has 16
  // candidates, all 16 start-sequences distinct, and two of them 22.08" apart —
  // so there is plenty of variety in the room. It still deals ONE card, because
  // every layout that differs visibly also wastes far more: within the widest
  // 1.5x ceiling the farthest candidate is 1.42" away, and the 21"-away layouts
  // cost 1.7-1.9x the best. The ceiling refuses them, correctly.
  //
  // So "One clean layout for this room" is the honest answer here, not a
  // degenerate one. NOTE FOR STAGE 2.5b: the hallway card will therefore show no
  // Shuffle button. That is a real product consequence of a real constraint —
  // decide the copy for it, don't "fix" the deck to manufacture a second card.
  { key:'hallway',   why:"Stage 2.5b demo room — 24'x4', the 6:1 fit-to-screen proof case",
    dims:{roomRunIn:288,roomAcrossIn:48,gap:0.25,plankLen:60,plankWid:9,minOff:16,minReuse:20,minRip:2,perBox:8,rotate:4},
    cands:16, deck:1, gapBefore:0.67, gapAfter:null,  wasteRatio:1.000 }
];

function run(room){
  var cfg   = mkCfg(room.dims);
  var cands = FL.generateCandidates(cfg);
  var out   = D.orderDeck(cands.slice());
  var n     = D.getDeckSize();
  return { cfg:cfg, cands:cands, out:out, n:n, deck:out.slice(0, n) };
}
function starts(c){ return c.rows.map(function(r){ return r.start; }); }

// ===========================================================================
console.log("\nTHE BUG — rank order puts near-identical layouts next to each other");
// ===========================================================================
ROOMS.forEach(function(room){
  var r = run(room);
  var head = r.cands.slice(0, Math.min(D.getSlots(), r.cands.length));
  var g = D.minLoopGap(head);
  ok(room.key+": rank order worst gap "+room.gapBefore+"\"",
     Math.abs(g - room.gapBefore) <= 0.01, "got "+g.toFixed(2));
  ok(room.key+": ...which is below the "+VISIBLE_MIN+"\" visibility floor",
     g < VISIBLE_MIN, "got "+g.toFixed(2));
});

// ===========================================================================
console.log("\nTHE FIX — the deck separates what the viewer actually cycles");
// ===========================================================================
ROOMS.forEach(function(room){
  var r = run(room);
  ok(room.key+": "+r.cands.length+" candidates ("+room.why+")",
     r.cands.length === room.cands, "got "+r.cands.length);
  ok(room.key+": deck is "+room.deck+" card"+(room.deck===1?"":"s"),
     r.n === room.deck, "got "+r.n);

  if (room.gapAfter == null){
    // Single card: minLoopGap is Infinity by definition, and the UI must hide
    // Reshuffle rather than cycle % 1 and silently do nothing.
    ok(room.key+": one card => no cycle to make, gap is Infinity",
       D.minLoopGap(r.deck) === Infinity);
  } else {
    var g = D.minLoopGap(r.deck);
    ok(room.key+": worst gap now "+room.gapAfter+"\"",
       Math.abs(g - room.gapAfter) <= 0.01, "got "+g.toFixed(2));
    ok(room.key+": every step clears the "+VISIBLE_MIN+"\" floor",
       g >= VISIBLE_MIN, "got "+g.toFixed(2));
    /* It must still BEAT rank order — but the multiple shrank when the eye rule
       landed. Constraining step magnitudes makes the candidates structurally
       more alike, so there is less distance for the deck to find. Every deal
       still clears the visibility floor; the headroom above it is smaller. */
    ok(room.key+": and it still beats rank order ("+room.gapBefore+'" -> '+room.gapAfter+'")',
       g > room.gapBefore * 1.5, g.toFixed(2)+" vs "+room.gapBefore);
  }
});

// ===========================================================================
console.log("\nTHE CEILING — separation is not bought with bad layouts");
// ===========================================================================
ROOMS.forEach(function(room){
  var r = run(room);
  var wr = r.deck.reduce(function(m,c){ return Math.max(m, c.waste/(r.cands[0].waste||1)); }, 0);
  ok(room.key+": worst card wastes "+room.wasteRatio+"x card 0",
     Math.abs(wr - room.wasteRatio) <= 0.001, "got "+wr.toFixed(3));
  ok(room.key+": ...and never exceeds the widest ceiling (1.5x)",
     wr <= 1.5 + 1e-9, "got "+wr.toFixed(3));
});

// ===========================================================================
console.log("\nA ONE-CARD DECK IS A VERDICT, NOT A FAILURE TO SEARCH");
// ===========================================================================
// Both single-card rooms must be single-card for a REASON that is still true.
// Without this, relaxing the ceiling or the floor later would look like an
// improvement while actually hiding that these rooms were never searched.
(function(){
  var r = run(ROOMS.filter(function(x){ return x.key==='hallway'; })[0]);
  var c = r.cands;

  var distinct = new Set(c.map(function(x){ return starts(x).join(','); })).size;
  ok("hallway: all 16 candidates are genuinely distinct layouts",
     distinct === 16, "got "+distinct);

  var maxAny = 0;
  for (var i=0;i<c.length;i++) for (var j=i+1;j<c.length;j++)
    maxAny = Math.max(maxAny, D.deckDistance(c[i], c[j]));
  ok("hallway: and the variety exists — some are far apart",
     maxAny > 15, "widest pair "+maxAny.toFixed(2)+'"');

  // ...but not at an acceptable waste. This is the assertion that explains the
  // one-card deck: inside the widest ceiling, nothing is far enough away.
  var pool = c.slice(1).filter(function(x){ return x.waste <= c[0].waste * 1.5; });
  var farInPool = Math.max.apply(null, pool.map(function(x){ return D.deckDistance(c[0], x); }));
  ok("hallway: inside the widest 1.5x ceiling nothing is far enough away",
     farInPool < VISIBLE_MIN, "farthest "+farInPool.toFixed(2)+'"');
  ok("hallway: ...which is below the "+VISIBLE_MIN+"\" floor, so the deck is 1 on purpose",
     farInPool < VISIBLE_MIN && r.n === 1);

  // The far layouts are refused on cost, and here is the cost.
  var far = c.filter(function(x){ return D.deckDistance(c[0], x) > 20; });
  var ratios = far.map(function(x){ return x.waste / c[0].waste; });
  ok("hallway: every far layout wastes materially more — refused on cost",
     far.length > 0 && Math.min.apply(null, ratios) > 1.3,
     far.length+" far, min ratio "+(far.length?Math.min.apply(null,ratios).toFixed(2):'n/a'));
})();

// ===========================================================================
console.log("\nTHE VERDICT THE ONE-CARD MARKER QUOTES");
// ===========================================================================
/* When the deck collapses, the UI puts a marker where Shuffle would be and the
   (i) behind it explains why, quoting numbers. Those numbers come from HERE —
   never from copy — so the sentence on screen cannot drift from what the deck
   actually did. If someone hardcodes "16 candidates" into the string, this is
   the suite that should have stopped them. */
ROOMS.forEach(function(room){
  var r = run(room);
  var w = D.getDeckWhy();
  if (room.deck === 1){
    ok(room.key+": a one-card deck records WHY", !!w);
    ok(room.key+": ...it reports all "+r.cands.length+" candidates as considered",
       w && w.considered === r.cands.length, w ? String(w.considered) : 'null');
    ok(room.key+": ...and the nearest affordable layout's real distance",
       w && w.nearestGap >= 0 && w.nearestGap < VISIBLE_MIN,
       w ? w.nearestGap.toFixed(2) : 'null');
    ok(room.key+": ...measured at the WIDEST ceiling, so 'nothing was skipped' is true",
       w && w.ceiling === D.getCeilings()[D.getCeilings().length-1],
       w ? String(w.ceiling) : 'null');
  } else {
    // A multi-card room has nothing to explain, and a stale verdict left over
    // from a previous room would put a marker on a floor that can shuffle.
    ok(room.key+": a multi-card deck records no verdict (nothing to explain)", w === null,
       JSON.stringify(w));
  }
});
(function(){
  // The exact figures the hallway marker prints. Pinned so the copy and the
  // engine can be compared by eye in a review.
  var r = run(ROOMS.filter(function(x){ return x.key==='hallway'; })[0]);
  var w = D.getDeckWhy();
  ok("hallway marker quotes 16 candidates", w.considered === 16, String(w.considered));
  ok("hallway marker quotes the real nearest affordable shift",
     w.nearestGap >= 0 && w.nearestGap < VISIBLE_MIN, w.nearestGap.toFixed(3));
  // deckVerdict is pure: same candidates in, same verdict out.
  var again = D.deckVerdict(r.cands);
  ok("deckVerdict is pure", again.considered === w.considered
     && Math.abs(again.nearestGap - w.nearestGap) < 1e-9);
})();

// ===========================================================================
console.log("\nAND THE UI ACTUALLY BRANCHES ON IT");
// ===========================================================================
/* The verdict is only worth computing if the screen uses it. Verified live in
   both themes; these guard the wiring so the marker cannot quietly stop
   rendering, or start rendering on a floor that CAN shuffle. */
(function(){
  var html = require('fs').readFileSync(require('path').join(__dirname,'index.html'),'utf8');
  var i = html.indexOf('function oneCardMarker(){');
  ok("the marker exists", i > 0);
  var body = html.slice(i, html.indexOf('function renderLayout(', i));

  ok("its copy interpolates the deck's own numbers, not a hardcoded count",
     /w\.considered/.test(body) && /w\.nearestGap/.test(body));
  ok("...and no candidate count is written into the string",
     !/\b16 candidate/.test(body));
  ok("it carries the one-liner verbatim",
     /A room this narrow lays one way/.test(body));
  ok("it is built with textContent, never innerHTML", !/innerHTML/.test(body));

  // Shown to EVERYONE: not .helpdot, which :root[data-guide=expert] hides
  // wholesale. An expert needs the explanation of a missing control as much as
  // a beginner does — arguably more, since they will go looking for the button.
  ok("the marker's dot is NOT .helpdot (which expert mode hides)",
     !/el\("button","helpdot"\)/.test(body) && /el\("button","whydot"\)/.test(body));
  ok("...and it carries a data-marker hook for a future visibility rule",
     /data-marker/.test(body));
  ok("no expert-mode rule hides .whydot today",
     !/data-guide="expert"\][^{]*\.whydot/.test(html));

  /* The render branch: the marker is the ELSE of the inline Shuffle condition,
     so the two are mutually exclusive by construction rather than by two
     conditions that could drift apart.

     Anchor on `fl-reshuffle`, NOT on the deckSize test — that string appears
     twice (the overlay toolbar has its own Shuffle, with no marker because a
     sentence does not belong in a toolbar), and taking the first match tested
     the wrong one. */
  var r = html.indexOf('el("button","fl-reshuffle")');
  ok("the inline Shuffle exists", r > 0);
  var branch = html.slice(html.lastIndexOf('if ((S.deckSize || 0) > 1){', r), r + 400);
  ok("Shuffle renders only when the deck has more than one card",
     /if \(\(S\.deckSize \|\| 0\) > 1\)\{[\s\S]*fl-reshuffle/.test(branch));
  ok("...and the marker is its else, so they can never both appear",
     /\} else \{[\s\S]{0,80}card\.appendChild\(oneCardMarker\(\)\);/.test(branch));
  // The overlay keeps its Shuffle-or-nothing behaviour: no marker there.
  var ov = html.indexOf('rs.textContent = "↺ Shuffle"');
  ok("the overlay toolbar shows no marker (a sentence does not belong in a toolbar)",
     html.slice(ov-300, ov+300).indexOf('oneCardMarker') < 0);
})();

// ===========================================================================
console.log("\nCARD 0 IS UNTOUCHED — this is why the deck moved zero goldens");
// ===========================================================================
ROOMS.forEach(function(room){
  var r = run(room);
  ok(room.key+": card 0 is still the engine's top-ranked candidate",
     r.out[0] === r.cands[0]);
  ok(room.key+": ...same object, so its pinned starts are byte-identical",
     JSON.stringify(starts(r.out[0])) === JSON.stringify(starts(r.cands[0])));
});
console.log("  --  If the two above ever fail, test_fl_engine.js is about to fail too:");
console.log("      every golden there pins cands[0]. Fix the deck, not the goldens.");

// ===========================================================================
console.log("\nNOTHING IS LOST — the deck reorders, it does not discard");
// ===========================================================================
ROOMS.forEach(function(room){
  var r = run(room);
  ok(room.key+": all "+r.cands.length+" candidates survive the reorder",
     r.out.length === r.cands.length, "got "+r.out.length);
  var missing = r.cands.filter(function(c){ return r.out.indexOf(c) < 0; });
  ok(room.key+": ...and every one is the same object (export/tests still see them all)",
     missing.length === 0, missing.length+" missing");
});

// ===========================================================================
console.log("\nDETERMINISM — the same room always deals the same deck");
// ===========================================================================
ROOMS.forEach(function(room){
  var a = run(room), b = run(room);
  ok(room.key+": two independent runs deal an identical deck",
     E.digest(a.deck.map(starts)) === E.digest(b.deck.map(starts)));
});

// ===========================================================================
console.log("\nDECK SIZE IS BOUNDED AND HONEST");
// ===========================================================================
(function(){
  ROOMS.forEach(function(room){
    var r = run(room);
    ok(room.key+": deck never exceeds "+D.getSlots()+" slots",
       r.n <= D.getSlots(), "got "+r.n);
    ok(room.key+": deck never exceeds the candidates that exist",
       r.n <= r.cands.length, r.n+" > "+r.cands.length);
  });

  // orderDeck must survive the degenerate inputs the UI can hand it.
  ok("empty candidate list: returns [] and reports deck 0",
     (function(){ var o = D.orderDeck([]); return o.length===0 && D.getDeckSize()===0; })());
  ok("null candidate list: returns [] and reports deck 0",
     (function(){ var o = D.orderDeck(null); return o.length===0 && D.getDeckSize()===0; })());
  ok("single candidate: returns it and reports deck 1 (Reshuffle must hide)",
     (function(){ var c=[{rows:[{start:1}],waste:1}]; var o=D.orderDeck(c);
                  return o.length===1 && D.getDeckSize()===1; })());
})();

// ===========================================================================
console.log("\nDISTANCE — the measure itself");
// ===========================================================================
(function(){
  var A={rows:[{start:0},{start:0},{start:0}]};
  var B={rows:[{start:3},{start:6},{start:9}]};
  ok("deckDistance is the mean absolute row-start difference",
     D.deckDistance(A,B) === 6);
  ok("deckDistance is symmetric", D.deckDistance(A,B) === D.deckDistance(B,A));
  ok("a layout is zero distance from itself", D.deckDistance(A,A) === 0);
  ok("no rows: distance 0, not NaN", D.deckDistance({rows:[]},{rows:[]}) === 0);

  // minLoopGap must include the WRAP back to card 0 — greedy ordering front-loads
  // the difference and dumps the closest pair on the wrap, which is exactly the
  // step a user hits when they tap Reshuffle one more time than there are cards.
  var seq=[{rows:[{start:0}]},{rows:[{start:20}]},{rows:[{start:1}]}];
  ok("minLoopGap counts the wrap back to card 0 (1\", not 19\")",
     D.minLoopGap(seq) === 1);
  ok("a one-card deck has no gap to measure", D.minLoopGap([seq[0]]) === Infinity);

  var seen=0; D.permute([1,2,3], function(){ seen++; });
  ok("permute enumerates every order (3! = 6)", seen === 6, "got "+seen);
})();

// ===========================================================================
// run_tests.sh greps for a line matching ^N passed, M failed — keep this format.
console.log("\nengine sources: fl=" + FL.__source + "  deck=" + D.__source);
console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
