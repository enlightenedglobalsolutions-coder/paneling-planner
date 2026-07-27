// ============================================================================
//  test_labels.js — where a plank label sits, and why it stays on the sheet.
//
//  THE BUG THIS PINS. In the rotated fullscreen view every label carried a
//  rotate(-90) that exactly cancelled the group's rotate(90). The labels came
//  out axis-aligned on screen, reading ACROSS planks that now ran vertically —
//  the opposite of how text on a blueprint follows the member it annotates.
//
//  That counter-rotation also caused the clipping, which is why both symptoms
//  had one cause: cancelling the rotation puts the label's LONG dimension on the
//  room's NARROW axis, so first- and last-row labels ran off the viewBox (6 of
//  55 labels in a 13'x11' kitchen, by 2.6"-4.2"). Removing it fixed both.
//
//  What is left for arithmetic — and what this file guards — is the cross-axis
//  clamp. A first/last row is only edgeRip wide and edgeRip may be as little as
//  minRip (2"), while the labels are 5.2 and 6.4 units tall. Centring naively on
//  y + h/2 hangs the glyph box off the edge of the sheet in EITHER orientation.
//
//  The extents are asymmetric and that is the whole subtlety: a monospace glyph
//  box reaches ~0.95em ABOVE the baseline and only ~0.25em below (measured off
//  the shipped font: at 5.2, 4.91 up and 1.17 down). A symmetric half-height
//  under-clamps the bottom edge and the last row's number keeps clipping.
//
//  Run:  node test_labels.js     (or ./run_tests.sh)
// ============================================================================

var E = require('./engine_source.js');
var L = E.load('label');

var pass=0, fail=0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok  "+name); }
  else { fail++; console.log("FAIL  "+name+(extra!=null?"  "+extra:"")); }
}

var ABOVE = L.getAbove(), BELOW = L.getBelow();
var FS_PLANK = 5.2, FS_ROWNUM = 6.4;   // the two sizes buildSvg actually uses

// Top and bottom of the glyph box for a baseline, in sheet units.
function boxTop(base, fs){ return base - fs*ABOVE; }
function boxBot(base, fs){ return base + fs*BELOW; }

// ===========================================================================
console.log("\nTHE EXTENTS — asymmetric, and carried with margin");
// ===========================================================================
ok("glyph reaches further above the baseline than below", ABOVE > BELOW);
ok("above is >= the measured 0.944em", ABOVE >= 0.944, "got "+ABOVE);
ok("below is >= the measured 0.225em", BELOW >= 0.225, "got "+BELOW);
// The margin exists because the baseline is written through toFixed(2). Clamping
// to the exact measurement left labels over the line by ~0.04" in a 24'x4' room.
ok("...and both carry margin over the measurement, for toFixed(2) rounding",
   ABOVE > 0.944 && BELOW > 0.225);
ok("but not so much margin that a label stops being centred",
   ABOVE < 1.1 && BELOW < 0.4);

// ===========================================================================
console.log("\nNORMAL ROWS — the label is centred, not clamped");
// ===========================================================================
(function(){
  var cfg = { acrossIn: 131.5 };                 // 11' room, 15 rows
  // A full-width interior row: 9" tall, comfortably taller than the glyph.
  var y = 30, h = 9;
  var base = L.labelBaseline(y, h, FS_PLANK, cfg);
  var top = boxTop(base, FS_PLANK), bot = boxBot(base, FS_PLANK);

  ok("interior row: glyph box sits inside the row", top >= y-0.01 && bot <= y+h+0.01,
     "row ["+y+","+(y+h)+"] box ["+top.toFixed(2)+","+bot.toFixed(2)+"]");
  // Centring the BOX on the row, not the baseline — the reason the helper adds
  // (above-below)/2 rather than a fixed nudge.
  var boxMid = (top+bot)/2;
  ok("...and the box is centred on the row, not the baseline",
     Math.abs(boxMid - (y+h/2)) < 0.01, "mid "+boxMid.toFixed(2)+" vs "+(y+h/2));
})();

// ===========================================================================
console.log("\nEDGE ROWS — the clamp, in both directions");
// ===========================================================================
(function(){
  var cfg = { acrossIn: 131.5 };

  // FIRST row of the sheet, thin: 2" edge rip against a 6.4 row number.
  var base = L.labelBaseline(0, 2, FS_ROWNUM, cfg);
  ok("first row 2\" tall: label does not run off the top of the sheet",
     boxTop(base, FS_ROWNUM) >= -0.01, "top "+boxTop(base,FS_ROWNUM).toFixed(3));

  // LAST row of the sheet, thin. This is the one a symmetric half-height missed:
  // the box reaches only 0.25em below the baseline, so the bottom bound is a
  // different distance from the centre than the top bound.
  var base2 = L.labelBaseline(cfg.acrossIn-2, 2, FS_ROWNUM, cfg);
  ok("last row 2\" tall: label does not run off the bottom of the sheet",
     boxBot(base2, FS_ROWNUM) <= cfg.acrossIn+0.01,
     "bottom "+boxBot(base2,FS_ROWNUM).toFixed(3)+" vs "+cfg.acrossIn);

  // The regression that shipped: 13'x11', row 15, the row NUMBER in the gutter.
  var y15 = 131.5-7.25;
  var b15 = L.labelBaseline(y15, 7.25, FS_ROWNUM, cfg);
  ok("the row-15 gutter number that used to clip now fits",
     boxBot(b15, FS_ROWNUM) <= cfg.acrossIn+0.01,
     "bottom "+boxBot(b15,FS_ROWNUM).toFixed(3));
})();

// ===========================================================================
console.log("\nEVERY ROW OF EVERY REAL ROOM STAYS ON THE SHEET");
// ===========================================================================
// Sweep the row geometry the engine actually produces, rather than trusting the
// three hand-picked cases above. Same row/rip maths as the other suites.
(function(){
  function rows(roomAcrossIn, gap, W, minRip){
    var acrossIn = roomAcrossIn - 2*gap;
    var nRows = Math.ceil(acrossIn/W), edge = (acrossIn-(nRows-2)*W)/2;
    if (nRows>=3 && edge<minRip){ nRows+=1; edge=(acrossIn-(nRows-2)*W)/2; }
    if (nRows<2){ nRows=2; edge=acrossIn/2; }
    var widths=[]; if(nRows===2){ widths=[acrossIn/2,acrossIn/2]; }
    else { widths.push(edge); for(var k=0;k<nRows-2;k++) widths.push(W); widths.push(edge); }
    return { acrossIn:acrossIn, widths:widths };
  }
  var CASES = [
    ["kitchen 11' wide",    132, 0.25, 9, 2],
    ["great room 16' wide", 192, 0.25, 9, 2],
    ["hallway 4' wide",      48, 0.25, 9, 2],
    ["3' wide, minRip 1",    36, 0.25, 9, 1],
    ["two-row 18\"",         18, 0.25, 9, 2],
    ["narrower than a plank", 7, 0,    9, 2]
  ];
  CASES.forEach(function(c){
    var r = rows(c[1], c[2], c[3], c[4]);
    var cfg = { acrossIn: r.acrossIn };
    var worst = 0, y = 0, sizes = [FS_PLANK, FS_ROWNUM];
    r.widths.forEach(function(h){
      sizes.forEach(function(fs){
        var b = L.labelBaseline(y, h, fs, cfg);
        worst = Math.max(worst, -boxTop(b,fs), boxBot(b,fs) - cfg.acrossIn);
      });
      y += h;
    });
    // A sheet can be genuinely thinner than the text — the 7" room is 3.5" rows
    // against an 8.06-unit row number. Overflow is then unavoidable, so the bar
    // is "no worse than the minimum possible", not "zero". Asserting zero here
    // would be asserting something the geometry cannot deliver.
    var tallest = Math.max.apply(null, sizes.map(function(fs){ return fs*(ABOVE+BELOW); }));
    var floor = Math.max(0, (tallest - cfg.acrossIn)/2);
    ok(c[0]+": all "+r.widths.length+" rows keep both label sizes on the sheet"
       + (floor > 0 ? " (sheet thinner than the text — "+floor.toFixed(2)+"\" unavoidable)" : ""),
       worst <= floor + 0.01, "worst overhang "+worst.toFixed(3)+" vs floor "+floor.toFixed(3));
  });
})();

// ===========================================================================
console.log("\nDEGENERATE — a sheet thinner than the text itself");
// ===========================================================================
(function(){
  // 6.4 * (0.98+0.28) = 8.06 units of glyph in a 4-unit sheet: it cannot fit.
  // It must still return a finite, centred number rather than NaN or a bound
  // that has crossed over itself.
  var cfg = { acrossIn: 4 };
  var b = L.labelBaseline(0, 4, FS_ROWNUM, cfg);
  ok("returns a finite baseline", isFinite(b), String(b));
  var over = Math.max(-boxTop(b,FS_ROWNUM), boxBot(b,FS_ROWNUM)-cfg.acrossIn);
  var top = -boxTop(b,FS_ROWNUM), bot = boxBot(b,FS_ROWNUM)-cfg.acrossIn;
  ok("...and splits the unavoidable overflow evenly instead of dumping it one side",
     Math.abs(top-bot) < 0.01, "top "+top.toFixed(2)+" bottom "+bot.toFixed(2));
  ok("...overflowing by less than the sheet is tall", over < cfg.acrossIn);
})();

// ===========================================================================
console.log("\nTHE COUNTER-ROTATION IS GONE FROM THE SHIPPED FILE");
// ===========================================================================
// The clamp above cannot see orientation, so the thing that actually fixed the
// reported bug — dropping rotate(-90) from the labels — is asserted against the
// shipped source directly. Without this, the clamp could pass forever while the
// labels went back to reading across the planks.
(function(){
  var fs = require('fs');
  var html = fs.readFileSync(require('path').join(__dirname,'index.html'),'utf8');
  var i = html.indexOf('function buildSvg(');
  var j = html.indexOf('// ---------- fullscreen overlay ----------', i);
  // Strip line comments first. The comments in buildSvg EXPLAIN the removed
  // rotate(-90), so a raw grep matches the explanation and reports the bug as
  // still present — a false failure that would teach the next person to delete
  // this assertion.
  var body = html.slice(i, j).split('\n')
               .map(function(l){ return l.replace(/\/\/.*$/, ''); }).join('\n');
  ok("buildSvg contains no rotate(-90) counter-rotation on any label",
     body.indexOf('rotate(-90') < 0,
     "found: "+(body.match(/rotate\(-90[^"]*/)||[''])[0]);
  ok("the group itself still rotates when opts.rotated",
     /g\.setAttribute\("transform",\s*"rotate\(90\)/.test(body));
  ok("both label call sites go through labelBaseline",
     (body.match(/labelBaseline\(/g)||[]).length === 2,
     (body.match(/labelBaseline\(/g)||[]).length+" call sites");
})();

// run_tests.sh greps for a line matching ^N passed, M failed — keep this format.
console.log("\nengine source: label=" + L.__source);
console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
