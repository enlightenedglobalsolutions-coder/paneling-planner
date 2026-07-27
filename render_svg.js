#!/usr/bin/env node
// ============================================================================
//  render_svg.js — render a layout to a real .svg/.png, headless.
//
//  WHY THIS EXISTS. Some questions can only be answered by LOOKING: "does the
//  Wood view read as timber or as a graphic", "do the labels follow the plank
//  when it rotates". The Chrome extension's screenshot times out on this app
//  often enough that a session will burn its budget retrying it and then guess.
//
//  So: slice the SHIPPED buildSvg() out of index.html and run it against a
//  20-line DOM shim. Nothing is re-implemented, so what comes out is what ships
//  — verify by matching element counts against the live DOM.
//
//  BONUS, and it is not a small one: `qlmanage` rasterises with WEBKIT, which
//  is the engine iOS Safari actually runs. For an EGS PWA that makes this a free
//  cross-engine check, not merely a workaround for a flaky screenshot.
//
//  USAGE
//    node render_svg.js                            # wood, dark theme, kitchen
//    node render_svg.js --view=install --rot       # rotated install view
//    node render_svg.js --theme=light --room=hall  # 24'x4' hallway in daylight
//    node render_svg.js --done=1,2,3               # with rows 1-3 ticked off
//    node render_svg.js --png                      # also rasterise via qlmanage
//    node render_svg.js --out=/tmp/x.svg
//
//  views: blueprint | seams | heat | wood | install
//  rooms: kitchen | great | hall
//
//  Then read the .png. That is the only step that answers "photo or graphic".
// ============================================================================

var fs = require('fs'), path = require('path'), cp = require('child_process');
var REPO = __dirname;
var HTML = path.join(REPO, 'index.html');
var html = fs.readFileSync(HTML, 'utf8');
var FL = require(path.join(REPO, 'engine_source.js')).load('fl');

function die(m){ console.error('FAIL: ' + m); process.exit(1); }
function cut(a, b){
  var i = html.indexOf(a); if (i < 0) die('anchor missing in index.html: ' + a);
  var j = html.indexOf(b, i); if (j < 0) die('end anchor missing: ' + b);
  return html.slice(i, j);
}

// --- args -------------------------------------------------------------------
var A = {};
process.argv.slice(2).forEach(function(s){
  var m = /^--([^=]+)(?:=(.*))?$/.exec(s);
  if (m) A[m[1]] = m[2] === undefined ? true : m[2];
});
var theme = A.theme || 'dark';
var view  = A.view  || 'wood';
var rot   = !!A.rot;
var done  = String(A.done || '').split(',').filter(Boolean).map(Number);

// --- tokens, READ FROM THE STYLESHEET ---------------------------------------
/* Deliberately parsed, never hardcoded. --ink and --paper are ROLE tokens —
   ink is the surface, paper is the text — so they SWAP between themes: in
   daylight --ink is #f4f5f6 and --paper is #1c2026, at night the reverse. A
   hardcoded table in this file got that backwards once and made a light-theme
   render look plausible while the shipped app was failing contrast. Parse it. */
function tokens(themeName){
  var block = cut(':root[data-theme="' + themeName + '"]{', '}');
  var t = {}, re = /--([a-z0-9-]+)\s*:\s*([^;]+);/g, m;
  while ((m = re.exec(block))) t[m[1]] = m[2].trim();
  if (!t['ink'] || !t['paper']) die('could not parse tokens for theme ' + themeName);
  var camel = function(k){ return k.replace(/-(\w)/g, function(_,c){ return c.toUpperCase(); }); };
  var TOK = {};
  Object.keys(t).forEach(function(k){ TOK[camel(k)] = t[k]; });
  TOK.plank = [1,2,3,4,5,6].map(function(n){ return t['plank-' + n]; }).filter(Boolean);
  return TOK;
}

// --- DOM shim ---------------------------------------------------------------
function El(n){ this.name=n; this.attrs={}; this.kids=[]; this.style={}; this.textContent=''; }
El.prototype.setAttribute = function(k,v){ this.attrs[k]=v; };
El.prototype.getAttribute = function(k){ return this.attrs[k]; };
El.prototype.appendChild  = function(c){ this.kids.push(c); return c; };
El.prototype.addEventListener = function(){};
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
El.prototype.toString = function(){
  var a = Object.keys(this.attrs).map(function(k){
    return ' ' + k + '="' + String(this.attrs[k]).replace(/"/g,'&quot;') + '"';
  }, this).join('');
  return '<'+this.name+a+'>' + this.kids.map(String).join('') + esc(this.textContent) + '</'+this.name+'>';
};
global.document = { createElementNS: function(ns,n){ return new El(n); } };

// --- the renderer, sliced ---------------------------------------------------
var src = [
  'var SVGNS = "http://www.w3.org/2000/svg";',
  cut('  function mk(name, attrs){',              '  function rowY(cfg, i)'),
  cut('  function rowY(cfg, i)',                  '  // End joints of a row'),
  cut('  function rowJoints(r){',                 '  var VIEWS = ['),
  'var BLUE = [], WOOD = [];',
  cut('  var SPECIES = {};',                      '  // One renderer, five skins.'),
  cut('  function buildSvg(cand, cfg, opts){',    '  // ---------- fullscreen overlay ----------'),
  cut('  function inch(v){',                      '  // ---------- cut list / install ----------')
].join('\n');

var TOK = tokens(theme);
var S = { done:{}, view:view };
done.forEach(function(n){ S.done[n] = true; });

var M;
try {
  M = new Function('TOK','S','currentRow','LEGENDS','OV',
    src + '\nreturn { buildSvg:buildSvg, WOOD:WOOD, BLUE:BLUE };'
  )(TOK, S, function(){ for (var i=1;i<=99;i++) if(!S.done[i]) return i; return null; }, {}, {panned:false});
} catch(e){
  die('the sliced renderer would not evaluate — an anchor probably moved.\n      '
      + e.constructor.name + ': ' + e.message);
}
TOK.plank.forEach(function(c){ M.WOOD.push(c); });
[TOK.ink3, TOK.line, TOK.lineSoft, TOK.ink2, TOK.ink3, TOK.line].forEach(function(c){ M.BLUE.push(c); });

// --- the room ---------------------------------------------------------------
var ROOMS = {
  kitchen: { roomRunIn:156, roomAcrossIn:132 },
  great:   { roomRunIn:240, roomAcrossIn:192 },
  hall:    { roomRunIn:288, roomAcrossIn:48  }
};
var pick = ROOMS[A.room || 'kitchen'] || die('unknown room: ' + A.room);
var o = { gap:0.25, plankLen:60, plankWid:9, minOff:16, minReuse:20, minRip:2, perBox:8, rotate:4,
          roomRunIn:pick.roomRunIn, roomAcrossIn:pick.roomAcrossIn };

// readInputs() is DOM-bound, so its row/rip maths is reproduced here — the same
// duplication the test harnesses carry, and pinned by them.
var gap=o.gap, runIn=o.roomRunIn-2*gap, acrossIn=o.roomAcrossIn-2*gap;
var nRows=Math.ceil(acrossIn/o.plankWid), edge=(acrossIn-(nRows-2)*o.plankWid)/2;
if(nRows>=3 && edge<o.minRip){ nRows+=1; edge=(acrossIn-(nRows-2)*o.plankWid)/2; }
if(nRows<2){ nRows=2; edge=acrossIn/2; }
var widths=[]; if(nRows===2){ widths=[acrossIn/2,acrossIn/2]; }
else { widths.push(edge); for(var k=0;k<nRows-2;k++) widths.push(o.plankWid); widths.push(edge); }
var cfg = { runIn:runIn, acrossIn:acrossIn, plankLen:o.plankLen, plankWid:o.plankWid,
            minOff:o.minOff, minReuse:o.minReuse, minRip:o.minRip, gap:gap, perBox:o.perBox,
            rotate:o.rotate, nRows:nRows, widths:widths, edgeRip:edge };

var cand = FL.generateCandidates(cfg)[0];
var svg  = M.buildSvg(cand, cfg, { view:view, rotated:rot, gutter:true, tappable:false });
svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
svg.setAttribute('width', rot ? 620 : 1000);

var out = A.out || path.join(REPO, 'render-'+view+'-'+theme+(rot?'-rot':'')+'.svg');
var text = String(svg);
fs.writeFileSync(out, text);

console.log('wrote  ' + out);
console.log('  view ' + view + '  theme ' + theme + (rot?'  rotated':'') +
            '  room ' + (A.room||'kitchen') + (done.length?('  done '+done.join(',')):''));
console.log('  rects ' + (text.match(/<rect/g)||[]).length +
            '  paths ' + (text.match(/<path/g)||[]).length +
            '  texts ' + (text.match(/<text/g)||[]).length);

if (A.png){
  // qlmanage is WebKit — the engine iOS Safari uses. No rsvg-convert/cairosvg here.
  var dir = path.dirname(out);
  cp.execSync('qlmanage -t -s 1100 -o ' + JSON.stringify(dir) + ' ' + JSON.stringify(out),
              { stdio:'ignore' });
  console.log('rasterised (WebKit) ' + out + '.png');
}
