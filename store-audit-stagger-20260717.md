# Store Audit — Stagger (combined build, 111,608 bytes) — 2026-07-17

Audited file: the validated v6.3 combined paneling+flooring index.html.
Target product for stores: **Stagger** (flooring-first). Play first, Apple second.

## Gate 1 — "Just a website" rejection (Apple 4.2)
| Check | Result | Evidence |
|---|---|---|
| Offline-capable app logic | PASS | 0 `fetch(` calls in app code — engines, export, everything runs on-device |
| Safe-area insets | PASS | 5 uses of `env(safe-area-inset-*)` |
| Viewport app-like | WARN | `maximum-scale=1` disables pinch-zoom — Apple accessibility reviewers sometimes flag this; keep zoom in content areas |
| **Manifest linked** | **FAIL** | No `rel="manifest"` in this file — not installable as shipped |
| **Service worker registered** | **FAIL** | 0 `serviceWorker` references — no offline caching, cold-start offline will fail |

The deploy protocol assumes a `service-worker.js` exists in the repo, but this
file never registers one and links no manifest. Whatever the live repo has, the
store build must carry both **inside this artifact's ecosystem** — this is the
difference between "the code works offline" and "the app IS offline."

## Gate 2 — Completeness (Apple 2.1)
| Check | Result | Evidence |
|---|---|---|
| Dead features | PASS | Zero network-dependent features; nothing silently fails |
| Placeholder/beta text | PASS | Only leftover is an unused `.soon` CSS rule — cosmetic, delete it |
| All screens functional | PASS | Setup/Layout/Cuts/Print in both modes, validated this build |

## Gate 3 — Payments (Apple 3.1.1 / Play Billing)
| Check | Result | Evidence |
|---|---|---|
| No external purchase/donation links | PASS | 0 hits for stripe/paypal/btc/interac/contribute |
| Pro unlock design | ACTION | When Pro gating is added: iOS build must use IAP (or ship paid-up-front); the Lemon Squeezy key path stays web/Android-only |

## Gate 4 — Privacy declarations
| Check | Result | Evidence |
|---|---|---|
| Third-party requests | PASS | Only external string is the EGS github.io domain (header comment). "No data collected" is TRUE |
| **Privacy policy URL** | **FAIL** | No privacy page or link exists; both stores require a live policy URL |

## Gate 5 — Android / TWA (repo-level, not verifiable from index.html)
| Check | Result |
|---|---|
| TWA package via PWABuilder | ACTION |
| `/.well-known/assetlinks.json` on the Pages domain | ACTION — without it the app opens with browser chrome and fails Gate 1 |
| Current Play target API level | ACTION — check at build time |

## Gate 6 — Metadata & assets
| Check | Result |
|---|---|
| Icon set from master SVG | ACTION — Stagger icon exists as SVG; generate the store size set |
| Screenshots (real content) | ACTION |
| "Stagger" name availability on Play/App Store | ACTION — verify before attaching the brand to listings |

## Gate 7 — EGS-specific blockers
| Check | Result | Evidence |
|---|---|---|
| Storage safety | PASS (note) | Only stored data is install progress, fingerprinted to its exact layout — self-invalidating, so stale-schema corruption can't occur. Formal `schemaVersion` still recommended when Pro licensing adds stored state |
| Delete confirms | PASS | Reshuffle-with-progress and clear-progress both confirm |
| **Product shape** | **FAIL** | This file is the combined tool with PANELING as the default mode. The store product is Stagger: flooring-first, standalone (the FLOORING MODULE markers exist for exactly this extraction), paneling arriving later as the Pro tier |

## Verdict: **BLOCKED**

Blockers, in fix order:
1. Extract standalone Stagger (flooring default; markers make this mechanical)
2. Add manifest + service worker + icon set to the store artifact
3. Publish a privacy policy page and link it in-app
4. Repo: assetlinks.json + PWABuilder TWA package
5. Verify "Stagger" listing-name availability
6. Minor: drop `maximum-scale=1` in content views; delete the unused `.soon` rule

Strengths to state in review notes when submitting: fully functional offline
(airplane-mode demo), zero data collection (truthful privacy labels), on-device
computation as the core value — the exact profile that beats the 4.2 rejection.

---

# UPDATE — 2026-07-18: blockers fixed, package built

| Blocker | Status |
|---|---|
| 1. Standalone Stagger (flooring-first) | FIXED — store build boots to flooring, paneling toggle hidden (code dormant, ready for Pro). Rebranded: title/header "Stagger" |
| 2. Manifest + service worker + icons | FIXED — manifest.json (standalone, theme #185FA5), cache-first SW (stagger-cache-v1, all 7 assets verified present), icons 192/512/512-maskable/180. Icons are PLACEHOLDERS pending the real Stagger mark |
| 3. Privacy policy | FIXED — privacy.html ("collects nothing", truthful), linked from the app header |
| 4. assetlinks.json | TEMPLATE READY — needs the SHA-256 from Play Console App Signing after first upload |
| 5. Name availability | OPEN — Edwin: search "Stagger" on Play/App Store (2-minute manual check) |
| 6. maximum-scale / .soon | FIXED — both removed |

Validation: index JS + service-worker.js pass node --check; manifest and
assetlinks parse as JSON; 0 secrets; 0 payment links; 0 third-party requests;
boot-mode and modebar-hide verified by grep.

## Remaining human steps (in order)
1. Play Store search for "Stagger" name conflicts
2. Deploy stagger-store/ contents to a repo → GitHub Pages (own repo recommended: stagger)
3. Test install on a real phone: airplane mode cold start must work
4. PWABuilder.com → point at the live URL → generate the Android/TWA package
5. Play Console: create app (package ca.egs.stagger), upload, copy the App
   Signing SHA-256 into .well-known/assetlinks.json, redeploy Pages
6. Real Stagger icon when designed (with the Notebuilt icon swap) — replace the
   4 PNGs, bump SW cache
