// ============================================================================
//  Stagger — migrate_jobs.js
//  One-time, NON-DESTRUCTIVE migration: stagger.jobs.v1  ->  stagger.store.v1
//
//  The interim model (hand-rolled inside index.html) and the proven store.js
//  model disagree about more than field names, so this is a real translation,
//  not a rename:
//
//    root   { schema, currentId, jobs:{id->job} }   ->  { schemaVersion,
//                                                          currentJobId, jobs:[] }
//    job    created/updated                         ->  createdAt/updatedAt
//    area   (no id)                                 ->  id assigned here
//    area   material : "Hardwood" | "__exclude"     ->  materialType
//             ...store's own `material` is the {faceIn,lengthsAvailFt} object
//    area   mode     : "imperial" | "metric"        ->  unitsMode
//             ...store's own `mode` is the "floor"/"panel" work mode
//
//  Those last two are same-name/different-meaning collisions. Writing them
//  straight across would silently corrupt both, so they are renamed here and
//  the store's own meanings keep the original names.
//
//  Safety contracts:
//   - the legacy payload is deep-copied first; the caller's object and the
//     old localStorage key are never mutated
//   - migration REFUSES to run if the destination already holds jobs, so a
//     second launch cannot duplicate a job list
//   - a record that fails the shape check is reported, never silently dropped
// ============================================================================

var LEGACY_KEY = "stagger.jobs.v1";

// injectable for tests (mirrors store.js's _setClock)
var _mUid = function(){ return "ar-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8); };
var _mNow = function(){ return Date.now(); };

function _clone(v){ return JSON.parse(JSON.stringify(v)); }

// ---- is there anything to migrate? -----------------------------------------
function hasLegacy(storage){
  try { return !!storage.getItem(LEGACY_KEY); } catch(e){ return false; }
}

// ---- parse + shape-check the legacy payload --------------------------------
// Returns { ok, error, jobs:[...] } — jobs in the same order the old app listed
// them (most recently updated first), so the preview matches what you'd see.
function readLegacy(raw){
  if(raw==null || raw==="") return { ok:false, error:"empty", jobs:[] };
  var st;
  try { st = JSON.parse(raw); } catch(e){ return { ok:false, error:"corrupt", jobs:[] }; }
  if(!st || typeof st!=="object" || !st.jobs || typeof st.jobs!=="object")
    return { ok:false, error:"shape", jobs:[] };
  var jobs = Object.keys(st.jobs).map(function(k){ return st.jobs[k]; })
    .filter(function(j){ return j && typeof j==="object" && Array.isArray(j.areas); })
    .sort(function(a,b){ return (b.updated||0)-(a.updated||0) || (b.created||0)-(a.created||0); });
  return { ok:true, error:null, jobs:jobs, currentId:st.currentId||null, schema:st.schema };
}

// ---- what the user sees BEFORE anything is written -------------------------
// One row per job: exactly the figures the old job list showed.
function previewLegacy(raw){
  var r = readLegacy(raw);
  if(!r.ok) return { ok:false, error:r.error, jobs:[], totalJobs:0, totalAreas:0 };
  var rows = r.jobs.map(function(j){
    var areas = j.areas || [];
    return {
      id: j.id, name: j.name || "Untitled job",
      areaCount: areas.length,
      sqft: areas.reduce(function(s,a){ return s + (a && a.excluded ? 0 : ((a&&a.sqft)||0)); }, 0),
      updated: j.updated || j.created || null
    };
  });
  return { ok:true, error:null, jobs:rows, totalJobs:rows.length,
           totalAreas:rows.reduce(function(s,r2){ return s+r2.areaCount; },0) };
}

// ---- the translation itself ------------------------------------------------
function migrateArea(a){
  return {
    id: _mUid(),
    name: (typeof a.name==="string" && a.name) ? a.name : "Area",
    mode: "floor",                       // store's WORK mode; units go to unitsMode
    dims: { entry:"outside", outWidthIn:null, outDepthIn:null,
            wallDefault:{ framing:"2x6", finish:"drywall-1/2" },
            overrides:{ width:{a:null,b:null}, depth:{a:null,b:null} },
            siteWidthIn:null, siteDepthIn:null },
    truss: { oc:24, offsetIn:18 },
    material: { faceIn:5.0, lengthsAvailFt:[12,14,16] },
    pinned: null,
    // A legacy area has no install record and cannot: stagger.jobs.v1 predates
    // per-area progress entirely. Written explicitly rather than left off,
    // because this is a hand-kept field list — an area arriving from here and
    // one from createArea() must carry the same shape, or the difference shows
    // up later as a field that exists on some records and not others.
    install: null,
    // ---- carried across from stagger.jobs.v1 ----
    materialType: (typeof a.material==="string") ? a.material : null,
    unitsMode: (a.mode==="metric" || a.mode==="imperial") ? a.mode : "imperial",
    excluded: !!a.excluded,
    rects: (a.rects!==undefined) ? a.rects : null,
    edges: (a.edges!==undefined) ? a.edges : null,
    inches: (a.inches!==undefined) ? a.inches : null,
    sqft: (typeof a.sqft==="number" && isFinite(a.sqft)) ? a.sqft : null,
    engineInput: (a.engineInput!==undefined) ? a.engineInput : null,
    runOverride: (a.runOverride!==undefined) ? a.runOverride : null
  };
}

function migrateJob(j){
  return {
    id: (typeof j.id==="string" && j.id) ? j.id : ("job-"+_mUid()),
    name: (typeof j.name==="string" && j.name) ? j.name : "Untitled job",
    createdAt: j.created || _mNow(),
    updatedAt: j.updated || j.created || _mNow(),
    wastePct: (parseFloat(j.wastePct)>=0) ? j.wastePct : 10,
    boxCov: (typeof j.boxCov==="string") ? j.boxCov : "",
    areas: (j.areas||[]).map(migrateArea)
  };
}

// migrateLegacy(raw, schemaVersion) -> { ok, error, store, migrated:{jobs,areas} }
// `raw` is the untouched string from the old key. The caller writes the result
// to the NEW key only; the old key is not this function's business.
function migrateLegacy(raw, schemaVersion){
  var r = readLegacy(raw);
  if(!r.ok) return { ok:false, error:r.error, store:null, migrated:{jobs:0,areas:0} };
  var safe = _clone(r.jobs);              // never touch the caller's objects
  var jobs = safe.map(migrateJob);
  var currentJobId = null;
  if(r.currentId && jobs.some(function(j){ return j.id===r.currentId; })) currentJobId = r.currentId;
  else if(jobs.length) currentJobId = jobs[0].id;
  return {
    ok: true, error: null,
    store: { schemaVersion: (typeof schemaVersion==="number") ? schemaVersion : 2,
             jobs: jobs, currentJobId: currentJobId },
    migrated: { jobs: jobs.length,
                areas: jobs.reduce(function(s,j){ return s+j.areas.length; },0) }
  };
}

// ---- guard: only ever migrate into an empty destination --------------------
function shouldMigrate(legacyRaw, destStore){
  if(!legacyRaw) return { should:false, reason:"no-legacy" };
  if(destStore && Array.isArray(destStore.jobs) && destStore.jobs.length)
    return { should:false, reason:"destination-not-empty" };
  return { should:true, reason:null };
}

function backupKeyFor(now){ return LEGACY_KEY + ".backup." + (now || _mNow()); }

if(typeof module!=="undefined") module.exports = {
  LEGACY_KEY, hasLegacy, readLegacy, previewLegacy,
  migrateArea, migrateJob, migrateLegacy, shouldMigrate, backupKeyFor,
  _setClock: function(u,n){ _mUid=u||_mUid; _mNow=n||_mNow; }
};
