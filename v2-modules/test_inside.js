const M = require('./inside_dims.js');
let p=0,f=0; const ok=(n,c,x)=>{ c?(p++,console.log("  PASS "+n)):(f++,console.log("  FAIL "+n+" ["+x+"]")); };

// Steeves-style: 22'-0 outside, 2x6 exterior + 1/2 drywall both sides
let r = M.insideDim(264, {framing:"2x6", finish:"drywall-1/2"});
ok("2x6+1/2 both sides: 264 - 12 = 252", Math.abs(r.insideIn-252)<0.001, r.insideIn);
ok("math trail readable", r.trail.includes("outside") && r.trail.includes("= 21\u2032-0\u2033 inside"), r.trail);

// Per-side override: one exterior 2x6, one interior 2x4 partition
r = M.insideDim(264, {framing:"2x6", finish:"drywall-1/2"}, {b:{framing:"2x4", finish:"drywall-1/2"}});
ok("override side b: 264-6-4 = 254", Math.abs(r.insideIn-254)<0.001, r.insideIn);

// Pine finish subtracts more than drywall
r = M.insideDim(264, {framing:"2x6", finish:"pine-3/4"});
ok("pine 3/4 both sides: 264-12.5 = 251.5", Math.abs(r.insideIn-251.5)<0.001, r.insideIn);

// Both directions, independent overrides
let a = M.insideArea(264, 150, {framing:"2x6", finish:"drywall-1/2"},
                     null, {a:{framing:"2x4", finish:"drywall-1/2"}});
ok("area width 252", Math.abs(a.width.insideIn-252)<0.001, a.width.insideIn);
ok("area depth override: 150-4-6 = 140", Math.abs(a.depth.insideIn-140)<0.001, a.depth.insideIn);

// Guards: garbage in -> null, never a wrong number
ok("zero outside -> null", M.insideDim(0,{framing:"2x6",finish:"none"})===null);
ok("bad framing -> null", M.insideDim(264,{framing:"2x5",finish:"none"})===null);
ok("walls thicker than room -> null", M.insideDim(10,{framing:"2x8",finish:"pine-3/4"})===null);

// site-measure precedence is a UI rule, but the module must round-trip fractions
ok("fraction formatting 251.5 -> 20'-11 1/2", M.insideDim(264,{framing:"2x6",finish:"pine-3/4"}).trail.includes("20\u2032-11 1/2\u2033"), r.trail);
console.log(p+" passed, "+f+" failed"); process.exit(f?1:0);
