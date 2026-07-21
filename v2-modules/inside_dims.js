// ============================================================
// Stagger v2 — inside-dimension calculator (pure module)
// Outside blueprint dims + wall build + finish -> inside wall-to-wall,
// both directions, with per-side override and a visible math trail.
// ============================================================

// Wall assembly thickness in inches: framing + interior finish.
// Sheathing/exterior cladding sits OUTSIDE the outside dimension line on a
// typical plan (dims to outside of framing), so it is NOT subtracted.
var FRAMING = { "2x4": 3.5, "2x6": 5.5, "2x8": 7.25, "none": 0 };
var FINISH  = { "drywall-1/2": 0.5, "drywall-5/8": 0.625, "pine-3/4": 0.75, "none": 0 };

// side spec: {framing:"2x6", finish:"drywall-1/2"}  -> thickness + label
function wallThickness(side){
  var f = FRAMING[side.framing];  var fin = FINISH[side.finish];
  if (f == null || fin == null) return null;
  return { t: f + fin,
           label: side.framing + " + " + side.finish + " = " + (f + fin) + "\u2033" };
}

// One direction (width OR depth):
//   outsideIn: outside dimension in inches
//   def: default side spec; overrides: {a:{...}|null, b:{...}|null}
// Returns inside inches + the human-readable math trail (the echo).
function insideDim(outsideIn, def, overrides){
  overrides = overrides || {};
  var A = wallThickness(overrides.a || def);
  var B = wallThickness(overrides.b || def);
  if (A == null || B == null || !(outsideIn > 0)) return null;
  var inside = outsideIn - A.t - B.t;
  if (inside <= 0) return null;
  return {
    insideIn: inside,
    trail: fmtIn(outsideIn) + " outside \u2212 (" + A.label + ") \u2212 (" + B.label + ") = "
           + fmtIn(inside) + " inside",
    sides: { a: A, b: B }
  };
}

// Both directions for an area. width = the RUN (board length direction),
// depth = ACROSS the rows (board-connect direction). Independent overrides,
// because the two walls bounding the run are usually different walls than
// the two bounding the depth.
function insideArea(outWidthIn, outDepthIn, def, wOv, dOv){
  var w = insideDim(outWidthIn, def, wOv);
  var d = insideDim(outDepthIn, def, dOv);
  if (!w || !d) return null;
  return { width: w, depth: d };
}

function fmtIn(x){
  var f = Math.floor(x/12), r = Math.round((x - f*12)*16)/16;
  var w = Math.floor(r), fr = r - w, s = "";
  if (fr > 0.001){ var n = Math.round(fr*16), dd = 16;
    while (n % 2 === 0 && dd > 1){ n/=2; dd/=2; } s = " " + n + "/" + dd; }
  return (f>0 ? f + "\u2032-" : "") + w + s + "\u2033";
}

if (typeof module !== "undefined") module.exports = { insideDim, insideArea, wallThickness, FRAMING, FINISH };
