// ============================================================================
//  test_area.js — the join. One area's geometry meets the engine.
//
//  This is the step the user's story broke at, and it is deliberately thin: an
//  area supplies two numbers, they go into the SAME Setup fields Quick calc
//  reads, and the SAME generate() runs. There is no per-area cfg builder.
//
//  That matters for what this suite can honestly claim. The plan's hard
//  checkpoint is "a per-area layout must byte-match Quick calc for identical
//  dims". If the two were separate implementations, a passing test would only
//  mean they agreed on the cases tried. Because they are one code path entered
//  from two places, the test below checks the thing that could actually break
//  it: whether the dimension survives the trip through a Setup field intact.
//
//  Verified in-browser as well, which is the authoritative form: SVG (every
//  rect AND every label) and all 15 cut-list rows byte-identical between the
//  area path and Quick calc for 13'x11'.
//
//  Run:  node test_area.js     (or ./run_tests.sh)
// ============================================================================

var fs = require('fs'), path = require('path');
var E  = require('./engine_source.js');
var FL = E.load('fl');
var J  = E.load('areajoin');

var pass=0, fail=0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok  "+name); }
  else { fail++; console.log("FAIL  "+name+(extra!=null?"  "+extra:"")); }
}
var html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');

// ===========================================================================
console.log("\nDISPATCH IS ON bands.length === 1, NOT ON kind");
// ===========================================================================
/* `kind` is 'rect' when bands.length <= 1 — TRUE FOR ZERO BANDS AS WELL AS ONE.
   A shape that produced no bands therefore reads as a rectangle while carrying a
   null `rect`. The codebase has been burned by this before, which is why the
   plan specified the band test explicitly. */
function area(bands, rect, ok_){
  return { name:"A", sqft:100, engineInput:{
    ok: ok_ !== false, kind: (bands.length<=1 ? 'rect' : 'L'),
    profile:{ kind:(bands.length<=1?'rect':'L'), bands:bands }, rect:rect||null } };
}
(function(){
  var oneBand = area([{depthIn:132,runIn:156,runStartIn:0}], {runIn:156,acrossIn:132});
  ok("one band with a rect -> laid", !!J.stgAreaRect(oneBand));
  ok("...and it returns the area's own dimensions",
     J.stgAreaRect(oneBand).runIn===156 && J.stgAreaRect(oneBand).acrossIn===132);

  // THE TRAP: kind lies here.
  var zero = area([], null);
  ok("ZERO bands still reports kind 'rect' (this is the trap)",
     zero.engineInput.kind === 'rect');
  ok("...but is refused, because the dispatch counts bands", J.stgAreaRect(zero)===null);

  /* TWO bands now route to the engine, because the L field is proven: 256
     geometries swept, zero seam breaks, nothing unlayable. THREE still refuse —
     a three-band field has two corners and nothing has swept two corners
     interacting. The refusal retires per shape as each shape is proven, not per
     stage. */
  var L = J.stgAreaField(area([{depthIn:30,runIn:240,runStartIn:0},
                               {depthIn:54,runIn:120,runStartIn:0}], null));
  ok("two bands -> laid as an L", !!L && L.kind === 'L');
  ok("...carrying both bands through to the engine", L.bands.length === 2);
  ok("three bands -> still refused (two corners, unswept)",
     J.stgAreaField(area([{depthIn:9,runIn:99,runStartIn:0},
                          {depthIn:9,runIn:88,runStartIn:0},
                          {depthIn:9,runIn:77,runStartIn:0}], null))===null);
  ok("...and stgAreaRect still answers the narrower question",
     J.stgAreaRect(area([{depthIn:30,runIn:240,runStartIn:0},
                         {depthIn:54,runIn:120,runStartIn:0}], null))===null);

  // Two bands of the SAME run is a rectangle wearing a profile — it must take
  // the rectangle path so it cannot possibly differ from one.
  var flat = J.stgAreaField(area([{depthIn:60,runIn:240,runStartIn:0},
                                  {depthIn:72,runIn:240,runStartIn:0}], null));
  ok("two bands of equal run collapse to the rectangle path",
     !!flat && flat.kind === 'rect');
  ok("...with the depths summed", flat.rect.acrossIn === 132 && flat.rect.runIn === 240,
     JSON.stringify(flat.rect));

  // Belt and braces: one band but no rect payload, and a failed read.
  ok("one band with a NULL rect -> refused (the two agree or nobody lays)",
     J.stgAreaRect(area([{depthIn:1,runIn:1,runStartIn:0}], null))===null);
  ok("engineInput.ok false -> refused",
     J.stgAreaRect(area([{}], {runIn:156,acrossIn:132}, false))===null);
  ok("no engineInput at all -> refused", J.stgAreaRect({name:"A"})===null);
  ok("zero-size rect -> refused",
     J.stgAreaRect(area([{}], {runIn:0,acrossIn:132}))===null);
  ok("negative rect -> refused",
     J.stgAreaRect(area([{}], {runIn:156,acrossIn:-5}))===null);

  // And the source really does test bands, not kind — a future edit that
  // "simplifies" this back to kind==='rect' should fail here, not in the field.
  var i = html.indexOf('function stgAreaField(area){');
  var body = html.slice(i, html.indexOf('function stgShowAreaLayout(', i));
  ok("the dispatch counts bands", /bands\.length === 1/.test(body) && /bands\.length === 2/.test(body));
  ok("...and never dispatches on engineInput.kind",
     !/e\.kind\s*===|\.profile\.kind\s*===/.test(body));
})();

// ===========================================================================
console.log("\nTHE DIMENSION SURVIVES THE TRIP THROUGH A SETUP FIELD");
// ===========================================================================
/* This is what could actually break the byte-match. The area writes its inches
   into a field that DEFAULTS TO FEET; if the written form were ambiguous, or
   were rounded to sixteenths for readability, the engine would receive a
   different room than the one measured — silently, and only for the area path. */
(function(){
  var CASES = [156, 132, 155.5, 131.25, 203.375, 47.5, 288, 96.0625, 1000.5];
  var worst = 0;
  CASES.forEach(function(v){
    var round = J.parseMeas(J.stgInchField(v), "ft");
    if (Math.abs(round - v) > worst) worst = Math.abs(round - v);
  });
  ok("every measured dimension round-trips EXACTLY through the field", worst === 0,
     "worst drift "+worst);

  // Specifically: the field's ft default must not multiply it by twelve.
  ok("155.5\" does not become 1866\" because the field defaults to feet",
     J.parseMeas(J.stgInchField(155.5), "ft") === 155.5,
     String(J.parseMeas(J.stgInchField(155.5), "ft")));
  // And a plain number in that field WOULD have — which is why the inch mark is
  // not decoration.
  ok("...a bare number in the same field is read as FEET (hence the inch mark)",
     J.parseMeas("155.5", "ft") === 1866);

  /* The readable alternative, rejected. Formatting as 12'-11 1/2" reads better
     in the field but snaps to sixteenths, and a drawn area is stored to three
     decimals — so any dimension that is not a multiple of 1/16 would be changed
     before the engine ever saw it. (203.375 IS a multiple of 1/16, which is why
     an earlier version of this assertion picked it and proved nothing.) */
  var notSixteenth = 203.3;
  ok("a real measurement need not land on a sixteenth",
     Math.round(notSixteenth*16)/16 !== notSixteenth);
  ok("...so sixteenth-rounding would silently move the room",
     Math.abs(Math.round(notSixteenth*16)/16 - notSixteenth) > 0.01,
     String(Math.abs(Math.round(notSixteenth*16)/16 - notSixteenth)));
  ok("...while the inch-mark form does not",
     J.parseMeas(J.stgInchField(notSixteenth), "ft") === notSixteenth);
})();

// ===========================================================================
console.log("\nTHE HARD CHECKPOINT — area and Quick calc are ONE code path");
// ===========================================================================
(function(){
  // Structural: showArea must not build its own cfg.
  var i = html.indexOf('function showArea(meta){');
  var body = html.slice(i, html.indexOf('function exitArea(', i));
  ok("showArea calls the shared generate()", /\bgenerate\(\);/.test(body));
  ok("...and builds no cfg of its own", !/nRows\s*=|widths\.push|readInputs\(/.test(body));

  // Behavioural: identical field values in, identical layout out. Reproduces
  // readInputs()'s arithmetic once and drives it from both entry points.
  function cfgFrom(lenIn, widIn){
    var gap=0.25, runIn=lenIn-2*gap, acrossIn=widIn-2*gap, W=9, minRip=2;
    var nRows=Math.ceil(acrossIn/W), edge=(acrossIn-(nRows-2)*W)/2;
    if(nRows>=3 && edge<minRip){ nRows+=1; edge=(acrossIn-(nRows-2)*W)/2; }
    if(nRows<2){ nRows=2; edge=acrossIn/2; }
    var widths=[]; if(nRows===2){ widths=[acrossIn/2,acrossIn/2]; }
    else { widths.push(edge); for(var k=0;k<nRows-2;k++) widths.push(W); widths.push(edge); }
    return { runIn:runIn, acrossIn:acrossIn, plankLen:60, plankWid:W, minOff:16,
             minReuse:20, minRip:minRip, gap:gap, perBox:8, rotate:4,
             nRows:nRows, widths:widths, edgeRip:edge };
  }
  var ROOMS = [[156,132],[240,192],[288,48],[155.5,131.25],[203.375,97.5],[120,7]];
  var mismatches = [];
  ROOMS.forEach(function(r){
    // area path: inches -> field string -> parser -> cfg
    var a = cfgFrom(J.parseMeas(J.stgInchField(r[0]),"ft"), J.parseMeas(J.stgInchField(r[1]),"ft"));
    // quick calc: the same numbers typed as feet-and-inches
    var q = cfgFrom(r[0], r[1]);
    if (E.digest(FL.generateCandidates(a)) !== E.digest(FL.generateCandidates(q)))
      mismatches.push(r.join('x'));
  });
  ok("every room byte-matches between the area path and Quick calc",
     mismatches.length === 0, mismatches.join(', '));

  // The three demo rooms must land on their existing goldens through the area
  // path too — if the join changed what the engine produces, this is where it shows.
  var GOLD = { '156x132':'4feb4d8193f9986c', '240x192':'a2a234d87999ff3f',
               '288x48':'309ec2a3ee61e15a' };
  Object.keys(GOLD).forEach(function(k){
    var d = k.split('x').map(Number);
    var cfg = cfgFrom(J.parseMeas(J.stgInchField(d[0]),"ft"), J.parseMeas(J.stgInchField(d[1]),"ft"));
    ok("the area path reproduces the "+k+" golden exactly",
       E.digest(FL.generateCandidates(cfg)) === GOLD[k], E.digest(FL.generateCandidates(cfg)));
  });
})();

// ===========================================================================
console.log("\nAN AREA IS THE ONE THING YOU INSTALL FROM  (was: NOTHING IS PERSISTED)");
// ===========================================================================
/* RE-GOLDENED AT STAGE 4, ON PURPOSE. Read this before "fixing" it back.

   Stage 3 shipped an area layout read-only, and this block asserted exactly
   that: the join persisted nothing, wrote no progress, and left row ticking off.
   Those assertions were right for the reason they gave — progress had nowhere to
   live. `egs-floor-progress` was one global localStorage slot for the whole app,
   so a per-area write could only overwrite whatever floor the user was actually
   laying. The restriction was a consequence of the storage, not a view about
   what an area should be.

   Stage 4 gave progress somewhere to live: a record ON the area, in the job
   store, fingerprinted to the layout it was made against. The reason expired, so
   the assertions expire with it — and they invert rather than relax. Area mode
   is now the ONLY mode that writes. What must not move is the OTHER half of the
   containment, which is `test_sample.js`'s: the demo still writes nothing, and
   that suite was left to prove it independently of this one.

   The old assertions, and what replaced each:
     "one predicate covers both read-only layouts"  -> the predicate now names
        area mode as the exception, so it is asserted from the other side.
     "the join never persists to the store"         -> the join now persists, via
        exactly one adapter; asserted as "only through the adapter".
     "still exactly one writer of the progress key" -> there is no key. Asserted
        as "the key is gone from the file entirely".                            */
(function(){
  var p = html.indexOf('function isReadOnlyLayout(){');
  ok("the predicate is inverted: read-only unless you are in an area",
     /return !inArea\(\);/.test(html.slice(p, p+140)));

  // The guards themselves did NOT change — that is the point of one predicate.
  var s = html.indexOf('function saveProgress(){');
  ok("saveProgress() still asks the one predicate", /if \(isReadOnlyLayout\(\)\) return;/
     .test(html.slice(s, html.indexOf('function doneCount(', s))));
  var t = html.indexOf('function toggleRow(n){');
  ok("toggleRow() still asks the one predicate",
     /if \(isReadOnlyLayout\(\)\) return;/.test(html.slice(t, t+400)));

  /* The global slot is not merely unused, it is gone. Counting the STRING would
     count the comments explaining why it went — which is prose, and prose is not
     the thing that can break. What can break is a live read or write reappearing,
     so that is what is asserted, plus the disappearance of the identifier that
     used to carry it. */
  ok("no PKEY variable survives anywhere in the file", html.indexOf('PKEY') < 0);
  ok("nothing reads or writes the old global slot",
     !/localStorage\.(getItem|setItem)\(\s*["']egs-floor-progress/.test(html));
  ok("...it is only ever removed, once",
     (html.match(/removeItem\("egs-floor-progress"\)/g)||[]).length === 1);

  // Rows are tappable again — in an area, and only there. The affordance and the
  // handler still travel together, which is what stops a row that looks live
  // from doing nothing.
  ok("the tap affordance is still tied to the predicate",
     /isReadOnlyLayout\(\) \? "" : " fl-tapzone"/.test(html));
  ok("...and the handler with it",
     /if \(!isReadOnlyLayout\(\)\) row\.addEventListener/.test(html));

  // Reshuffle was never the containment point and still is not.
  ok("Reshuffle is not gated on area mode", !/inArea\(\) && \(S\.deckSize/.test(html));

  // The join persists — through the adapter, and nowhere else. What it must
  // still not touch is the pin: that is Stage 5's, and a layout being installed
  // is not the same as a layout being chosen.
  var j = html.indexOf('function stgShowAreaLayout(i){');
  var jbody = html.slice(j, html.indexOf('/* The refusal.', j));
  ok("the join hands the area an install slot",
     /install\s*:\s*stgInstallSlot\(area\)/.test(jbody));
  ok("...and still never writes area.pinned", jbody.indexOf('.pinned') < 0);

  // One adapter, bound to the area OBJECT. Binding to the index `i` would file
  // the next tick against whichever floor had shifted into that slot.
  var k = html.indexOf('function stgInstallSlot(area){');
  var kbody = html.slice(k, html.indexOf('function stgShowAreaLayout(', k));
  ok("the adapter reads and writes through store.js, not by hand",
     /StaggerStore\.readInstall\(area, fp\)/.test(kbody)
     && /StaggerStore\.setInstall\(area, fp, doneRows\)/.test(kbody));
  ok("...and commits through persist(), the same door as every other job write",
     /persist\(\);/.test(kbody));
  ok("...and closes over the area object, never its index",
     kbody.indexOf('JOB.areas[') < 0);
})();

// ===========================================================================
console.log("\nL-SHAPES REFUSE HONESTLY");
// ===========================================================================
(function(){
  var i = html.indexOf('function stgAreaRefusal(area){');
  // Strip comments: the block carries a note QUOTING the old, now-false line so
  // nobody reinstates it, and a raw grep matches the quotation and reports the
  // bug as still present. Same trap as the rotate(-90) assertion in test_labels.
  // Strip BLOCK comments whole, not line-by-line: a continuation line inside a
  // /* */ run does not start with a marker, so a per-line filter leaves it in.
  var body = html.slice(i, html.indexOf('// The one way back', i))
                 .replace(/\/\*[\s\S]*?\*\//g, '')
                 .replace(/\/\/.*$/gm, '');

  ok("the band count is interpolated, not hardcoded",
     /bands \+ " bands"/.test(body) && !/"2 bands"/.test(body));
  ok("it says what it would cost to fake it", /over-count the boards by more than 40%/.test(body));
  ok("it says the workaround was tried and measured", /one L in\s*\n?\s*"?\s*\+?\s*"?twenty/.test(body));
  // It must not claim a capability the app no longer lacks. The previous copy
  // said "Stagger lays rectangles for now", which stopped being true the moment
  // two bands started laying — a refusal that misstates the app is worse than a
  // blunt one.
  ok("it does NOT claim rectangles are the limit", !/lays rectangles for now/.test(body));
  ok("...and it says what IS laid", /lays a single step/.test(body));
  // NB: the copy is a concatenation in source, so match a fragment that does not
  // span a `+` boundary — an earlier version failed on the join, not the text.
  ok("it reassures about what is NOT lost",
     /measurements and square footage/.test(body));

  // Promises nothing: no date, no version, no "soon".
  ok("it promises no date or version",
     !/\bsoon\b|\bnext (release|version)\b|\bv[0-9]|\bQ[1-4]\b|coming in/i.test(body));

  // And the button that was scoped out stays scoped out.
  ok("no [Split this area] button ships", !/Split this area/.test(html));

  // The refusal must not navigate — it explains where the user already is.
  ok("the refusal does not switch screens",
     body.indexOf('switchScreen') < 0 && body.indexOf('FL.showArea') < 0);
})();

// ===========================================================================
console.log("\nTHE LAYOUT VIEW SURVIVED THE RE-HOST");
// ===========================================================================
(function(){
  // Stage 2.5a/3692d90 and the 0734 rotated-label fix both have to hold at the
  // new mount. Verified live in both themes (55 labels, 0 clipped, 0/90 deg);
  // these guard the code they depend on.
  ok("the inline view still sets no width attribute (fit-to-screen)",
     !/scroll\.appendChild[\s\S]{0,200}setAttribute\("width"/.test(html));
  // The glyph is escaped in source (\u21bb), so match the escape, not the char.
  ok("the overlay still has Rotate", /\\u21bb Rotate/.test(html));
  ok("labels still ride the group rotation (no counter-rotation)",
     html.slice(html.indexOf('function buildSvg('),
                html.indexOf('// ---------- fullscreen overlay ----------'))
         .split('\n').map(function(l){ return l.replace(/\/\/.*$/,''); }).join('\n')
         .indexOf('rotate(-90') < 0);
  ok("the area badge mounts on BOTH the layout and the cut list",
     (html.match(/else if \(inArea\(\)\) body\.appendChild\(areaBanner\(cfg\)\);/g)||[]).length === 2);
  ok("the badge names the parameters it used",
     /From Setup: /.test(html) && /One plank size applies to every area for now/.test(html));
  ok("...and the join closes the jobs overlay before showing the layout",
     /stgCloseJobs\(\);[\s\S]{0,900}FL\.showArea/.test(html));
})();

// run_tests.sh greps for a line matching ^N passed, M failed — keep this format.
console.log("\nengine sources: fl=" + FL.__source + "  areajoin=" + J.__source);
console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
