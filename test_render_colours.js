// ============================================================================
//  test_render_colours.js — every rendered colour is a real colour.
//
//  THE BUG THIS EXISTS FOR. In paneling mode every plank body rendered PURE
//  BLACK, in both themes. Neither obvious cause was it: not an unresolved
//  `var()`, not a missing material branch. The diagram is built by STRING
//  CONCATENATION, and the retheme that swapped hex literals for token names
//  produced this:
//
//      s += '<rect ... fill=TOK.ink3 stroke=TOK.line/>'
//
//  — an unquoted attribute whose literal value is the eight characters
//  "TOK.ink3". SVG cannot parse that as a paint, so it falls back to black. The
//  fix is `fill="'+TOK.ink3+'"`. Sixteen attributes across two renderers.
//
//  WHY IT HID FOR SO LONG: text and gutter labels were broken in exactly the
//  same way, but black text on a light sheet looks deliberate. Only the large
//  filled rectangles made it obvious, and only in one mode — so it read as "the
//  paneling renderer is broken" rather than "every colour in this file is".
//
//  These checks are STATIC because the failure is a source-level typo class, and
//  a static check runs in front of every deploy. The runtime sweep (all modes x
//  both themes, no fill-painting element computing to black) was run in-browser
//  and is recorded in the commit; `<line>` elements are excluded there because
//  they carry a default black `fill` they never paint — counting them reports 31
//  false positives and teaches you to ignore the sweep.
//
//  Run:  node test_render_colours.js     (or ./run_tests.sh)
// ============================================================================

var fs = require('fs'), path = require('path');

var pass=0, fail=0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok  "+name); }
  else { fail++; console.log("FAIL  "+name+(extra!=null?"  "+extra:"")); }
}
var html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');

// The paint attributes an SVG actually renders with.
var PAINT = 'fill|stroke|stop-color|flood-color|lighting-color';

/* Find paint attributes whose value is a bare identifier — the exact bug.

   `fill=` is ALSO an ordinary JS assignment (`var fill=el(...)`,
   `var fill=act?a:b`), and a naive sweep reports those as broken markup. A check
   that cries wolf gets switched off, so declarations are excluded. Scanning the
   raw source rather than extracted string literals is deliberate: the fixed form
   `fill="'+TOK.ink3+'"` SPANS a quote boundary, so a literal-extracting scan
   sees no attributes at all and passes vacuously. */
function badPaintAttrs(src){
  var re = new RegExp('(var|let|const)?\\s*\\b(' + PAINT + ')=(?!["\'])([A-Za-z_$][\\w.$]*)', 'g');
  var out = [], m;
  while ((m = re.exec(src))){
    if (m[1]) continue;                 // a JS declaration, not markup
    out.push(m[2] + '=' + m[3]);
  }
  return out;
}

// ===========================================================================
console.log("\nNO TOKEN NAME IS EVER RENDERED AS A LITERAL");
// ===========================================================================
(function(){
  // The exact shape of the bug: an UNQUOTED attribute taking a bare identifier.
  var bare = badPaintAttrs(html);
  ok("no paint attribute takes an unquoted identifier", bare.length===0,
     bare.slice(0,4).join(', '));
  // Prove the check would still catch the original bug rather than passing
  // because it stopped looking.
  ok("...and the check still detects the shape it was written for",
     badPaintAttrs("s += '<rect fill=TOK.ink3 stroke=TOK.line/>';").length === 2);
  ok("...while ignoring an ordinary JS assignment",
     badPaintAttrs("var fill=el('div','x');").length === 0);

  // The near-miss: quoted, but quoting the NAME instead of the value.
  var quoted = html.match(new RegExp('\\b(?:'+PAINT+')="(?:TOK|window\\.TOK)\\.', 'g')) || [];
  ok("no paint attribute is the string \"TOK.something\"", quoted.length===0,
     quoted.slice(0,4).join(', '));

  // CSS custom properties do not resolve in SVG PRESENTATION attributes. If one
  // appears here it renders as nothing, which looks like a missing element
  // rather than a colour bug.
  var vars = html.match(new RegExp('\\b(?:'+PAINT+')="var\\(', 'g')) || [];
  ok("no paint attribute uses var() (it does not resolve as a presentation attr)",
     vars.length===0, vars.slice(0,4).join(', '));
})();

// ===========================================================================
console.log("\nEVERY TOKEN REFERENCED IS A TOKEN THAT EXISTS");
// ===========================================================================
(function(){
  // Harvest the keys refreshTokens() actually assigns.
  var i = html.indexOf('function refreshTokens(');
  var body = html.slice(i, html.indexOf('window.refreshTokens', i));
  var defined = {};
  (body.match(/TOK\.(\w+)\s*=/g) || []).forEach(function(m){
    defined[m.replace(/TOK\.|\s*=/g,'')] = true;
  });
  ok("refreshTokens defines a healthy set of tokens",
     Object.keys(defined).length >= 18, Object.keys(defined).length+" tokens");

  // Every TOK.x read anywhere in the file must be one of them. This is what
  // catches a typo'd token: interpolating TOK.brasslite yields `undefined`,
  // which SVG treats exactly like the literal-string bug — black.
  var used = {};
  (html.match(/\bTOK\.(\w+)/g) || []).forEach(function(m){
    used[m.slice(4)] = true;
  });
  var unknown = Object.keys(used).filter(function(k){
    return !defined[k] && k !== 'plank' && k !== 'heat';
  });
  ok("every TOK.<name> read in the file is one refreshTokens defines",
     unknown.length===0, unknown.join(', '));

  // And the two ramps really are arrays, so TOK.plank[0] is a colour not undefined.
  ok("the plank and heat ramps are built as arrays",
     /TOK\.plank\s*=\s*ramp\(/.test(body) && /TOK\.heat\s*=\s*ramp\(/.test(body));
})();

// ===========================================================================
console.log("\nSTRING-BUILT SVG INTERPOLATES ITS COLOURS");
// ===========================================================================
(function(){
  // The two renderers that build SVG as text rather than through mk().
  [['drawDiagram',        'paneling layout diagram'],
   ['renderMeasureDiagram','measure diagram']].forEach(function(r){
    var i = html.indexOf('function '+r[0]+'(');
    ok(r[1]+" exists", i > 0);
    if (i < 0) return;
    // to the next top-level function
    var j = html.indexOf('\nfunction ', i+1);
    var body = html.slice(i, j < 0 ? i+9000 : j);

    var paints = (body.match(new RegExp('\\b(?:'+PAINT+')=', 'g')) || []).length;
    var broken = badPaintAttrs(body);
    ok(r[1]+": all "+paints+" paint references are quoted or interpolated",
       broken.length===0, broken.slice(0,3).join(', '));

    // Any token it uses must be interpolated, not pasted.
    var pasted = body.match(new RegExp('\\b(?:'+PAINT+')="TOK\\.', 'g')) || [];
    ok(r[1]+": no token pasted as a string", pasted.length===0);
  });
})();

// ===========================================================================
console.log("\nNO HARDCODED HEX SURVIVES IN THE THEMED RENDERERS");
// ===========================================================================
(function(){
  /* A literal hex cannot follow the theme, so it is the same class of defect one
     step quieter: right in one theme, wrong in the other. Checked only inside the
     renderers that are supposed to be themed — fallbacks inside refreshTokens()
     are legitimate and excluded, since that is where the defaults live. */
  var i = html.indexOf('function drawDiagram(');
  var body = html.slice(i, html.indexOf('\nfunction ', i+1));
  var hexes = body.match(new RegExp('\\b(?:'+PAINT+')="#[0-9a-fA-F]{3,8}"', 'g')) || [];
  ok("the paneling diagram hardcodes no hex paint", hexes.length===0,
     hexes.slice(0,4).join(', '));

  // KNOWN, out of scope for this thread and recorded rather than silently
  // tolerated: one legend swatch border is a literal. It is a 0.5px border on a
  // swatch, not a rendered fill, and it belongs to the legend work.
  var swatch = /\.5px solid #B9B7AE/.test(html);
  ok("(known) the legend swatch border is still a literal — filed, not fixed", swatch);
})();

// run_tests.sh greps for a line matching ^N passed, M failed — keep this format.
console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
