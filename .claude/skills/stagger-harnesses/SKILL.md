---
name: stagger-harnesses
description: How Stagger's test harnesses reach the engines inside index.html — the engine_source.js registry, module-first/slice-fallback resolution, its loud-failure guards, and the anchor traps. Load when adding or changing a harness, registering an engine, or when a loader anchor breaks.
---

# Stagger test harnesses — reaching the engines

Stagger's engines live inside `index.html`. They are pure, so a harness can slice them out and run
them in node. Doing that per-harness means the day an engine is extracted to a module, every
harness that sliced it breaks at once. So `engine_source.js` resolves **module-first,
slice-fallback**:

```js
var E = require('./engine_source.js');
var FL = E.load('fl');     // -> require('./fl_engine.js') if it exists
                           // -> else slice index.html between anchors
```

The registry lives in `engine_source.js` (`ENGINES`) — read the keys there. Not all of them are
engines in the layout sense — `material` and `label` are the pure arithmetic behind how the
drawing *looks*, sliced out because `buildSvg` itself touches the DOM and cannot be; `sample` is a
config table, sliced for the same reason anything else is, so the numbers on a room card can be run
against the engine that has to produce them. (`textOn`/`relLum`/`mixHex` ride along inside
`material`'s range and share its hex helpers, so `test_contrast.js` loads `material` too.)
**Extracting an engine to a module is a no-op for
the tests** — proven: writing `grid_geom.js` flips `test_bridge.js` from the slice path to the module
path with no harness edit and the same 16/16.

The loader fails **loudly and exits 1 before any assertion**, so a harness that cannot load its
engine never prints a misleading "0 passed, 0 failed". It rejects a missing anchor, an **ambiguous**
anchor (appearing more than once — an ambiguous slice can silently take the wrong code), a slice
that has started touching the DOM, and a partial extraction.

Two things the registry encodes that are easy to trip over:

- **The paneling engine is not contiguous.** `assignStock`, `computeTakeoff` and `planOffcuts` sit
  *outside* its own `PANELING ENGINE END` marker, and all three need `rowName()` ~500 lines further
  down. Five anchored ranges, concatenated.
- **`generateOptions` is not pure.** It reads the module global `LONGEST_STOCK` and **overrides its
  own `capIn` parameter with it**, so the same call returns different results depending on whether
  `generate()` ran first. The loader declares the binding and exposes `setLongestStock()`; tests set
  it per case. The impurity only bites when the value crosses a joint-count boundary, which is
  exactly why it went unnoticed.
- **`deck` is deliberately NOT part of `fl`.** The Reshuffle deck sits *above* the engine — the
  `fl` range ends at `readInputs()`, and the deck block starts ~50 lines later. That separation is
  the whole reason the shuffle work moved **zero goldens**: the deck reorders what the viewer
  cycles through and never changes what the engine produced. `test_deck.js` asserts `out[0] ===
  cands[0]` for every room, so if the deck ever starts reordering position 0 it fails *there*,
  with a message saying why, instead of 105 assertions failing in `test_fl_engine.js` with no
  explanation. `orderDeck` **writes** `S.deckSize`, so the loader supplies `S` and a
  `getDeckSize()` accessor.
