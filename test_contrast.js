// ============================================================================
//  test_contrast.js — can you actually READ the install view?
//
//  THE BUG. A finished row's cut label was painted in --ok — the SAME token as
//  the plank it sits on. 1.00:1. Invisible by construction, in both themes, and
//  it shipped. The current row was as bad: --paper-dim on --warn is 1.09:1 in
//  daylight and 1.00:1 at night.
//
//  THE FIX THAT DOESN'T WORK, and why it is worth a test of its own: "just use
//  the muted text token". --paper-dim is deliberately MID luminance so it reads
//  as secondary text on the page ground. Measured on --ok it is 1.00:1 light and
//  1.48:1 dark — it fails exactly as hard as the bug. The state fills straddle
//  it, and they INVERT between themes.
//
//  THE TRAP INSIDE THE FIX. --ink and --paper are ROLE tokens — ink is the
//  surface, paper is the text — so they SWAP: in daylight TOK.ink is #f4f5f6
//  (light) and TOK.paper is #1c2026 (dark); at night the reverse. A first cut at
//  textOn() returned `relLum(bg) > k ? TOK.ink : TOK.paper`, which reads like
//  "dark text on a light ground" and is right in exactly ONE theme. It passed
//  every dark-theme check and inverted every choice in daylight. Hence the
//  luminance-driven pick, and hence this suite runs BOTH themes over the same
//  assertions rather than trusting one.
//
//  Tokens are parsed out of index.html's own theme blocks — never retyped here,
//  because a hardcoded copy is what made the mistake survive as long as it did.
//
//  Run:  node test_contrast.js     (or ./run_tests.sh)
// ============================================================================

var fs = require('fs'), path = require('path');
var E = require('./engine_source.js');
var M = E.load('material');

var pass=0, fail=0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok  "+name); }
  else { fail++; console.log("FAIL  "+name+(extra!=null?"  "+extra:"")); }
}

var AA = 4.5;
function ratio(a, b){
  var x = M.relLum(a), y = M.relLum(b);
  return (Math.max(x,y) + 0.05) / (Math.min(x,y) + 0.05);
}

// --- tokens, read from the stylesheet --------------------------------------
var html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
function themeTokens(name){
  var start = html.indexOf(':root[data-theme="'+name+'"]{');
  if (start < 0) throw new Error('no theme block for '+name);
  var block = html.slice(start, html.indexOf('}', start));
  var t = {}, re = /--([a-z0-9-]+)\s*:\s*([^;]+);/g, m;
  while ((m = re.exec(block))) t[m[1].replace(/-(\w)/g,function(_,c){return c.toUpperCase();})] = m[2].trim();
  return t;
}
var THEMES = { light: themeTokens('light'), dark: themeTokens('dark') };

// ===========================================================================
console.log("\nTHE TOKENS REALLY DO SWAP — the trap this suite exists for");
// ===========================================================================
(function(){
  var L = THEMES.light, D = THEMES.dark;
  ok("light: --ink is the LIGHT one", M.relLum(L.ink) > M.relLum(L.paper),
     L.ink+" vs "+L.paper);
  ok("dark:  --ink is the DARK one",  M.relLum(D.ink) < M.relLum(D.paper),
     D.ink+" vs "+D.paper);
  ok("so naming a token cannot tell you which contrasts — only measuring can",
     (M.relLum(L.ink) > M.relLum(L.paper)) !== (M.relLum(D.ink) > M.relLum(D.paper)));
})();

// ===========================================================================
console.log("\nTHE OLD BUG STAYS DEAD");
// ===========================================================================
Object.keys(THEMES).forEach(function(name){
  var T = THEMES[name];
  ok(name+": a label in --ok on an --ok plank was 1.00:1 (the shipped bug)",
     ratio(T.ok, T.ok) < 1.01);
  ok(name+": --paper-dim on --ok would NOT have fixed it either",
     ratio(T.paperDim, T.ok) < AA, ratio(T.paperDim,T.ok).toFixed(2)+":1");
  ok(name+": --paper-dim on --warn fails too",
     ratio(T.paperDim, T.warn) < AA, ratio(T.paperDim,T.warn).toFixed(2)+":1");
});

// ===========================================================================
console.log("\nEVERY INSTALL-VIEW PAIR CLEARS 4.5:1, IN BOTH THEMES");
// ===========================================================================
// Mirrors buildSvg exactly: done planks fade 0.30 over the sheet, current and
// pending planks are solid, and the label takes textOn() of the ground it lands
// on — except pending, which keeps --paper-dim on --ink-3.
var DONE_FADE = 0.30;
Object.keys(THEMES).forEach(function(name){
  var T = THEMES[name];
  M.setTokens(T);
  var sheet = T.ink2;
  var cases = [
    ['done row   ', M.mixHex(T.ok, sheet, DONE_FADE), null],
    ['current row', T.warn,                            null],
    ['pending row', T.ink3,                            T.paperDim]
  ];
  cases.forEach(function(c){
    var ground = c[1];
    var fg = c[2] || M.textOn(ground);
    var r = ratio(fg, ground);
    ok(name+": "+c[0]+" label "+fg+" on "+ground+"  "+r.toFixed(2)+":1",
       r >= AA, r.toFixed(2));
  });

  // Gutter row numbers sit on the sheet, not on a plank.
  [['done ',T.ok],['now  ',T.warn],['pend ',T.paperFaint]].forEach(function(c){
    var r = ratio(c[1], sheet);
    ok(name+": gutter "+c[0]+" "+c[1]+" on sheet  "+r.toFixed(2)+":1", r >= AA, r.toFixed(2));
  });
});

// ===========================================================================
console.log("\ntextOn() PICKS BY LUMINANCE, NOT BY NAME");
// ===========================================================================
Object.keys(THEMES).forEach(function(name){
  var T = THEMES[name];
  M.setTokens(T);
  /* Sweep the whole range rather than the three grounds we happen to use.
     Two separate claims, and conflating them is a mistake worth not repeating:

     (a) textOn is OPTIMAL — it always returns whichever anchor scores higher.
         This must hold everywhere. A hand-picked 0.22 threshold failed it on
         mid-grey, choosing the pale anchor where the dark one was better.
     (b) textOn clears 4.5:1 — this CANNOT hold everywhere, and asserting it
         would be asserting something the anchors cannot deliver. Around mid-grey
         the best possible is ~4.06:1. So measure the unusable band instead and
         check the app's real grounds stay out of it. */
  var suboptimal = 0, unusable = [], worst = 99, worstBg = null;
  for (var v=0; v<=255; v+=1){
    var hx = '#' + [v,v,v].map(function(n){ return (n<16?'0':'')+n.toString(16); }).join('');
    var chosen = ratio(M.textOn(hx), hx);
    var best = Math.max(ratio(T.ink, hx), ratio(T.paper, hx));
    if (chosen < best - 0.001) suboptimal++;
    if (best < AA) unusable.push(M.relLum(hx));
    if (chosen < worst){ worst = chosen; worstBg = hx; }
  }
  ok(name+": textOn always picks the better of the two anchors",
     suboptimal === 0, suboptimal+" grounds where the other anchor scored higher");
  ok(name+": ...and equals the best achievable everywhere (worst "+worst.toFixed(2)+":1)",
     Math.abs(worst - Math.max(ratio(T.ink,worstBg), ratio(T.paper,worstBg))) < 0.001);
  // The band where no anchor can reach 4.5:1 — a fact about the anchors, not a
  // defect. Pinned so nobody adds a state colour that lands in it.
  var lo = Math.min.apply(null, unusable), hi = Math.max.apply(null, unusable);
  ok(name+": the unusable band is narrow and mid-toned (lum "
     +lo.toFixed(2)+"-"+hi.toFixed(2)+")", unusable.length > 0 && lo > 0.10 && hi < 0.45,
     unusable.length+" greys");
  [['done', M.mixHex(T.ok, T.ink2, DONE_FADE)], ['now', T.warn], ['pending', T.ink3]]
    .forEach(function(c){
      var l = M.relLum(c[1]);
      ok(name+": the "+c[0]+" ground sits outside that band (lum "+l.toFixed(2)+")",
         l < lo || l > hi);
    });

  // And it must actually switch, not just always return one token.
  var onWhite = M.textOn('#ffffff'), onBlack = M.textOn('#000000');
  ok(name+": it returns different anchors for white and black grounds",
     onWhite !== onBlack, onWhite+" / "+onBlack);
  ok(name+": dark text on white", M.relLum(onWhite) < 0.2, onWhite);
  ok(name+": light text on black", M.relLum(onBlack) > 0.5, onBlack);
});

// ===========================================================================
console.log("\nTHE ONE-CARD MARKER'S GROUNDS");
// ===========================================================================
/* The marker that stands where Shuffle would when a room has a single layout.
   It introduces four new text/ground pairs, and it shows for EVERYONE — it is
   not a .helpdot and is not hidden in expert mode — so all four are load-bearing
   in both themes. Card and why-box grounds are read from the stylesheet the same
   way the rest of this suite reads tokens. */
Object.keys(THEMES).forEach(function(name){
  var T = THEMES[name];
  [['one-liner on the card', T.paperDim, T.ink2],
   ['(i) glyph on the card', T.brass,    T.ink2],
   ['why-box copy',          T.paperDim, T.ink3],
   ['(i) pressed state',     T.onBrass,  T.brassFill]
  ].forEach(function(c){
    var r = ratio(c[1], c[2]);
    ok(name+": "+c[0]+"  "+c[1]+" on "+c[2]+"  "+r.toFixed(2)+":1", r >= AA, r.toFixed(2));
  });
});
// --brass is the one that moves: it must DARKEN in daylight or it cannot sit on
// a light card. This is the documented two-token rule, asserted rather than trusted.
ok("--brass darkens in daylight so it can be text on a light ground",
   M.relLum(THEMES.light.brass) < M.relLum(THEMES.dark.brass),
   THEMES.light.brass+" vs "+THEMES.dark.brass);
ok("--brass-fill stays bright in BOTH themes (it is a fill, not text)",
   THEMES.light.brassFill === THEMES.dark.brassFill,
   THEMES.light.brassFill+" / "+THEMES.dark.brassFill);

// ===========================================================================
console.log("\nPHYSICAL LIGHT USES ABSOLUTE ANCHORS, NOT ROLE TOKENS");
// ===========================================================================
/* A bevel catch, a shadow and wood grain model LIGHT. They need "the dark one"
   and "the light one" — not --paper and --ink, which swap between themes. The
   Wood renderer shipped with `stroke:TOK.paper` for the highlight and
   `stroke:TOK.ink` for the shadow: correct at night, INVERTED in daylight. The
   floor lit itself from below and the grain went pale, for a whole release.

   It hid because the scratch render tool hardcoded those two tokens the wrong
   way round for light theme, so the daylight render looked plausible. The
   committed render_svg.js parses them from the stylesheet, which is what
   surfaced it — the same "parse, don't hardcode" rule this suite runs on. */
Object.keys(THEMES).forEach(function(name){
  var T = THEMES[name];
  M.setTokens(T);
  ok(name+": the dark anchor really is the darker of the two",
     M.relLum(M.textOn('#ffffff')) < M.relLum(M.textOn('#000000')));
  // On a mid-tone plank, a catch must be lighter and a shadow darker than it.
  var plank = T.plank1 || '#c08a4a';
  var lighter = M.textOn('#000000'), darker = M.textOn('#ffffff');
  ok(name+": a catch is lighter than the board it sits on",
     M.relLum(lighter) > M.relLum(plank), lighter+" vs "+plank);
  ok(name+": a shadow is darker than the board it sits on",
     M.relLum(darker) < M.relLum(plank), darker+" vs "+plank);
});
(function(){
  // And the shipped renderer must not reach for the role tokens here.
  var i = html.indexOf('if (view === "wood"){');
  var body = html.slice(i, html.indexOf('if (view === "install" && len > 26){', i));
  ok("the wood bevel uses anchorLight(), not TOK.paper",
     /stroke:anchorLight\(\)/.test(body) && !/stroke:TOK\.paper\b/.test(body));
  ok("the wood shadow and grain use anchorDark(), not TOK.ink",
     /stroke:anchorDark\(\)/.test(body) && !/stroke:TOK\.ink\b/.test(body));
  ok("...and the anchors are chosen by measured luminance",
     /function anchorDark\(\)\{\s*return relLum\(TOK\.ink\) < relLum\(TOK\.paper\)/.test(html));
})();

// ===========================================================================
console.log("\nDONE IS NOT CARRIED BY COLOUR ALONE");
// ===========================================================================
(function(){
  // A tick prefix, so the state survives greyscale, glare and colour blindness.
  var i = html.indexOf('function buildSvg(');
  var body = html.slice(i, html.indexOf('// ---------- fullscreen overlay ----------', i));
  ok("a done label carries a tick as well as a colour",
     /isDone \? "✓ " : ""/.test(body));
  ok("the label colour comes from the ground, never from the plank's own fill",
     /fill: \(isDone \|\| isNow\) \? textOn\(ground\)/.test(body));
  ok("...and --ok is no longer used as a LABEL colour anywhere in buildSvg",
     !/fill:\s*isDone \? TOK\.ok/.test(body));
  ok("done rows now fade in the install view too, like every other view",
     /if \(isDone\) rect\.setAttribute\("fill-opacity"/.test(body));
})();

// run_tests.sh greps for a line matching ^N passed, M failed — keep this format.
console.log("\nengine source: material=" + M.__source);
console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
