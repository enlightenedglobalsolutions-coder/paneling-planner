#!/usr/bin/env python3
"""
reinline.py — refresh every copy of a module inlined in index.html from the
tested module on disk. Run after ANY module edit, so the shipped single file
never drifts from what the harnesses cover.

Two inlining styles, both covered:

  IIFE  store.js / migrate_jobs.js / diagnose.js are wrapped as
        `var StaggerStore = (function(){ ... })();`

  BARE  spread.js / lshape.js / bridge.js are inlined as plain top-level
        functions, between sentinel comments this script writes and preserves.

Before 2026-07-26 the BARE three were copied BY HAND and were not covered here.
That meant test_bridge.js tested bridge.js on disk while the app ran the
hand-copied inline version — in sync by hand rather than by proof. They are in
sync no longer by luck but by construction: this script regenerates them.
"""
import sys, shutil, time, os, re

REPO = "/Volumes/AI Storage/EGS/apps/Stagger"
IDX  = os.path.join(REPO, "index.html")

# Tolerant: bridge.js writes `if (typeof module !== "undefined")` with spaces,
# spread.js writes it without. A fixed string separator misses one of them.
EXPORT_RE = re.compile(r'\nif\s*\(\s*typeof module\s*!==\s*"undefined"\s*\)\s*module\.exports')

def split_module(path):
    """Return (body, exports_tail) with the module.exports block removed."""
    src = open(path).read()
    hits = list(EXPORT_RE.finditer(src))
    if len(hits) != 1:
        sys.exit("ABORT: %s has %d export blocks (expected 1)" % (path, len(hits)))
    m = hits[0]
    body = src[:m.start()]
    tail = src[m.end():]
    # tail starts at " = {" or similar; keep only what is inside the braces
    inner = tail.partition("{")[2]
    return body.rstrip(), inner.rstrip()

def wrap_module(path, varname):
    body, inner = split_module(path)
    return "var %s = (function(){\n%s\nreturn {%s})();\n" % (varname, body, inner)

def bare_module(path, name):
    """The module's own source, minus its export block, between sentinels."""
    body, _ = split_module(path)
    return ("/* ==== %s (inlined) — REFRESHED BY reinline.py. Edit %s, not here. ==== */\n"
            "%s\n/* ==== end %s ==== */" % (name, name, body, name))

html = open(IDX).read()
orig_len = len(html)

BLOCKS = [
    ("var StaggerStore = (function(){",   "/* ---- migrate_jobs.js (inlined",
     os.path.join(REPO, "store.js"),        "StaggerStore"),
    ("var StaggerMigrate = (function(){", "/* ---- diagnose.js (inlined",
     os.path.join(REPO, "migrate_jobs.js"), "StaggerMigrate"),
    ("var StaggerDiag = (function(){",    "/* ---------- persistence · stagger.store.v1",
     os.path.join(REPO, "diagnose.js"),     "StaggerDiag"),
]

# Bare blocks — plain top-level functions between sentinels this script owns.
# The sentinels are regenerated on every run, so they survive the rewrite; that
# is why they exist rather than anchoring on the module's own first comment.
BARE = ["spread.js", "lshape.js", "bridge.js"]

for start, end, path, var in BLOCKS:
    if html.count(start) != 1:
        sys.exit("ABORT [%s]: start marker count = %d" % (var, html.count(start)))
    if html.count(end) != 1:
        sys.exit("ABORT [%s]: end marker count = %d" % (var, html.count(end)))
    i = html.index(start)
    j = html.index(end, i)
    html = html[:i] + wrap_module(path, var) + "\n" + html[j:]
    print("  refreshed %s from %s" % (var, os.path.basename(path)))

for name in BARE:
    start = "/* ==== %s (inlined)" % name
    end   = "/* ==== end %s ==== */" % name
    if html.count(start) != 1:
        sys.exit("ABORT [%s]: start sentinel count = %d — did someone edit the "
                 "inlined block by hand?" % (name, html.count(start)))
    if html.count(end) != 1:
        sys.exit("ABORT [%s]: end sentinel count = %d" % (name, html.count(end)))
    i = html.index(start)
    j = html.index(end, i) + len(end)
    html = html[:i] + bare_module(os.path.join(REPO, name), name) + html[j:]
    print("  refreshed %s (bare) from %s" % (name, name))

stamp = time.strftime("%Y%m%d-%H%M%S")
shutil.copy2(IDX, IDX + ".bak." + stamp)
open(IDX, "w").write(html)
print("backup : %s.bak.%s" % (IDX, stamp))
print("size   : %d -> %d chars (%+d)" % (orig_len, len(html), len(html)-orig_len))
