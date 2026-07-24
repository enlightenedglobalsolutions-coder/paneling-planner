#!/usr/bin/env python3
"""
reinline.py — refresh the copies of store.js / migrate_jobs.js inlined in
index.html from the tested modules on disk. Run after ANY module edit, so the
shipped single file never drifts from what the harnesses cover.
"""
import sys, shutil, time, os

REPO = "/Volumes/AI Storage/EGS/apps/Stagger"
IDX  = os.path.join(REPO, "index.html")

def wrap_module(path, varname):
    src = open(path).read()
    sep = 'if(typeof module!=="undefined") module.exports = {'
    if src.count(sep) != 1:
        sys.exit("ABORT: %s has %d export blocks" % (path, src.count(sep)))
    head, _, tail = src.partition(sep)
    return "var %s = (function(){\n%s\nreturn {%s})();\n" % (varname, head.rstrip(), tail.rstrip())

html = open(IDX).read()
orig_len = len(html)

BLOCKS = [
    ("var StaggerStore = (function(){",   "/* ---- migrate_jobs.js (inlined",
     os.path.join(REPO, "store.js"),        "StaggerStore"),
    ("var StaggerMigrate = (function(){", "/* ---------- persistence · stagger.store.v1",
     os.path.join(REPO, "migrate_jobs.js"), "StaggerMigrate"),
]

for start, end, path, var in BLOCKS:
    if html.count(start) != 1:
        sys.exit("ABORT [%s]: start marker count = %d" % (var, html.count(start)))
    if html.count(end) != 1:
        sys.exit("ABORT [%s]: end marker count = %d" % (var, html.count(end)))
    i = html.index(start)
    j = html.index(end, i)
    html = html[:i] + wrap_module(path, var) + "\n" + html[j:]
    print("  refreshed %s from %s" % (var, os.path.basename(path)))

stamp = time.strftime("%Y%m%d-%H%M%S")
shutil.copy2(IDX, IDX + ".bak." + stamp)
open(IDX, "w").write(html)
print("backup : %s.bak.%s" % (IDX, stamp))
print("size   : %d -> %d chars (%+d)" % (orig_len, len(html), len(html)-orig_len))
