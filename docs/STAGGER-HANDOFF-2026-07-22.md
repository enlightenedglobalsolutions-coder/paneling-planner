# Stagger — Handoff (2026-07-22)

Start-of-chat context for the **merge session at the Mac**. Read this first.

---

## THE TASK NEXT CHAT
Merge the new **jobs → areas → draw → measure** flow (built today, self-contained in
`stagger-shape-input.html`) into the **live Stagger app** (`index.html`), then deploy.

**Upload at the start of that chat:**
1. `stagger-shape-input.html` ← today's build (62,594 B) — REQUIRED, it won't exist in a new container
2. the live Stagger `index.html` ← REQUIRED for the merge
3. `spread.js` / `lshape.js` (+ tests) ← to wire the real board optimizer
4. `store.js` ← so persistence uses the real Jobs/Areas model

Opening line that works: *"Merging the new jobs/shape-input flow into the live Stagger
index.html — files attached."*

---

## WHAT WAS BUILT TODAY (all in `stagger-shape-input.html`, single file, no frameworks)

**Flow:** Jobs list → job's Areas → shape picker → draw canvas → measure → save area.

- **Jobs list** (home): name, area count, total sq ft, "last updated", newest first.
  `+ New job` → "Untitled job", ✎ inline rename, Delete w/ confirm.
  **Launch:** opens the last-opened job; shows the Jobs list only if there are none.
- **Areas** (per job): row per area w/ material chip + sq ft, tap to edit, ✎ rename,
  Delete w/ confirm, job total (excluded areas omitted), materials estimate.
- **Shape picker**: Rectangle / L / U / T presets + "Draw it myself".
- **Draw canvas**: drag on empty grid to pull out a room; drag to move (snaps edge-to-edge);
  corner handle resizes; pinch/±  zoom; undo/clear; live union outline + connectivity warning.
  Collapsible grid (`Hide grid ▲`) + sticky top/bottom bars so the page scrolls freely.
- **Measure**: tap a side's number on the diagram → single linked input opens below
  (ft/in/frac ⇄ m/cm, remembers last unit) → value lands **beside** the number at full size.
- **Estimate**: waste % (default 10) + optional sq ft/box → per-material "buy N sq ft" + box count.

### Engine work (pure, tested)
- `bridge.js` (**16/16**, `test_bridge.js`) — traced outline + measured sides → engine input.
  `buildEngineInput(edges, inches, overrideAxis?)` →
  `{ ok, runAxis, kind:'rect'|'L'|'complex', profile:{kind,bands:[{depthIn,runIn,runStartIn}]},
     rect:{runIn,acrossIn}|null, warnings, autoSwitched }`
  Boards auto-run the longer wall; auto-switches axis when that's the only clean band split;
  overridable in-app via `Switch ⇄`.
- **Persistence** (**17/17**, `test_persist.js`) and **jobs layer** (**20/20**, `test_jobs.js`).

Run tests from the folder holding the HTML: `node test_bridge.js && node test_persist.js && node test_jobs.js`

---

## LOCKED DECISIONS (don't re-litigate)
- **Look = "rich & warm" brass + timber**: espresso ground, brushed-brass gradients, cream text,
  Georgia serif headings, deep-brass "done" check-stamp. **No green** — it clashed on gold.
- **Measure fields**: 22px tall, compact rows (approved).
- **Entry model**: tap the side number → linked field below → value beside the number.
  *No* always-visible field list, *no* popover on the diagram.
- **Measurements are final wall-to-wall (inside) dims**, used as-is.
- **Each area carries**: name + material/type + shape + sizes. Material list =
  Hardwood / Laminate / Vinyl plank / Engineered / Tile / Pine T&G / **Exclude**
  (excluded areas show in the list but don't count toward totals or materials).
- **Estimate is the simple one** (sq ft + waste %), aimed at DIY homeowners — *separate from*
  the contractor-grade staggered board optimizer, which is the merge work.
- **Storage** = keyed collection, schema-versioned, so a job list needed no migration.

---

## STORAGE CONTRACT
Key `stagger.jobs.v1` (units in `stagger.units`):
```
{ schema:1, currentId:"job_x",
  jobs:{ "job_x":{ id, name, created, updated, areas:[], wastePct, boxCov } } }
```
`area = { name, material, excluded, rects, edges, inches, mode, runOverride, sqft, engineInput }`
— inches stored internally throughout (meas_widget contract).
Auto-saves on every mutation. Corrupt/wrong-schema/junk records are discarded rather than
crashing; private-mode and quota failures are swallowed.

---

## KNOWN GAPS BEFORE IT CAN SHIP
- [ ] **No PWA plumbing in the prototype** — no service worker registration, manifest link,
      icons, or `window.EGS_VERSION`. The store package already has manifest + SW + privacy.html
      + assetlinks; the locked wood-floor S icon set is generated. Wire, don't rebuild.
- [ ] **Board optimizer not connected** — `Save area` stores `engineInput`, but nothing consumes
      it yet. This is the main merge job (`spread.js` / `generateLShape`).
- [ ] **EGS standard violation carried in**: the prototype uses `innerHTML` with class strings
      throughout (standards say don't). Worth a pass during the merge.
- [ ] **No Save/Export + Contribute page**, which EGS standards require, with Privacy linking to it.
- [ ] Not yet device-tested: multi-area jobs, the jobs list, persistence across a real app restart.
- [ ] Stagger should **default to flooring on open** (long-standing ask, still not done).

---

## WORKING NOTES
- Logic/file work goes clean in chat (testable headless). Visual/touch-canvas work is slow blind —
  **screenshots are what fixed every visual issue today.**
- Deploy is a Mac job: `egs-deploy.sh`, then swipe-close the installed app and reopen twice.
- `LC_ALL=C` on greps. Verify title + byte size before copying any file.
- Claude keeps notes across chats (decisions, standards, Stagger history) and they follow you
  across Claude models — but **the container resets: files do not carry over.** Download today's
  outputs before starting the new chat. None of it follows you to a different AI vendor.
