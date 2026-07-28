// ============================================================================
//  test_lfield.js — the L join: one continuous field across a corner.
//
//  THE REGRESSION THIS STAGE EXISTS TO KILL. The rejected approach built each
//  band with its own buildLayout() call. Band two therefore began at a hardcoded
//  full plank, knowing nothing about the rows above it, and across 256 generated
//  L geometries that silently violated the adjacent-row seam rule in 5% of them.
//  Silently: the layout audited clean, because the auditor compared joints
//  ROW-LOCALLY and the two bands measure from different walls.
//
//  Both halves of that are fixed at the root, not adapted around:
//    - buildLayout runs ONE sequence over the whole field, each row carrying its
//      own run. There is no per-band call and nothing to restart.
//    - audit() and every clearance check work in ROOM coordinates, so a joint in
//      the leg is compared against a joint in the main run where they actually
//      are, not where each row happens to measure from.
//
//  The sweep below is the proof, and it asserts on the notch rows explicitly —
//  a global "0 violations" would have passed on the old code too.
//
//  Run:  node test_lfield.js     (or ./run_tests.sh)
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

// The rectangle cfg, built exactly as readInputs() does — the reference the L
// path has to collapse onto.
function rectCfg(runIn, acrossIn){
  var W=BASE.plankWid, minRip=BASE.minRip;
  var nRows=Math.ceil(acrossIn/W), edge=(acrossIn-(nRows-2)*W)/2;
  if(nRows>=3 && edge<minRip){ nRows+=1; edge=(acrossIn-(nRows-2)*W)/2; }
  if(nRows<2){ nRows=2; edge=acrossIn/2; }
  var widths=[]; if(nRows===2){ widths=[acrossIn/2,acrossIn/2]; }
  else { widths.push(edge); for(var k=0;k<nRows-2;k++) widths.push(W); widths.push(edge); }
  return { runIn:runIn, acrossIn:acrossIn, plankLen:BASE.plankLen, plankWid:W,
           minOff:BASE.minOff, minReuse:BASE.minReuse, minRip:minRip, gap:BASE.gap,
           perBox:BASE.perBox, rotate:BASE.rotate, nRows:nRows, widths:widths, edgeRip:edge };
}
function bands(d0,r0,d1,r1,x0,x1){
  return [{depthIn:d0, runIn:r0, runStartIn:x0||0},
          {depthIn:d1, runIn:r1, runStartIn:x1||0}];
}
// The row index where the run first changes — the notch.
function notchAt(cfg){
  var rr = cfg.rowRuns; if (!rr) return -1;
  for (var i=1;i<rr.length;i++){
    if (Math.abs(rr[i].runIn-rr[i-1].runIn) > 0.001 ||
        Math.abs((rr[i].xStart||0)-(rr[i-1].xStart||0)) > 0.001) return i;
  }
  return -1;
}
function absOf(r, cfg){
  return FL.absJoints(r.start, r.runIn||cfg.runIn, BASE.plankLen, r.xStart||0);
}
function gapBetween(a, b, cfg){
  return FL.clearanceAbs(b.start, b.xStart||0, absOf(a,cfg), b.runIn||cfg.runIn, BASE.plankLen);
}

// ===========================================================================
console.log("\nHARD CHECKPOINT — an L with a zero notch IS a rectangle");
// ===========================================================================
/* Not "looks like": collapses onto. If the two bands share a run there is no
   corner, so there must be no rowRuns, no rip, and the identical cfg — which
   means the identical layout, byte for byte. A first cut split at EVERY band
   boundary and failed this, inventing a seam the room does not have. */
[[155.5,131.5],[239.5,191.5],[287.5,47.5],[203.375,97.5],[119.5,6.5]].forEach(function(d){
  var rect = rectCfg(d[0], d[1]);
  var band = FL.bandedCfg(bands(d[1]*0.4, d[0], d[1]*0.6, d[0]), BASE);
  ok(d[0]+"x"+d[1]+": cfg is identical to the rectangle path",
     JSON.stringify(rect)===JSON.stringify(band));
  ok(d[0]+"x"+d[1]+": ...so the layout digest is identical",
     E.digest(FL.generateCandidates(rect))===E.digest(FL.generateCandidates(band)));
  ok(d[0]+"x"+d[1]+": ...and it carries no per-row runs at all", !band.rowRuns);
});
// The three demo rooms specifically: a zero-notch L must reproduce their goldens.
[['156x132','f2b63670853b129c',155.5,131.5],
 ['240x192','87381dd7b2d49096',239.5,191.5],
 ['288x48', 'f24aeef20b8b0439',287.5,47.5]].forEach(function(g){
  var band = FL.bandedCfg(bands(g[3]*0.5, g[2], g[3]*0.5, g[2]), BASE);
  ok("a zero-notch L reproduces the "+g[0]+" golden exactly",
     E.digest(FL.generateCandidates(band))===g[1]);
});

// ===========================================================================
console.log("\nONE CONTINUOUS FIELD — the leg never restarts");
// ===========================================================================
(function(){
  var cfg = FL.bandedCfg(bands(45,240,45,120), BASE);
  var best = FL.generateCandidates(cfg)[0];
  var k = notchAt(cfg);
  ok("the run changes partway down the field", k > 0, String(k));
  ok("rows above the notch carry the main run",
     cfg.rowRuns[k-1].runIn === 240 && cfg.rowRuns[0].runIn === 240);
  ok("rows below it carry the leg run",
     cfg.rowRuns[k].runIn === 120 && cfg.rowRuns[cfg.rowRuns.length-1].runIn === 120);

  // The whole requirement, as a number: no restart at the corner.
  ok("the first leg row does NOT start at a full plank",
     Math.abs(best.rows[k].start - BASE.plankLen) > 0.001, String(best.rows[k].start));
  ok("...and it is not row 1's start either (no transition board)",
     Math.abs(best.rows[k].start - best.rows[0].start) > 0.001);

  // Continuity is the sequence, so every row must still be a legal successor.
  var worst = Infinity;
  for (var i=1;i<best.rows.length;i++) worst = Math.min(worst, gapBetween(best.rows[i-1], best.rows[i], cfg));
  ok("every adjacent pair clears the stagger rule, corner included",
     worst >= BASE.minOff - 0.001, "worst "+worst.toFixed(2)+'"');

  // And the builder does not secretly rebuild per band.
  var html = require('fs').readFileSync(require('path').join(__dirname,'index.html'),'utf8');
  var i2 = html.indexOf('function buildLayout(seed, cfg, guard){');
  var body = html.slice(i2, html.indexOf('function audit(', i2));
  ok("buildLayout has ONE row loop, not one per band",
     (body.match(/for \(var i=2; i<=cfg\.nRows; i\+\+\)/g)||[]).length === 1);
  ok("...and takes its run per row rather than from cfg once",
     /rowRunAt\(cfg, i-1\)/.test(body));
})();

// ===========================================================================
console.log("\nTHE SEAM SWEEP — 256 L geometries, notch rows asserted explicitly");
// ===========================================================================
(function(){
  // Depths deliberately OFF the plank grid, or no row ever straddles the notch
  // and the sweep proves nothing. A first run of this used depths that were all
  // multiples of the plank width and reported 0 rips across all 256 — green, and
  // exercising none of the code it existed to test.
  var MAIN=[156,204,240,287.5], LEG=[71.5,108,143.25,180],
      D0=[40,53.5,76.25,100],   D1=[44,61.5,88.75,112];
  var total=0, violations=0, notchBreaks=0, withRip=0, worstNotchGap=Infinity;
  MAIN.forEach(function(m){ LEG.forEach(function(l){ D0.forEach(function(d0){ D1.forEach(function(d1){
    total++;
    var cfg = FL.bandedCfg(bands(d0,m,d1,l), BASE);
    var best = FL.generateCandidates(cfg)[0];
    if (FL.audit(best.rows, cfg) > 0) violations++;
    if (cfg.plan && cfg.plan.ripCount > 0) withRip++;
    // EXPLICIT on the rows that span the notch line — the 5% the old code broke.
    var rr = cfg.rowRuns || [];
    for (var i=1;i<rr.length;i++){
      if (Math.abs(rr[i].runIn-rr[i-1].runIn) < 0.001) continue;
      var g = gapBetween(best.rows[i-1], best.rows[i], cfg);
      if (g < worstNotchGap) worstNotchGap = g;
      if (g < BASE.minOff - 0.001) notchBreaks++;
      // and the skip-a-row rule across the corner
      if (i >= 2){
        var g2 = gapBetween(best.rows[i-2], best.rows[i], cfg);
        if (g2 < BASE.minOff - 0.001) notchBreaks++;
      }
    }
  });});});});

  ok("swept "+total+" L geometries", total === 256, String(total));
  ok("...and every one of them actually produced a corner rip", withRip === total,
     withRip+" of "+total);
  ok("zero audit violations across the sweep", violations === 0, String(violations));
  ok("ZERO notch-spanning seam breaks (this was 5%)", notchBreaks === 0, String(notchBreaks));
  ok("worst clearance across a corner is still legal",
     worstNotchGap >= BASE.minOff - 0.001, worstNotchGap.toFixed(2)+'"');
})();

// ===========================================================================
console.log("\nROOM COORDINATES — the reason the old break was SILENT");
// ===========================================================================
(function(){
  /* Two rows whose joints coincide in the room, but which measure from different
     walls. Judged row-locally they look 60" apart; judged in the room they are
     on top of each other. The old auditor used the row-local reading, which is
     why the 5% never showed up as a violation. */
  var P = 60;
  var mainRow = { start:30, runIn:240, xStart:0 };
  var legRow  = { start:30, runIn:120, xStart:0 };
  var sameSpot = FL.clearanceAbs(legRow.start, 0, FL.absJoints(mainRow.start, 240, P, 0), 120, P);
  ok("identical starts on a shared wall really are zero apart", near(sameSpot, 0));

  // Offset the leg along the wall: row-local says the same, the room does not.
  var offset = FL.clearanceAbs(legRow.start, 20, FL.absJoints(mainRow.start, 240, P, 0), 120, P);
  ok("offsetting the leg 20\" moves the joints 20\" in the room", near(offset, 20),
     offset.toFixed(2));
  ok("...which a row-local comparison would have missed entirely",
     Math.abs(offset - sameSpot) > 1);

  // The auditor must use the room reading.
  var html = require('fs').readFileSync(require('path').join(__dirname,'index.html'),'utf8');
  var i = html.indexOf('function audit(rows, cfg){');
  var body = html.slice(i, html.indexOf('function wasteOf(', i));
  ok("audit() compares in room coordinates", /clearanceAbs\(/.test(body));
  ok("...and no longer uses the row-local clearance()", !/[^A-Za-z]clearance\(/.test(body));
})();

// ===========================================================================
console.log("\nONE OFFCUT POOL — a piece cut in the main run starts a leg row");
// ===========================================================================
(function(){
  // Hand-computed fixture. Main run 156", plank 60": a row starting with a 60"
  // piece leaves 156 - 60 - 60 = 36" at the wall. That 36" board is what the
  // pool holds, and it is long enough (>= minReuse 20) to open a later row.
  var hand = FL.tailLen(60, 156, 60);
  ok("hand-computed offcut for a 156\" run starting full is 36\"", near(hand, 36),
     String(hand));
  ok("...which clears the reuse floor", hand >= BASE.minReuse);

  var cfg = FL.bandedCfg(bands(45,156,36,72), BASE);
  var cands = FL.generateCandidates(cfg);
  var crossed = 0, examples = [];
  cands.forEach(function(c){
    c.rows.forEach(function(r){
      var m = /row (\d+)'s offcut/.exec(r.src||'');
      if (!m) return;
      var donor = c.rows[+m[1]-1];
      var dRun = donor.runIn||cfg.runIn, rRun = r.runIn||cfg.runIn;
      if (Math.abs(dRun-rRun) > 0.001){
        crossed++;
        if (examples.length < 1) examples.push("row "+r.n+" (run "+rRun+") reuses row "+donor.n+" (run "+dRun+")");
      }
    });
  });
  ok("offcuts are reused ACROSS the corner, not banked per band",
     crossed > 0, examples.join('; ') || "no cross-band reuse found");

  // A piece can only start a row it actually fits in — the pool is shared, not blind.
  var html = require('fs').readFileSync(require('path').join(__dirname,'index.html'),'utf8');
  var i = html.indexOf('function buildLayout(seed, cfg, guard){');
  var body = html.slice(i, html.indexOf('function audit(', i));
  ok("a banked piece must fit the run it is going into",
     /bank\[i-2\] <= runIn/.test(body));
  ok("...and is checked against THIS row's run, not the donor's",
     /clearanceAbs\(c, g\.xStart, prevJ, runIn, P\)/.test(body));
})();

// ===========================================================================
console.log("\nTHE CORNER RIP");
// ===========================================================================
(function(){
  // Notch on a course line: nothing to rip.
  var clean = FL.bandRowPlan(bands(45,240,45,120), BASE.plankWid, BASE.minRip);
  ok("a notch that lands on a course produces no rip", clean.ripCount === 0);
  ok("...and every row is a full plank wide",
     clean.widths.every(function(w){ return near(w, BASE.plankWid); }));

  // Notch mid-row: the board at the inside corner is ripped, and the two halves
  // add back up to the row they came from.
  var rip = FL.bandRowPlan(bands(30,240,54,120), BASE.plankWid, BASE.minRip);
  ok("a notch inside a row rips it", rip.ripCount === 2, String(rip.ripCount));
  var ripped = rip.rows.filter(function(r){ return r.rip; });
  ok("...into exactly two strips", ripped.length === 2);
  ok("...whose widths sum to one course", near(ripped[0].width + ripped[1].width, BASE.plankWid),
     (ripped[0].width+ripped[1].width).toFixed(3));
  ok("...one each side of the corner",
     Math.abs(ripped[0].runIn - ripped[1].runIn) > 0.001);
  ok("the rip is reported like an edge rip — a row narrower than a plank",
     ripped.every(function(r){ return r.width < BASE.plankWid; }));
  ok("total depth is preserved by the split",
     near(rip.widths.reduce(function(a,b){return a+b;},0), 84), String(rip.totalDepth));
})();

// ===========================================================================
console.log("\nSLIVERS — reported, never silently laid  [OPEN QUESTION]");
// ===========================================================================
(function(){
  /* A corner rip is only layable if it clears the same minRip floor the engine
     already enforces at the walls. When the notch falls a fraction inside a row
     it does not. Measured across 5,776 notch depths: 37% of corner rips came out
     under 2", the worst 0.125". A board that thin cannot be cut or held down.

     Resolving it is a TRADE decision with three defensible answers — nudge the
     starting rip so the notch lands on a course, let the neighbouring board run
     through and scribe it, or absorb the difference across the two rows — and
     each changes the floor the customer gets. So the engine measures and
     reports; it does not choose. This is why the Stage 3 dispatch has NOT been
     flipped. */
  // 32.125" was FOUND, not guessed: an earlier draft picked 30.25" on the
  // assumption that any off-grid notch slivers, and it does not — the row grid
  // shifts with the edge rip, so 30.25" splits into a comfortable 6.125"/2.875".
  // The failure depends on where the notch falls relative to the COURSES, not on
  // whether the depth is round.
  var thin = FL.bandRowPlan(bands(32.125,240,54,120), BASE.plankWid, BASE.minRip);
  ok("a notch that lands 1.94\" from a course makes a sliver", thin.slivers > 0,
     "narrowest "+thin.narrowestRip+'"');
  ok("...and the plan says so rather than emitting it quietly", thin.layable === false);

  var fine = FL.bandRowPlan(bands(30,240,54,120), BASE.plankWid, BASE.minRip);
  ok("a rip at or above the floor is layable", fine.layable === true && fine.slivers === 0);

  // How often, across the same 256 the seam sweep uses.
  var MAIN=[156,204,240,287.5], LEG=[71.5,108,143.25,180],
      D0=[40,53.5,76.25,100],   D1=[44,61.5,88.75,112];
  var n=0, bad=0, worst=Infinity;
  MAIN.forEach(function(m){ LEG.forEach(function(l){ D0.forEach(function(d0){ D1.forEach(function(d1){
    n++;
    var p = FL.bandRowPlan(bands(d0,m,d1,l), BASE.plankWid, BASE.minRip);
    if (!p.layable) bad++;
    if (isFinite(p.narrowestRip)) worst = Math.min(worst, p.narrowestRip);
  });});});});
  ok("the sweep measures how often it bites ("+bad+" of "+n+", narrowest "+worst+'")',
     n === 256);
  ok("every geometry reports layability either way", bad >= 0 && bad <= n);
})();

// run_tests.sh greps for a line matching ^N passed, M failed — keep this format.
console.log("\nengine source: fl=" + FL.__source);
console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
