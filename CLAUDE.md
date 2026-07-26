# Stagger — repo notes

Extends the EGS working standards in `../../CLAUDE.md`. Only repo-specific rules live here.

## Inlined modules — re-inline before testing or deploying

`index.html` is a single self-contained file (no `<script src>`), so the tested modules are
**copied into it**, not linked. Six modules are inlined, in two styles — and since 2026-07-26
**`reinline.py` covers all six**:

| Module | Inlined as | Tested by |
|---|---|---|
| `store.js` | `StaggerStore` IIFE | `test_store.js`, `test_jobs.js` |
| `migrate_jobs.js` | `StaggerMigrate` IIFE | `test_persist.js` |
| `diagnose.js` | `StaggerDiag` IIFE | `test_diagnose.js` |
| `spread.js` | bare, between `/* ==== spread.js (inlined) ... ==== */` sentinels | `test_spread.js` |
| `lshape.js` | bare, between sentinels | `test_lshape.js` |
| `bridge.js` | bare, between sentinels | `test_bridge.js` |

(`inside_dims.js` is **not** inlined — it has no consumer in `index.html` yet.)

**After editing ANY of those six, run `python3 reinline.py` before testing or deploying.** It
rewrites every block from the modules on disk, takes a timestamped backup, and is idempotent —
running it with no module changes is a 0-byte edit.

Skipping it means the harnesses pass against `store.js` while `index.html` still carries the
old code, and the app ships something no test has ever run. The gap is silent: nothing fails,
the tests are just no longer testing what ships.

### Why the bare three were added (Stage 0, 2026-07-26)

`spread.js`, `lshape.js` and `bridge.js` used to be copied **by hand**, so `test_bridge.js` tested
`bridge.js` on disk while the app ran a hand-copied inline version. They happened to be in sync —
by hand, not by proof. They are now regenerated, so drift is impossible by construction. Verified
by injecting a hand-edit into the inlined bridge copy and watching `reinline.py` repair it.

The bare blocks sit between **sentinels `reinline.py` writes and regenerates**:

```
/* ==== bridge.js (inlined) — REFRESHED BY reinline.py. Edit bridge.js, not here. ==== */
   ...module source, minus its module.exports block...
/* ==== end bridge.js ==== */
```

They exist because the obvious anchor — the module's own first comment — is destroyed by the very
rewrite that needs it. Don't hand-edit between them; the next `reinline.py` will overwrite it. The
adapters the old note warned about (`v2RunSpread` around `runSpread`) sit **outside** the sentinels
and are untouched.

Note the export-stripping regex is deliberately tolerant of spacing: `bridge.js` writes
`if (typeof module !== "undefined")` and `spread.js` writes it without spaces. A fixed-string
separator silently misses one of them.

To prove the inlined copies match the modules, extract them back out of `index.html` and run the
real harnesses against the extracted code — that is the check that catches drift.

`test_bridge.js` already works this way: it slices the grid-geometry block out of `index.html` and
tests *that*, so it fails if the shipped file drifts. It fails loudly with a readable message if
its anchors move or the block starts touching the DOM — a harness that cannot run must not look
like one that passes.

## Themes — one token system, two palettes

The whole app (main screens **and** the Jobs overlay) runs on one set of CSS custom
properties, using the EGS house vocabulary from Notebuilt/Roadside: **surface = `--ink*`,
text = `--paper*`, hairlines = `--line*`**. The old blue `:root` and the overlay's private
brass block are both gone — that duplication is what made `--ink`/`--paper`/`--line`/`--ok`/
`--warn` mean *opposite things* in the two halves of the file. Don't reintroduce a scoped
palette.

Direction is **Charcoal & Brass**: cool neutral grounds, brass reserved for accents, timber
kept where it belongs (the plank ramp). Every text/background pair clears **WCAG 4.5:1 in both
themes** — if you change a colour, re-check it.

**Brass has two tokens and they are not interchangeable:**
- `--brass-fill` — brass as a **fill** (buttons, pills). Stays bright `#C89A34` in *both* themes.
- `--brass` — brass as **text** on the ground. Darkens to `#8a6410` in daylight, or it fails
  contrast on a light background.
- `--on-brass` — text sitting on `--brass-fill`. Near-black in both.
- `--brass-grad` is a **gradient**: valid only as a `background`. Using it for `color`/`stroke`/
  `border-color` silently renders nothing.

Theme is stored in `stagger.theme` (`light`/`dark`/`system`, default `system`). An inline script
in `<head>`, **before the stylesheet**, resolves the preference to an explicit `data-theme` on
`<html>` so there is no flash of the wrong theme and CSS never needs a duplicated media-query
palette. A `matchMedia` listener keeps `system` live.

### The SVG renderers do not follow CSS
Roughly 80 colours are painted as SVG *attributes*, so a variable swap cannot reach them.
`refreshTokens()` reads them out of CSS once per theme change into `TOK`, and `applyTheme()`
then calls `rerenderActive()` to redraw the visible screen. **`refreshTokens` is defined inside
the flooring module's closure and exported via `window.refreshTokens`** — without that export
`applyTheme`'s `typeof refreshTokens === "function"` check is false, and the layout silently
keeps the previous theme's colours while the chrome changes around it. That failure is invisible
unless you actually toggle the theme with a layout on screen.

## Beginner mode (EGS pilot — Stagger defines this pattern)

All help copy lives in **one liftable block, `STAGGER_HELP`**, keyed by the `data-help` attribute
on each `.helpdot`. Rendered with `textContent`, never `innerHTML`. Expert mode hides every
marker with a single rule on `:root[data-guide="expert"]` — no per-marker DOM work. Stored in
`stagger.beginner` (`1`/`0`, default **1**). To add a marker: add the copy to `STAGGER_HELP`, then
put `<button class="helpdot" data-help="your.key">i</button>` next to the control. Nothing else.

## Settings

Fifth bottom-nav tab, `#s-settings`. `switchScreen()` is data-driven off `data-screen`, so a new
screen needs no new plumbing. Holds Appearance, Guidance, Units and **Paneling mode** — the
Paneling/Flooring toggle that used to sit in the header. It is stored in `stagger.paneling` and
the app boots flooring-first unless it says otherwise.

## Safe-area

Follows the Notebuilt idiom: `--safe-t` / `--safe-b` aliases in `:root` with a `0px` fallback,
plus `viewport-fit=cover`. Never inline raw `env()` again. Note `#jobsOverlay .actions` — several
views stack 2–3 of those bars, so only `:last-of-type` sticks and carries the inset; otherwise the
gesture inset is counted two or three times.

## Service worker

The live one is **`service-worker.js`** — registered in `index.html`, stamped with a dated
`CACHE_VERSION` by `egs-deploy.sh` on every deploy. It `importScripts('./sw_logic.js')`.

`stagger-service-worker.js` was a byte-identical duplicate stuck at `CACHE_VERSION = 'DEV'` with
zero references anywhere in the repo. `egs-deploy.sh` only ever stamps `service-worker.js`, so it
could only drift further. **Retired to `_old/` on 2026-07-25.** Don't recreate it.

Still outstanding, not fixed here: `stagger-manifest.webmanifest` is a byte-identical, unreferenced
duplicate of `manifest.webmanifest`; and `manifest.webmanifest` points at
`icons/icon-maskable-512.png` while the file on disk is `icons/icon-512-maskable.png`, so the
maskable icon 404s.

## Test harnesses

**Run everything with `./run_tests.sh`** (optionally `./run_tests.sh engine` to filter). Exit 0 only
if every suite passes, so it is safe in front of a deploy. 10 suites, 447 assertions.

### `v2-modules/` is gone (Stage 0, 2026-07-26)

It held byte-identical copies of `store.js`, `lshape.js`, `spread.js`, `inside_dims.js` and three
of their tests — 59 duplicated assertions that could drift from the originals and prove nothing if
they did. Retired to `_old/v2-modules/` (gitignored, still on disk), along with two historical
prototypes (`stagger-v2-index.html`, `stagger-grid-demo.html`).

**One file was NOT a duplicate: `test_spread.js` was the only coverage `spread.js` had anywhere.**
It was promoted to the repo root rather than archived. Deleting the directory wholesale — which is
what the audit's Stage 0 line originally said — would have silently dropped it.

Assertion count went 506 → 447, which is exactly the 59 duplicates (10 + 23 + 26). No coverage lost.

### `engine_source.js` — how harnesses get at an engine

Stagger's engines live inside `index.html`. They are pure, so a harness can slice them out and run
them in node. Doing that per-harness means the day an engine is extracted to a module, every
harness that sliced it breaks at once. So `engine_source.js` resolves **module-first,
slice-fallback**:

```js
var E = require('./engine_source.js');
var FL = E.load('fl');     // -> require('./fl_engine.js') if it exists
                           // -> else slice index.html between anchors
```

Registered engines: `grid`, `fl`, `panel`. **Extracting an engine to a module is a no-op for the
tests** — proven: writing `grid_geom.js` flips `test_bridge.js` from the slice path to the module
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

### The two engine suites are CHARACTERISATION suites

`test_fl_engine.js` (105) and `test_panel_engine.js` (96) pin what the engines do **today**, so the
v3 restructure has to answer one question: *did the layout the user sees change?* They are not
specifications. **Where the engine has a defect, the defect is pinned and labelled `KNOWN DEFECT`,
not corrected — when it is fixed, those tests SHOULD fail, and get flipped to assert the new
behaviour.** Currently pinned:

- `plankLen 4` + `minOff 3` passes the UI guard (`4 <= 3` is false) then throws `TypeError` on row 2,
  because `legalStarts` finds nothing below `MIN_FRESH` and the fallback dereferences null.
- The rip bump adds one row with no re-check, so `edgeRip` can end up **below** the `minRip` warranty
  floor the engine just tried to enforce.
- `generateOptions` returns an option reporting `illegal:0` when no legal joint row exists at all —
  only the `label` string reveals it.
- `rowJoints` arrays are **shared** across rows and across options, and `option.unit === option.rowJoints`.
  Reading is safe; any `push`/`sort`/`splice` by a consumer corrupts several options at once.

Both engines are deterministic (seeded LCG, no `Math.random`, no clock), so goldens pin exact output.
Each fixture pins three layers: a **readable start sequence**, the **candidate metrics**, and a
**full-structure digest** as backstop. That split earns its keep — a `MIN_FRESH 6→7` perturbation
changes the candidate set but not the winning starts, and only the digest catches it.

**Order is pinned only where the ranking comparator separates every pair.** The suite measures tie
exposure at run time; where ties exist the winner depends on seed-loop insertion order, so those
fixtures pin the *set* and the invariants instead. Reading a failure: starts changed on a zero-tie
fixture ⇒ real behaviour changed; starts changed on a tie-exposed fixture ⇒ suspect loop or sort
order first; digest-only change ⇒ something outside the projection moved.



All 10 harnesses pass. Most are a plain `require()` of a module; `test_bridge.js`,
`test_fl_engine.js` and `test_panel_engine.js` get their code through `engine_source.js` (above),
so they test **what actually ships** and fail if the shipped file drifts.

`test_bridge.js` is current and passing (16/16). Its header mentions a `stagger-shape-input.html`
prototype **in the past tense** — that fixture was never in this repo, and the harness was
repointed at `index.html` in `e4dda67`. Don't read that comment as a live dependency and don't
"fix" the harness again.

The old `allConnected` / `rectsAdjacent` gap is **closed**: the grid slice now starts at
`function snapToGrid(v, grid){`, so `allConnected` can actually be called. It could not be before —
`rectsAdjacent` sat outside the range and any test touching it would have got a `ReferenceError`
rather than a real failure.

Still open: nothing slices the inlined `bridge.js` / `spread.js` / `lshape.js` blocks — only the
grid engine and the two layout engines. Those three are kept in sync by hand, not by test
(`reinline.py` does not cover them). Adding them to the `engine_source.js` registry is the cheap fix.

## Persistence

Live key is `stagger.store.v1` (schema 2). The older `stagger.jobs.v1` is migrated once, on
demand, from the in-app migration screen, and is then **left untouched** — it is only ever read.
It is cleared solely by the user, from the confirm-gated "Remove old copy" action on the jobs list.

Three fields were renamed on the way across because the two models used the same names for
different things. Do not "tidy" these back:

- `material` (string, e.g. `"Pine T&G"`) → `materialType`; `material` is the store's stock object
- `mode` (units, `"imperial"`/`"metric"`) → `unitsMode`; `mode` is the work mode, `"floor"`/`"panel"`

Areas carry a stable `id` — pins hang off it, so pins survive an area being deleted or reordered.
Re-saving an area must preserve its `id` and `pinned`.

## Support & Backup (Jobs → 💾 Save & Support)

Follows the **canonical EGS Gen 2** pattern (`renderSupport()` + `egsSupportCoreHtml()`, as in
`apps/Roadside`), ported to this file's ES5 + static-`section.view` idiom rather than copied
byte-for-byte. Three deliberate deviations from the canonical text:

- **No privacy-page link.** The canonical block links to an in-app Privacy page. Stagger has none,
  so the row is omitted rather than shipping a dead link. *Stagger is the only donation-carrying
  EGS app without a privacy page — the standard wants one.*
- **Placeholder guards** borrowed from WFD: Stripe/PayPal/Wise are still placeholders, so those
  tabs say "isn't set up yet" instead of rendering `href="STRIPE_PAYMENT_LINK"`. A side effect
  worth keeping: no third-party host string enters `index.html`, so the `--full` privacy gate
  stays clean. **If you fill in a real link, expect that gate to start reporting the host.**
- Interac and BTC are live; the BTC address is shared with WFD.

**`var STAGGER_STORE_BUILD` (near the Support block) — flip to `true` for any Play/App Store
build.** `EGS-DECISIONS.md` forbids donation links in store builds (they read as circumventing
Apple/Play billing). `true` drops the whole Contribute half and keeps backup/restore. This is why
`store-audit-stagger-*.md` Gate 3 now reads ACTION rather than PASS.

### Board estimate — mode matters
`stgReadSetup()` reads the **paneling** inputs (`i-face`, `i-oc`, `q-*`). Those live in
`#setup-panel`, which `setMode()` only marks `hidden` — they stay in the DOM carrying their HTML
defaults. Reading them unconditionally meant that in flooring mode the estimate quoted 5″ face /
24″ o.c. / 12′ stock that the user never entered, **and handed them to the truss engine via
`v2RunSpread()`**. It now returns `{ok:false, reason}` outside paneling mode and the renderer
prints the reason instead of a fabricated figure.

Still open, filed not fixed: **a typed-sqft area cannot be estimated at all**, because
`engineInput` is only ever built from drawn canvas geometry. The typed model exists and is
entirely unread — `effectiveDims()` has **zero call sites** and `area.dims` is written but never
read. The missing `dims → engineInput` converter is its own piece of work with its own harness.

### Export / restore — the contract that bites
Export writes an envelope: `{app:'stagger', version:1, exportedAt, store:{…}}`. But
`StaggerStore.importJSON(store, text)` expects the **bare store**, so restore must unwrap
`env.store` before handing it over. Passing the whole envelope does **not** throw — it returns
`{ok:true, added:0}` and silently restores nothing. That is why restore treats `added === 0` as a
failure, not a success.

Restore is additive: `importJSON` merges, re-ids clashing job ids and suffixes their names
`" (imported)"` — it never overwrites. It also auto-downloads a `stagger-before-restore-*.json`
**before** the confirm, per the backup-before-write rule. Saving goes through `storeCommit()`
(whole store, honours the `STORE_RO` guard), **not** `persist()` (job-scoped, needs `JOB`).
