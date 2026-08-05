> **Canonical standards:** `/Volumes/AI Storage/EGS/EGS-STANDARDS.md` — read §1–§2 before building. A request conflicting with Tier 1 = stop and say so.

---

# Stagger — repo notes

Extends the EGS working standards in `../../CLAUDE.md`. Only repo-specific rules live here.

## Inlined modules — re-inline before testing or deploying

`index.html` is a single self-contained file (no `<script src>`), so the tested modules are
**copied into it**, not linked. Six modules are inlined, in two styles, and since 2026-07-26
**`reinline.py` covers all six**. Which modules and which style is declared in `reinline.py` itself
(the `IIFE` and `BARE` lists near the top) — read it there rather than trusting a copy here.

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
functional** — the floor rendered fine every time. `test_material.js` pins each one, because
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
the bottom edge, which is how the last row's number kept clipping. Pinned in `test_labels.js`,
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

Containment lives at the write, not at the buttons that reach it, and that has survived the storage
underneath it changing completely (Stage 4, below). Row ticking stays off in the demo (`toggleRow`
refuses): a demonstration is not something you install from. And the demo must never create
`stagger.store.v1` — a seeded job would permanently strand legacy data behind `shouldMigrate()`'s
bare `jobs.length` check.

`test_sample.js` is deliberately the **independent** proof that the demo writes nothing. It has been
rewritten twice underneath, for the same lesson each time: assert the guarantee, not the mechanism.
Stage 3 widened `inSample()` to `isReadOnlyLayout()`; Stage 4 inverted that predicate and took the
storage out of the module entirely. A suite pinning `setItem(PKEY` would have read both as breaks.

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

**One predicate, `isReadOnlyLayout()`.** New guards ask *that* rather than name a mode, which is what
stops the next mode from having to remember four separate checks — and it is why Stage 4 could
invert the whole containment model by changing one return. Rows lose their `.fl-tapzone` affordance
wherever it is true: a row that looks tappable and does nothing is the dishonest failure this app is
written against. Pinning still lands in Stage 5; `area.pinned` is paneling-shaped
(`{scenarioFt, boards}`).

*(Stage 3 shipped an area layout read-only — "nothing is persisted". That expired at Stage 4, which
is the section below. Read them in order or the reasoning looks contradictory.)*

## Per-area install progress (Stage 4)

**An install belongs to a floor, and a job can have two floors half-laid at once.** That is the whole
change. `egs-floor-progress` was a **single global localStorage slot** holding `{fp, done}` for
whichever layout was last on screen, so the app could only ever track one install — which is why
every mode except the one you happened to be in had to be forbidden from writing. The record moved
onto the area, in the job store, as **`area.install = {fp, done:[rows], updatedAt}`** (schema **3**).

**The containment model INVERTS. `isReadOnlyLayout()` is now `!inArea()`.** Area mode is the one
mode that writes; Quick calc and the demo never do. The guards themselves did not change — that is
the point of having one predicate. Read the predicate as a sentence: a layout is something you look
at unless it is an area of a job, in which case it is a floor you are laying.

**THE MODE FLAGS ARE NOW MUTUALLY EXCLUSIVE BY CONSTRUCTION, AND THAT IS LOAD-BEARING.** While the
predicate was `sampleMode || areaMode`, a flag left set from a previous screen only ever made the
next layout *more* read-only — a harmless direction to leak in, and nothing cleared them. Now a stale
`areaMode` would file Quick calc's ticks **against whatever area was last open**. So every entry
point sets *both* flags: `startQuickCalc`, `showSample`, `showArea`, `showAreaField`. Setup's
Generate button was rewired from `FL.generate` to **`FL.startQuickCalc`**, and `generate()` is no
longer exported at all — it is the one function that cannot set the flags, since the entries call it
after setting theirs.

**FL never learns what an area is.** It cannot see `JOB` or `persist()` (block 3, sealed, and the
dependency runs one way), so block 3 hands in an adapter — `AREA.install = {load(fp), save(fp,rows)}`
built by `stgInstallSlot(area)`. No adapter means nowhere to write, which is exactly Quick calc: the
demo is barred twice over, by the predicate *and* by having no slot. The adapter closes over the area
**object, never its index** — `i` is a position in `JOB.areas` and a rename or delete moves it.

**Removing localStorage from that path is what made it testable.** The whole read/write path is now
arithmetic over an injected object, so it is registered in `engine_source.js` as the **`install`**
engine and `test_install.js` *runs* it. What cannot run — the entry points, which render — is
asserted from source. Both halves are needed: the executable half proves the mechanism, the source
half proves the real entries reach it (the spec's mode accessors are test-only doors that would
happily lie).

### A reshuffle never zeroes a half-laid floor
It confirms, as it always did — but confirming was not enough, because `reshuffle()` also overwrote
the saved record with an empty one on the way past. A shuffle you immediately regretted had already
destroyed the floor, one tap deep.

**It now writes nothing at all.** It sets the new fingerprint and calls `loadProgress(S.fp)`. The
stored record keeps pointing at the layout it was made on, so the ticks vanish from the *screen* and
come back the moment you land on that card again — **cycling the deck all the way round is the
undo**, verified in-browser on a 4-card kitchen. The record is replaced only when you tick a row on a
different layout, which is a deliberate act on the floor you chose.

`readInstall()` returns nothing unless the fp matches, and **a stale record is left alone rather than
deleted** — that is what makes the above work, and it is also why carrying `install` across a
re-measure is safe.

### `saveCurrentArea`'s allowlist grew a third name
It rebuilds the area from a hand-written field list, so anything not named there is erased on the
next re-measure — for a half-laid floor, that means walking back into the room to a blank sheet.
`area.install` now sits beside `area.id` and `area.pinned` for the same reason. `migrateArea()` in
`migrate_jobs.js` is a second hand-written list and carries `install: null` explicitly, so an area
arriving from `stagger.jobs.v1` and one from `createArea()` have the same field set. `test_install.js`
asserts they do — the invariant is "these do not drift", not "install exists".

### Quick calc's Install view is honest read-only
The Row-complete button was gated on `!inSample()`, so **Quick calc shipped a button that called a
guarded `toggleRow()` — it looked live and did nothing.** It now asks the one predicate, and the
marker `data-marker="install.nojob"` stands in its exact slot, styled as `.fl-onecard` to match the
one-card marker. **Not `.helpdot`** — `:root[data-guide="expert"]` hides those wholesale, and the
person who goes looking for the missing button is the expert. *Copy is a draft, flagged for Edwin.*

Four other lines stopped promising what they cannot deliver in a read-only layout: the progress bar
(hidden), "Now laying — row N" (→ "First cuts — row N"), "Cut sequence — tap a row to tick it off"
(→ "Cut sequence"), and the overlay footer's "next up: row N".

`exitArea()` also clears `S.done`. `S` survives a screen change, so without it the ticks stayed on
screen with `areaMode` already false — and "Clear progress" is gated on `hasProgress()` rather than
on the predicate, so it reappeared as a button that wipes the screen and, having no slot, leaves the
stored record untouched.

### The legacy global slot is DROPPED, not migrated
One-time `removeItem("egs-floor-progress")` behind `stagger.installMoved`. This is the one place in
the app that deletes without asking, and Edwin ruled it: there is **nothing to migrate it to** — the
record names a layout by fingerprint and says nothing about which room, so attaching it to a guess
would put ticks on a floor nobody laid — and what it holds is a handful of row numbers recoverable
by looking at the floor. Nothing measured or typed is touched.

Deliberately *not* the `stagger.jobs.v1` treatment (left in place, only ever read): that key is still
offered to the user through the migration screen, so it has a live purpose. This one has none, and a
stale key nothing reads is a trap for whoever greps for it next.

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

## The paneling drawing — whole ceiling, and a fullscreen page (2026-08-05)

**The drawing ALWAYS shows every row.** It did not: a 29-row pine job drew ten, under a footer
reading *"10 of 29 rows"*, directly above a cut list of twenty-nine. Nothing crashed and nothing was
logged, so a self-contradiction sat on one screen until somebody under the ceiling noticed.

Two clamps compounding — `Math.min(showRows || rowJoints.length, 10)` inside `drawDiagram`, and the
on-screen caller passing `10` on top. **The hard cap also hit PRINT and EXPORT**, which nobody had
seen: both pass `inp.rows` and both got ten anyway. That is a sheet you carry up a ladder covering a
third of the job. `showRows` is **gone**, not defaulted — a parameter whose only use is drawing an
incomplete ceiling has no honest caller.

**Rows compress; they never disappear.** `diagRowHeight()` shrinks the row so the whole ceiling fits
a height budget. Jobs **up to 22 rows are byte-unchanged** (the budget divided by 22 still exceeds
`DIAG_RH_MAX`). Past ~145 rows the legibility floor `DIAG_RH_MIN` wins and the drawing is allowed to
exceed the budget and scroll — an invisible row is a partial drawing by another route. Print and the
fullscreen overlay take `DIAG_H_PRINT`, a taller budget: paper and a zoomable page are not a phone.

**The gutter widens for multi-letter row names.** At a fixed 10 units, `AA`/`AB`/`AC` were
right-aligned at x=7 and ran off the left edge — the last three rows of the job silently lost their
labels. Found by looking at the drawing, not by a test.

**Rule 3 — the drawing and the cut list cannot disagree.** `drawDiagram` derives its count from
`rowJoints.length`, so it cannot be short by construction. What construction cannot cover is
`inp.rows` disagreeing with the layout handed in, so the drawing **says so on itself** — a warn band
reading *"drawing shows N rows, cut list expects M — do not use"*, sized into the viewBox so the one
warning that matters is not the one thing clipped away. `diagRowCount(svg)` reads the count back out
of finished SVG, so tests check the OUTPUT rather than re-running the arithmetic and agreeing with
themselves.

### `DrawingOverlay` — the fullscreen page, as a component
Tap the diagram for rotate / pinch-zoom / pan / fit. Paneling had no fullscreen view at all.

It is a **component, not a copy**. The flooring overlay is ~130 lines wired to `S.cands`/`buildSvg`;
copying it would put two pinch-zoom implementations in one file, which is the drift this repo keeps
paying for. Callers supply only `{svg, contentW, contentH, foot, buttons, onRotate}`.

**Flooring is NOT migrated yet — filed.** It should be, and this is written as the general case so
the migration is deletion rather than rewriting. Its gesture surface is untested code that can only
really be judged with fingers on a phone, and rolling that into a bug fix that needed to ship would
mix a verifiable change with an unverifiable one. `test_diagram.js` asserts pinch-zoom exists **at
most twice** and will need tightening to 1 when flooring moves.

**Two bugs found only by measuring the rendered box — both silent, both pinned:**
- **`rotate(90)` without a unit is invalid CSS**, and an invalid value voids the *whole* transform
  declaration. The drawing lost its transform entirely on rotate and fell back to the stylesheet's
  full width. Must be `90deg`. Note `rotate(90)` **is** correct in an SVG transform *attribute* —
  the flooring renderer uses it legitimately — so the test is scoped to the overlay, not the file.
- **The element is sized to the drawing's own dimensions, never to `contentSize()`.** That helper is
  already swapped when rotated; sizing from it and then rotating swaps twice and the drawing came out
  transposed. `contentSize()` answers "how much room does this need", which is Fit's question.
- Sizing uses **inline styles**, because a width *attribute* loses to `svg.dg{width:100%}` in the
  stylesheet. The flooring overlay never hit this only because its SVGs carry no such class — an
  accident a shared component must not rely on.

## The paneling generator — round 2 (2026-08-04)

From a real pine ceiling: run 261.75″, trusses 24″ o.c. first at 18″, 12′ stock, 29 rows. The
generator produced a layout that **cycled**; Edwin caught it on the ceiling, not on a screen, and
rescued the remaining rows by hand. Both sequences are pinned in `test_generator2.js`.

**Why `layoutPeriod()` missed it — do not trust it alone again.** It asks for a WHOLE-SEQUENCE
period (`s[k] === s[k-p]` for every k). The failure was **interleaved**: from row I every second row
was the identical two-piece row `{5}` while the odd rows cycled a six-row pool. No single `p`
describes that, so it scored as varied. **Rule 4 is the question that catches it** — has this exact
row appeared in the last five, whatever happened in between.

### The five rules, all enforced at GENERATION time
1. **Vocabulary** — middles are every o.c. multiple from 2 bays to stock (24″/144″ ⇒ 48/72/96/120/144).
   The pool always held all five; the *walk* only ever reached for `{48,120}`.
2. **Truss exclusion** — no joint on a truss carrying one in either of the previous two rows. **Hard.**
   3+ is preferred, **soft only**.
3. **Staircase ban** — never complete a joint marching one truss per row across three rows.
4. **Signature spacing** — an identical row makeup never recurs within 5 rows. **Hard.** The
   fixed-rhythm echo half is **soft**.
5. **Forced-row cap** — ~1 per 8 rows, **and only where exactly ONE two-piece row is possible.**

**Rule 3 is STEP-24 ONLY, and that is measured.** Reading it to also ban a 48″-per-row march rejects
the hand rescue seven times (J→K→L is t3→t5→t7). The must-pass fixture decides the reading; both
directions are pinned so the stricter one cannot creep back as a "tightening".

**R2's "prefer 3+" and R4's echo check must stay soft** — the hand rescue breaches the first seven
times and has three echoes of its own. A hard version rejects the layout that must pass.

**Rule 5's condition is the rule.** A first cut rationed every single-joint row; the seed sweep
caught it on a 180″ run where **five** two-piece rows are legal — a family, not a signature. Where
more than one exists the ration stands down and rules 2 and 4 already stop any single one recurring.

### The walk backtracks; it does not relax
Tightening rule 2 means a greedy walk can corner itself, and the old answer to a corner was to
**relax a hard rule and carry on** — which is how a violation reaches a ceiling. It is now a
depth-first search with a node budget, ordered by the soft preferences and randomised within them.
Relaxation happens only after the search is exhausted, and it is reported.

Two preferences were **removed**: the anti-diagonal filter (rule 3 is the sharper, hard version) and
the 42″ short-end tie-break (a material idea acting as a strong attractor toward one row shape — it
belongs in stock assignment, not in where a seam is visible). One was **kept**: two-bay separation
from the row above, now a strict **ordering tier** rather than a filter. Dropping it was a real
regression the panel goldens caught (`oneBay` 0 → 17); as a tier over a backtracking search it
recovers to 1 without ever buying separation at the price of rule 2.

`generateOptions(trusses, runIn, capIn, rows, {prevRows})` — `prevRows` is the courses already
installed. Optional, so every existing caller is unchanged. It exists because the defect was found
**mid-job**: a rule window starting at the generator's own row 0 will happily reuse a truss from the
last installed course.

**The label is earned.** `"non-repeating stagger · A"` only when `passesFiveRules()`; otherwise it
names what failed ("2 seam(s) too close", "3 repeated row(s)").

### KNOWN: `cluster` is not comparable across this rebuild
28 → 56 on the ceiling fixture, and **30 of the 56 are `rowgap2 delta1`** — a joint one bay from a
joint two rows up. Rule 2 forbids delta 0 there, so it *pushes* joints onto the neighbouring truss,
and `auditLayout`'s cluster counts delta 0 and delta 1 identically. The old 28 included delta-0 pairs
the spec now bans outright. **Filed as its own thread:** the metric should weight delta 0 above
delta 1 at rowgap ≥ 2 — a change to a measure, with its own goldens.

Side effect worth knowing: on the app's **default** inputs the six options no longer consume
identical boards (56/57/58, waste 5.9–9.1%). That closes the old takeoff-vs-option report.

## Test harnesses

**Run everything with `./run_tests.sh`** (optionally `./run_tests.sh engine` to filter). Exit 0 only
if every suite passes, so it is safe in front of a deploy. It prints the suite and assertion
totals — read them from the run, never from here.

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

Stagger's engines live inside `index.html`. Harnesses do not slice it themselves: they go through
`engine_source.js`, which resolves **module-first, slice-fallback** and fails **loudly before any
assertion** rather than letting a harness print a misleading "0 passed, 0 failed".

The mechanics — the registry, the anchor rules, and the traps each registered engine encodes — are
in the `stagger-harnesses` skill. Read it before adding a harness or registering an engine.

**The purity check reads code, not prose.** It used to scan the raw slice for `document.`/`window.`/
`localStorage`, so a *comment* explaining that a function no longer touches localStorage was enough
to fail the slice as impure — the exact inversion of what the check is for, and the pressure it
creates is to mutilate an accurate comment. It now strips comments first. `stripComments` is
**exported** for the same reason harnesses keep needing it: a block that quotes the thing it forbids
matches a raw grep for it (`test_area.js`'s refusal, `test_labels.js`'s counter-rotation,
`test_install.js`'s "reshuffle no longer writes"). One implementation, not three that disagree.

### The two engine suites are CHARACTERISATION suites

`test_fl_engine.js` and `test_panel_engine.js` pin what the engines do **today**, so the
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



Every harness passes — read the suite and assertion totals from `./run_tests.sh`, never from here.
Most are a plain `require()` of a module; `test_bridge.js`, `test_fl_engine.js`, `test_panel_engine.js`,
`test_area.js`, `test_deck.js`, `test_labels.js` and `test_install.js` get their code through
`engine_source.js` (above), so they test **what actually ships** and fail if the shipped file drifts.

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

Live key is `stagger.store.v1` (schema **3** — v3 added `area.install`, see Stage 4 above; the
migration is additive and runs on load, but the store is only rewritten when something commits, so a
v2 payload stays v2 on disk until the first real write). The older `stagger.jobs.v1` is migrated once, on
demand, from the in-app migration screen, and is then **left untouched** — it is only ever read.
It is cleared solely by the user, from the confirm-gated "Remove old copy" action on the jobs list.

Three fields were renamed on the way across because the two models used the same names for
different things. Do not "tidy" these back:

- `material` (string, e.g. `"Pine T&G"`) → `materialType`; `material` is the store's stock object
- `mode` (units, `"imperial"`/`"metric"`) → `unitsMode`; `mode` is the work mode, `"floor"`/`"panel"`

Areas carry a stable `id` — pins hang off it, so pins survive an area being deleted or reordered.
Re-saving an area must preserve its `id`, its `pinned` and its `install`.

`applyAreaV2` is now **`applyAreaDefaults`** — named for the shape, not one version. It applies
whatever `geometryDefaults()` currently says an area carries, and every migration that touches areas
calls it, so a record migrated from v1 and one created today carry the same field set.

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
