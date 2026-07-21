const L = require('./lshape.js');
let p=0,f=0; const ok=(n,c,x)=>{ c?(p++,console.log("  PASS "+n)):(f++,console.log("  FAIL "+n+" ["+x+"]")); };

// Engine stub that RESPECTS continuity: it won't repeat the previous row's
// joints, so we can verify the band boundary is handled. Joints chosen from a
// small legal set per run, avoiding prevRows' last row.
function contEngine(){
  return { generate:function(runIn, acrossIn, boardIn, opts){
    var rows=Math.max(1,Math.round(acrossIn/5));
    // legal joint sets depend on run (bigger run -> more options)
    var sets = runIn>=300 ? [[1,5],[2,6],[3,7],[4,8]] : [[1,5],[2,6],[3,7]];
    var prev = (opts.prevRows||[]).slice(-1)[0] || null;
    var prev2 = (opts.prevRows||[]).slice(-2,-1)[0] || null;
    var out=[]; var last=prev, last2=prev2;
    for(var i=0;i<rows;i++){
      // pick a set that shares no truss with last, and <=1 with last2
      var pick=null;
      for(var s=0;s<sets.length;s++){
        var cand=sets[(i+s)%sets.length];
        var shareLast = last? cand.filter(x=>last.indexOf(x)>=0).length : 0;
        var shareL2 = last2? cand.filter(x=>last2.indexOf(x)>=0).length : 0;
        if(shareLast===0 && shareL2<=1){ pick=cand; break; }
      }
      if(!pick) pick=sets[i%sets.length];
      out.push(pick); last2=last; last=pick;
    }
    return { ok:true, rowJoints:out };
  }};
}

// --- rectangle = single band ---
let rect = { kind:"rect", bands:[ {depthIn:150, runIn:262, runStartIn:0} ] };
let rres = L.generateLShape(contEngine(), rect, 5, 192, {});
ok("rect generates", rres.ok===true);
ok("rect row count ~ depth/face", rres.totalRows===30, rres.totalRows);
ok("rect audit clean", L.auditLShape(rres).ok===true, JSON.stringify(L.auditLShape(rres)));

// --- Zapach-style L: side strip beside garage, then full-width bottom ---
// side strip: depth 240, run 110 (9'-2), starts at x=245 (past garage)
// bottom band: depth 238, run 360 (30'), starts at x=0
let zapach = { kind:"L", bands:[
  { depthIn:240, runIn:110, runStartIn:245 },
  { depthIn:238, runIn:360, runStartIn:0 }
]};
let zres = L.generateLShape(contEngine(), zapach, 5, 192, {});
ok("Zapach L generates", zres.ok===true);
ok("Zapach has two bands", zres.bands.length===2);
ok("band 0 rows from depth 240", zres.bands[0].rows===48, zres.bands[0].rows);
ok("band 1 rows from depth 238", zres.bands[1].rows===48, zres.bands[1].rows);
ok("total rows = sum of bands", zres.totalRows===zres.bands[0].rows+zres.bands[1].rows);
ok("each row tagged with its band run", zres.rows[0].runIn===110 && zres.rows[50].runIn===360, zres.rows[50].runIn);

// --- THE critical test: seam rules hold ACROSS the band boundary ---
let audit = L.auditLShape(zres);
ok("Zapach audit: no adjacent shared truss (incl. boundary)", audit.adjShare===0, audit.adjShare);
ok("Zapach audit: two-back share <=1 (incl. boundary)", audit.twoBackOver===0, audit.twoBackOver);
ok("boundary was actually checked", audit.boundaryChecks>=1, audit.boundaryChecks);

// --- extent + row counts ---
let ext = L.shapeExtent(zapach);
ok("total depth = 478", ext.totalDepthIn===478, ext.totalDepthIn);
ok("bounding run = 360", ext.boundingRunIn===360, ext.boundingRunIn);
ok("bandRowCounts", JSON.stringify(L.bandRowCounts(zapach,5))==="[48,48]");

// --- cut list rolls up across bands ---
let cuts = L.lshapeCutList(zres);
ok("cut list has all rows", cuts.length===zres.totalRows);
ok("cut list rows numbered 1..N", cuts[0].row===1 && cuts[cuts.length-1].row===zres.totalRows);
ok("cut list carries band + run", cuts[50].band===1 && cuts[50].runIn===360);

// --- adversarial ---
ok("no bands -> error", L.generateLShape(contEngine(),{bands:[]},5,192,{}).error==="no-bands");
ok("bad depth -> error", L.validateShape({bands:[{depthIn:0,runIn:100,runStartIn:0}]}).error==="bad-depth");
ok("bad run -> error", L.validateShape({bands:[{depthIn:100,runIn:-5,runStartIn:0}]}).error==="bad-run");
ok("engine illegal on a band -> error, no crash", (()=>{
  let bad={generate:()=>({ok:false})};
  let r=L.generateLShape(bad,zapach,5,192,{});
  return r.ok===false && r.error==="band-illegal";
})());
ok("engine throw on a band -> error, no crash", (()=>{
  let boom={generate:()=>{throw new Error("x");}};
  return L.generateLShape(boom,zapach,5,192,{}).ok===false;
})());

console.log("\n"+p+" passed, "+f+" failed"); process.exit(f?1:0);
