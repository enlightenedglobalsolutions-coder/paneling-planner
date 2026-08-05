// ============================================================================
//  test_diagram.js — the paneling drawing shows the WHOLE ceiling.
//
//  THE BUG THIS COMES FROM. A 29-row pine job drew ten rows, under a footer
//  reading "10 of 29 rows", directly above a cut list of twenty-nine. Nothing
//  crashed, nothing was logged, and no suite compared the two numbers — so a
//  self-contradiction sat on one screen until somebody standing under the
//  ceiling noticed.
//
//  It was two clamps compounding: `Math.min(showRows || rowJoints.length, 10)`
//  inside drawDiagram, and the on-screen caller passing 10 on top. THE HARD CAP
//  ALSO HIT PRINT AND EXPORT — both pass inp.rows and both got ten anyway, which
//  is a sheet you carry up a ladder covering a third of the job. That is the
//  half nobody had seen, and it is why the assertions below cover all three call
//  paths rather than the screen alone.
//
//  The rule being pinned: drawn row count === cut list row count, ALWAYS. Rows
//  compress; they never disappear.
//
//  Run:  node test_diagram.js     (or ./run_tests.sh)
// ============================================================================

var fs = require('fs'), path = require('path');
var E = require('./engine_source.js');
var D = E.load('paneldiag');
var P = E.load('panel');

var pass=0, fail=0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok  "+name); }
  else { fail++; console.log("FAIL  "+name+(extra!=null?"  "+extra:"")); }
}
var html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');

// The real pine job.
var RUN=261.75, OC=24, OFF=18, STOCK=144, ROWS=29;
var TRUSSES = P.buildTrusses(RUN, OFF, OC);
function inpFor(rows){ return { runIn:RUN, trusses:TRUSSES, offset:OFF, rows:rows, unitRows:1 }; }
function layout(n){ var a=[]; for(var r=0;r<n;r++) a.push([1+(r%5), 7]); return a; }
function heightOf(svg){ return Number(/viewBox="0 0 320 ([0-9.]+)"/.exec(svg)[1]); }

// ===========================================================================
console.log("\nEVERY ROW, AT EVERY SIZE");
// ===========================================================================
(function(){
  // The reported case first, by name, so a failure reads as the bug returning.
  var svg = D.drawDiagram(inpFor(ROWS), layout(ROWS), null);
  ok("the 29-row pine job draws 29 rows", D.diagRowCount(svg)===ROWS, D.diagRowCount(svg));
  ok("...and the footer no longer says '10 of 29'", !/\d+ of \d+ rows/.test(svg),
     (/\d+ of \d+ rows/.exec(svg)||[])[0]);
  ok("...it states a plain count instead", />29 rows</.test(svg));

  // A spread either side of every threshold in the sizing.
  [1,2,5,9,10,11,22,23,29,30,47,60,99,120,240].forEach(function(n){
    var s = D.drawDiagram(inpFor(n), layout(n), null);
    ok("rows="+n+": draws all "+n, D.diagRowCount(s)===n, D.diagRowCount(s));
  });
})();

// ===========================================================================
console.log("\nROWS COMPRESS; THEY NEVER DISAPPEAR");
// ===========================================================================
/* Edwin's rule 1: the whole ceiling, compressed to whatever fits, even if each
   row is a thin line. So the thing that gives is the row HEIGHT, and it has to
   keep giving without ever letting the drawing run away down the page. */
(function(){
  /* THE BUDGET AND THE LEGIBILITY FLOOR CONFLICT, AND THE FLOOR WINS.

     Below RH_MIN a row is not a thin line, it is nothing — so past roughly 145
     rows the drawing is allowed to exceed the height budget and scroll rather
     than render rows nobody can see. That is rule 1's own priority: a partial
     drawing is worse than none, and an invisible row is a partial drawing by
     another route. The contract is therefore "fits the budget OR is already at
     the floor", and both halves are asserted so neither can quietly become the
     excuse for the other. */
  var MAXH = D.getScreenH();
  [23,29,40,60,120,145,240,600].forEach(function(n){
    var h = heightOf(D.drawDiagram(inpFor(n), layout(n), null));
    var atFloor = D.diagRowHeight(n) <= D.getRhMin() + 1e-9;
    ok("rows="+n+": fits the "+MAXH+" budget, or is at the legibility floor",
       h <= MAXH+0.5 || atFloor, "height "+h+(atFloor?" (at floor)":""));
  });
  ok("the budget holds for every realistic ceiling (<=145 rows)",
     [23,29,60,100,145].every(function(n){
       return heightOf(D.drawDiagram(inpFor(n), layout(n), null)) <= MAXH+0.5; }));
  ok("row height never drops below the legibility floor",
     D.diagRowHeight(1000) >= D.getRhMin(), D.diagRowHeight(1000));
  ok("...and never grows past the original 16",
     D.diagRowHeight(1) === D.getRhMax(), D.diagRowHeight(1));
  // Monotonic: more rows must never produce a TALLER row.
  var prev = Infinity, mono = true;
  for (var n=1;n<=200;n++){ var rh=D.diagRowHeight(n); if (rh>prev+1e-9) mono=false; prev=rh; }
  ok("row height is monotonic in row count", mono);

  /* Jobs that fitted before must be untouched — the fix is allowed to change
     tall ceilings and nothing else. 22 rows is the last size that still divides
     into the budget above RH_MAX. */
  ok("jobs up to 22 rows still render at exactly the old 16px",
     [1,5,10,15,20,22].every(function(n){ return D.diagRowHeight(n)===16; }));
})();

// ===========================================================================
console.log("\nALL THREE CALL PATHS — screen, print, export");
// ===========================================================================
/* The clamp was inside drawDiagram, so print and export asked for 29 and got
   ten. Asserting the screen alone would have missed the worse half. */
(function(){
  ok("no call site can ask for a partial ceiling any more",
     !/drawDiagram\([^)]*,\s*(10|inp\.rows)\s*\)/.test(html),
     (/drawDiagram\([^)]*,\s*(?:10|inp\.rows)\s*\)/.exec(html)||[])[0]);
  /* Comments stripped first. The block above drawDiagram explains what the old
     `showRows` parameter did and why it went, so a raw grep for the identifier
     matches the explanation and reports the parameter as still present — the
     same trap engine_source's purity check and test_area's refusal grep both
     record. Strip, then look at the code. */
  var code = E.stripComments(html);
  ok("the hard 10-row cap is gone from the code",
     !/Math\.min\([^)]*showRows/.test(code) && code.indexOf('showRows') < 0,
     (/[^\n]*showRows[^\n]*/.exec(code)||[])[0]);

  /* FOUR call sites now — the fullscreen overlay joined screen, print and
     export. Counting them was the first version of this assertion and it broke
     the moment the overlay landed, which is the tell that a count is the wrong
     question. What matters is that each one asks for a COMPLETE ceiling, and
     that the two kinds of budget go to the right places: the inline card
     compresses to fit a phone, everything you actually work from does not. */
  var calls = (html.match(/drawDiagram\(inp, STATE\.rowJoints, STATE\.rowStock/g)||[]).length;
  ok("every drawDiagram call site is accounted for", calls===4, calls+" call sites");
  var screenCall = /drawDiagram\(inp, STATE\.rowJoints, STATE\.rowStock\)/.test(html);
  ok("the inline card takes the compressing screen budget", screenCall);

  // Print is allowed a taller budget — paper is not a phone — but it is still
  // every row, and it must not silently become the screen's.
  var printSvg = D.drawDiagram(inpFor(ROWS), layout(ROWS), null, {maxHeight:D.getPrintH()});
  ok("print draws every row too", D.diagRowCount(printSvg)===ROWS, D.diagRowCount(printSvg));
  ok("...at full row height, because paper is not a phone",
     D.diagRowHeight(ROWS, D.getPrintH()) === D.getRhMax());
  ok("...and the print budget is genuinely larger than the screen's",
     D.getPrintH() > D.getScreenH());
  /* Print, export AND the fullscreen overlay all take the taller budget. The
     overlay is the one you zoom into on a ladder, so compressing it to phone
     height would defeat the point of opening it. */
  ok("print, export and the overlay all pass the print budget",
     (html.match(/drawDiagram\([^)]*maxHeight:DIAG_H_PRINT/g)||[]).length===3,
     (html.match(/drawDiagram\([^)]*maxHeight:DIAG_H_PRINT/g)||[]).length+" of 3");
})();

// ===========================================================================
console.log("\nTHE DRAWING AND THE CUT LIST CANNOT DISAGREE  (Edwin's rule 3)");
// ===========================================================================
(function(){
  // Agreement is the normal case and must be silent.
  var good = D.drawDiagram(inpFor(ROWS), layout(ROWS), null);
  ok("when they agree, nothing is said", !/do not use/.test(good));

  /* Disagreement is shouted, ON the drawing, where somebody comparing the two
     is already looking. Reproduce the exact shape of the shipped bug: a layout
     of ten handed in against a cut list of twenty-nine. */
  var bad = D.drawDiagram(inpFor(29), layout(10), null);
  ok("a short layout against a 29-row cut list is called out",
     /do not use/.test(bad));
  ok("...naming both numbers, so it is checkable rather than vague",
     /drawing shows 10 rows, cut list expects 29/.test(bad.replace(/<[^>]*>/g,'')));
  ok("...and the warning is INSIDE the viewBox, not clipped away",
     (function(){
       var y = Number(/<rect x="0" y="([0-9.]+)"/.exec(bad)[1]);
       return y + 13 <= heightOf(bad);
     })());
  ok("...and the drawing still shows what it actually has, not a lie",
     D.diagRowCount(bad)===10);

  // The counter is what the tests trust, so prove it counts rows and not
  // whatever else the renderer happens to emit as a rect.
  ok("diagRowCount ignores the warning band's own rect",
     D.diagRowCount(bad)===10 && (bad.match(/<rect /g)||[]).length===11);
  ok("diagRowCount returns 0 for an empty ceiling",
     D.diagRowCount(D.drawDiagram(inpFor(0), [], null))===0);

  // And the whole point: a real generated layout, checked end to end.
  P.setLongestStock(STOCK);
  var opts = P.generateOptions(TRUSSES, RUN, STOCK, ROWS);
  opts.forEach(function(o,i){
    var s = D.drawDiagram(inpFor(ROWS), o.rowJoints, null);
    ok("generated option "+(i+1)+": drawn rows === cut list rows",
       D.diagRowCount(s) === o.rowJoints.length && o.rowJoints.length === ROWS,
       D.diagRowCount(s)+" drawn vs "+o.rowJoints.length+" in the cut list");
    ok("...and it carries no mismatch warning", !/do not use/.test(s));
  });
})();

// ===========================================================================
console.log("\nTHE DRAWING STAYS READABLE AS IT COMPRESSES");
// ===========================================================================
/* Compressing is the trade Edwin asked for, but it must degrade cleanly rather
   than turn into a smear of overlapping text. Labels drop out when there is no
   longer room for them; the seams never do, because the seams are the drawing. */
(function(){
  function joints(svg){ return (svg.match(/<line [^>]*stroke-width="[0-9.]+"\/>/g)||[]).length; }
  var tall = D.drawDiagram(inpFor(120), layout(120), null);
  ok("at 120 rows the row letters are dropped", !/text-anchor="end"[^>]*>[A-Z]+</.test(tall));
  ok("...but every seam is still drawn",
     joints(tall) >= 120, joints(tall)+" joint marks");
  ok("...and every row bar too", D.diagRowCount(tall)===120);

  var normal = D.drawDiagram(inpFor(10), layout(10), null);
  ok("at 10 rows the letters are still there", /font-size="7\.0"|font-size="7"/.test(normal));

  /* MULTI-LETTER ROW NAMES MUST FIT. Found by looking at the drawing, not by a
     test: a 29-row ceiling reaches AA/AB/AC, and at the old fixed 10-unit gutter
     those were right-aligned at x=7 and ran off the left edge of the viewBox.
     The last three rows of the job silently lost their labels — the rows
     somebody is squinting at when they get to the end. */
  function minLabelX(svg){
    var m = svg.match(/<text x="([0-9.-]+)"[^>]*text-anchor="end"/g) || [];
    return m.reduce(function(lo,t){
      var v = parseFloat(/x="([0-9.-]+)"/.exec(t)[1]); return v<lo?v:lo; }, Infinity);
  }
  [10,26,27,29,60].forEach(function(n){
    var svg = D.drawDiagram(inpFor(n), layout(n), null);
    var name = D.rowName(n-1);
    // Right-aligned text extends LEFT of its x by roughly its width.
    var needed = name.length * 5.2 * 0.62;
    ok("rows="+n+" (last row "+name+"): its label fits inside the viewBox",
       minLabelX(svg) - needed >= -0.5, "labelX "+minLabelX(svg)+", needs "+needed.toFixed(1));
  });
  ok("the gutter only widens when it has to",
     minLabelX(D.drawDiagram(inpFor(26), layout(26), null))
     < minLabelX(D.drawDiagram(inpFor(27), layout(27), null)));

  // No text may be emitted at a size nobody can read.
  var sizes = (tall.match(/font-size="([0-9.]+)"/g)||[]).map(function(m){
    return Number(/([0-9.]+)/.exec(m)[1]); });
  ok("no text is emitted below 4px", sizes.every(function(v){ return v>=4; }),
     Math.min.apply(null, sizes)+"px smallest");
})();

// ===========================================================================
console.log("\nTHE FULLSCREEN PAGE  (Edwin's rule 2 — paneling gets parity)");
// ===========================================================================
/* Source-level, because the overlay is DOM and gesture code that cannot be
   sliced. What is checkable here is that paneling reaches the SAME component the
   rule asks for parity with, rather than a second copy of it. */
(function(){
  var code = E.stripComments(html);

  ok("a shared DrawingOverlay component exists", /var DrawingOverlay = \(function\(\)\{/.test(code));
  ok("the paneling diagram opens it", /DrawingOverlay\.open\(\{/.test(code));
  ok("...on tap", /dw\.addEventListener\("click", openPanelOverlay\)/.test(code));
  ok("...and from the keyboard, so it is not mouse-only",
     /dw\.addEventListener\("keydown"/.test(code));
  ok("...with the affordance visible rather than hidden knowledge",
     /Tap the drawing to zoom and rotate/.test(html) && /diagwrap tappable/.test(code));

  // Parity means the same three controls the flooring overlay offers.
  ok("the overlay offers Close, Rotate and Fit",
     /"✕ Close"/.test(code) && /"↻ Rotate"/.test(code) && /"Fit"/.test(code));
  ok("...and pinch-zoom and pan",
     /pointerdown/.test(code) && /pointermove/.test(code) && /Math\.hypot/.test(code));

  /* THE POINT OF A COMPONENT. Exactly one pinch-zoom implementation may exist,
     or the two drift and only one of them gets the next fix. The flooring
     overlay is not migrated yet — filed, and deliberately not rolled into this
     change — so today there are two `Math.hypot` gesture blocks. This asserts it
     does not become three, and will need updating to 1 when flooring migrates. */
  var pinches = (code.match(/startDist = Math\.hypot/g)||[]).length;
  ok("pinch-zoom is implemented at most twice (flooring's migration is filed)",
     pinches <= 2, pinches+" implementations");

  ok("the overlay binds its gestures once, not per open",
     /if \(bound\) return;/.test(code));

  /* TWO BUGS FOUND IN THE BROWSER, BOTH SILENT. Neither threw, neither logged,
     and the suite was green for both — they were only visible by measuring the
     rendered box. Pinned here because they are the kind that come back. */

  // 1. `rotate(90)` without a unit is INVALID CSS, and an invalid value voids
  //    the WHOLE transform declaration. The drawing lost its transform entirely
  //    on rotate and fell back to the stylesheet's full width.
  /* Scoped to the overlay, NOT the whole file: `rotate(90)` without a unit is
     correct in an SVG transform ATTRIBUTE — SVG has no units there — and the
     flooring renderer uses it legitimately. It is only invalid in a CSS
     transform, which is what this component writes. A global grep would have
     condemned working code elsewhere. */
  var ovBody = code.slice(code.indexOf("var DrawingOverlay = (function(){"),
                          code.indexOf("function diagRowCount(svg){"));
  ok("rotation carries its unit — bare rotate(90) voids the whole CSS transform",
     /rotate\(90deg\)/.test(ovBody) && !/rotate\(90\)/.test(ovBody));
  ok("...and it turns the drawing rather than asking the device",
     !/screen\.orientation\.lock/.test(code));

  // 2. The element is sized to the drawing's OWN dimensions. Sizing it to
  //    contentSize() — already swapped when rotated — and then rotating swaps
  //    twice: it came out 582x938 where it should have been 938x582.
  ok("the element is sized from cfg, not from the rotated footprint",
     /var c = \{ w: OV\.cfg\.contentW, h: OV\.cfg\.contentH \};/.test(code));
  ok("...while contentSize() stays the swapped one, for Fit",
     /return OV\.rotated \? \{ w:c\.contentH, h:c\.contentW \}/.test(code));

  // 3. Inline styles, because a width ATTRIBUTE loses to `svg.dg{width:100%}`
  //    in the stylesheet. The flooring overlay never hit this only because its
  //    SVGs carry no such class — an accident a shared component must not rely on.
  ok("the overlay sizes with inline styles, immune to the caller's CSS",
     /svg\.style\.width\s*=\s*c\.w \+ "px"/.test(code)
     && /svg\.style\.height\s*=\s*c\.h \+ "px"/.test(code));
  ok("...which is needed because svg.dg really does set width:100%",
     /svg\.dg\{[^}]*width:100%/.test(html));

  // It must show the whole ceiling too — a fullscreen view of a truncated
  // drawing would be the original bug with more pixels.
  ok("the overlay draws every row, at the print budget",
     /svg: drawDiagram\(inp, STATE\.rowJoints, STATE\.rowStock, \{maxHeight:DIAG_H_PRINT\}\)/.test(code));
  ok("...and its footer states the row count",
     /STATE\.rowJoints\.length \+ " rows/.test(code));
})();

// run_tests.sh greps for a line matching ^N passed, M failed — keep this format.
console.log("\nengine sources: paneldiag=" + D.__source + "  panel=" + P.__source);
console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
