// ============================================================================
//  Stagger v2 — store.js
//  Jobs -> Areas -> Layouts, versioned localStorage, migrations, CRUD,
//  export/import. Schema stores INCHES (engines speak inches). No framework.
//
//  Safety contracts (from the spec, non-negotiable):
//   - schemaVersion on every payload; migrate() chain runs on load, never
//     destructive; an unknown FUTURE version is read-only, never overwritten.
//   - site measures (siteWidthIn/siteDepthIn) win over computed dims.
//   - storage failure (quota / private mode) is reported, never silently lost.
//   - deletes are explicit calls (the UI gates them behind a confirm sheet that
//     names the target); nothing deletes on its own.
// ============================================================================

var STORE_KEY = "stagger.store.v1";
var SCHEMA_VERSION = 2;

// ---- id + clock (injectable for tests) ----
function _uid(){
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8);
}
function _now(){ return Date.now(); }

// ---- the empty store ----
function emptyStore(){
  return { schemaVersion: SCHEMA_VERSION, jobs: [], currentJobId: null };
}

// ---- v2 area/job defaults --------------------------------------------------
// v2 absorbed the drawn-geometry model that used to live under stagger.jobs.v1.
// Two field names collided across the two models and were renamed on the way in:
//   material (string "Hardwood"/"__exclude")  -> materialType   [store's own
//              `material` stays the {faceIn,lengthsAvailFt} stock object]
//   mode     (units "imperial"/"metric")      -> unitsMode      [store's own
//              `mode` stays the "floor"/"panel" work mode]
// Anything that renames a field must also add it here, or migrated records and
// freshly-created ones drift apart.
function geometryDefaults(){
  return { materialType:null, unitsMode:"imperial", excluded:false,
           rects:null, edges:null, inches:null, sqft:null,
           engineInput:null, runOverride:null };
}
function applyAreaV2(a){
  var d=geometryDefaults();
  Object.keys(d).forEach(function(k){ if(a[k]===undefined) a[k]=d[k]; });
  if(a.pinned===undefined) a.pinned=null;
  if(typeof a.id!=="string") a.id=_uid();
  return a;
}

// ---- migrations: index i upgrades vFrom i -> i+1. Append only; never rewrite.
//      Each must be pure and non-destructive (add fields, don't drop data). ----
var MIGRATIONS = [
  // [0] v0 -> v1 : the original shape; nothing to add.
  null,
  // [1] v1 -> v2 : geometry fields on areas, waste/box on jobs, currentJobId on
  //     the root. Additive only — no existing field is renamed or dropped here.
  function v1_to_v2(s){
    if(s.currentJobId===undefined) s.currentJobId=null;
    (s.jobs||[]).forEach(function(j){
      if(j.wastePct===undefined) j.wastePct=10;
      if(j.boxCov===undefined) j.boxCov="";
      if(!Array.isArray(j.areas)) j.areas=[];
      j.areas.forEach(applyAreaV2);
    });
    return s;
  }
];

function migrate(store){
  if(!store || typeof store !== "object") return emptyStore();
  var v = (typeof store.schemaVersion === "number") ? store.schemaVersion : 0;
  // Future version we don't understand: DO NOT touch. Caller treats read-only.
  if(v > SCHEMA_VERSION){ return { __future: true, schemaVersion: v, jobs: store.jobs || [] }; }
  // Apply forward migrations in order.
  var s = store;
  for(var i = v; i < SCHEMA_VERSION; i++){
    if(typeof MIGRATIONS[i] === "function") s = MIGRATIONS[i](s);
    s.schemaVersion = i + 1;
  }
  if(!Array.isArray(s.jobs)) s.jobs = [];
  return s;
}

// ---- load / save with honest failure ----
function loadStore(storage){
  storage = storage || _localStorage();
  var raw;
  try { raw = storage.getItem(STORE_KEY); }
  catch(e){ return { store: emptyStore(), error: "read", readOnly:false }; }
  if(!raw) return { store: emptyStore(), error: null, readOnly:false };
  var parsed;
  try { parsed = JSON.parse(raw); }
  catch(e){ // corrupt payload: keep a backup, start fresh, tell the caller
    try { storage.setItem(STORE_KEY + ".corrupt." + _now(), raw); } catch(_){}
    return { store: emptyStore(), error: "corrupt", readOnly:false };
  }
  var migrated = migrate(parsed);
  if(migrated.__future) return { store: migrated, error: "future", readOnly:true };
  return { store: migrated, error: null, readOnly:false };
}

function saveStore(store, storage){
  storage = storage || _localStorage();
  if(store && store.__future) return { ok:false, error:"readonly-future" }; // never overwrite newer data
  try {
    storage.setItem(STORE_KEY, JSON.stringify(store));
    return { ok:true, error:null };
  } catch(e){
    // quota exceeded or private-mode block — report, don't pretend it saved
    return { ok:false, error: (e && e.name==="QuotaExceededError") ? "quota" : "write" };
  }
}

function _localStorage(){
  try { return window.localStorage; } catch(e){ return _memStub(); }
}
function _memStub(){ var m={}; return {
  getItem:function(k){ return k in m ? m[k] : null; },
  setItem:function(k,v){ m[k]=String(v); },
  removeItem:function(k){ delete m[k]; }
}; }

// ---- job CRUD ----
function createJob(store, name){
  var job = { id:_uid(), name:(name||"Untitled job").trim(), createdAt:_now(), updatedAt:_now(),
              areas:[], wastePct:10, boxCov:"" };
  store.jobs.push(job);
  return job;
}
function getJob(store, jobId){ return store.jobs.find(function(j){ return j.id===jobId; }) || null; }
function renameJob(store, jobId, name){
  var j=getJob(store,jobId); if(!j) return false;
  j.name=(name||"").trim()||j.name; j.updatedAt=_now(); return true;
}
function deleteJob(store, jobId){
  var i=store.jobs.findIndex(function(j){ return j.id===jobId; });
  if(i<0) return false; store.jobs.splice(i,1); return true;
}

// ---- area CRUD ----
function defaultDims(){
  return { entry:"outside", outWidthIn:null, outDepthIn:null,
           wallDefault:{ framing:"2x6", finish:"drywall-1/2" },
           overrides:{ width:{a:null,b:null}, depth:{a:null,b:null} },
           siteWidthIn:null, siteDepthIn:null };
}
function createArea(store, jobId, name, mode){
  var j=getJob(store,jobId); if(!j) return null;
  var area={ id:_uid(), name:(name||"New area").trim(), mode:(mode||"floor"),
             dims:defaultDims(), truss:{ oc:24, offsetIn:18 },
             material:{ faceIn:5.0, lengthsAvailFt:[12,14,16] }, pinned:null };
  applyAreaV2(area);
  j.areas.push(area); j.updatedAt=_now(); return area;
}
function getArea(job, areaId){ return job ? (job.areas.find(function(a){ return a.id===areaId; })||null) : null; }
function deleteArea(store, jobId, areaId){
  var j=getJob(store,jobId); if(!j) return false;
  var i=j.areas.findIndex(function(a){ return a.id===areaId; });
  if(i<0) return false; j.areas.splice(i,1); j.updatedAt=_now(); return true;
}

// ---- the effective inside dimension: site measure wins over computed ----
// computedFn(area) -> {widthIn, depthIn} | null   (slice-1 inside-dims does this)
function effectiveDims(area, computedFn){
  var d=area.dims, comp = computedFn ? computedFn(area) : null;
  var width = (d.siteWidthIn!=null) ? d.siteWidthIn : (comp ? comp.widthIn : null);
  var depth = (d.siteDepthIn!=null) ? d.siteDepthIn : (comp ? comp.depthIn : null);
  return {
    widthIn: width, depthIn: depth,
    widthSource: (d.siteWidthIn!=null) ? "site" : "computed",
    depthSource: (d.siteDepthIn!=null) ? "site" : "computed"
  };
}

// ---- pin / unpin a chosen layout on an area ----
function pinLayout(store, jobId, areaId, layout){
  var j=getJob(store,jobId); var a=getArea(j,areaId); if(!a) return false;
  a.pinned = { scenarioFt:layout.scenarioFt, rowJoints:layout.rowJoints,
               label:layout.label, boards:layout.boards, pinnedAt:_now() };
  j.updatedAt=_now(); return true;
}
function unpinLayout(store, jobId, areaId){
  var j=getJob(store,jobId); var a=getArea(j,areaId); if(!a||!a.pinned) return false;
  a.pinned=null; j.updatedAt=_now(); return true;
}

// ---- job totals: sum pinned boards across areas, grouped by stock length ----
function jobBoardSummary(store, jobId){
  var j=getJob(store,jobId); if(!j) return null;
  var byLen={}, pinnedAreas=0, unpinned=0, excluded=0;
  j.areas.forEach(function(a){
    // An excluded area is deliberately out of the job — it can never be pinned,
    // so counting it as "unpinned" would report a gap the user cannot close.
    if(a.excluded){ excluded++; return; }
    if(a.pinned && a.pinned.boards!=null){
      var ft=a.pinned.scenarioFt;
      byLen[ft]=(byLen[ft]||0)+a.pinned.boards; pinnedAreas++;
    } else unpinned++;
  });
  return { byLen:byLen, pinnedAreas:pinnedAreas, unpinnedAreas:unpinned, excludedAreas:excluded,
           totalBoards:Object.keys(byLen).reduce(function(s,k){ return s+byLen[k]; },0) };
}

// ---- export / import ----
function exportAll(store){ return JSON.stringify(store, null, 2); }
function exportJob(store, jobId){
  var j=getJob(store,jobId); if(!j) return null;
  return JSON.stringify({ schemaVersion:store.schemaVersion, jobs:[j] }, null, 2);
}
// import merges jobs; a clashing id becomes a new copy (never silently overwrite).
function importJSON(store, text){
  var incoming; try { incoming=JSON.parse(text); } catch(e){ return { ok:false, error:"parse" }; }
  var mig=migrate(incoming);
  if(mig.__future) return { ok:false, error:"future" };
  if(!Array.isArray(mig.jobs)) return { ok:false, error:"shape" };
  var added=0;
  mig.jobs.forEach(function(j){
    if(store.jobs.some(function(e){ return e.id===j.id; })){ j.id=_uid(); j.name=j.name+" (imported)"; }
    store.jobs.push(j); added++;
  });
  return { ok:true, added:added };
}

if(typeof module!=="undefined") module.exports = {
  STORE_KEY, SCHEMA_VERSION, emptyStore, migrate, loadStore, saveStore,
  geometryDefaults, applyAreaV2,
  createJob, getJob, renameJob, deleteJob,
  createArea, getArea, deleteArea, defaultDims, effectiveDims,
  pinLayout, unpinLayout, jobBoardSummary,
  exportAll, exportJob, importJSON, _memStub,
  _setClock:function(u,n){ _uid=u||_uid; _now=n||_now; }
};
