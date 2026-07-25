# Stagger — repo notes

Extends the EGS working standards in `../../CLAUDE.md`. Only repo-specific rules live here.

## Inlined modules — re-inline before testing or deploying

`index.html` is a single self-contained file (no `<script src>`), so the tested modules are
**copied into it**, not linked. Five modules are inlined, in two different ways:

| Module | Inlined as | Tested by | Refreshed by `reinline.py`? |
|---|---|---|---|
| `store.js` | `StaggerStore` IIFE | `test_store.js`, `test_jobs.js` | **yes** |
| `migrate_jobs.js` | `StaggerMigrate` IIFE | `test_persist.js` | **yes** |
| `diagnose.js` | `StaggerDiag` IIFE | `test_diagnose.js` | **yes** |
| `spread.js` | bare, `/* ---- spread.js ---- */` | `v2-modules/test_spread.js` | no — by hand |
| `lshape.js` | bare, `/* ---- lshape.js ---- */` | `test_lshape.js` | no — by hand |
| `bridge.js` | bare | `test_bridge.js` | no — by hand |

(`inside_dims.js` is **not** inlined — it has no consumer in `index.html` yet.)

**After editing `store.js`, `migrate_jobs.js` or `diagnose.js`, run `python3 reinline.py` before
testing or deploying.** It rewrites those blocks from the modules on disk, takes a timestamped backup,
and is idempotent — running it with no module changes is a 0-byte edit.

The other three were inlined by hand and `index.html` wraps them in adapters it does not share
(e.g. `v2RunSpread` around `runSpread`). **`reinline.py` deliberately leaves them alone** — a blind
refresh would clobber those adapters. If you edit one, port the change into `index.html` by hand
and confirm it landed.

Skipping it means the harnesses pass against `store.js` while `index.html` still carries the
old code, and the app ships something no test has ever run. The gap is silent: nothing fails,
the tests are just no longer testing what ships.

Also keep `store.js` and `v2-modules/store.js` byte-identical (`diff store.js v2-modules/store.js`).

To prove the inlined copies match the modules, extract them back out of `index.html` and run the
real harnesses against the extracted code — that is the check that catches drift.

`test_bridge.js` already works this way: it slices the grid-geometry block out of `index.html` and
tests *that*, so it fails if the shipped file drifts. It fails loudly with a readable message if
its anchors move or the block starts touching the DOM — a harness that cannot run must not look
like one that passes.

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

All 11 harnesses pass (7 at root, 4 in `v2-modules/`). Every one is a plain `require()` of its
module **except `test_bridge.js`**, which is a *slicer*: it cuts the grid-geometry block out of
`index.html` between `function rectsToCells(rects){` and `//  EGS Measurement Widget` and tests
**that**, so it fails if the shipped file drifts.

`test_bridge.js` is current and passing (16/16). Its header mentions a `stagger-shape-input.html`
prototype **in the past tense** — that fixture was never in this repo, and the harness was
repointed at `index.html` in `e4dda67`. Don't read that comment as a live dependency and don't
"fix" the harness again.

Two known gaps, neither actioned:
- The slice starts at `rectsToCells`, but `allConnected` (inside the slice) calls `rectsAdjacent`
  (defined just *outside* it). Nothing tests `allConnected`, so it never fires; a future test that
  does will get a `ReferenceError`, not a real failure. Move the START anchor to
  `function rectsAdjacent(a, b){` if that day comes.
- Nothing slices the inlined `bridge.js` / `spread.js` / `lshape.js` blocks — only the grid engine.
  Those three are kept in sync by hand, not by test.

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
