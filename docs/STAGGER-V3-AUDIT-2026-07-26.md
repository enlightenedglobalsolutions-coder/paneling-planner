# Stagger — architecture audit & v3 proposal

**2026-07-26 · read-only audit, no code changed.** Baseline `3771407`, `index.html` 5,831 lines,
11 harnesses green. Every claim below carries a `file:line` and was verified against the shipped
file; where I ran something to check, I say so.

---

## 0. The one-sentence finding

**Stagger is two applications sharing a document.** They occupy two separate JavaScript scopes,
have two separate navigation systems that do not know each other exists, two separate ideas of
what a room is, and they exchange exactly one value in one direction. The user's story — *open
app → my job → my rooms → my layouts → my order* — is not partially implemented. It is
**severed in the middle**: everything left of "my layouts" lives in one world, everything right
of it lives in the other, and nothing crosses.

This is not a new discovery so much as an unfinished one. `docs/STAGGER-V2-SPEC.md:53-56` already
specified the whole flow, including the join:

> *"Jobs UI — job list → job → areas → area detail … → generate → spread table → pin. **Pinned
> layout view = the existing layout screen**, read-only badge 'PINNED — Steeves · Main ceiling'."*

That last sentence is the missing join, and it was never built. Slices 1–3 shipped (inside_dims,
store, spread runner). Slice 4 shipped *half* — the jobs/areas/draw/measure front end — and
stopped exactly where it would have had to touch the base app. Then the product pivoted
flooring-first, which orphaned the half that did land, because the estimator it feeds is the
**paneling** engine.

So v3 is not a change of direction. It is finishing the direction already chosen, on the side of
the app the product actually leads with now.

---

## 1. The map — information architecture as built

### 1.1 The two worlds

|  | **World A — base planner** | **World B — Jobs overlay** |
|---|---|---|
| Markup | `.app` L576–751, `#fl-ov` L754–758 | `#jobsOverlay` L3062–3192 |
| Script | top-level, true globals | one IIFE, `L3197–5827`, `"use strict"` |
| Navigation | `switchScreen(id)` L1735 → `.screen.active` | `showView(id)` L3846 → `.view.on` |
| State | `MODE`, `STATE`, `S`, `OV` | `STORE`, `JOB`, `M`, `rects`, `editingIdx` |
| Persistence | `egs-floor-progress` only | `stagger.store.v1` |

I verified the scope boundary directly: World B opens `(function(){ "use strict";` at L3197 and
closes `})();` at L5827. **Its state is not on `window`.** `switchScreen` is never called from
inside it; `showView` is never called from outside it. The overlay is `z-index:9000` (L329) and
simply paints over whichever base screen is live — the base app keeps running underneath, and
`nav.bottom` is covered, so there is no way to reach a base screen without closing the overlay.

**Total shared surface: one function.** `stgReadSetup()` L5128–5166 reaches out of the IIFE to
read the global `MODE` and the DOM inside `#setup-panel`. It is a one-way read. Nothing in World B
writes World A; nothing in World A reads World B at all.

### 1.2 Screens, reached how, reading and writing what

**World A**

| Screen | Reached by | Reads | Writes |
|---|---|---|---|
| `header.top` L577 | always visible | — | — |
| `#setup-panel` L585 | nav Setup, **only when `MODE==='panel'`** | `#i-*`, `#q-8…16` | `STATE`, `LONGEST_STOCK` → `s-layout` |
| `#setup-floor` L632 | nav Setup (default) | `#f-*` ×9 | `S.cfg/.cands/.fp`, reads `egs-floor-progress` → `s-layout` |
| `#s-layout` L682 | nav, or Generate | `STATE.*` / `S.*` | `STATE.active` / `S.view`, `S.done` → `egs-floor-progress` |
| `#s-cuts` L683 | nav, "View cut list", `goToRow` | same | `S.done` → `egs-floor-progress` |
| `#s-print` L684 | **nav only** | `STATE`/`S` via `currentExportData()` L1581 | nothing persisted |
| `#s-settings` L701 | **nav only** | `stagger.theme/.beginner/.units`, `MODE` | those keys, `stagger.paneling` |
| `#fl-ov` L754 | 2 controls, floor mode only | `S.*`, `OV` | `OV` pan/zoom |

**World B** — all inside `#jobsOverlay`, entered *only* via `#openJobs` L580.

| View | Reached by | Reads | Writes |
|---|---|---|---|
| `#viewJobs` L3069 | first open w/o job; every `← Jobs` | `stagger.store.v1`, `stagger.jobs.v1` | store (create/rename/delete job) |
| `#viewJob` L3117 | open/create job; save area | `JOB.*`, **`stgReadSetup()` → World A** | `JOB.wastePct/.boxCov`, materials, pins |
| `#viewPick` L3128 | `+ Add area` | `PRESETS` | `rects`, `drawBackTarget` |
| `#viewDraw` L3136 | picker; `editArea` | `rects`, `zoom`, `VIEW`, `CELL` | `rects`, `undoStack` — **nothing persisted** |
| `#viewMeasure` L3160 | `#toMeasure` **only** | `M`, `stagger.units` | `M`, `stagger.units`, then the area → store |
| `#viewMigrate` L3098 | **first overlay open only, if legacy key exists** | `stagger.jobs.v1` | store + `.backup.<ts>` |
| `#viewDiag` L3084 | `Check migration`, itself conditional | raw keys | **nothing** (by design) |
| `#viewSupport` L3093 | `💾 Save & Support` | store | store (restore) |

### 1.3 Storage keys

`stagger.theme` · `stagger.beginner` · `stagger.units` · `stagger.paneling` · `egs-floor-progress`
· `stagger.store.v1` (+ `.corrupt.<ts>`) · `stagger.jobs.v1` (+ `.backup.<ts>`).

Note what is **absent**: no Setup input is ever saved. Not one `#i-*`, `#f-*` or `#q-*` value.
The user re-types the room every session.

### 1.4 Three engine input paths that share nothing

1. `FL.readInputs()` L2183 — nine DOM fields from `#setup-floor` → `S.cfg`.
2. `readInputs()` L1203 — DOM fields from `#setup-panel` → `STATE.inp`.
3. `buildEngineInput(edges, inchesArr, overrideAxis)` L3801 — `M.edges`/`M.inches` only →
   `area.engineInput`.

The only join is `v2RunSpread(ei, setup.lengths, setup.truss, setup.face)` L4985, marrying path 3's
geometry to path 2's DOM numbers — **the paneling ones**.

---

## 2. The incoherence

### 2.1 The severance, stated plainly

**Work done in the Jobs overlay reaches the Layout/Cut list/Print screens: never.**
`saveCurrentArea()` L4985–4999 writes `JOB.areas` and calls `persist(); showJob();`. It never
touches `STATE`, `S`, `switchScreen`, or any Setup input. `stgCloseJobs()` L5720 is one line —
`ov.hidden=true`. A user can draw a six-band L, measure every side, and produce a validated
`engineInput` — then close the overlay to find `#f-len-ft` still holding the HTML default.

**Work done on the base Setup screen reaches a job or area: never.** `generate()` L1238 and
`FL.generate()` L2213 both end at `switchScreen("s-layout")`. Neither mentions `JOB`,
`StaggerStore`, `persist` or `pinLayout`. **There is no "save this layout to an area" control
anywhere in the app.**

### 2.2 The user's story, traced against the build

| Story step | Where it lives | Status |
|---|---|---|
| open app | boots to `#s-setup`, flooring | ✅ but lands on a **parameter form**, not a job |
| my job | `#viewJobs` — two taps in, behind a header button | ⚠️ exists, not the entry |
| my rooms | `#viewJob` → areas | ✅ genuinely good |
| my layouts | — | ❌ **does not exist per area** |
| my order | two panels that never reconcile | ❌ see 2.5 |

Step four is the hole. `v2RunSpread` returns `rowJoints` per length (L3497) and `pinLayout` stores
them (L4381), but the only rendering of a pin is one line of text, L5789:
`'<div class="stgPinNote">Pinned: '+pin.scenarioFt+"′ · "+pin.boards+' boards</div>'`.
No diagram, no cut list, no way to open the layout you just pinned. Tapping an area row goes to the
**drawing editor** (L5079 → `editArea`), not to its layout.

### 2.3 Duplicate state

Every one of these exists twice, independently stored:

- **Room dimensions — four representations.** `measIn("i-width")` L1205 · `measIn("f-len-ft")`
  L2185 · `engineInput.rect {runIn, acrossIn}` L3795 · and a fourth, entirely dead:
  `defaultDims()` L4344 (`outWidthIn`, `siteWidthIn`, wall build). Note the field names in paths
  2 and 3 are *identical* — `{runIn, acrossIn}`, same units, two stores, never exchanged.
- **Plank/board parameters.** `f-plen`/`f-pwid` vs `i-face`/`q-*` vs `area.material {faceIn,
  lengthsAvailFt}` L4354 — the last written, never read.
- **Waste — three unrelated numbers under one word.** `#i-buffer` (a user input, L622), the
  computed `wastePct` L1192 (an output), and `JOB.wastePct` (a per-job input, L4329).
- **Boxes.** `f-perbox` "planks per box" vs `JOB.boxCov` "sq ft per box" — same purchasing
  question, different units, never reconciled.
- **Layout results — three containers.** `STATE` L1235, `S` L2180, `area.pinned` L4381.
  **`STATE` and `S` are never persisted.** A reload destroys any generated layout permanently.

### 2.4 Dead ends

- **A reload wipes your layout.** Nothing from World A survives except FL row ticks
  (`egs-floor-progress`), and those are keyed to a geometry fingerprint with no job identity
  (L2254) — regenerate and they are silently dropped (`if (!o || o.fp !== fp) return {}` L2263).
- **Mode flip wipes the screen but not the state.** `setMode()` L1752 clears `#layout-body`,
  `#cuts-body`, `#print-area` while `STATE`/`S` survive in memory. The visible output is
  invalidated; the underlying state is not.
- **The job board estimate cannot be printed or exported.** It renders into `innerHTML` inside the
  overlay. `StaggerStore.exportJob` L4409 exists, is exported at L4431, and **is never called** —
  no UI reaches it. The only export from World B is a restore file, not a document a supplier reads.
- **Print covers exactly one layout, in the current mode.** `currentExportData()` L1581 branches on
  `MODE` and returns a flat `{title, meta, rows, svg}` with no notion of grouping. A job with eight
  areas produces eight separate print runs of rooms you must re-type by hand — or none. With
  nothing generated, all three buttons `alert("Generate a layout first.")` (L1590/1596/1602),
  which is unactionable advice when what you *have* is a measured job.
- **On a fresh install the estimator is invisible.** The app boots flooring (L1798) and
  `stgReadSetup()` bails at L5150 unless `MODE==='panel'`. So the per-area spread table, the pin
  buttons and the whole-job shopping list are all replaced by a paragraph of prose until the user
  finds **Settings → Paneling mode**. *(This is the honest-failure fix shipped 2026-07-25 — correct
  as a stopgap, and precisely the symptom v3 must remove.)*

### 2.5 Two "what to buy" panels that never reconcile

On the same screen: `renderEstLines()` L5029 groups **sq ft by material** and ignores boards;
`stgRenderBoardEstimate()` L5738 groups **boards by stock length** and ignores material. Headers
"Materials to buy" (L5020) and "Board estimate" (L5750). `shoppingList()` L3288 reads only pinned
board counts, so a job mixing Hardwood and Tile yields one undifferentiated line. Neither is
exportable, printable or copyable.

### 2.6 Orphaned data

Written on every save, migrated, exported, backed up — and read by nothing:
`area.dims` (only consumer `effectiveDims()` L4367 has **zero call sites**) · `area.truss` ·
`area.material` · `area.mode` · `area.pinned.rowJoints` · `.label` · `.pinnedAt`.
Five of the eleven fields `createArea` writes (L4352–4354) are dead weight.

### 2.7 Live defects found during the audit

| Defect | Evidence |
|---|---|
| **`stagger.units` has two writers, neither syncs the other.** Settings L1890 writes the key and repaints its own control *and nothing else*; the measure widget L4083 writes the same key. Measuring one area in metric silently rewrites the global preference, and Settings shows the stale value until reload. | verified by grep |
| **Units is an app-wide setting that the app is not wide enough to honour.** `parseMeas` L1615 is imperial-only — no metric branch anywhere in World A (verified). Choosing Metric changes the measure widget and leaves the base planner, print sheet and both exports in feet-and-inches. | verified |
| **Reopening the overlay lands on a stale view.** `stgOpenJobs()` L5361 calls `renderJob()`/`renderJobs()` but **never `showView`**. Close from `viewMeasure`, reopen — you are still on the measure screen while `viewJob`'s DOM was rebuilt behind it. | verified |
| **`#stgRecovered` is dead markup.** `window.__stgRecovered` is read twice (L5355, L5359) and **never assigned anywhere in the file**. The banner cannot appear. | verified |
| **`#jobHeading` L3118 is never written** — a permanently empty span. | verified |
| **`#viewMigrate` has no back button and is a one-shot** — reachable only on the first overlay open of a page load. | L5352 |
| **Flooring `#s-cuts` "back" goes to the overlay, not to Layout** (L2857), while paneling's equivalent returns to `s-layout` (L1421). The two modes disagree about what "back" means from the same screen. | verified |
| **Identity residue below the surface.** L3 still reads "EGS Paneling Layout Planner"; L12 still points at the `paneling-planner` URL. | verified |

---

## 3. The v3 proposal — jobs-first

### 3.1 The principle

**One spine, one store, one vocabulary.** A job holds areas; an area holds its shape, its
measurements, its parameters and its chosen layout. Everything the user does happens inside that
spine. The base planner stops being a *place* and becomes a *view* — the thing that renders an
area's layout — exactly as `STAGGER-V2-SPEC.md:55` intended.

Practically: **World B's data model wins, World A's engines and renderers are kept and
re-parented.** No engine gets rewritten (§4 shows why that's affordable).

### 3.2 The locked opening flow

**First open** — no jobs in store:

> ### See your new floor before you buy a board
>
> **[ Show me a sample room ]** ← primary
> **[ Start my room — I'm ready to measure ]**
> *Just need a quick number? · Quick calc*

- **Show me a sample room** → loads the pre-built demo (§3.3) and goes *straight to a finished
  layout* — pattern diagram + cut list, no input. Footer: **"Now do your room →"**, which starts
  the real flow. The demo is a real job in the store flagged `isSample:true`, so it is deletable,
  never merges into user data, and is skipped by export.
- **Start my room** → new job → first area → shape picker.
- **Quick calc** → §3.6.

**Returning open** — jobs exist:

> **[ Continue — Maple Street ]** ← primary, names the job
> [ All jobs ] · [ New job ] · *Quick calc*

Rule: the primary button always names something real. Never "Get started" to a stranger, never
"Continue" to nothing.

### 3.3 The sample room — real content, real numbers

**I ran the actual shipped engine to produce these.** I sliced the FL core out of `index.html`
(the same technique `test_bridge.js` uses), confirmed it is 264 lines with **zero DOM contact**,
and ran `generateCandidates()` on candidate dimensions. These are engine output, not invented:

> **Sample kitchen — 13'-0" × 11'-0"** (143 sq ft)
> Plank 60" × 9" · ¼" expansion gap · min joint offset 16" · min offcut to reuse 20" ·
> min first/last row 2" · 8 planks per box · rotate 4 boxes
>
> | | |
> |---|---|
> | Usable floor | 12'-11½" run × 10'-11½" across |
> | Rows | **15** (first and last ripped to 7¼" — well above the 2" warranty floor) |
> | Layouts generated | 16 candidates |
> | Best layout | **0 rule violations, 0 relaxed rows** |
> | Pattern | **15 unique row starts across 15 rows — nothing repeats anywhere in the room** |
> | Planks | **50** → **7 boxes** |
> | Unusable offcut | 296.5 sq in ≈ **2.1 sq ft** |
> | Row 1 | full · full · cut to 35½" — the 35½" offcut is reusable (> 20" minimum) |

That last figure is why this room is the right demo: **period 15 over 15 rows** means the pattern
never repeats — which is the single thing the app exists to do. The demo proves the product's
claim on its own numbers, in one tap, before the user has measured anything.

*Chosen from four candidates (12'6"×10'8", 13'6"×10'0", 14'0"×11'6" also ran clean); 13'0"×11'0"
gives the cleanest "every row unique" result at a believable kitchen size.*

### 3.4 The spine

```
Jobs  ──→  Job (areas)  ──→  Area
                               ├── Shape        (picker / draw)
                               ├── Measure      (sides → inches)
                               ├── Parameters   (plank, gap, stagger rules)   ← moved here
                               ├── Layout       (the existing renderer, per area)
                               └── Cut list     (the existing renderer, per area)
Job ──→ Order (one document: boxes + cut lists across all areas)
```

**Parameters move into the flow, not onto a landing page.** Plank size, gap and stagger rules
become `area.params`, defaulting from `job.params`, defaulting from app defaults. A job of six
bedrooms sets the plank once; one area in a different product overrides it. This kills the
`#setup-floor` landing screen as a *destination* — the fields survive, re-hosted inside the area.

**Layout and Cut list stop being global screens** and become per-area views. `nav.bottom` drops to
**Jobs · Order · Settings**; layout/cuts are reached from the area you are standing in.

### 3.5 True-scale drawing

Today the canvas is abstract by construction: `VIEW={cols:32,rows:40}, CELL=18, zoom=1` (L3834),
`u2px(v)= v*CELL*zoom` — a grid cell means nothing dimensionally. Worse, the **measure diagram is
also not true-scale**: `renderMeasureDiagram()` L4142 scales from `e.x1/e.x2`, which are *grid*
coordinates, so a 20 ft wall and a 4 ft wall drawn as equal cells render equal.

Both halves of the fix already exist. `reconstructPolygon()` L3727 already produces inch-space
vertices; `traceOutline()` gives the topology; every engine already speaks inches (L3619: *"Stores
INCHES internally"*). Missing is:

1. one `pxPerIn` scalar in canvas state;
2. `u2px(v) = v * pxPerIn * zoom`;
3. a re-render path drawing from `reconstructPolygon(...).verts` once measurements land;
4. auto-fit — after measurement, choose `pxPerIn` so the shape fills the stage, and snap dragging
   to inches (6" or 1 ft) rather than to `grid=1`.

Confined to L3836–3930 plus `renderMeasureDiagram` L4142. Nothing downstream notices.

### 3.6 Quick calc — the secondary path preserved

Two taps from open, no job, no save: **length × width → spread → cut list**. It is the current
`#setup-floor` + `#s-layout` + `#s-cuts` behaviour, unchanged, hosted as a modal flow rather than
the app's front door. One button at the end — **"Save this as a job"** — which is the join that
does not exist today (§2.1) and which makes Quick calc a funnel into the spine instead of a
cul-de-sac.

---

## 4. The cost

### 4.1 What is re-plumbing vs new construction

**Re-plumbing — the engines already qualify.** I verified this rather than assuming it: the
layout/geometry math is pure functions of its arguments with zero DOM contact.

| Already pure — lift as-is | Where |
|---|---|
| FL flooring engine core (264 lines) | L1920–2178 — *verified by slicing and running it in node* |
| Base paneling engine | L782–1202 (442 lines) |
| `runSpread` / `spreadTable` / `shoppingList` | `spread.js` — engine is **injected**, not imported |
| `generateLShape`, `auditLShape`, `lshapeCutList` | `lshape.js` |
| `buildEngineInput`, `shapeToProfile`, `reconstructPolygon` | `bridge.js` |
| Grid geometry (`rectsToCells`, `traceOutline`) | L3537–3618, purity enforced by `test_bridge.js:22` |
| `store.js`, `migrate_jobs.js`, `diagnose.js`, `inside_dims.js` | storage injectable, diagnose cannot reach localStorage by design |

**The DOM coupling is four seams, not a hundred:** `readInputs()` ×2 (L1203, L2183),
`generate()` ×2 (both ending in `switchScreen`), the SVG renderers' `getComputedStyle` token
lookup (L2345), and the global `M` in the measure widget. Each is bounded.

| New construction | Rough size |
|---|---|
| First-open screen + sample-room seeding | small |
| Per-area Layout/Cut list hosting (re-parenting existing renderers) | medium |
| `area.params` / `job.params` cascade + schema v3 migration | medium |
| Whole-job Order document (print/export across areas) | **largest single new piece** |
| True-scale canvas + auto-fit | small, confined |
| Quick calc as a modal + "save as job" | small |

### 4.2 What the harnesses need

Current coverage is **246 assertions across 8 suites — and it protects the data layer, not the
product.** 179 of those (store, persist, diagnose, jobs) cover persistence and migration.

**Zero coverage exists for:** the FL flooring engine · the base paneling `generate()` ·
`switchScreen`/`showView` navigation · every print/export path · `v2RunSpread`/`v2Engine`/`v2CutSim`
· the draw canvas · the measurement widget (notable — `measIn` mis-parsing was a shipped bug fixed
across three commits).

**The two engines the app is named for have no test between them.** Before moving that code,
budget characterisation tests. The good news, proven above: **the FL core slices clean and runs in
node in isolation** — a characterisation harness for it is cheap, and the same trick works for the
paneling engine.

**`test_bridge.js` — resolved in Stage 1, no longer a Stage-3 hazard.** It used to slice between
`'function rectsToCells(rects){'` and `'//  EGS Measurement Widget'`, and would have hard-failed the
moment the grid block was extracted. It now loads through `engine_source.js`, which resolves
**module-first, slice-fallback** — so the extraction is a no-op for the harness.

Proven, not assumed: writing a `grid_geom.js` flipped the loader from `slice:index.html` to
`module:grid_geom.js` and `test_bridge.js` reported **16/16 both ways with no harness edit**. The
proof artefact was then removed — Stage 1 extracts nothing.

The latent trap is also closed: `allConnected` calls `rectsAdjacent`, which sat **outside** the old
slice. Nothing exercised it, so it worked by luck; the range now starts at `snapToGrid` and
`allConnected` is genuinely callable (verified both true and false cases).

### 4.3 A hygiene item that de-risks everything else

`reinline.py` covers only `store.js`, `migrate_jobs.js`, `diagnose.js`. **`spread.js`, `lshape.js`
and `bridge.js` are hand-copied**, so `test_bridge.js` tests the *disk* copy while the app runs the
*inline* one. I diffed all three today: **currently in sync** (bridge 91/91 code lines identical) —
but that is luck maintained by hand, and it is the exact gap `CLAUDE.md` warns about. Also
`v2-modules/` is a byte-identical duplicate of the root modules and their tests. Closing both is
cheap and makes every later stage safer.

### 4.4 Staged build order — each stage ships and verifies alone

| # | Stage | Ships | Verified by |
|---|---|---|---|
| **0** | **Hygiene.** Extend `reinline.py` to bridge/spread/lshape; delete `v2-modules/`; ~~fix the `rectsAdjacent` slice boundary~~ (**done in Stage 1**); clear the identity residue (L3, L12). | invisible to users | harnesses green, `reinline` 0-byte delta |
| **1** | ✅ **DONE 2026-07-26. Characterisation harnesses** for both engines, pinning today's output as the contract. | nothing | **13 suites, 506 assertions, 0 failures** (was 11 suites / 246) |
| **2** | **First-open + sample room.** New entry screen, demo job seeded with the §3.3 numbers, `Continue {job}` for returners. Quick calc link points at today's Setup. | **real user value on day one** — the demo alone answers "will this work for me" | sample layout matches the figures in §3.3 exactly |
| **3** | **The join.** Per-area Layout + Cut list: render an area's `engineInput` through the existing renderers, inside the overlay. Tapping an area offers *Layout* as well as *Edit shape*. | the missing step four | `test_bridge` migrated to `require`; per-area layout matches Quick calc output for identical dims |
| **4** | **Parameters into the flow.** `area.params` ← `job.params` ← defaults; schema v3 + migration; retire `#setup-floor` as a destination. | one place to set plank size | migration harness (v2→v3), round-trip, old stores load unchanged |
| **5** | **The Order document.** One printable/exportable document per job: boxes and cut lists across all areas, grouped by material. Retires the two irreconcilable panels (§2.5). | "my order" — the end of the story | export harness (first coverage of that path) |
| **6** | **True-scale canvas + auto-fit.** | drawings that mean something | visual + a geometry harness on `pxPerIn` |
| **7** | **Quick calc as a modal**, with "Save this as a job". Nav becomes Jobs · Order · Settings. | the pro path, now a funnel | full sweep, both themes |

**Sequencing logic:** Stage 1 before anything moves, because the engines are unprotected. Stage 2
first among user-facing work because it is the highest value for the least risk — it touches no
existing flow. Stage 3 is the keystone; everything after is easier once the two worlds share a
screen. Stage 5 is the largest single piece and deliberately late, because it needs Stages 3 and 4
to have something coherent to print.

**Not in scope, still owed:** the typed-sqft area still cannot be estimated — `engineInput` only
ever comes from drawn geometry, and `effectiveDims()` has zero call sites. That `dims → engineInput`
converter is its own job with its own harness, and Stage 4 is where it would naturally land.

---

## Defects filed by Stage 1

Building the characterisation suites surfaced four engine defects that the audit had not seen.
All are **pinned as current behaviour** and labelled in the harnesses — when each is fixed, the
pinning test should fail and be flipped to assert the correction.

| Defect | Evidence | Where pinned |
|---|---|---|
| **A live crash.** `plankLen 4` + `minOff 3` passes the UI guard (`4 <= 3` is false), then throws `TypeError: Cannot read properties of null` on row 2 — `legalStarts` finds nothing below `MIN_FRESH=6` and the over-constrained fallback dereferences null. Reachable from the UI. | verified | `test_fl_engine.js`, KNOWN DEFECTS |
| **The rip bump does not re-check.** It adds one row and recomputes the edge, with no second look — so `minRip 8` on a 100″ room yields `edgeRip 0.25`, **below the warranty floor the engine just tried to enforce**, and the UI then flags a config the engine itself produced. | verified | `test_fl_engine.js`, KNOWN DEFECTS |
| **`generateOptions` is not pure.** It reads the module global `LONGEST_STOCK` and **overrides its own `capIn` parameter with it**. The same call returns different results depending on whether `generate()` ran first — but only when the value crosses a joint-count boundary, which is why it went unnoticed (144 and 192 behave identically at `runIn 262`; 96 does not). | verified | `test_panel_engine.js`, KNOWN IMPURITY |
| **A silent-corruption path.** With an impossible span cap, `generateOptions` returns an option reporting `illegal: 0` while every row is un-buildable. Only the `label` string distinguishes it, and `assignStock`/`computeTakeoff` will happily produce numbers from it. | verified | `test_panel_engine.js`, KNOWN HAZARD |

Also recorded, not tested: `minSeg`, `reachesBoth`, `rowEvenness` and `simulateRow` have **zero
callers** — removal candidates for Stage 0 hygiene.

**One correction to §4.2 of this audit:** it stated the paneling engine occupies lines 782–1202.
It does not — the engine is **not contiguous**. `assignStock`, `computeTakeoff` and `planOffcuts`
sit outside its own `PANELING ENGINE END` marker, and all three depend on `rowName()` ~500 lines
further down. `engine_source.js` assembles it from five anchored ranges.

---

## 5. Answering the question the audit was really asking

The app is not badly built. World B's jobs/areas/draw/measure flow is genuinely good, the engines
are clean and pure, and the data layer is well tested. What is missing is a **join** — a single
screen where an area's geometry meets an engine and produces a layout the user can keep.

Everything else in this report is downstream of that one absence. Build the join and the duplicate
state has somewhere to collapse into, the orphaned fields acquire a reader, the two shopping panels
become one order, and the user's story runs end to end for the first time.
