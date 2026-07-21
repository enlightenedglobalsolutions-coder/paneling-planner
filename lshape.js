// ============================================================================
//  Stagger v2 — lshape.js  (Slice 3b: L-shaped areas as run profiles)
//  An area is an ordered list of DEPTH BANDS, each with its own run length and
//  start offset. Rows are generated band by band; within a band every row uses
//  that band's run. A rectangle is the single-band special case — no separate
//  code path. Trusses are continuous across the whole area; the seam rules
//  (adjacent rows never share, two-back share <=1) apply ACROSS band boundaries
//  exactly as within a band.
//
//  The layout ENGINE is injected (same contract as spread.js), so this module
//  adds no joint math of its own — it slices the area into bands, drives the
//  engine per band with continuity carried across the seam, and stitches the
//  rows back into one layout + one cut list.
// ============================================================================

// shape = { kind:"L"|"rect", bands:[ {depthIn, runIn, runStartIn} , ... ] }
// For a rect: bands:[ {depthIn:<full>, runIn:<full>, runStartIn:0} ]

// Validate a shape: bands present, positive dims, depths sum sanely.
function validateShape(shape){
  if(!shape || !Array.isArray(shape.bands) || !shape.bands.length)
    return { ok:false, error:"no-bands" };
  for(var i=0;i<shape.bands.length;i++){
    var b=shape.bands[i];
    if(!(b.depthIn>0)) return { ok:false, error:"bad-depth", band:i };
    if(!(b.runIn>0))   return { ok:false, error:"bad-run", band:i };
    if(b.runStartIn==null || b.runStartIn<0) return { ok:false, error:"bad-start", band:i };
  }
  return { ok:true };
}

// Total depth and the max run (width of the bounding box) — handy for the UI.
function shapeExtent(shape){
  var depth=0, maxRun=0, minStart=Infinity, maxEnd=0;
  shape.bands.forEach(function(b){
    depth+=b.depthIn;
    if(b.runIn>maxRun) maxRun=b.runIn;
    if(b.runStartIn<minStart) minStart=b.runStartIn;
    if(b.runStartIn+b.runIn>maxEnd) maxEnd=b.runStartIn+b.runIn;
  });
  return { totalDepthIn:depth, maxRunIn:maxRun, boundingRunIn:maxEnd-(minStart===Infinity?0:minStart) };
}

// Given a face width, how many rows fall in each band (rows run across depth).
function bandRowCounts(shape, faceIn){
  return shape.bands.map(function(b){ return Math.max(1, Math.round(b.depthIn/faceIn)); });
}

// Generate a full L-shaped layout. engine.generate(runIn, acrossIn, boardIn, opts)
// is called PER BAND, but we pass continuity so seam rules hold across the seam:
// opts.prevRows = the last two rows' joints from the previous band.
function generateLShape(engine, shape, faceIn, boardIn, opts){
  var v=validateShape(shape); if(!v.ok) return { ok:false, error:v.error };
  opts = opts || {};
  var counts=bandRowCounts(shape, faceIn);
  var allRows=[];        // stitched rowJoints across every band
  var bandMeta=[];       // per-band {runIn, rows, startRow}
  var carry=[];          // last up-to-2 rows from previous band (for continuity)

  for(var i=0;i<shape.bands.length;i++){
    var b=shape.bands[i];
    var bandAcross=counts[i]*faceIn;
    var r;
    try {
      r = engine.generate(b.runIn, bandAcross, boardIn,
            Object.assign({}, opts, { prevRows: carry.slice(-2), runStartIn:b.runStartIn }));
    } catch(e){ r={ ok:false }; }
    if(!r || r.ok===false) return { ok:false, error:"band-illegal", band:i };

    var rows = r.rowJoints || [];
    bandMeta.push({ runIn:b.runIn, runStartIn:b.runStartIn, rows:rows.length, startRow:allRows.length });
    for(var k=0;k<rows.length;k++) allRows.push({ joints:rows[k], runIn:b.runIn, runStartIn:b.runStartIn, band:i });
    carry = rows;   // hand this band's rows to the next as continuity
  }

  return {
    ok:true,
    rows: allRows,                       // [{joints, runIn, runStartIn, band}]
    bands: bandMeta,
    totalRows: allRows.length,
    extent: shapeExtent(shape)
  };
}

// Independent audit: verify seam rules hold across the WHOLE stitched layout,
// including band boundaries. Reads only the output (never the engine's flags).
function auditLShape(layout){
  if(!layout.ok) return { ok:false };
  var rows=layout.rows.map(function(r){ return r.joints||[]; });
  function shared(a,b){ var n=0; a.forEach(function(x){ if(b.indexOf(x)>=0)n++; }); return n; }
  var adjShare=0, twoBackOver=0, boundaryChecks=0;
  for(var r=0;r<rows.length;r++){
    if(r>0 && rows[r].length && rows[r-1].length){
      if(shared(rows[r],rows[r-1])>0) adjShare++;
      if(layout.rows[r].band!==layout.rows[r-1].band) boundaryChecks++;
    }
    if(r>1 && rows[r].length && rows[r-2].length && shared(rows[r],rows[r-2])>1) twoBackOver++;
  }
  return { ok: adjShare===0 && twoBackOver===0,
           adjShare:adjShare, twoBackOver:twoBackOver, boundaryChecks:boundaryChecks };
}

// Cut list rolls up across bands: each row labeled with its band + run.
function lshapeCutList(layout, trussesForRun){
  // trussesForRun(runIn, runStartIn) -> [truss positions] ; segLen derived by host.
  return layout.rows.map(function(r, idx){
    return { row: idx+1, band: r.band, runIn: r.runIn, runStartIn: r.runStartIn, joints: r.joints };
  });
}

if(typeof module!=="undefined") module.exports = {
  validateShape, shapeExtent, bandRowCounts, generateLShape, auditLShape, lshapeCutList
};
