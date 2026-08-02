// ============================================================================
//  test_install.js — per-area install progress. Stage 4.
//
//  THE MOVE THIS SUITE GUARDS
//  An install belongs to a floor. Until Stage 4 the app could only hold one at
//  a time: `egs-floor-progress` was a single global localStorage slot holding
//  {fp, done} for whichever layout was last on screen. Every other mode had to
//  be forbidden from writing to it, because a write from anywhere could only
//  overwrite the floor the user was actually laying. Progress now lives ON the
//  area, in the job store, and the containment model inverts with it: area mode
//  is the ONE mode that writes, and Quick calc and the demo never do.
//
//  WHAT IS EXECUTABLE AND WHAT IS GREPPED, AND WHY
//  The record mechanics (store.js) and the whole read/write path (the `install`
//  slice of index.html) are RUN, not read — Stage 4 took localStorage out of
//  that path, which is what made it sliceable in the first place. What cannot
//  be run is the mode ENTRY points: showSample/showArea call generate(), which
//  renders. Those are asserted from source. The split matters: the executable
//  half proves the mechanism is right, the source half proves the real entries
//  reach it. Neither is sufficient alone, and the accessors in engine_source's
//  `install` spec are test-only doors that would happily lie if the entries
//  drifted — which is precisely what the source half is there to catch.
//
//  Run:  node test_install.js     (or ./run_tests.sh)
// ============================================================================

var fs = require('fs'), path = require('path');
var E  = require('./engine_source.js');
var I  = E.load('install');
var S  = require('./store.js');
var M  = require('./migrate_jobs.js');

var pass=0, fail=0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok  "+name); }
  else { fail++; console.log("FAIL  "+name+(extra!=null?"  "+extra:"")); }
}
var html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');

// A job with two areas — because "two floors half-laid at once" is the thing
// the old global slot could not express, and the first thing worth proving.
function twoAreaJob(){
  var st = S.emptyStore();
  var j  = S.createJob(st, "Renovation");
  return { store:st, job:j,
           kitchen: S.createArea(st, j.id, "Kitchen"),
           hall:    S.createArea(st, j.id, "Hall") };
}

// ===========================================================================
console.log("\nTWO FLOORS CAN BE HALF-LAID AT ONCE");
// ===========================================================================
(function(){
  var w = twoAreaJob();
  ok("a fresh area carries an install field, empty",
     'install' in w.kitchen && w.kitchen.install === null);

  S.setInstall(w.kitchen, "FP-K", [1,2,3]);
  S.setInstall(w.hall,    "FP-H", [1]);

  // The whole point of the move. Under the old global slot the second write
  // erased the first, and nothing on screen said so.
  ok("ticking the hall leaves the kitchen alone",
     S.readInstall(w.kitchen, "FP-K").join(",") === "1,2,3");
  ok("...and the hall keeps its own",
     S.readInstall(w.hall, "FP-H").join(",") === "1");

  // Written whole, sorted, so an exported backup is readable and two backups
  // diff into "these rows got laid".
  S.setInstall(w.kitchen, "FP-K", [7,2,9]);
  ok("rows are stored sorted", w.kitchen.install.done.join(",") === "2,7,9");
  ok("...and the record names the layout it belongs to", w.kitchen.install.fp === "FP-K");
  ok("...and when it was touched", typeof w.kitchen.install.updatedAt === "number");

  // Progress rides in the job export, because it is job data now.
  var round = JSON.parse(S.exportJob(w.store, w.job.id));
  ok("progress survives an export/import round trip",
     round.jobs[0].areas[0].install.done.join(",") === "2,7,9");
})();

// ===========================================================================
console.log("\nTHE FINGERPRINT IS THE SAFETY, AND STALE IS NOT DELETED");
// ===========================================================================
(function(){
  var w = twoAreaJob();
  S.setInstall(w.kitchen, "FP-A", [1,2,3,4]);

  // Row numbers mean nothing without the layout they were made on: shuffle the
  // deck and "row 4" is a different set of cuts.
  ok("a record for another layout reads as no progress",
     S.readInstall(w.kitchen, "FP-B").length === 0);
  ok("...and is reported as stale rather than as absent",
     S.installIsStale(w.kitchen, "FP-B") === true);
  ok("...while the matching layout is not stale",
     S.installIsStale(w.kitchen, "FP-A") === false);

  // NOT deleted. This is what makes a reshuffle survivable — see below.
  ok("reading against the wrong layout does not destroy the record",
     w.kitchen.install.done.join(",") === "1,2,3,4");

  // An empty record is a real state (you cleared your progress), distinct from
  // never having laid anything, and it must not read as stale.
  S.setInstall(w.hall, "FP-A", []);
  ok("a cleared record is not stale", S.installIsStale(w.hall, "FP-B") === false);
  ok("an area with no record at all reads empty", S.readInstall(S.createArea(
       w.store, w.job.id, "Den"), "FP-A").length === 0);

  // The engine's fingerprint must actually separate two layouts of one room,
  // or none of the above does anything.
  var cfg  = { runIn:156, acrossIn:132, plankLen:60, plankWid:9, nRows:15 };
  var candA = { rows:[{start:0},{start:20},{start:40}] };
  var candB = { rows:[{start:0},{start:24},{start:48}] };
  ok("the fingerprint separates two layouts of the same room",
     I.fingerprint(cfg, candA) !== I.fingerprint(cfg, candB));
  ok("...and is stable for the same one",
     I.fingerprint(cfg, candA) === I.fingerprint(cfg, candA));
  ok("...and separates two rooms with the same starts",
     I.fingerprint(cfg, candA) !== I.fingerprint(
       { runIn:157, acrossIn:132, plankLen:60, plankWid:9, nRows:15 }, candA));
})();

// ===========================================================================
console.log("\nCONTAINMENT INVERTS: AREA MODE IS THE ONE THAT WRITES");
// ===========================================================================
(function(){
  // A recording adapter — the same shape block 3 hands in.
  function slot(rec){
    return { load:function(fp){ return (rec.fp===fp) ? rec.done.slice() : []; },
             save:function(fp, rows){ rec.fp=fp; rec.done=rows.slice(); rec.writes++; } };
  }

  var rec = { fp:null, done:[], writes:0 };
  I.setState({ cfg:{nRows:6}, fp:"FP-1", done:{1:true,2:true} });

  I.enterQuickCalc();
  ok("Quick calc is read-only", I.isReadOnlyLayout() === true);
  I.saveProgress();
  ok("...and writes nothing", rec.writes === 0);
  ok("...because it has no install slot at all", I.installSlot() === null);

  I.enterSample();
  ok("the demo is read-only", I.isReadOnlyLayout() === true);
  I.saveProgress();
  ok("...and writes nothing", rec.writes === 0);
  ok("...and is handed no slot either", I.installSlot() === null);

  I.enterArea({ name:"Kitchen", install:slot(rec) });
  ok("an area is NOT read-only — this is the inversion", I.isReadOnlyLayout() === false);
  I.saveProgress();
  ok("...and it writes", rec.writes === 1 && rec.done.join(",") === "1,2");
  ok("...against the layout on screen", rec.fp === "FP-1");

  // Belt and braces: even inside area mode, an area handed no adapter writes
  // nothing rather than throwing. A missing slot is a layout with nowhere to
  // write, which is a state, not a crash.
  I.enterArea({ name:"No slot" });
  ok("area mode with no adapter is a no-op, not an error", (function(){
    try { I.saveProgress(); return true; } catch(e){ return false; }
  })());
  ok("...and loads empty", Object.keys(I.loadProgress("FP-1")).length === 0);

  // An adapter that throws must not take the app down mid-install.
  I.enterArea({ name:"Broken", install:{ load:function(){ throw new Error("x"); },
                                         save:function(){ throw new Error("x"); } } });
  ok("a throwing adapter is swallowed on load",
     Object.keys(I.loadProgress("FP-1")).length === 0);
  ok("...and on save", (function(){
    try { I.saveProgress(); return true; } catch(e){ return false; }
  })());
})();

// ===========================================================================
console.log("\nEVERY ENTRY SETS BOTH FLAGS  (source — the entries cannot be run)");
// ===========================================================================
/* This is the assertion that stops the executable half above from being a
   fiction. While every mode was read-only, a flag left set from a previous
   screen only ever made the next layout MORE read-only — a harmless direction
   to leak in, and nothing cleared them. Now that area mode WRITES, a stale
   areaMode files Quick calc's ticks against whatever area was last open. So
   each entry point must set both flags, not just its own. */
(function(){
  function entry(name, endAnchor){
    var i = html.indexOf('function ' + name + '(');
    return html.slice(i, html.indexOf(endAnchor, i));
  }
  var quick  = entry('startQuickCalc', '// The sample room');
  var sample = entry('showSample',     'function exitSample');
  var area   = entry('showArea',       'function exitArea');
  var field  = entry('showAreaField',  'function reshuffle');

  ok("startQuickCalc clears the demo flag",   /sampleMode = false;/.test(quick));
  ok("...and the area flag, and the area",    /areaMode = false; AREA = null;/.test(quick));
  ok("showSample sets its own flag",          /sampleMode = true;/.test(sample));
  ok("...and clears area mode",               /areaMode = false; AREA = null;/.test(sample));
  ok("showArea sets its own flag",            /areaMode = true;/.test(area));
  ok("...and clears the demo flag",           /sampleMode = false;/.test(area));
  ok("showAreaField sets its own flag",       /areaMode = true;/.test(field));
  ok("...and clears the demo flag",           /sampleMode = false;/.test(field));

  /* generate() must not be reachable from outside the module: it is the one
     function that does NOT set the flags — it cannot, since showSample and
     showArea both call it after setting theirs — so an outside caller reaching
     it runs a layout under whatever mode was left over. That is the exact hole
     Setup's button used to sit in. */
  var exp = html.indexOf('  return {\n    /* generate() is deliberately NOT exported');
  ok("generate() is not on the module's public surface", exp > 0);
  ok("...and Setup's Generate button goes through the entry point instead",
     /\$\("f-btn-generate"\)\.addEventListener\("click", FL\.startQuickCalc\);/.test(html));
  ok("...with no FL.generate call left anywhere", !/FL\.generate\b/.test(html));

  // Entering an area must NOT blank the ticks any more — that line was there
  // because an area preview had no progress of its own to load. It has now.
  ok("showArea no longer throws the area's ticks away", !/S\.done = \{\};/.test(area));
  ok("...nor does the L-shaped path", !/S\.done = \{\};/.test(field));
  ok("...but the demo still does, every time", /S\.done = \{\};/.test(sample));

  /* LEAVING, though, does clear the screen. S survives a screen change, so
     without this the ticks stayed in S.done with areaMode already false — and
     "Clear progress" is gated on hasProgress() rather than on the predicate, so
     it came back as a button that wipes the screen and, having no slot to write
     through, leaves the stored record untouched. */
  var exit = html.slice(html.indexOf('  function exitArea(){'),
                        html.indexOf('/* A banded (L) area.'));
  ok("exitArea drops the ticks off the screen", /S\.done = \{\};/.test(exit));
  ok("...and lets the screen go back to sleep", /refreshWake\(\);/.test(exit));
  ok("...without writing anything on the way out",
     E.stripComments(exit).indexOf('saveProgress') < 0);
})();

// ===========================================================================
console.log("\nA RESHUFFLE NEVER ZEROES A HALF-LAID FLOOR");
// ===========================================================================
(function(){
  var i = html.indexOf('  function reshuffle(){');
  var body = html.slice(i, html.indexOf('  /* ---------- progress', i));

  // It still asks first. That was already true and must stay true.
  ok("reshuffle confirms before the ticks leave the screen",
     /window\.confirm\(/.test(body) && /You've laid/.test(body));
  ok("...and the copy says they come back", /come back if you shuffle back/.test(body));

  /* And it no longer writes. This used to overwrite the saved record with an
     empty one on the way past, so a shuffle you immediately regretted had
     already destroyed the floor — the confirm asked about something that was
     then irreversible one tap deep. */
  // Comments stripped first: the block carries a note explaining that the write
  // was removed and WHY, and a raw grep matches the explanation and reports the
  // call as still there. Same trap as test_area.js's refusal grep.
  ok("reshuffle does not write on the way past",
     E.stripComments(body).indexOf('saveProgress()') < 0);
  ok("...it re-reads the record for the card it landed on",
     /S\.done = loadProgress\(S\.fp\);/.test(body));

  // Executable: cycling away and back restores the ticks, because nothing was
  // destroyed and the fingerprint identifies the layout.
  var rec = { fp:"FP-1", done:[1,2,3], writes:0 };
  I.enterArea({ name:"Kitchen", install:{
    load:function(fp){ return (rec.fp===fp) ? rec.done.slice() : []; },
    save:function(fp, rows){ rec.fp=fp; rec.done=rows.slice(); rec.writes++; } } });

  ok("landing on the layout you laid restores the ticks",
     Object.keys(I.loadProgress("FP-1")).join(",") === "1,2,3");
  ok("shuffling to another card shows none of them",
     Object.keys(I.loadProgress("FP-2")).length === 0);
  ok("...and shuffling all the way back brings them back",
     Object.keys(I.loadProgress("FP-1")).join(",") === "1,2,3");
  ok("...none of which wrote anything", rec.writes === 0);

  // The record is replaced only by a deliberate tick on the layout you chose.
  I.setState({ cfg:{nRows:6}, fp:"FP-2", done:{1:true} });
  I.saveProgress();
  ok("ticking a row on the new card is what replaces it",
     rec.writes === 1 && rec.fp === "FP-2" && rec.done.join(",") === "1");
})();

// ===========================================================================
console.log("\nQUICK CALC IS HONEST ABOUT NOT TRACKING AN INSTALL");
// ===========================================================================
(function(){
  var i = html.indexOf('  function renderCuts(){');
  var body = html.slice(i, html.indexOf('  function cutRow(', i));

  /* The Row-complete button used to be gated on !inSample(), so Quick calc
     shipped a button that called a guarded toggleRow(): it looked live and did
     nothing. That is the dishonest failure this app is written against. */
  ok("the Row-complete button asks the one containment predicate",
     /if \(!isReadOnlyLayout\(\)\)\{[\s\S]{0,400}?fl-done-btn/.test(body));
  ok("...and is no longer gated on the demo flag alone",
     !/if \(!inSample\(\)\)\{[\s\S]{0,200}?fl-done-btn/.test(body));
  ok("...and something stands in its slot instead",
     /\} else if \(!inSample\(\)\)\{[\s\S]{0,120}?installMarker\(\)/.test(body));

  // The marker itself: same family as the one-card marker, its own hook, and
  // NOT .helpdot — expert mode hides those wholesale, and the person who goes
  // looking for the missing button is the expert.
  var m = html.indexOf('  function installMarker(){');
  var mbody = html.slice(m, html.indexOf('  /* The area badge.', m));
  ok("the marker carries its own data-marker hook",
     /data-marker","install\.nojob"/.test(mbody));
  ok("...is styled as a marker, not a button", /el\("div","fl-onecard"\)/.test(mbody));
  ok("...and is not a .helpdot, which expert mode would hide",
     mbody.indexOf('helpdot') < 0);
  ok("...and says where install tracking lives",
     /Install tracking lives with a job/.test(mbody));
  ok("...and is rendered as text, never innerHTML",
     /textContent =/.test(mbody) && mbody.indexOf('innerHTML') < 0);

  // Nothing else on the screen may promise ticking it cannot deliver.
  ok("the progress bar only appears where an install can exist",
     /if \(!isReadOnlyLayout\(\)\) head\.appendChild\(progressBlock\(\)\);/.test(body));
  ok("'Now laying' only appears where something is being laid",
     /isReadOnlyLayout\(\) \? "First cuts/.test(body));
  ok("the cut-sequence heading stops inviting a tap that does nothing",
     /isReadOnlyLayout\(\) \? "Cut sequence"/.test(html));
  ok("the layout hint stops promising ticking",
     /isReadOnlyLayout\(\)\s*\n?\s*\? "Tap the floor to zoom and rotate"/.test(html));
  // The separator is written as · in the source, not as a literal — match
  // the source, not the rendered string.
  ok("the overlay footer drops 'next up' where there is no next",
     /isReadOnlyLayout\(\)\s*\n?\s*\? "Pinch to zoom \\u00b7 tap any row to open its cuts"/.test(html));
})();

// ===========================================================================
console.log("\nTHE RECORD SURVIVES A RE-MEASURE");
// ===========================================================================
(function(){
  /* saveCurrentArea() rebuilds the area from a hand-written field list, so
     anything not named there is erased on the next re-measure — which for a
     half-laid floor means walking back into the room to a blank sheet. The same
     trap already documented for `id` and `pinned`. */
  var i = html.indexOf('function saveCurrentArea(){');
  var body = html.slice(i, html.indexOf('function startNewArea(', i));
  ok("a re-measure carries the install record across",
     /area\.install = prev \? prev\.install : null;/.test(body));
  ok("...alongside the id and the pin it hangs beside",
     /area\.id     = prev/.test(body) && /area\.pinned = prev/.test(body));

  // Carrying it is only safe because it is fingerprinted: ticks made against
  // the old dimensions must read as no progress, not as progress against the
  // new ones.
  var area = { install:null };
  S.setInstall(area, "FP-OLD", [1,2,3]);
  ok("ticks from the old dimensions do not transfer to the new layout",
     S.readInstall(area, "FP-NEW").length === 0);
  ok("...but an undone typo lands back on them",
     S.readInstall(area, "FP-OLD").join(",") === "1,2,3");
})();

// ===========================================================================
console.log("\nTHE LEGACY GLOBAL SLOT IS DROPPED, ONCE, AND NOTHING ELSE IS");
// ===========================================================================
(function(){
  var i = html.indexOf('var INSTALL_MOVED_KEY');
  var body = html.slice(i, html.indexOf('function newId(', i));

  ok("the old key is removed exactly once, behind a flag",
     (body.match(/removeItem\("egs-floor-progress"\)/g)||[]).length === 1
     && /getItem\(INSTALL_MOVED_KEY\)/.test(body)
     && /setItem\(INSTALL_MOVED_KEY, "1"\)/.test(body));
  ok("...and the whole thing is inside a try, so private mode is not fatal",
     /try\{/.test(body) && /catch\(e\)\{\}/.test(body));

  /* THE IMPORTANT HALF. The drop is deliberately blunt — there is no honest way
     to decide which area a fingerprint-only record belonged to — but blunt must
     stay narrow. It must not touch the store, and it must not touch the legacy
     jobs key, which is still offered to the user through the migration screen
     and is only ever READ. */
  ok("it never touches the live store", body.indexOf('stagger.store.v1') < 0
     && body.indexOf('storeCommit') < 0);
  ok("it never touches the legacy jobs key", body.indexOf('stagger.jobs.v1') < 0);
  ok("...and removes nothing else at all",
     (body.match(/removeItem\(/g)||[]).length === 1);

  // And nothing anywhere reads or writes the old slot any more.
  ok("no live read or write of the old slot survives",
     !/localStorage\.(getItem|setItem)\(\s*["']egs-floor-progress/.test(html));
  ok("...and the PKEY identifier is gone with it", html.indexOf('PKEY') < 0);
})();

// ===========================================================================
console.log("\nTHE SCHEMA CARRIES IT, WHICHEVER DOOR AN AREA CAME IN BY");
// ===========================================================================
(function(){
  ok("the store is at schema 3", S.SCHEMA_VERSION === 3);

  // An area that predates the field gets it on load, or migrated records and
  // fresh ones drift apart — the trap store.js's own comment warns about.
  var old = S.migrate({ schemaVersion:2, jobs:[{ id:"j", name:"J", wastePct:10, boxCov:"",
                                                areas:[{ id:"a", name:"A" }] }] });
  ok("a v2 store migrates to 3", old.schemaVersion === 3);
  ok("...and its areas gain the install field", 'install' in old.jobs[0].areas[0]);
  ok("...empty, not invented", old.jobs[0].areas[0].install === null);

  // A v1 store has to arrive in the same shape, through the older migration.
  var v1 = S.migrate({ schemaVersion:1, jobs:[{ id:"j", name:"J", areas:[{ id:"a", name:"A" }] }] });
  ok("a v1 store lands on the same shape", 'install' in v1.jobs[0].areas[0]);

  // And so does one that came across from stagger.jobs.v1, whose migrator keeps
  // its own hand-written field list.
  var legacy = M.migrateArea({ name:"Legacy", sqft:120 });
  ok("a legacy-migrated area carries the field too", 'install' in legacy);
  ok("...and is null, because progress never existed there", legacy.install === null);

  // The two doors must produce the same field set, which is the actual invariant
  // — not "install exists" but "these do not drift".
  var st = S.emptyStore(), j = S.createJob(st, "J");
  var fresh = S.createArea(st, j.id, "Fresh");
  var missing = Object.keys(fresh).filter(function(k){ return !(k in legacy); });
  ok("a legacy area and a fresh one carry the same fields",
     missing.length === 0, missing.join(","));

  // A future store is still never touched — the read-only rule outranks the
  // new migration.
  var fut = S.migrate({ schemaVersion:99, jobs:[] });
  ok("a future store is still read-only", fut.__future === true);
})();

// run_tests.sh greps for a line matching ^N passed, M failed — keep this format.
console.log("\nengine source: install=" + I.__source);
console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
