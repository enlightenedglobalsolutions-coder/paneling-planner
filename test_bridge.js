// Harness: builds shapes through the REAL pipeline (rects -> cells ->
// traceOutline) so the bridge is tested on genuine engine output, then feeds
// per-edge measurements (grid length x 12 = 1 cell -> 1 ft) and checks the
// resulting engine input.

var fs=require('fs');
// Pull the grid-geometry engine straight out of the SHIPPED app file.
// (This harness used to read a prototype, stagger-shape-input.html, that was
//  never in this repo — so it could not run at all. index.html is the better
//  source anyway: it tests what actually ships.)
var html=fs.readFileSync('index.html','utf8');
var START='function rectsToCells(rects){', END='//  EGS Measurement Widget';
var i=html.indexOf(START), j=html.indexOf(END, i);
if(i<0 || j<0){
  console.error("FAIL: could not locate the grid-geometry block in index.html.");
  console.error("      Anchors: "+JSON.stringify(START)+" .. "+JSON.stringify(END));
  process.exit(1);
}
var engine=html.slice(i, j);
// guard: this slice must stay pure — the moment it touches the DOM it stops
// being testable in node, and we want to hear about that as a failure, not a crash.
if(/document\.|window\.|localStorage/.test(engine)){
  console.error("FAIL: the grid-geometry block in index.html now touches the DOM; "
              + "extract it to a module rather than widening this harness.");
  process.exit(1);
}
eval(engine);
var bridge=require('./bridge.js');
var buildEngineInput=bridge.buildEngineInput, shapeToProfile=bridge.shapeToProfile;

var pass=0, fail=0;
function ok(name, cond, extra){ if(cond){pass++; console.log("  ok  "+name);} else {fail++; console.log("FAIL  "+name+(extra?"  "+extra:""));} }
function near(a,b,t){ return Math.abs(a-b)<=(t==null?0.01:t); }

// edges from a set of rects, with inches = cell-length * 12 per edge
function shape(rects){
  var res=traceOutline(rectsToCells(rects));
  var inches=res.edges.map(function(e){ return e.cells*12; });
  return { edges:res.edges, inches:inches };
}
function bandKey(b){ return '['+b.depthIn+','+b.runIn+','+b.runStartIn+']'; }
function hasBand(bands, depth, run, start){
  return bands.some(function(b){ return near(b.depthIn,depth)&&near(b.runIn,run)&&near(b.runStartIn,start); });
}

console.log("\nRECTANGLE 12ft x 10ft");
var R=shape([{x:0,y:0,w:12,h:10}]);
var r=buildEngineInput(R.edges, R.inches);
ok("ok + rect kind", r.ok && r.kind==='rect', r.kind);
ok("single band", r.profile.bands.length===1, JSON.stringify(r.profile.bands));
ok("run along longer wall (144)", near(r.bbox.runIn,144) && near(r.profile.bands[0].runIn,144));
ok("depth 120", near(r.profile.bands[0].depthIn,120));
ok("rect payload {144,120}", r.rect && near(r.rect.runIn,144) && near(r.rect.acrossIn,120), JSON.stringify(r.rect));

console.log("\nL-SHAPE (8 wide full 20 tall + 8x8 leg bottom-right)");
var L=shape([{x:0,y:0,w:8,h:20},{x:8,y:12,w:8,h:8}]);
var l=buildEngineInput(L.edges, L.inches);
ok("ok + L kind", l.ok && l.kind==='L', l.kind);
ok("two bands", l.profile.bands.length===2, JSON.stringify(l.profile.bands));
ok("band full run 240 start 0 depth 96", hasBand(l.profile.bands,96,240,0), JSON.stringify(l.profile.bands));
ok("band leg run 96 start 144 depth 96", hasBand(l.profile.bands,96,96,144), JSON.stringify(l.profile.bands));
ok("no rect payload for L", l.rect===null);

console.log("\nU-SHAPE (auto should switch axis to stay clean)");
var U=shape([{x:0,y:0,w:4,h:14},{x:10,y:0,w:4,h:14},{x:0,y:10,w:14,h:4}]);
var u=buildEngineInput(U.edges, U.inches);
ok("ok + not complex after auto", u.ok && u.kind!=='complex', u.kind);
ok("three clean bands", u.profile.bands.length===3, JSON.stringify(u.profile.bands));
ok("flags the auto-switch", !!u.autoSwitched, JSON.stringify(u.warnings));

console.log("\nU-SHAPE forced onto the splitting axis (override)");
// force the axis that splits -> expect complex + a warning
var uForce=shapeToProfile(U.edges, U.inches, u.runAxis==='x'?'y':'x');
ok("override respected + flagged complex", uForce.kind==='complex' && uForce.warnings.length>0, uForce.kind);

console.log("\nRECT override to short axis");
var rF=buildEngineInput(R.edges, R.inches, 'y'); // force run along the 120 side
ok("override run axis y -> run 120", near(rF.profile.bands[0].runIn,120) && near(rF.profile.bands[0].depthIn,144), JSON.stringify(rF.profile.bands));

console.log("\nERROR: missing a measurement");
var miss=R.inches.slice(); miss[1]=null;
var e=buildEngineInput(R.edges, miss);
ok("reports missing-length not crash", e.ok===false && e.error==='missing-length', JSON.stringify(e));

console.log("\n"+pass+" passed, "+fail+" failed\n");
process.exit(fail?1:0);
