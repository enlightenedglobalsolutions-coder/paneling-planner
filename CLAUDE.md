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

### `--ink` and `--paper` SWAP between themes — never pick a token by name
They are **role** tokens: `--ink*` is the surface, `--paper*` is the text. So in daylight
`TOK.ink` is `#f4f5f6` (light) and `TOK.paper` is `#1c2026` (dark); at night it is the other way
round. Code like `relLum(bg) > k ? TOK.ink : TOK.paper` *reads* as "dark text on a light ground"
and is correct in **exactly one theme** — in the other it inverts every choice and every pair
fails contrast. It passed every dark-theme check and broke daylight.

Use **`textOn(bg)`**, which picks by measured luminance. Its crossover is *computed* — the geometric
mean of the two anchors' offset luminances — not a hand-picked constant; a hardcoded `0.22` was
measurably worse than the derived `~0.197` on mid-grey grounds. It maximises contrast but cannot
manufacture it: **around mid-grey no anchor reaches 4.5:1** (best ≈ 4.06:1), so a state fill must
not land in that band. `test_contrast.js` pins the band and checks every real ground stays out.

**Anything modelling physical light takes `anchorLight()` / `anchorDark()`, never a role token.**
A bevel catch, a shadow, wood grain — these need "the light one" and "the dark one" absolutely. The
Wood renderer shipped with `stroke:TOK.paper` for the highlight and `stroke:TOK.ink` for the shadow:
correct at night, **inverted in daylight**, so the floor lit itself from below and the grain went
pale. It hid for a release because the scratch render tool hardcoded those two tokens backwards for
light theme; `render_svg.js` parses them from the stylesheet, which is what surfaced it.

Text on a coloured *state* fill takes `textOn()`. Text on the page ground keeps `--paper-dim`.
Do **not** reach for `--paper-dim` on an accent fill — it is deliberately mid-luminance and measures
1.00:1 on `--ok`, which is the same trap that produced the invisible done-label in the first place.

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

### Two renderers build SVG as a STRING — interpolate, never paste
`drawDiagram()` (paneling) and `renderMeasureDiagram()` assemble SVG by concatenation rather than
through `mk()`. The retheme that swapped hex literals for token names produced
`fill=TOK.ink3` — an **unquoted attribute whose literal value is the text "TOK.ink3"**. SVG cannot
parse that as a paint, so it falls back to **black**: every paneling plank body rendered solid black,
in both themes. The form must be `fill="'+TOK.ink3+'"`.

It hid because the text labels were broken identically, and black text on a light sheet looks
deliberate — so it read as "the paneling renderer is broken" rather than "every colour in this file
is". `test_render_colours.js` pins the class: no paint attribute may take a bare identifier, quote a
token *name*, or use `var()` (which does not resolve in an SVG presentation attribute), and every
`TOK.<name>` read anywhere must be one `refreshTokens()` actually defines — a typo'd token
interpolates to `undefined`, which renders black exactly like the original bug.

When sweeping rendered colours at runtime, **exclude `<line>`**: it carries a default black `fill`
it never paints, and counting it reports ~31 false positives per diagram.

### The SVG renderers do not follow CSS
Roughly 80 colours are painted as SVG *attributes*, so a variable swap cannot reach them.
`refreshTokens()` reads them out of CSS once per theme change into `TOK`, and `applyTheme()`
then calls `rerenderActive()` to redraw the visible screen. **`refreshTokens` is defined inside
the flooring module's closure and exported via `window.refreshTokens`** — without that export
`applyTheme`'s `typeof refreshTokens === "function"` check is false, and the layout silently
keeps the previous theme's colours while the chrome changes around it. That failure is invisible
unless you actually toggle the theme with a layout on screen.

Note `applyTheme(pref)` **takes the preference as an argument**. Calling it bare falls through to
`matchMedia`, so `applyTheme()` after setting `stagger.theme` looks like it did nothing.

## The flooring layout view

### Print and screen are separate wrappers — keep them that way
`.fl-scroll` (inline) and `.fl-print-diag` (print) were **one shared class**, so tuning the screen
silently moved the printed sheet. They are now split, and they want opposite things:

- **inline** — `width:100%; max-width:100%; height:auto`, no `width` attribute on the SVG. The
  whole room fits the screen, never cropped with sideways scroll. `buildSvg` already sets
  `viewBox` + `preserveAspectRatio`, so this is free; there is no resize listener anywhere in the
  file and none is needed. The HTML export and the paneling diagram already worked this way — the
  flooring inline view was the odd one out.
- **print** — keeps `overflow-x:auto`, `min-width:640px` and the explicit
  `svg.setAttribute("width", Math.max(660, runIn*1.3))`. It is a paper sheet, not a phone.

If you change one, check the other. Ticking and zoom live in the fullscreen overlay
(`tappable:false` inline), and the overlay already has Rotate — iOS Safari won't let a web app
lock orientation, so "rotate your phone" cannot be a button; the control turns the drawing.

### Wood is a material renderer, not a pattern
Plank tone is `plankTone(cand.seed, row, piece)` — a hash of the **layout's identity**, never of
`isDone`/`isNow`. Those are view state, and feeding them in makes the floor change colour as rows
are ticked off. `isDone` may only touch opacity (which now fades in *every* view — done rows
used to keep a full-opacity stroke and so read *brighter* than unfinished ones).

It took three passes to stop looking like a graphic. **All three failures were statistical, not
functional** — the floor rendered fine every time. `test_material.js` (41) pins each one, because
nothing else would catch a regression:

1. **The checkerboard.** `WOOD[(i*5+p*3) % 6]` — `p*3 % 6` cycles `0,3,0,3`, so every row used
   exactly **two** of the six tones, alternating.
2. **Six shades of one honey.** A flat pick from `--plank-1..6` spans only ~40 units of luminance.
   Real bundles cluster mid-tone *with occasional genuinely dark and pale outliers*, so the token
   supplies the **hue** and a per-plank offset supplies the **value**. The offset is **cubed** —
   that is the whole trick, since a uniform draw scatters evenly and reads as confetti. Now ~123
   units, ~115 distinct tones per 120 boards.
3. **Corduroy, and one hue.** Grain ran the full width of every board with the same gentle S.
   Now length, position, strength, curvature and count (0–5, one board in five bare) all vary, plus
   an occasional cathedral arc. And `warmTone` adds a hue axis — **asymmetric on purpose**, because
   a pale board that also takes a full cool shift washes out to taupe.

**Measuring warmth as R−B on the finished tone does not isolate hue** — `shadeTone` moves R−B by
itself (darkening scales it down; lightening pulls toward a near-neutral highlight). Reconstruct the
value-only tone and difference against it, or you will measure value and report the asymmetry
backwards. That mistake is preserved in the test's comments.

Planks carry **no stroke**. Separation is a bevel — light catch (`--paper`) on top, heavier shadow
(`--ink`) below plus a softer chamfer pass, and an end-joint shadow. The shadow side is deliberately
heavier than the catch: a symmetric outline floats like a tile. Strength varies per board, or it
reads as a drawn rule again.

**One `feTurbulence` overlay** covers the whole floor — flat fills were what still read as laminate.
`baseFrequency` is **anisotropic** (`0.035 0.75`) so the noise stretches into streaks that follow
the boards. It is **one filtered rect, not one per plank** — 100+ turbulence passes would be a phone
problem. It rides inside the rotated group, so the streaks turn with the drawing for free. Known
limit: the noise is continuous **through end joints**, where real grain would stop.

Background is `--ink-2`, the theme ground: **not `--brass`**, which is documented as brass-as-*text*
and darkens in daylight, so using it as a fill breaks its own contract (that was the gold mat).

**Palette is an input.** `SPECIES` is a plain JS map, defaulting to the `--plank-1..6` theme tokens.
Deliberately *not* new CSS custom properties: `refreshTokens` reads a fixed prefix and count, so
every species would need declarations in both theme blocks — O(species × themes) stylesheet edits
for what is a material choice, not a theme concern. No picker ships yet; the seam is what ships.

### Labels follow the plank, and stay on the sheet
In the rotated view every label used to carry a `rotate(-90)` that exactly cancelled the group's
`rotate(90)`, so labels came out axis-aligned on screen, reading **across** planks that now ran
vertically. Dropping it fixed **two** symptoms, because cancelling the rotation also put each
label's long dimension on the room's *narrow* axis — 6 of 55 labels in a 13'×11' kitchen overflowed
the viewBox by 2.6″–4.2″. Row numbers turn too: when you tilt the phone to read a rotated sheet,
mixed orientations are worse than either one.

`labelBaseline()` clamps the cross axis, because a first/last row is only `edgeRip` wide and
`edgeRip` may be as little as `minRip` (2″) against a 6.4-unit glyph. The extents are **measured and
asymmetric** — ~0.95em above the baseline, ~0.25em below — and a symmetric half-height under-clamps
the bottom edge, which is how the last row's number kept clipping. Pinned in `test_labels.js` (22),
which also asserts the counter-rotation has not come back.

### Reshuffle
Lives directly under the picture inline, and in the overlay bar beside Rotate/Fit — you must be able
to see the floor and the button that changes it at once. **Both are guarded on `S.deckSize > 1`**:
with a one-card deck `reshuffle()` would cycle `% 1` and silently do nothing. When the deck is 1 the
label reads "One clean layout for this room" instead of "Layout 1 of N".

### The one-card marker
When the deck collapses to a single layout, the inline Shuffle button is replaced — in its exact
slot, at the same weight — by a one-liner plus an **(i)**. The condition is **geometric**
(`deckSize === 1`), never room-specific, so any future one-card room gets it; the `narrow` fixture
already does, not just the hallway.

The (i) expands copy that quotes **`S.deckWhy`** — `{considered, nearestGap, ceiling}`, written by
`orderDeck` from `deckVerdict()`. Those numbers are *computed, never written into the string*: the
sentence claims "every candidate landed within 1.42″ of this one", and that has to stay true when
the ceilings or `VISIBLE_MIN` move. `test_deck.js` asserts the copy interpolates rather than
hardcodes. `nearestGap` is measured at the **widest** ceiling, which is what makes "nothing was
skipped" honest. It prints to 2 decimals, not `inch()` — sixteenths render 1.42 as `1.4375″`, which
reads as false precision.

**The dot is `.whydot`, deliberately not `.helpdot`.** `:root[data-guide="expert"]` hides every
`.helpdot`, and this marker must show for everyone — it explains an *absence*, which an expert needs
more than a beginner, since they are the one who will go looking for the button. It carries
`data-marker="deck.onecard"` so a later visibility rule has a hook without a rewrite. Styled to match
`.helpdot` so the two read as one family.

The overlay toolbar gets no marker: a sentence does not belong in a toolbar.

## The demo rooms

Three tappable cards — Kitchen 13'×11', Great room 20'×16', Hallway 24'×4' — rendered from
**`SAMPLE_ROOMS`**, not written in the HTML. Each card advertises rows/planks/boxes, and those are
the same numbers `test_fl_engine.js` pins as goldens for those rooms; the fixtures were added
**before** the cards existed, and `test_sample.js` runs the engine from each card's own dimensions
and compares. Nothing else connects a card's claim to reality.

All three use the app's **own** Setup defaults (60"×9", gap ¼"). A demo on parameters the app never
sets proves nothing about what the user is shown — an early draft of `test_deck.js` used a 48" plank
and measured a 4-card hallway where the app deals 1.

**One markup block serves both entry points.** `#welcome-rooms` is the primary content on first
open; for returning users it is hidden and the small "Sample room" link toggles that same list. The
entry mode still decides the **exit**: from the first-open offer, leaving clears the room fields as
an invitation; from the returning link it restores whatever was there (a returning pro may have real
numbers in Setup).

### Containment is at the WRITE, not at the button
Stage 2 disabled Reshuffle in the demo. Stage 2.5b moved the guard into **`saveProgress()`**, which
returns early in sample mode — so the button came back and the demo runs the real generator.

This matters because `egs-floor-progress` is a **single global slot**, not per-job, and `reshuffle()`
writes it unconditionally while its "you'll lose your ticks" confirm reads only the *current*
session's `S.done` — empty in a demo. A user mid-install who opened the demo out of curiosity and
shuffled would have had their real row ticks erased with no warning.

**Every write to that key must keep going through `saveProgress()`** — `test_sample.js` asserts
there is exactly one `setItem(PKEY` in the file. Row ticking stays off (`toggleRow` still refuses in
sample mode): a demonstration is not something you install from. And the demo must never create
`stagger.store.v1` — a seeded job would permanently strand legacy data behind `shouldMigrate()`'s
bare `jobs.length` check.

## The join — per-area layouts (Stage 3)

Tapping **Layout** on an area row hands off to the Layout screen with a badge naming the area, the
job, the measured dimensions and **the parameters it used**.

**It is one code path, not two.** `stgShowAreaLayout()` writes the area's dimensions into the *same*
Setup fields Quick calc reads and calls the *same* `generate()`. There is deliberately **no per-area
cfg builder** — a second one would be a second thing to keep in agreement, and the plan's hard
checkpoint ("a per-area layout must byte-match Quick calc for identical dims") would then be pinning
a coincidence. Verified in-browser: SVG (every rect *and* every label) and all 15 cut-list rows
byte-identical for 13'×11'; and the three demo rooms reproduce their existing goldens through the
area path.

**Dispatch is on `bands.length === 1`, never on `kind`.** `kind` is `'rect'` when
`bands.length <= 1` — **true for zero bands as well as one** — so a shape that produced no bands
reads as a rectangle while carrying a null `rect`. `stgAreaRect()` checks the band count *and* the
rect payload; `test_area.js` asserts the source does not dispatch on `kind`.

**The join lives in script block 3.** It has to: `JOB`, `stgSheet` and `fmtSqft` are inside that
sealed IIFE and are **not** global. A first cut placed it in block 1 and the button silently did
nothing — no console error, because the handler never ran. Everything it needs *outward* (`FL`,
`stgSetRoom`, `setMode`, `switchScreen`, `$`, `clear`) **is** global, so the dependency runs one way.

**Dimensions cross as inch-marked strings** (`stgInchField` → `156"`). The Setup field defaults to
**feet**, so a bare `155.5` would be read as 1866″; and formatting as `12'-11 1/2"` would snap to
sixteenths and quietly move a room stored to three decimals. The inch mark makes `parseMeas` return
the number verbatim. The field's live echo still shows the tape-measure reading.

**Nothing is persisted.** `areaMode` joins `sampleMode` under one predicate, **`isReadOnlyLayout()`**
— ticking off, Reshuffle on, progress key never written. New guards should ask *that* rather than
name a mode, which is what stops the next mode from having to remember four separate checks. Rows
also lose their `.fl-tapzone` affordance: a row that looks tappable and does nothing is the
dishonest failure this app is written against. Pinning lands in Stage 5; `area.pinned` is
paneling-shaped (`{scenarioFt, boards}`) and `saveCurrentArea` rebuilds from a 16-name allowlist
that would erase any new field on the next re-measure.

### The eye rule — no pattern the eye can follow
The seam field must show no run the eye can track. **Three or more consecutive steps of similar
magnitude is a pattern, and three already fails.** Magnitude only — direction is ignored, because an
equal-step zigzag (left, right, left by similar amounts) tracks as readily as a diagonal.

A *step* is `phaseStep()`: the difference between two row starts, wrapped to `(-P/2, P/2]`. Wrapping
matters — joints repeat every plank, so 50″ → 10″ is a 20″ step, not 40″.

**Tolerance is proportional to the plank**, not a magic number: the joint spacing *is* the plank
length, so what reads as "the same step" scales with it. `eyeTol(P) = max(1.5, P × 0.05)` — 3.0″ at
60″, 2.4″ at 48″. Chosen by measurement: at this tolerance several existing kitchen candidates
already passed, so the rule is achievable, while the photographed staircase (spread 4.5″ over six
courses) is caught.

**`eyeOffences()` is SEVERITY-weighted**, and this matters. A first version counted runs, so a
marginal three-course wobble and a fourteen-course staircase both scored 1 and the ranking had no
reason to prefer the wobble. Each run now contributes `length − 2`.

**Why the engine drew the staircase:** it maximised clearance on every row, and the largest
achievable clearance is nearly the same number every time, so the steps clustered. The fix is in
both places — `pickFresh` rejects a start that would make a third similar step (falling back rather
than dead-ending), and the ranking prefers fewer offences. Rejection alone cannot help a room with
no alternative; ranking alone leaves the generator producing offences.

### Row ends — 2″ is a rule, 6″ is a preference
The last cut in a row is never under **2″** (`END_MIN`, a legality filter in `legalStarts`), and
**6″+** is preferred (`END_PREF`, a small score bonus that breaks ties without steering the layout).
Note `MIN_FRESH = 6` already forbade *starting* a row under 6″ — the same instinct at the other end
of the row, which had no counterpart until now.

The rule reaches **row 1**, whose start was hardcoded to a full plank: a run that made the first
course end on a chip had no way to fix itself. It now steps back until the end is layable.

**The two rules are solved together, never in sequence.** Forcing a row's end moves that row's
joints, which changes its step, which is what the eye rule judges — fix them one after the other and
the second undoes the first. So the **end rule filters what is legal** and the **eye rule chooses
among the survivors**. Both are re-checked in the offcut-reuse branch, which bypasses `pickFresh`
entirely.

**Ranking order:** `endHard → violations → eye → relaxed → period → waste → unique → endSoft`. An
unlayable end beats everything; then the seam rule; then the eye. `endSoft` ranks last so a
comfortable last cut cannot buy a materially worse floor.

### KNOWN: the seam rule and the eye rule conflict in tight rooms
Measured across 3,780 rectangle rooms: **no row anywhere ends under 2″** (shortest exactly 2.00″),
and **68.8% are fully clean** of followable runs. The residual **25.6%** is not a generator failure —
verified, the ranking takes the least-patterned option **within its tier** in every case. It is a
genuine conflict: in a tightly-constrained room the only layouts without a step carry **seam
violations**, and joints too close together is a structural defect where a visible step is an ugly
one. The engine will not trade the first for the second.

Example: a 90″ × 67″ room at a 48″ plank has **one** legal start per row, so every seam-legal layout
steps by exactly 16″. Its no-pattern alternative carries eight seam violations.

**The app already surfaces the remedy for most of these** — `isLocked()` flags 68% of them and
`suggestOffset()` offers a smaller stagger for 100%, which clears the staircase in 59%. The 32% that
step without being flagged is an open gap: `isLocked` requires `period <= 4` and so misses
staircases that do not repeat exactly. Whether the lock warning should fire on the eye score instead
is a parked question — it changes user-facing messaging.

### The L field engine — one continuous field, and the corner is SCRIBED
Two-band L areas route to the engine. `stgAreaField()` counts **bands**, never `kind`
(`kind` is `'rect'` at `bands.length <= 1`, i.e. for zero bands too). Two bands of the same run
collapse to the rectangle path so they cannot possibly differ from one. **Three or more still
refuse** — a three-band field has two corners and nothing has swept two corners interacting. The
refusal retires **per shape, as each shape is proven**, not per stage.

**One continuous field.** `buildLayout` runs **one** sequence over the whole field with each row
carrying its own run (`cfg.rowRuns`). No per-band call, nothing to restart: the first row of the leg
continues the stagger instead of opening on a full plank. That restart is what the rejected adapter
did and what broke the seam rule.

**Room coordinates, everywhere.** `clearanceAbs()` and `audit()` compare joints where they actually
are. This is why the old 5% was *silent*: rows measuring from different walls looked 60″ apart
row-locally while sitting on top of each other. The auditor must not share the builder's blind spot.
Sweep: **5% → 0%** across 256 geometries, notch rows asserted explicitly.

**THE CORNER IS SCRIBED, NOT SPLIT.** A course meeting the corner mid-width is laid **whole**,
spanning the furthest wall it reaches, and the overhang is scribed — which is what a floor layer
does, and it keeps the field in full-width courses instead of running a seam along the notch line.

Splitting was the first model and was wrong twice: it invented a course boundary the room does not
have, and when the notch fell near a course line it produced a strip below the rip floor —
**0.125″ at worst, on 69% of swept geometries**. Scribing removes that *by construction*: nothing
splits a course, so `ripCount` is 0 and a sliver is impossible rather than rare. The scribe is
reported in the cut list beside the offcut, as the trade brief required.

**Rectangles are untouched by construction.** `cfg.rowRuns` absent ⇒ every helper returns
`cfg.runIn`/0. Rows carry `runIn`/`xStart` **only** when the field genuinely has more than one —
attaching them unconditionally moved every rectangle *digest* without changing a layout, which is a
golden moving and was reverted, not re-goldened.

**A zero-notch L collapses ONTO the rectangle path** — same cfg, same digest, no `rowRuns` — and
reproduces the kitchen/greatroom/hallway goldens. `bandRowPlan` treats a boundary as a corner **only
where the run changes**; a first cut split at every band boundary and failed this.

**The expansion gap applies to bands too.** `bandedCfg` subtracts it from each band's run and from
the field depth, exactly as `readInputs()` does — an L laid hard against its walls while a rectangle
of the same room was not would be a quiet, expensive difference. Bands passed to `bandedCfg` are
therefore **measured room dimensions**. The field extent is *furthest wall minus nearest*, not the
furthest alone, or the near-wall gap is counted twice.

**One offcut pool.** The bank is not per band: a piece cut in the main run starts a leg row
(measured, 22.4% of candidate layouts). It must *fit* the run it is going into and is checked against
that row's run, not the donor's.

**Run direction needs no new control** — Setup already carries "Boards run left–right / top–bottom ·
Switch ⇄", persisted per area as `runOverride`.

### Areas with more than one corner refuse, with the evidence
Not because it is hard — because **both fakes were measured and both were worse than saying no**:

- **Bounding box:** audits clean (`violations: 0`, a drawing that looks entirely right) and
  over-counts material by **42.9%**. A wrong answer that looks correct is the worst thing this app
  could hand someone standing in a supplier's aisle.
- **Band-by-band adapter:** across 256 generated L geometries it silently violated the adjacent-row
  seam rule in **5%**, because `buildLayout()` hardcodes row 1's start and never reads
  `opts.prevRows`. Fixing that is an edit to the pinned engine core — its own stage, its own goldens.

The message ships; no button does. The band count is interpolated from the area's own profile, never
hardcoded, for the same reason the deck verdict is. `test_area.js` asserts the copy promises no date
or version, and that no `[Split this area]` button exists anywhere.

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
if every suite passes, so it is safe in front of a deploy. 19 suites, 1038 assertions.

It **globs `test_*.js`**, so a new harness needs no registration — but it counts assertions by
grepping for a line matching `^N passed, M failed`. A suite that prints its total any other way
is reported as passing with **0 assertions**, which looks like success. End every harness with
that exact line.

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

Registered engines: `grid`, `fl`, `panel`, `deck`, `material`, `label`, `sample`, `areajoin`. The last three are
not engines in the layout sense — `material` and `label` are the pure arithmetic behind how the
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
