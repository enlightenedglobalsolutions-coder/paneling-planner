// ============================================================================
//  engine_source.js — one way to get at an engine's source, for every harness.
//
//  Stagger's engines live INSIDE index.html. They are pure (no DOM), so a test
//  can slice them out and run them in node — that is what test_bridge.js has
//  always done. The problem with doing it per-harness is that the day an engine
//  is extracted to its own module, every harness that sliced it breaks at once.
//
//  So: resolve MODULE-FIRST, SLICE-FALLBACK.
//    - if ./<module>.js exists, require it
//    - otherwise cut the named anchor ranges out of index.html and eval them
//  Extracting an engine to a module is then a no-op for the tests: they simply
//  stop slicing and start requiring, with no harness edit.
//
//  Every failure here is LOUD and exits 1 BEFORE any assertion runs, so a
//  harness that cannot load its engine never prints a misleading
//  "0 passed, 0 failed". Same contract as test_bridge.js.
//
//  Run:  (not run directly — required by the test_*.js harnesses)
// ============================================================================

var fs = require('fs');
var path = require('path');

var REPO = __dirname;
var HTML = path.join(REPO, 'index.html');

// ---------------------------------------------------------------------------
//  The engine registry.
//
//  `module`  optional on-disk module; used if present.
//  `ranges`  ordered [startAnchor, endAnchor] pairs, concatenated in order.
//            Anchors are EXACT substrings of index.html and must each appear
//            exactly once. The end anchor is exclusive.
//  `exports` names the slice must define, checked after eval.
//  `pure`    if true, the slice must not touch the DOM (default true).
// ---------------------------------------------------------------------------
var ENGINES = {

  // Grid geometry — what test_bridge.js has always sliced.
  // NOTE the START anchor is snapToGrid, NOT rectsToCells: allConnected lives
  // inside the block and CALLS rectsAdjacent, which sat just outside the old
  // slice, and snapRect calls nearestEdge. Nothing exercised those paths, so
  // the old slice worked by luck. Starting at the top of the geometry block
  // closes the gap (CLAUDE.md records this as the documented fix).
  grid: {
    module: 'grid_geom.js',
    ranges: [['function snapToGrid(v, grid){', '//  EGS Measurement Widget']],
    exports: ['rectsToCells', 'traceOutline', 'allConnected', 'rectsAdjacent',
              'mergeColinear', 'countRegions', 'snapToGrid', 'snapRect']
  },

  // FL flooring engine — the pure core only. Stops at readInputs(), which is
  // the first DOM-bound function in the module.
  fl: {
    module: 'fl_engine.js',
    ranges: [['var STEP = 0.5;', '  function readInputs(){']],
    exports: ['joints', 'clearance', 'tailLen', 'rowPieces', 'legalStarts',
              'pickFresh', 'buildLayout', 'audit', 'wasteOf', 'uniqueStarts',
              'shortestPeriod', 'generateCandidates', 'boxPlan', 'isLocked',
              'suggestOffset', 'bandRowPlan', 'bandedCfg', 'clearanceAbs', 'absJoints']
  },

  // Base paneling engine. NOT contiguous: assignStock / computeTakeoff /
  // planOffcuts sit OUTSIDE the engine's own END marker, and all three need
  // rowName(), which lives 500 lines further down. Five ranges, each verified
  // DOM-free, concatenated in file order.
  panel: {
    module: 'panel_engine.js',
    ranges: [
      ['//  ===== PANELING ENGINE START =====', '//  ===== PANELING ENGINE END ====='],
      ['function assignStock(inp, rowJoints){', 'var STOCK_LENGTHS'],
      ['function capForInputs(inp){',            'var LONGEST_STOCK'],
      ['function planOffcuts(inp, unit, stockLenIn){', '// ---------- render cut list ----------'],
      ['function rowName(r){',                   'function el(tag,cls){']
    ],
    // generateOptions reads the module global LONGEST_STOCK (index.html:1026)
    // and OVERRIDES its own capIn parameter with it — so it is not pure, and
    // the same call returns different results depending on whether generate()
    // ran first. The real declaration sits between two ambiguous anchors, so
    // the loader declares the binding itself and hands the harness a setter.
    // Tests must set it explicitly per case rather than inherit it.
    preamble: 'var LONGEST_STOCK = 0;',
    accessors: {
      setLongestStock: 'function(v){ LONGEST_STOCK = v; }',
      getLongestStock: 'function(){ return LONGEST_STOCK; }'
    },
    exports: ['buildTrusses', 'segLengths', 'maxSeg', 'jointCount',
              'candidateRows', 'buildPanelLayout', 'auditLayout', 'optionStats',
              'generateOptions', 'assignStock', 'computeTakeoff', 'planOffcuts',
              'capForInputs', 'rowName']
  },

  // Deck ordering — the Reshuffle layer. Deliberately OUTSIDE the fl slice
  // (which ends at readInputs) because it runs above the engine: it reorders
  // what the viewer cycles through and never changes what the engine produced.
  // That separation is the reason the deck work moved zero goldens, and this
  // entry is what keeps it honest — if the block ever drifts back into the
  // engine's range, the fl anchors break rather than the deck silently
  // becoming part of the pinned output.
  //
  // Its one external dependency is S.deckSize, which orderDeck WRITES. The
  // loader supplies the object so the harness can read the deck size back
  // exactly the way the UI does.
  deck: {
    module: 'deck.js',
    ranges: [['  var DECK_SLOTS   = 6;', '  function generate(){']],
    preamble: 'var S = { deckSize: 0, deckWhy: null };',
    accessors: {
      getDeckSize: 'function(){ return S.deckSize; }',
      getDeckWhy:  'function(){ return S.deckWhy; }',
      getSlots:    'function(){ return DECK_SLOTS; }',
      getVisibleMin: 'function(){ return VISIBLE_MIN; }',
      getCeilings: 'function(){ return DECK_CEILINGS; }'
    },
    exports: ['deckDistance', 'minLoopGap', 'permute', 'buildDeck', 'orderDeck', 'deckVerdict']
  },

  // The wood material. Pure arithmetic that decides what each plank LOOKS like.
  // Pinned because the failure mode is statistical, not functional: a change that
  // narrows the value spread or evens out the grain still renders a floor, still
  // passes every other suite, and just quietly goes back to looking like a
  // graphic. Only numbers catch that.
  material: {
    module: 'material.js',
    ranges: [
      ['  var SPECIES = {};',                     '  /* Along-length sheen.'],
      ['  function plankGrain(seed, row, piece){', '  /* Baseline for a label']
    ],
    // WOOD is the live --plank-1..6 array, filled by refreshTokens() from CSS;
    // TOK is only reached for the empty-palette fallback. Tests supply both.
    preamble: 'var WOOD = [], TOK = { ink3:"#eeeeee" };',
    accessors: {
      setPalette: 'function(a){ WOOD.length = 0; a.forEach(function(c){ WOOD.push(c); }); }',
      setTokens:  'function(t){ Object.keys(t).forEach(function(k){ TOK[k] = t[k]; }); }',
      getSpread:  'function(){ return PLANK_SPREAD; }',
      getWarmth:  'function(){ return PLANK_WARMTH; }'
    },
    // textOn/relLum/mixHex sit inside the same range and share its hex helpers,
    // so they are exported here rather than sliced again. They need a LIVE TOK —
    // the whole point of textOn is that TOK.ink and TOK.paper swap between
    // themes — hence setTokens rather than a fixed preamble value.
    exports: ['plankTone', 'plankGrain', 'plankHash', 'plankRand',
              'shadeTone', 'warmTone', 'plankPalette',
              'relLum', 'mixHex', 'textOn']
  },

  // The join: the pure half of "can this area be laid, and with what numbers".
  // stgShowAreaLayout() itself touches the DOM and the overlay, but the two
  // decisions that matter — is this one band, and does the dimension survive the
  // trip through a Setup field — are arithmetic and belong under test.
  // parseMeas rides along because the round-trip is only meaningful against the
  // REAL parser; reimplementing it here would test the reimplementation.
  areajoin: {
    module: 'area_join.js',
    ranges: [
      ['// Lossless inches -> a Setup field.', 'function stgShowAreaLayout(i){'],
      ['function parseMeas(str, defUnit){',    '// Read a measurement field']
    ],
    exports: ['stgInchField', 'stgAreaRect', 'parseMeas', 'fracVal']
  },

  // The demo rooms. Not an engine at all — a config table — but it is sliced the
  // same way for the same reason: the numbers printed on a room card must be the
  // numbers the engine actually produces, and the only way to know is to run one
  // against the other.
  sample: {
    module: 'sample_rooms.js',
    ranges: [['var SAMPLE_ROOMS = [', 'function stgSampleRoom(key){']],
    accessors: { getRooms: 'function(){ return SAMPLE_ROOMS; }' },
    exports: []
  },

  // Label placement. buildSvg() itself touches the DOM and cannot be sliced, but
  // the part that decides WHERE a label sits is pure arithmetic, so it is pinned
  // here rather than left to a screenshot. Guards the clamp that keeps a label
  // inside the sheet when its row is thinner than the text (edgeRip can be 2"
  // against a 6.4-unit glyph).
  label: {
    module: 'label_geom.js',
    ranges: [['  var GLYPH_ABOVE = 0.98', '  // One renderer, five skins.']],
    accessors: {
      getAbove: 'function(){ return GLYPH_ABOVE; }',
      getBelow: 'function(){ return GLYPH_BELOW; }'
    },
    exports: ['labelBaseline']
  }
};

function die(lines){
  lines.forEach(function(l){ console.error(l); });
  process.exit(1);
}

function readHtml(){
  try { return fs.readFileSync(HTML, 'utf8'); }
  catch(e){
    die(["FAIL: cannot read " + HTML,
         "      engine_source.js must be run from the repo that holds index.html.",
         "      (" + e.message + ")"]);
  }
}

// Cut one [start, end) range, insisting both anchors are unique.
function cut(html, name, startAnchor, endAnchor, idx){
  var firstS = html.indexOf(startAnchor);
  var firstE = html.indexOf(endAnchor, firstS < 0 ? 0 : firstS);

  if (firstS < 0 || firstE < 0){
    die(["FAIL: could not locate range " + (idx+1) + " of engine '" + name + "' in index.html.",
         "      start: " + JSON.stringify(startAnchor) + (firstS < 0 ? "   <-- NOT FOUND" : "   ok"),
         "      end:   " + JSON.stringify(endAnchor)   + (firstE < 0 ? "   <-- NOT FOUND" : "   ok"),
         "      The anchors moved. Fix the anchor in engine_source.js — do not",
         "      widen the range to paper over it."]);
  }

  // A duplicated anchor means the slice is ambiguous, which is worse than a
  // missing one because it fails silently.
  var dupS = html.indexOf(startAnchor, firstS + 1);
  var dupE = html.indexOf(endAnchor,   firstE + 1);
  if (dupS >= 0 || dupE >= 0){
    die(["FAIL: ambiguous anchor for engine '" + name + "', range " + (idx+1) + ".",
         "      " + JSON.stringify(dupS >= 0 ? startAnchor : endAnchor) +
           " appears more than once in index.html.",
         "      Make the anchor unique — an ambiguous slice can silently take",
         "      the wrong code."]);
  }
  return html.slice(firstS, firstE);
}

/**
 * Load an engine by name. Returns an object of its exported functions.
 * Module-first, slice-fallback.
 */
function load(name){
  var spec = ENGINES[name];
  if (!spec) die(["FAIL: unknown engine '" + name + "'.",
                  "      Known: " + Object.keys(ENGINES).join(', ')]);

  // --- module path -------------------------------------------------------
  if (spec.module){
    var modPath = path.join(REPO, spec.module);
    if (fs.existsSync(modPath)){
      var mod = require(modPath);
      var missing = spec.exports.filter(function(n){ return typeof mod[n] !== 'function'; });
      if (missing.length){
        die(["FAIL: " + spec.module + " exists but does not export: " + missing.join(', '),
             "      A partial extraction is worse than none — the harness would",
             "      test a different engine than the app runs."]);
      }
      mod.__source = 'module:' + spec.module;
      return mod;
    }
  }

  // --- slice path --------------------------------------------------------
  var html = readHtml();
  var src = spec.ranges.map(function(r, i){ return cut(html, name, r[0], r[1], i); }).join('\n');

  if (spec.pure !== false && /document\.|window\.|localStorage/.test(src)){
    var offending = (src.match(/^.*(?:document\.|window\.|localStorage).*$/m) || [''])[0].trim();
    die(["FAIL: engine '" + name + "' now touches the DOM in index.html.",
         "      first offending line: " + offending.slice(0, 100),
         "      Extract it to a module rather than widening this harness."]);
  }

  var out;
  try {
    // Return the named exports out of the evaluated slice, plus any accessors
    // the spec declares for module globals the slice depends on.
    var fields = spec.exports.map(function(n){ return n + ":" + n; });
    Object.keys(spec.accessors || {}).forEach(function(k){
      fields.push(k + ":" + spec.accessors[k]);
    });
    var factory = new Function(
      (spec.preamble ? spec.preamble + "\n" : "") + src +
      "\nreturn {" + fields.join(',') + "};"
    );
    out = factory();
  } catch(e){
    die(["FAIL: engine '" + name + "' sliced out of index.html but would not evaluate.",
         "      " + e.constructor.name + ": " + e.message,
         "      Usually this means the slice is missing a helper it calls.",
         "      Widen the range in engine_source.js to include it."]);
  }

  var absent = spec.exports.filter(function(n){ return typeof out[n] !== 'function'; });
  if (absent.length){
    die(["FAIL: engine '" + name + "' slice is missing: " + absent.join(', '),
         "      Either the function was renamed, or it fell outside the range."]);
  }

  out.__source = 'slice:index.html';
  return out;
}

// A stable, readable digest for golden comparisons. Not cryptographic intent —
// just a backstop that catches anything the human-readable projection misses.
function digest(value){
  return require('crypto').createHash('sha256')
           .update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

module.exports = { load: load, digest: digest, ENGINES: ENGINES };
