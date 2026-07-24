# Stagger — repo notes

Extends the EGS working standards in `../../CLAUDE.md`. Only repo-specific rules live here.

## Inlined modules — re-inline before testing or deploying

`index.html` is a single self-contained file (no `<script src>`), so the tested modules are
**copied into it**, not linked. These are inlined:

| Module | Inlined as | Tested by |
|---|---|---|
| `store.js` | `StaggerStore` | `test_store.js` |
| `migrate_jobs.js` | `StaggerMigrate` | `test_persist.js` |

**After editing either module, run `python3 reinline.py` before testing or deploying.**

It rewrites both inlined blocks in `index.html` from the modules on disk, takes a timestamped
backup, and is idempotent — running it with no module changes is a 0-byte edit.

Skipping it means the harnesses pass against `store.js` while `index.html` still carries the
old code, and the app ships something no test has ever run. The gap is silent: nothing fails,
the tests are just no longer testing what ships.

Also keep `store.js` and `v2-modules/store.js` byte-identical (`diff store.js v2-modules/store.js`).

To prove the inlined copies match the modules, extract them back out of `index.html` and run the
real harnesses against the extracted code — that is the check that catches drift.

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
