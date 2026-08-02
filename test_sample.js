// ============================================================================
//  test_sample.js — the demo rooms tell the truth.
//
//  A room card advertises "22 rows · 13 boxes" before you tap it. Those figures
//  are written in SAMPLE_ROOMS; the figures the user then sees come from the
//  engine. Nothing connects the two except this file. Change a plank default, a
//  rip rule or a room dimension and the cards would go on quoting the old
//  numbers, confidently and wrongly, with every other suite still green.
//
//  So: run the engine from each card's OWN dimensions and compare.
//
//  This also guards the containment that lets the demo run the real generator.
//  Stage 2 disabled Reshuffle in the demo because egs-floor-progress is a single
//  GLOBAL slot and reshuffle() wrote it unconditionally — a user mid-install who
//  opened the demo out of curiosity and shuffled would have had their real row
//  ticks erased with no warning. Stage 2.5b moved the guard from the BUTTON to
//  the WRITE: saveProgress() returns early in sample mode, so the button can
//  come back. That is only safe while every write still goes through there.
//
//  Run:  node test_sample.js     (or ./run_tests.sh)
// ============================================================================

var fs = require('fs'), path = require('path');
var E  = require('./engine_source.js');
var FL = E.load('fl');
var D  = E.load('deck');
var S  = E.load('sample');

var pass=0, fail=0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok  "+name); }
  else { fail++; console.log("FAIL  "+name+(extra!=null?"  "+extra:"")); }
}

var ROOMS = S.getRooms();
var html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');

// The app's own Setup defaults, read from the HTML rather than retyped — the
// cards inherit these, so if a default moves the cards move with it and this
// suite must follow automatically rather than keep asserting the old world.
function htmlDefault(id){
  var re = new RegExp('id="'+id+'"[^>]*value="([^"]*)"');
  var m = re.exec(html) || new RegExp('value="([^"]*)"[^>]*id="'+id+'"').exec(html);
  return m ? m[1] : null;
}
// "13'-0" -> 156 ; "1/4" -> 0.25 ; "60" -> 60
function measIn(s){
  s = String(s).trim();
  var ft = /^(-?\d+(?:\.\d+)?)'\s*-?\s*(\d+(?:\.\d+)?)?$/.exec(s);
  if (ft) return parseFloat(ft[1])*12 + (ft[2] ? parseFloat(ft[2]) : 0);
  var fr = /^(\d+)\/(\d+)$/.exec(s);
  if (fr) return parseInt(fr[1],10)/parseInt(fr[2],10);
  return parseFloat(s);
}
var DEF = {
  gap:      measIn(htmlDefault('f-gap')),
  plankLen: measIn(htmlDefault('f-plen')),
  plankWid: measIn(htmlDefault('f-pwid')),
  minOff:   measIn(htmlDefault('f-minoff')),
  minReuse: measIn(htmlDefault('f-minreuse')),
  minRip:   measIn(htmlDefault('f-minrip')),
  perBox:   measIn(htmlDefault('f-perbox')),
  rotate:   measIn(htmlDefault('f-rotate'))
};

function mkCfg(lenIn, widIn){
  var gap=DEF.gap, runIn=lenIn-2*gap, acrossIn=widIn-2*gap;
  var W=DEF.plankWid, minRip=DEF.minRip;
  var nRows=Math.ceil(acrossIn/W), edge=(acrossIn-(nRows-2)*W)/2;
  if(nRows>=3 && edge<minRip){ nRows+=1; edge=(acrossIn-(nRows-2)*W)/2; }
  if(nRows<2){ nRows=2; edge=acrossIn/2; }
  var widths=[]; if(nRows===2){ widths=[acrossIn/2,acrossIn/2]; }
  else { widths.push(edge); for(var k=0;k<nRows-2;k++) widths.push(W); widths.push(edge); }
  return { runIn:runIn, acrossIn:acrossIn, plankLen:DEF.plankLen, plankWid:W,
           minOff:DEF.minOff, minReuse:DEF.minReuse, minRip:minRip, gap:gap,
           perBox:DEF.perBox, rotate:DEF.rotate, nRows:nRows, widths:widths, edgeRip:edge };
}

// ===========================================================================
console.log("\nTHE SETUP DEFAULTS THE CARDS INHERIT");
// ===========================================================================
Object.keys(DEF).forEach(function(k){
  ok("f-"+k+" default parsed: "+DEF[k], typeof DEF[k]==='number' && isFinite(DEF[k]) && DEF[k]>0,
     String(DEF[k]));
});
ok("the demo runs the app's own plank, not a size invented for the demo",
   DEF.plankLen===60 && DEF.plankWid===9, DEF.plankLen+"x"+DEF.plankWid);

// ===========================================================================
console.log("\nEVERY CARD'S NUMBERS ARE WHAT THE ENGINE ACTUALLY PRODUCES");
// ===========================================================================
ok("there are three demo rooms", ROOMS.length===3, String(ROOMS.length));
ROOMS.forEach(function(r){
  var lenIn = measIn(r.len), widIn = measIn(r.wid);
  ok(r.key+": dimensions parse ("+r.len+'" x '+r.wid+'")',
     isFinite(lenIn) && isFinite(widIn) && lenIn>0 && widIn>0, lenIn+"x"+widIn);

  var cfg   = mkCfg(lenIn, widIn);
  var cands = FL.generateCandidates(cfg);
  var box   = FL.boxPlan(cands[0].rows, cfg);

  ok(r.key+": card says "+r.rows+" rows", cfg.nRows===r.rows, "engine says "+cfg.nRows);
  ok(r.key+": card says "+r.planks+" planks", box.planks===r.planks, "engine says "+box.planks);
  ok(r.key+": card says "+r.boxes+" boxes", box.boxes===r.boxes, "engine says "+box.boxes);

  // deck size decides whether the card gets a Shuffle button and what the
  // banner claims, so it is advertised too and has to match.
  D.orderDeck(cands.slice());
  ok(r.key+": deck of "+r.deck+" layout"+(r.deck===1?"":"s"),
     D.getDeckSize()===r.deck, "engine says "+D.getDeckSize());
});

// ===========================================================================
console.log("\nTHE ROOMS ARE THE SHAPES WORTH SHOWING");
// ===========================================================================
(function(){
  var ar = ROOMS.map(function(r){ return measIn(r.len)/measIn(r.wid); });
  ok("one of them is a long corridor (>4:1) — the fit-to-screen proof case",
     Math.max.apply(null, ar) > 4, ar.map(function(x){return x.toFixed(1);}).join(', '));
  ok("one of them is roughly square (<1.5:1)",
     Math.min.apply(null, ar) < 1.5, Math.min.apply(null,ar).toFixed(2));
  var sizes = ROOMS.map(function(r){ return measIn(r.len)*measIn(r.wid); });
  ok("and they differ in size by at least 3x",
     Math.max.apply(null,sizes)/Math.min.apply(null,sizes) > 3);
  ok("every room has a distinct key", new Set(ROOMS.map(function(r){return r.key;})).size===3);
  ok("every room has a name to print", ROOMS.every(function(r){ return r.name && r.name.length; }));
})();

// ===========================================================================
console.log("\nA ONE-LAYOUT ROOM IS ADVERTISED HONESTLY");
// ===========================================================================
(function(){
  var single = ROOMS.filter(function(r){ return r.deck === 1; });
  var multi  = ROOMS.filter(function(r){ return r.deck  >  1; });
  ok("at least one demo room supports a real shuffle", multi.length >= 1, String(multi.length));
  // The hallway is the one-layout case. It is NOT a search failure — 16 distinct
  // candidates, two of them 22" apart — but every layout that differs visibly
  // wastes 1.7x the best, so the ceiling refuses them (pinned in test_deck.js).
  // The banner and the button must both reflect that rather than promise a
  // shuffle the user can disprove in one tap.
  if (single.length){
    var i = html.indexOf('function sampleBanner(');
    var body = html.slice(i, html.indexOf('function renderLayout(', i));
    ok("the banner copy branches on deck size",
       /S\.deckSize \|\| 0\) > 1/.test(body));
    ok("...and says there is nothing to shuffle to when there is not",
       /nothing to shuffle to/.test(body));
  } else {
    ok("no single-layout room to check (skipped honestly)", true);
  }
})();

// ===========================================================================
console.log("\nCONTAINMENT IS AT THE WRITE, NOT AT THE BUTTON");
// ===========================================================================
(function(){
  // The whole 2.5b move. If saveProgress() loses its guard, the demo silently
  // starts clobbering a real install's ticks again — and nothing on screen says so.
  var i = html.indexOf('function saveProgress(){');
  var body = html.slice(i, html.indexOf('function doneCount(', i));
  /* Assert the GUARD, not its spelling — and now not its STORAGE either.

     This block has survived two rewrites underneath it, and it is the same
     lesson each time. Stage 3 widened `inSample()` to `isReadOnlyLayout()`;
     pinning the old identifier would have read that strengthening as a break.
     Stage 4 inverted the predicate and moved progress out of localStorage onto
     the area — pinning `setItem(PKEY` would have read THAT as a break too.

     What this suite is actually for has never changed and must not: the demo
     writes nothing. Stage 4's containment assertions moved in `test_area.js`,
     with the reason, because area mode's restriction expired. The demo's did
     not expire and this suite is deliberately the independent proof of it — so
     it checks the guarantee against whatever the mechanism currently is. */
  ok("saveProgress() returns early for a read-only layout",
     /if \(isReadOnlyLayout\(\)\) return;/.test(body));
  ok("...before it reaches any write",
     body.indexOf('isReadOnlyLayout()') < body.indexOf('slot.save'));
  // The predicate must still put the demo on the read-only side of the line.
  var p = html.indexOf('function isReadOnlyLayout(){');
  ok("...and the predicate reads: not an area, not writable",
     /return !inArea\(\);/.test(html.slice(p, p+140)));
  ok("...which excludes the demo, because entering it clears area mode",
     /function showSample\(\)\{[\s\S]{0,200}?areaMode = false; AREA = null;/.test(html));

  // The demo is barred TWICE: by the predicate, and by having no install slot to
  // write through. Only an area is ever handed one.
  var slot = html.indexOf('function installSlot(){');
  ok("the write needs an install slot, and only area mode has one",
     /return \(areaMode && AREA && AREA\.install\) \? AREA\.install : null;/
       .test(html.slice(slot, slot+220)));
  var showSample = html.indexOf('function showSample(){');
  var sbody = html.slice(showSample, html.indexOf('function exitSample', showSample));
  // Grep the ASSIGNMENT, not the word: the body carries a comment about not
  // inheriting a real install's ticks, and matching prose reports a bug that
  // is not there.
  ok("...and showSample nulls AREA rather than supplying one",
     // The lookahead sits OUTSIDE the whitespace on purpose: `\s*(?!null)` is
     // satisfied by backtracking to zero spaces, so it matches everything.
     /AREA = null;/.test(sbody) && !/AREA\s*=(?!\s*null)/.test(sbody)
     && !/\.install\s*=/.test(sbody));

  // Ticking stays off: a demonstration is not something you install from.
  var t = html.indexOf('function toggleRow(n){');
  ok("toggleRow still refuses in a read-only layout",
     /if \(isReadOnlyLayout\(\)\) return;/.test(html.slice(t, t+400)));

  // And the button is no longer hidden — that was the point.
  ok("Reshuffle is no longer gated on !inSample()",
     !/!inSample\(\) && \(S\.deckSize/.test(html));
  ok("...but is still gated on there being more than one layout",
     (html.match(/\(S\.deckSize \|\| 0\) > 1/g)||[]).length >= 2);

  // The demo must never create the store — that would strand legacy data behind
  // shouldMigrate()'s bare jobs.length check. (Stage 2's hard-won lesson.)
  var s = html.indexOf('function stgShowSample(');
  var showBody = html.slice(s, html.indexOf('window.stgSampleRoomLabel', s));
  ok("stgShowSample never touches stagger.store.v1",
     showBody.indexOf('stagger.store.v1') < 0 && showBody.indexOf('storeCommit') < 0);
})();

// run_tests.sh greps for a line matching ^N passed, M failed — keep this format.
console.log("\nengine sources: fl=" + FL.__source + "  sample=" + S.__source);
console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
