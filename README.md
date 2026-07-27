# Stagger

Flooring and paneling layout planner. Single-file, offline-first, no frameworks — an EGS app.
Working notes and the rules for changing it live in [CLAUDE.md](CLAUDE.md).

## Everyday commands

| | |
|---|---|
| `./run_tests.sh` | every harness; exit 0 only if all pass. Run before any deploy. |
| `python3 reinline.py` | re-inline the six extracted modules into `index.html`. **Run after editing any of them** — the tests check the modules, the app runs the inlined copies. |
| `./deploy.sh --full` | ship (stamps a version, bumps the service-worker cache, pushes). |
| `node render_svg.js --view=wood --theme=light --png` | render a layout to `.svg`/`.png` headless, to *look* at it — the Chrome screenshot path is unreliable, and `qlmanage` rasterises with **WebKit**, the engine iOS Safari actually runs, so this doubles as a free cross-engine check. |

`render_svg.js --help` isn't a thing; the usage block is the file header. Output is gitignored.
