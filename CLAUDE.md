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
