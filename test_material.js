// ============================================================================
//  test_material.js — does the Wood view still look like timber?
//
//  This suite exists because the failure mode here is STATISTICAL. A change that
//  narrows the value spread, or evens out the grain, still renders a floor. Every
//  other suite still passes. The picture just quietly goes back to being a
//  graphic of a floor instead of a floor, and nobody notices until someone looks
//  at it on a phone.
//
//  Three rounds of this got fixed by measurement, and each is pinned below:
//
//    1. `WOOD[(i*5+p*3) % 6]` — p*3 % 6 cycles 0,3,0,3, so EVERY row used exactly
//       two of the six tones, alternating. A checkerboard, which is why it read
//       as a pattern.
//    2. A flat pick from the six --plank tokens. Those six span only ~40 units of
//       luminance — six shades of one honey. Uniformly mid-tone reads as fake,
//       because a real bundle has occasional genuinely dark and pale boards.
//    3. Every board the same hue, differing only in value; and grain that ran the
//       full width of every board with the same gentle curve, which reads as
//       corduroy.
//
//  Run:  node test_material.js     (or ./run_tests.sh)
// ============================================================================

var E = require('./engine_source.js');
var M = E.load('material');

var pass=0, fail=0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok  "+name); }
  else { fail++; console.log("FAIL  "+name+(extra!=null?"  "+extra:"")); }
}

// The shipped --plank-1..6, both themes. These are the real token values.
var PALETTES = {
  light: ['#B8823F','#A8743A','#AE7C40','#9C6B33','#BE8A49','#C69355'],
  dark:  ['#C89A5F','#BE8E52','#C0925A','#B5854A','#CBA067','#D2A76C']
};
function lum(hex){
  var h = hex.replace('#','');
  return 0.2126*parseInt(h.slice(0,2),16) + 0.7152*parseInt(h.slice(2,4),16)
       + 0.0722*parseInt(h.slice(4,6),16);
}
// A representative floor: the kitchen fixture's shape, seed 88.
function floor(seed, rows, per){
  var out = [];
  for (var r=0; r<(rows||15); r++) for (var p=0; p<(per||8); p++) out.push([seed,r,p]);
  return out;
}
function tones(seed){ return floor(seed).map(function(k){ return M.plankTone(k[0],k[1],k[2]); }); }
function sorted(a){ return a.slice().sort(function(x,y){ return x-y; }); }

// ===========================================================================
console.log("\nDETERMINISM — the same floor always renders the same");
// ===========================================================================
M.setPalette(PALETTES.light);
(function(){
  ok("plankTone is a pure function of (seed,row,piece)",
     M.plankTone(88,3,2) === M.plankTone(88,3,2));
  ok("...and so is plankGrain",
     JSON.stringify(M.plankGrain(88,3,2)) === JSON.stringify(M.plankGrain(88,3,2)));
  ok("a different layout gets a different floor",
     M.plankTone(88,3,2) !== M.plankTone(89,3,2));
  ok("a different board gets a different tone",
     M.plankTone(88,3,2) !== M.plankTone(88,3,3));
  // The reshuffle case: cycling away from a card and back must show the same floor.
  var before = tones(88).join(), after = (tones(101), tones(88).join());
  ok("cycling the deck away and back renders the identical floor", before === after);
})();

// ===========================================================================
console.log("\nVALUE SPREAD — the bundle is not six shades of one honey");
// ===========================================================================
Object.keys(PALETTES).forEach(function(themeName){
  M.setPalette(PALETTES[themeName]);
  var pal = sorted(PALETTES[themeName].map(lum));
  var palSpread = pal[5] - pal[0];
  var L = sorted(tones(88).map(lum));
  var spread = L[L.length-1] - L[0];

  ok(themeName+": the palette alone spans only "+palSpread.toFixed(0)+" units of luminance",
     palSpread < 55, palSpread.toFixed(1));
  // The headline number. Below ~2x and the floor is visibly uniform.
  ok(themeName+": the rendered floor spans "+spread.toFixed(0)+" — at least 2x the palette",
     spread > palSpread*2, spread.toFixed(1)+" vs "+palSpread.toFixed(1));

  // Clustered middle WITH tails is the whole point — a uniform draw across the
  // same range reads as evenly-scattered confetti, not as timber.
  var p10 = L[Math.floor(L.length*0.10)], p90 = L[Math.floor(L.length*0.90)];
  var mid = p90 - p10;
  ok(themeName+": the middle 80% is much tighter than the full range",
     mid < spread*0.75, "middle80 "+mid.toFixed(1)+" of "+spread.toFixed(1));
  ok(themeName+": ...but the tails genuinely reach — darkest is well below p10",
     (p10 - L[0]) > 8, "p10-min "+(p10-L[0]).toFixed(1));
  ok(themeName+": ...and the palest is well above p90",
     (L[L.length-1] - p90) > 8, "max-p90 "+(L[L.length-1]-p90).toFixed(1));

  // Near-unique tones. The checkerboard bug gave exactly 2 per row / 6 overall.
  var uniq = new Set(tones(88)).size;
  ok(themeName+": ~every board is its own tone ("+uniq+" of 120)",
     uniq > 90, String(uniq));
});

// ===========================================================================
console.log("\nTHE CHECKERBOARD IS GONE — the bug that started this");
// ===========================================================================
M.setPalette(PALETTES.light);
(function(){
  // The original defect: fill = WOOD[(i*5+p*3) % 6]. p*3 % 6 cycles 0,3,0,3,
  // so every row used two tones, strictly alternating. Assert per-ROW variety.
  var worst = 99, worstRow = -1;
  for (var r=0; r<15; r++){
    var row = [];
    for (var p=0; p<8; p++) row.push(M.plankTone(88,r,p));
    var u = new Set(row).size;
    if (u < worst){ worst = u; worstRow = r; }
  }
  ok("no row is limited to 2 tones (the checkerboard signature)", worst > 2,
     "row "+worstRow+" had "+worst);
  ok("the least varied row still uses at least 5 distinct tones", worst >= 5,
     "row "+worstRow+" had "+worst);

  // And no alternating period-2 run, which is what the eye actually caught.
  var alt = 0;
  for (var r2=0; r2<15; r2++){
    for (var p2=0; p2+2<8; p2++){
      if (M.plankTone(88,r2,p2) === M.plankTone(88,r2,p2+2)) alt++;
    }
  }
  ok("no row alternates between two tones", alt < 6, alt+" period-2 repeats");
})();

// ===========================================================================
console.log("\nHUE — boards differ in warmth, not only in lightness");
// ===========================================================================
(function(){
  function warmth(hex){                       // red minus blue: the warm axis
    var h = hex.replace('#','');
    return parseInt(h.slice(0,2),16) - parseInt(h.slice(4,6),16);
  }
  // warmTone itself, in isolation.
  var probe = '#B8823F';
  ok("warmTone(+) makes a board warmer", warmth(M.warmTone(probe, 0.8)) > warmth(probe));
  ok("warmTone(-) makes a board cooler", warmth(M.warmTone(probe,-0.8)) < warmth(probe));
  // Case-insensitive: the tokens are written uppercase in CSS and rgbHex emits
  // lowercase, so a strict compare fails on formatting rather than on colour.
  ok("warmTone(0) is a no-op", M.warmTone(probe, 0).toLowerCase() === probe.toLowerCase());

  /* Measuring warmth as R-B on the FINISHED tone does not isolate hue, and this
     is worth spelling out because the first version of this test got it wrong and
     reported the asymmetry backwards. shadeTone moves R-B on its own: darkening
     scales every channel, so R-B shrinks proportionally; lightening mixes toward
     a near-neutral highlight, so R-B shrinks there too. Both swamp the deliberate
     warmth jitter.

     So reconstruct the value-only tone and difference against it. That leaves
     exactly warmTone's contribution and nothing else. */
  var pal = PALETTES.light, warmer = 0, cooler = 0, maxWarm = 0, maxCool = 0;
  floor(88).forEach(function(k){
    var base = pal[M.plankHash(k[0],k[1],k[2],0) % pal.length];
    var v = M.plankRand(k[0],k[1],k[2],1)*2 - 1;
    var valueOnly = M.shadeTone(base, v*v*v * M.getSpread());
    var d = warmth(M.plankTone(k[0],k[1],k[2])) - warmth(valueOnly);
    if (d >  1){ warmer++; maxWarm = Math.max(maxWarm, d); }
    if (d < -1){ cooler++; maxCool = Math.max(maxCool, -d); }
  });
  ok("hue is a real second axis on top of value", warmer > 8 && cooler > 8,
     "warmer "+warmer+" cooler "+cooler);
  // Asymmetric on purpose: a pale board that also takes a full cool shift washes
  // out to taupe and stops reading as wood at all.
  ok("...and the warm shift reaches further than the cool one",
     maxWarm > maxCool, "max warm +"+maxWarm+" vs max cool -"+maxCool);

  // The floor-level consequence: at matched lightness, boards still differ in hue.
  var band = tones(88).filter(function(c){ var l = lum(c); return l > 125 && l < 138; });
  var BW = sorted(band.map(warmth));
  ok("boards of the SAME lightness still differ in warmth ("+band.length+" in band)",
     band.length > 8 && (BW[BW.length-1]-BW[0]) > 8,
     "range "+(BW.length?(BW[BW.length-1]-BW[0]):0));
})();

// ===========================================================================
console.log("\nGRAIN — figured boards, not combed ones");
// ===========================================================================
(function(){
  var counts = {}, waves = [], alphas = [], arcs = 0;
  floor(88).forEach(function(k){
    var g = M.plankGrain(k[0],k[1],k[2]);
    counts[g.n] = (counts[g.n]||0) + 1;
    waves.push(g.wave); alphas.push(g.alpha);
    if (g.arc) arcs++;
  });
  var total = 120;
  ok("some boards carry NO grain at all — "+(counts[0]||0)+" of 120",
     (counts[0]||0) > 8, String(counts[0]||0));
  ok("...but most boards do", (counts[0]||0) < total*0.4, String(counts[0]||0));
  ok("density varies across at least 4 distinct values", Object.keys(counts).length >= 4,
     Object.keys(counts).join(','));
  ok("no single density dominates the floor",
     Math.max.apply(null, Object.keys(counts).map(function(k){ return counts[k]; })) < total*0.45);

  var wr = sorted(waves), ar = sorted(alphas);
  ok("waviness varies board to board", (wr[wr.length-1]-wr[0]) > 0.4,
     (wr[wr.length-1]-wr[0]).toFixed(2));
  ok("grain strength varies board to board", (ar[ar.length-1]-ar[0]) > 0.03,
     (ar[ar.length-1]-ar[0]).toFixed(3));
  ok("grain stays faint — never a drawn line", ar[ar.length-1] < 0.14,
     "max alpha "+ar[ar.length-1].toFixed(3));

  // The cathedral arc is the most recognisable wood figure; it must be occasional,
  // not on every board (which would be its own kind of pattern).
  ok("cathedral figure appears on some boards ("+arcs+" of 120)", arcs > 5, String(arcs));
  ok("...but is not the norm", arcs < total*0.35, String(arcs));
})();

// ===========================================================================
console.log("\nTONE IS NOT VIEW STATE");
// ===========================================================================
(function(){
  // plankTone takes exactly (seed,row,piece). If isDone/isNow ever get threaded
  // in, the floor changes colour as rows are ticked off — which is the thing the
  // whole material is built to avoid. Guard the arity AND the shipped call site.
  ok("plankTone takes exactly three arguments", M.plankTone.length === 3,
     "arity "+M.plankTone.length);
  var fs = require('fs'), path = require('path');
  var html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  var call = (html.match(/plankTone\((cand\.seed[^)]*)\)/)||[])[1];
  ok("the shipped call site passes only the layout's identity",
     call === 'cand.seed, i, p', String(call));
  // Note the grouping: `plankTone\([^)]*isDone|isNow` would split on the | and
  // match a bare `isNow` ANYWHERE in the file, which is a guaranteed false alarm.
  ok("no view state is threaded into the tone call",
     !/plankTone\([^)]*(isDone|isNow)/.test(html));
})();

// ===========================================================================
console.log("\nPALETTE IS AN INPUT — the species seam");
// ===========================================================================
(function(){
  var custom = ['#3A2A1E','#4A3628','#2F2016','#55402F','#3F2E20','#604A36'];
  M.setPalette(custom);
  var t = tones(88);
  var inFamily = t.every(function(c){ return lum(c) < 150; });
  ok("swapping the palette swaps the whole floor", inFamily,
     "max lum "+Math.max.apply(null,t.map(lum)).toFixed(0));
  ok("...and the spread survives a dark species",
     (Math.max.apply(null,t.map(lum)) - Math.min.apply(null,t.map(lum))) > 30);
  M.setPalette(PALETTES.light);
  ok("an empty palette falls back rather than throwing",
     (function(){ M.setPalette([]); var c = M.plankTone(88,0,0); M.setPalette(PALETTES.light);
                  return typeof c === 'string' && c.length > 0; })());
})();

// run_tests.sh greps for a line matching ^N passed, M failed — keep this format.
console.log("\nengine source: material=" + M.__source);
console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
