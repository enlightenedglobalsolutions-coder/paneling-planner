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
//   - deletes are explicit calls (UI adds confirm()); nothing deletes on its own.
// ============================================================================

var STORE_KEY = "stagger.store.v1";
var SCHEMA_VERSION = 1;

// ---- id + clock (injectable for tests) ----
function _uid(){
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8);
}
function _now(){ return Date.now(); }

// ---- the empty store ----
function emptyStore(){
  return { schemaVersion: SCHEMA_VERSION, jobs: [] };
}

// ---- migrations: index i upgrades vFrom i -> i+1. Append only; never rewrite.
//      Each must be pure and non-destructive (add fields, don't drop data). ----
var MIGRATIONS = [
  // example shape for the future:
  // function v1_to_v2(s){ s.jobs.forEach(j=>{ if(j.tag===undefined) j.tag=null; }); return s; }
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
  var job = { id:_uid(), name:(name||"Untitled job").trim(), createdAt:_now(), updatedAt:_now(), areas:[] };
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
  var byLen={}, pinnedAreas=0, unpinned=0;
  j.areas.forEach(function(a){
    if(a.pinned && a.pinned.boards!=null){
      var ft=a.pinned.scenarioFt;
      byLen[ft]=(byLen[ft]||0)+a.pinned.boards; pinnedAreas++;
    } else unpinned++;
  });
  return { byLen:byLen, pinnedAreas:pinnedAreas, unpinnedAreas:unpinned,
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
  createJob, getJob, renameJob, deleteJob,
  createArea, getArea, deleteArea, defaultDims, effectiveDims,
  pinLayout, unpinLayout, jobBoardSummary,
  exportAll, exportJob, importJSON, _memStub,
  _setClock:function(u,n){ _uid=u||_uid; _now=n||_now; }
};
