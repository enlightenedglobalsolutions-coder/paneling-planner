// ============================================================================
//  Stagger v2 — spread.js  (Slice 3: board-length spread runner)
//  For each available stock length, run the EXISTING layout engine and collect
//  {boards, seams, quality, waste} so the user can compare lengths side by side.
//  This is a LOOP + TABLE over the real engine — it adds no layout math of its
//  own. The engine is injected, so this module never duplicates engine logic
//  and stays testable in isolation.
//
//  Honest-failure carried through: if a length can't produce a legal layout,
//  its row says so instead of showing a fake number. Mixed-length is a separate
//  opt-in scenario (behind the width-variance warning) — pure lengths here.
// ============================================================================

// engine contract (what the host passes in):
//   engine.generate(runIn, acrossIn, boardLenIn, opts) -> {
//       rowJoints: [[...],...],        // the chosen layout
//       boards: <number>,             // boards consumed (from the cut sim)
//       seams: <number>,              // total joints
//       relaxedRows: <number>,        // rows where a preference was relaxed
//       wastePct: <number>,           // 0..100
//       label: <string>,              // e.g. "stagger · B"
//       ok: <bool>                    // false if no legal layout at this length
//   }
//
// runSpread returns rows sorted best-first (fewest boards, then least waste),
// each annotated with a human "quality" summary.

function runSpread(engine, params){
  var runIn = params.runIn, acrossIn = params.acrossIn;
  var lengthsFt = (params.lengthsAvailFt || []).slice().sort(function(a,b){ return a-b; });
  if(!(runIn > 0) || !(acrossIn > 0)) return { ok:false, error:"bad-dimensions", rows:[] };
  if(!lengthsFt.length) return { ok:false, error:"no-lengths", rows:[] };

  var rows = lengthsFt.map(function(ft){
    var boardIn = ft * 12;
    var r;
    try { r = engine.generate(runIn, acrossIn, boardIn, params.opts || {}); }
    catch(e){ r = { ok:false }; }
    if(!r || r.ok === false){
      return { lengthFt:ft, ok:false, boards:null, seams:null, waste:null,
               quality:"no legal layout at this length", relaxedRows:null, label:null, rowJoints:null };
    }
    return {
      lengthFt: ft, ok:true,
      boards: r.boards, seams: r.seams,
      waste: (r.wastePct!=null) ? Math.round(r.wastePct*10)/10 : null,
      relaxedRows: r.relaxedRows || 0,
      quality: qualityLabel(r),
      label: r.label || null,
      rowJoints: r.rowJoints || null
    };
  });

  // rank the legal rows: fewest boards, then least waste, then fewest seams
  var legal = rows.filter(function(x){ return x.ok; });
  legal.sort(function(a,b){
    if(a.boards!==b.boards) return a.boards-b.boards;
    if((a.waste||0)!==(b.waste||0)) return (a.waste||0)-(b.waste||0);
    return (a.seams||0)-(b.seams||0);
  });
  // mark the best legal length
  if(legal.length) legal[0].best = true;

  return { ok:true, error:null, rows:rows, ranked:legal,
           best: legal.length ? legal[0].lengthFt : null };
}

function qualityLabel(r){
  if(r.relaxedRows && r.relaxedRows > 0)
    return r.relaxedRows + " row" + (r.relaxedRows>1?"s":"") + " relaxed";
  return "clean";
}

// Build a plain table model the UI can render directly.
function spreadTable(result){
  if(!result.ok) return { header:[], rows:[], note: result.error };
  return {
    header: ["Length","Boards","Seams","Quality","Waste"],
    rows: result.rows.map(function(x){
      if(!x.ok) return { cells:[ x.lengthFt+"'", "\u2014","\u2014", x.quality, "\u2014" ], ok:false };
      return { cells:[ x.lengthFt+"'", String(x.boards), String(x.seams),
                       x.quality, (x.waste!=null? x.waste+"%":"\u2014") ],
               ok:true, best:!!x.best, lengthFt:x.lengthFt };
    })
  };
}

// Whole-job shopping list from pinned per-area choices (pairs with store.jobBoardSummary).
function shoppingList(byLen){
  var parts = Object.keys(byLen).map(Number).sort(function(a,b){ return a-b; })
    .map(function(ft){ return byLen[ft] + "\u00d7 " + ft + "'"; });
  return parts.join("  +  ");
}

if(typeof module!=="undefined") module.exports = { runSpread, spreadTable, qualityLabel, shoppingList };
