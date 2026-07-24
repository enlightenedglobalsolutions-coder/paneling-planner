// ============================================================================
//  Stagger BRIDGE — traced shape + measured sides  ->  layout-engine input
//  ---------------------------------------------------------------------------
//  Turns the shape-input outline (grid edges from grid_shape.traceOutline) plus
//  the per-side real measurements (INCHES, one per edge) into what the layout
//  engine consumes:
//     rectangle   ->  { runIn, acrossIn }                         (spread.runSpread)
//     L / stepped ->  { kind:'L', bands:[{depthIn,runIn,runStartIn}] }  (generateLShape)
//
//  Rules baked in (Edwin, July 2026):
//   - Measurements are FINAL wall-to-wall (inside) dims — used as-is (no
//     outside->inside conversion here; inside_dims.js runs upstream if needed).
//   - Run direction is AUTO (boards run the longer wall) but can be OVERRIDDEN;
//     auto also prefers whichever axis yields a clean single-interval band
//     profile, so an L/U/T that splits one way is sliced the other way.
//
//  Pure geometry, no DOM. Testable headless.
// ============================================================================

// Walk the directed outline, moving each edge's measured length in its unit
// direction, to reconstruct the real orthogonal polygon (vertices in inches).
function reconstructPolygon(edges, inchesArr){
  if(!edges || !edges.length) return { ok:false, error:"no-edges" };
  var x=0, y=0, verts=[{x:0,y:0}];
  for(var i=0;i<edges.length;i++){
    var e=edges[i], len=inchesArr[i];
    if(len==null || !(len>0)) return { ok:false, error:"missing-length", side:i };
    var dx = e.horiz ? Math.sign(e.x2-e.x1) : 0;
    var dy = e.horiz ? 0 : Math.sign(e.y2-e.y1);
    x += dx*len; y += dy*len;
    verts.push({ x:x, y:y });
  }
  var closed = Math.abs(x) < 0.5 && Math.abs(y) < 0.5; // returns near origin
  verts.pop(); // drop the closing point (~ origin) -> corner list
  return { ok:true, verts:verts, closed:closed };
}

// cluster near-equal coordinate values into shared breakpoints (measurement drift)
function _cluster(vals, tol){
  var s=vals.slice().sort(function(a,b){return a-b;}), out=[], cur=[s[0]];
  for(var i=1;i<s.length;i++){
    if(s[i]-cur[cur.length-1] <= tol) cur.push(s[i]);
    else { out.push(_avg(cur)); cur=[s[i]]; }
  }
  out.push(_avg(cur));
  return out;
}
function _avg(a){ var t=0; for(var i=0;i<a.length;i++) t+=a[i]; return t/a.length; }
function _round(v){ return Math.round(v*1000)/1000; }

// run-intervals the polygon covers at a given depth level (ray-cast, even-odd).
// depthKey/runKey are 'x'/'y'; we cross edges parallel to the DEPTH axis.
function _coverageAt(verts, scan, depthKey, runKey){
  var xs=[], n=verts.length;
  for(var i=0;i<n;i++){
    var a=verts[i], b=verts[(i+1)%n];
    if(Math.abs(a[runKey]-b[runKey])<1e-6 && Math.abs(a[depthKey]-b[depthKey])>1e-6){
      var d0=Math.min(a[depthKey],b[depthKey]), d1=Math.max(a[depthKey],b[depthKey]);
      if(scan>d0 && scan<d1) xs.push(a[runKey]);
    }
  }
  xs.sort(function(p,q){return p-q;});
  var iv=[];
  for(var j=0;j+1<xs.length;j+=2) iv.push([xs[j], xs[j+1]]);
  return iv;
}

// Decompose the reconstructed polygon into a run profile for one run axis.
function shapeToProfile(edges, inchesArr, runAxis){
  var rp=reconstructPolygon(edges, inchesArr);
  if(!rp.ok) return rp;
  var verts=rp.verts;
  var minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  verts.forEach(function(p){ if(p.x<minx)minx=p.x; if(p.x>maxx)maxx=p.x; if(p.y<miny)miny=p.y; if(p.y>maxy)maxy=p.y; });
  var w=maxx-minx, h=maxy-miny;
  if(runAxis!=='x' && runAxis!=='y') runAxis = (w>=h) ? 'x' : 'y';
  var runKey=runAxis, depthKey=(runAxis==='x')?'y':'x';
  var runMin=(runAxis==='x')?minx:miny;

  var depthVals=verts.map(function(p){ return p[depthKey]; });
  var breaks=_cluster(depthVals, 0.25);

  var bands=[], warnings=[], complex=false;
  for(var i=0;i+1<breaks.length;i++){
    var lo=breaks[i], hi=breaks[i+1], mid=(lo+hi)/2;
    var ivs=_coverageAt(verts, mid, depthKey, runKey);
    if(ivs.length===0) continue;                    // concave notch: no material
    if(ivs.length>1){ complex=true;
      warnings.push("Depth "+_round(lo)+"-"+_round(hi)+"\" splits into "+ivs.length+" separate runs on this axis.");
    }
    var iv=ivs[0];
    bands.push({ depthIn:_round(hi-lo), runIn:_round(iv[1]-iv[0]), runStartIn:_round(iv[0]-runMin) });
  }

  var kind = complex ? 'complex' : (bands.length<=1 ? 'rect' : 'L');
  var out = {
    ok:true, runAxis:runAxis, closed:rp.closed, kind:kind,
    bbox:{ runIn:_round(runAxis==='x'?w:h), depthIn:_round(runAxis==='x'?h:w) },
    profile:{ kind:(bands.length<=1?'rect':'L'), bands:bands },
    rect:(bands.length===1)?{ runIn:bands[0].runIn, acrossIn:bands[0].depthIn }:null,
    warnings:warnings
  };
  if(!rp.closed) out.warnings.push("Measured sides don't perfectly close the shape.");
  return out;
}

// Top-level: auto-pick run axis (longer wall, but prefer a clean profile),
// unless overrideAxis ('x'|'y') is given.
function buildEngineInput(edges, inchesArr, overrideAxis){
  if(overrideAxis==='x' || overrideAxis==='y') return shapeToProfile(edges, inchesArr, overrideAxis);
  var rp=reconstructPolygon(edges, inchesArr);
  if(!rp.ok) return rp;
  var minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  rp.verts.forEach(function(p){ if(p.x<minx)minx=p.x; if(p.x>maxx)maxx=p.x; if(p.y<miny)miny=p.y; if(p.y>maxy)maxy=p.y; });
  var primary=((maxx-minx)>=(maxy-miny))?'x':'y', other=(primary==='x')?'y':'x';
  var A=shapeToProfile(edges, inchesArr, primary);
  if(A.kind!=='complex') return A;
  var B=shapeToProfile(edges, inchesArr, other);
  if(B.kind!=='complex'){
    B.warnings.unshift("Auto-ran boards the "+(other==='x'?'width':'length')+" way so the shape splits into clean bands.");
    B.autoSwitched=true;
    return B;
  }
  return A;
}

if (typeof module !== "undefined") module.exports = {
  reconstructPolygon, shapeToProfile, buildEngineInput
};
