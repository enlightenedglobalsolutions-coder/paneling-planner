// ============================================================================
//  Stagger — diagnose.js
//  READ-ONLY migration diagnostic. Answers one question with evidence:
//  "is it safe to remove the old copy of my jobs?"
//
//  Read-only BY CONSTRUCTION: every function here takes raw STRINGS and returns
//  a plain object. This module cannot reach localStorage even if it wanted to.
//  That matters — store.js's loadStore() WRITES a `.corrupt.<ts>` key when a
//  payload won't parse, so anything built on loadStore is not read-only. The
//  caller must read raw values with getItem and hand them here.
//
//  Nothing in this file mutates its arguments.
// ============================================================================

var LEGACY_KEY = "stagger.jobs.v1";
var STORE_KEY  = "stagger.store.v1";

// ---- how each writer stamps a job id (verified against the shipped app) ----
//   "id-…"      StaggerStore.createJob  -> only reachable via the "+ New job"
//                                          button; createdAt is the tap time
//   "job_…"     carried across from stagger.jobs.v1 by the migration; createdAt
//                                          is the ORIGINAL old timestamp
//   "job-ar-…"  migration-generated, because the legacy record had no usable id
// A job named "Untitled job" with 0 areas can come from EITHER the button or a
// nameless legacy record, so the label alone proves nothing — the id does.
function jobOrigin(id){
  if(typeof id !== "string" || !id) return { origin:"unknown", detail:"no id on this record" };
  if(id.indexOf("job-ar-") === 0)
    return { origin:"migrated-generated-id",
             detail:"came across from the old storage; the old record had no id, so one was generated" };
  if(id.indexOf("job_") === 0)
    return { origin:"migrated",
             detail:"came across from the old storage, keeping its original id" };
  if(id.indexOf("id-") === 0)
    return { origin:"created-in-app",
             detail:"created in the app with “+ New job” — this is the only code path that makes this id shape" };
  return { origin:"unknown", detail:"id shape does not match any known writer" };
}

function _parse(raw){
  if(raw == null || raw === "") return { present:false, ok:false, error:"absent", data:null };
  var d;
  try { d = JSON.parse(raw); }
  catch(e){ return { present:true, ok:false, error:"corrupt", data:null, bytes:raw.length }; }
  return { present:true, ok:true, error:null, data:d, bytes:raw.length };
}

function _sqft(areas){
  return (areas || []).reduce(function(s,a){ return s + ((a && a.excluded) ? 0 : ((a && a.sqft) || 0)); }, 0);
}

// ---- the OLD key, counted honestly ----------------------------------------
// Counts every record present, then separately names the ones the migration
// would silently discard (readLegacy drops any job whose `areas` isn't an
// array). A record the migration ignores must not be invisible here too.
function readLegacySide(raw){
  var p = _parse(raw);
  var out = { present:p.present, ok:p.ok, error:p.error, bytes:p.bytes || 0,
              rawJobCount:0, jobs:[], droppedRecords:[], areaCount:0, currentId:null };
  if(!p.ok) return out;
  var st = p.data;
  if(!st || typeof st !== "object" || !st.jobs || typeof st.jobs !== "object"){
    out.ok = false; out.error = "shape"; return out;
  }
  out.currentId = st.currentId || null;
  var keys = Object.keys(st.jobs);
  out.rawJobCount = keys.length;
  keys.forEach(function(k){
    var j = st.jobs[k];
    if(!j || typeof j !== "object" || !Array.isArray(j.areas)){
      out.droppedRecords.push({ key:k, id:(j && j.id) || null, name:(j && j.name) || "(no name)",
                                why:"its areas list is missing or not an array, so the migration skips it" });
      return;
    }
    out.jobs.push({ id:j.id || null, name:j.name || "Untitled job", areaCount:j.areas.length,
                    sqft:_sqft(j.areas), updated:j.updated || j.created || null,
                    areas:j.areas.map(function(a,i){
                      return { idx:i, name:(a && a.name) || "(unnamed)",
                               sqft:(a && a.sqft) || 0, excluded:!!(a && a.excluded) };
                    }) });
    out.areaCount += j.areas.length;
  });
  return out;
}

// ---- the NEW store ---------------------------------------------------------
function readStoreSide(raw){
  var p = _parse(raw);
  var out = { present:p.present, ok:p.ok, error:p.error, bytes:p.bytes || 0,
              schemaVersion:null, future:false, jobs:[], areaCount:0, currentJobId:null };
  if(!p.ok) return out;
  var st = p.data;
  if(!st || typeof st !== "object" || !Array.isArray(st.jobs)){
    out.ok = false; out.error = "shape"; return out;
  }
  out.schemaVersion = (typeof st.schemaVersion === "number") ? st.schemaVersion : null;
  out.currentJobId = st.currentJobId || null;
  st.jobs.forEach(function(j){
    if(!j || typeof j !== "object") return;
    var areas = Array.isArray(j.areas) ? j.areas : [];
    var org = jobOrigin(j.id);
    out.jobs.push({ id:j.id || null, name:j.name || "Untitled job", areaCount:areas.length,
                    sqft:_sqft(areas), createdAt:j.createdAt || null, updatedAt:j.updatedAt || null,
                    origin:org.origin, originDetail:org.detail,
                    areas:areas.map(function(a,i){
                      return { idx:i, name:(a && a.name) || "(unnamed)",
                               sqft:(a && a.sqft) || 0, excluded:!!(a && a.excluded),
                               pinned:!!(a && a.pinned) };
                    }) });
    out.areaCount += areas.length;
  });
  return out;
}

// ---- backups ---------------------------------------------------------------
function readBackups(backups, legacyRaw){
  var out = [];
  Object.keys(backups || {}).forEach(function(k){
    var raw = backups[k], p = _parse(raw);
    var jobCount = 0;
    if(p.ok && p.data && p.data.jobs && typeof p.data.jobs === "object")
      jobCount = Object.keys(p.data.jobs).length;
    out.push({ key:k, bytes:(raw || "").length, parses:p.ok, jobCount:jobCount,
               matchesCurrentLegacy: (legacyRaw != null && raw === legacyRaw) });
  });
  return out.sort(function(a,b){ return a.key < b.key ? -1 : 1; });
}

// ---- reconcile old against new --------------------------------------------
// Areas have no id in the old model, so they are matched by name; a name that
// appears more than once is reported as ambiguous rather than guessed at.
function reconcile(legacy, store){
  var byId = {};
  store.jobs.forEach(function(j){ if(j.id) byId[j.id] = j; });
  return legacy.jobs.map(function(lj){
    var sj = lj.id ? byId[lj.id] : null;
    if(!sj) return { id:lj.id, name:lj.name, status:"missing",
                     note:"no job with this id exists in the new storage",
                     legacyAreas:lj.areaCount, storeAreas:0, areaIssues:[] };
    var issues = [];
    var seen = {};
    lj.areas.forEach(function(la){
      var matches = sj.areas.filter(function(sa){ return sa.name === la.name; });
      if(matches.length === 0){
        issues.push({ area:la.name, problem:"missing", note:"not found in the new storage" });
      } else if(matches.length > 1 || (seen[la.name] && seen[la.name] >= matches.length)){
        issues.push({ area:la.name, problem:"ambiguous",
                      note:"more than one area shares this name, so it cannot be matched with certainty" });
      } else {
        var sa = matches[seen[la.name] || 0];
        if(Math.abs((sa.sqft || 0) - (la.sqft || 0)) > 0.01)
          issues.push({ area:la.name, problem:"sqft-differs",
                        note:"old " + la.sqft + " sq ft vs new " + sa.sqft + " sq ft (an edit after migrating also looks like this)" });
        if(sa.excluded !== la.excluded)
          issues.push({ area:la.name, problem:"excluded-differs", note:"the Exclude setting does not match" });
      }
      seen[la.name] = (seen[la.name] || 0) + 1;
    });
    var status = issues.some(function(i){ return i.problem === "missing" || i.problem === "ambiguous"; })
      ? "changed" : (issues.length ? "changed" : "matched");
    if(sj.areaCount < lj.areaCount)
      issues.push({ area:null, problem:"fewer-areas",
                    note:"the new job has " + sj.areaCount + " areas, the old one had " + lj.areaCount });
    return { id:lj.id, name:lj.name, status:(issues.length ? "changed" : "matched"),
             note:(issues.length ? "carried across, but not everything lines up" : "fully accounted for"),
             legacyAreas:lj.areaCount, storeAreas:sj.areaCount, areaIssues:issues };
  });
}

// ---- the whole report ------------------------------------------------------
function diagnose(input){
  input = input || {};
  var legacy  = readLegacySide(input.legacyRaw);
  var store   = readStoreSide(input.storeRaw);
  var backups = readBackups(input.backups, input.legacyRaw);
  var rec     = (legacy.ok && store.ok) ? reconcile(legacy, store) : [];

  var migratedJobs = store.jobs.filter(function(j){
    return j.origin === "migrated" || j.origin === "migrated-generated-id"; });
  var appMadeJobs = store.jobs.filter(function(j){ return j.origin === "created-in-app"; });

  // ---- what state is this device actually in? ----
  var state, stateNote;
  if(!legacy.present){
    state = "no-legacy";
    stateNote = "There is no old storage on this device. Nothing to bring across, nothing to remove.";
  } else if(!store.present || !store.ok || !store.jobs.length){
    state = "not-migrated";
    stateNote = "The old storage is still here and the new storage is empty. The migration has not run yet.";
  } else if(!migratedJobs.length){
    // the destination was already occupied, so the migration gate never opened
    state = "blocked-destination-not-empty";
    stateNote = "The migration NEVER RAN. The new storage already contained a job, and the migration "
              + "refuses to run into a non-empty store, so the old jobs were never brought across. "
              + "They are still in the old storage, untouched — do not remove the old copy.";
  } else if(rec.some(function(r){ return r.status === "missing"; })){
    state = "partial";
    stateNote = "Some jobs came across and some did not.";
  } else {
    state = "migrated";
    stateNote = "Every job in the old storage has a counterpart in the new storage.";
  }

  // ---- verdict: DO NOT REMOVE unless everything is accounted for ----
  var reasons = [];
  if(legacy.present && !legacy.ok)
    reasons.push("The old storage could not be read (" + legacy.error + "), so it cannot be reconciled.");
  if(legacy.present && legacy.droppedRecords.length)
    reasons.push(legacy.droppedRecords.length + " record(s) in the old storage are malformed and are skipped "
               + "by the migration entirely — they would be lost with no trace.");
  if(store.present && !store.ok)
    reasons.push("The new storage could not be read (" + store.error + ").");
  if(store.ok && store.schemaVersion != null && store.schemaVersion > 2)
    reasons.push("The new storage is schema v" + store.schemaVersion + ", newer than this app understands.");
  if(state === "blocked-destination-not-empty")
    reasons.push("The migration never ran, so the old jobs exist ONLY in the old copy.");
  if(state === "not-migrated")
    reasons.push("The migration has not run; the old copy is the only copy.");
  if(state === "partial")
    reasons.push("The migration ran but did not bring everything across.");
  rec.forEach(function(r){
    if(r.status === "missing")
      reasons.push("Job “" + r.name + "” is in the old storage but not in the new one.");
    else if(r.areaIssues.length)
      reasons.push("Job “" + r.name + "” has " + r.areaIssues.length + " area(s) that do not line up.");
  });

  var safe = (state === "migrated" || state === "no-legacy") && reasons.length === 0;

  return {
    generatedFrom: { legacyKey:LEGACY_KEY, storeKey:STORE_KEY },
    legacy: legacy, store: store, backups: backups,
    reconciliation: rec,
    migrationState: state, migrationNote: stateNote,
    jobOrigins: {
      migrated: migratedJobs.map(function(j){ return { name:j.name, id:j.id, detail:j.originDetail }; }),
      createdInApp: appMadeJobs.map(function(j){ return { name:j.name, id:j.id, createdAt:j.createdAt,
                                                          areaCount:j.areaCount, detail:j.originDetail }; }),
      unknown: store.jobs.filter(function(j){ return j.origin === "unknown"; })
                         .map(function(j){ return { name:j.name, id:j.id }; })
    },
    counts: { legacyJobs:legacy.rawJobCount, legacyAreas:legacy.areaCount,
              storeJobs:store.jobs.length, storeAreas:store.areaCount,
              droppedRecords:legacy.droppedRecords.length },
    verdict: safe ? "SAFE_TO_REMOVE" : "DO_NOT_REMOVE",
    reasons: reasons
  };
}

if(typeof module!=="undefined") module.exports = {
  LEGACY_KEY, STORE_KEY, jobOrigin, readLegacySide, readStoreSide, readBackups, reconcile, diagnose
};
