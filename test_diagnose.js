// ============================================================================
//  test_diagnose.js — the read-only migration diagnostic.
//
//  This harness guards the tool you use to decide whether to delete a job list.
//  Two things must hold: the verdict must never say SAFE while anything is
//  unaccounted for, and the module must be incapable of writing.
//
//  Run:  node test_diagnose.js
// ============================================================================
const D = require('./diagnose.js');
let p=0,f=0; const ok=(n,c,x)=>{ c?(p++,console.log("  PASS "+n)):(f++,console.log("  FAIL "+n+" ["+x+"]")); };

// ---- fixtures --------------------------------------------------------------
const legacyObj = { schema:1, currentId:"job_b", jobs:{
  job_a:{ id:"job_a", name:"Steeves Residence", created:1000, updated:5000, wastePct:12, boxCov:"23.5",
          areas:[ { name:"Main ceiling", material:"Pine T&G", excluded:false, sqft:120 },
                  { name:"Garage", material:"__exclude", excluded:true, sqft:400 } ] },
  job_b:{ id:"job_b", name:"Miller basement", created:2000, updated:9000,
          areas:[ { name:"Rec room", material:"Laminate", excluded:false, sqft:300 } ] }
}};
const LEGACY = JSON.stringify(legacyObj);

const migratedStore = JSON.stringify({ schemaVersion:2, currentJobId:"job_b", jobs:[
  { id:"job_a", name:"Steeves Residence", createdAt:1000, updatedAt:5000, areas:[
      { id:"ar-1", name:"Main ceiling", sqft:120, excluded:false, pinned:null },
      { id:"ar-2", name:"Garage", sqft:400, excluded:true, pinned:null } ] },
  { id:"job_b", name:"Miller basement", createdAt:2000, updatedAt:9000, areas:[
      { id:"ar-3", name:"Rec room", sqft:300, excluded:false, pinned:null } ] }
]});

// the reported device state: a phantom job blocking the gate, real jobs stranded
const blockedStore = JSON.stringify({ schemaVersion:2, currentJobId:"id-ms0gzhs9-vimyym", jobs:[
  { id:"id-ms0gzhs9-vimyym", name:"Untitled job", createdAt:1784990045385, updatedAt:1784990045385, areas:[] }
]});

// ---- 1. job-origin fingerprint (the question "what made this job?") --------
ok("an id- job is named as created in-app",
   D.jobOrigin("id-ms0gzhs9-vimyym").origin==="created-in-app", D.jobOrigin("id-x").origin);
ok("a job_ id is named as carried across", D.jobOrigin("job_a").origin==="migrated");
ok("a job-ar- id is named as migration-generated",
   D.jobOrigin("job-ar-abc").origin==="migrated-generated-id", D.jobOrigin("job-ar-abc").origin);
ok("an unrecognised id is not guessed at", D.jobOrigin("wat").origin==="unknown");
ok("a missing id is not guessed at", D.jobOrigin(undefined).origin==="unknown");
ok("the in-app origin explains itself in words",
   /New job/.test(D.jobOrigin("id-x").detail), D.jobOrigin("id-x").detail);

// ---- 2. the reported symptom: migration blocked by a phantom job -----------
let blocked = D.diagnose({ legacyRaw:LEGACY, storeRaw:blockedStore, backups:{} });
ok("blocked state is identified", blocked.migrationState==="blocked-destination-not-empty", blocked.migrationState);
ok("blocked state says the migration NEVER RAN", /NEVER RAN/.test(blocked.migrationNote));
ok("blocked verdict is DO_NOT_REMOVE", blocked.verdict==="DO_NOT_REMOVE", blocked.verdict);
ok("both stranded jobs are named as missing",
   blocked.reconciliation.filter(r=>r.status==="missing").length===2,
   JSON.stringify(blocked.reconciliation.map(r=>r.status)));
ok("the phantom job is attributed to the + New job button",
   blocked.jobOrigins.createdInApp.length===1 &&
   blocked.jobOrigins.createdInApp[0].name==="Untitled job",
   JSON.stringify(blocked.jobOrigins.createdInApp));
ok("nothing in the blocked store came from the migration", blocked.jobOrigins.migrated.length===0);
ok("counts show the mismatch plainly",
   blocked.counts.legacyJobs===2 && blocked.counts.storeJobs===1, JSON.stringify(blocked.counts));
ok("the reasons name each stranded job by name",
   blocked.reasons.some(r=>/Steeves Residence/.test(r)) &&
   blocked.reasons.some(r=>/Miller basement/.test(r)), JSON.stringify(blocked.reasons));

// ---- 3. the clean case -----------------------------------------------------
let good = D.diagnose({ legacyRaw:LEGACY, storeRaw:migratedStore, backups:{} });
ok("a clean migration is identified", good.migrationState==="migrated", good.migrationState);
ok("a clean migration is SAFE_TO_REMOVE", good.verdict==="SAFE_TO_REMOVE", JSON.stringify(good.reasons));
ok("a clean migration lists no reasons", good.reasons.length===0, JSON.stringify(good.reasons));
ok("every job reconciles as matched",
   good.reconciliation.every(r=>r.status==="matched"), JSON.stringify(good.reconciliation.map(r=>r.status)));
ok("both jobs are attributed to the migration", good.jobOrigins.migrated.length===2);
ok("no job is attributed to the button", good.jobOrigins.createdInApp.length===0);
ok("area counts are carried in the report",
   good.counts.legacyAreas===3 && good.counts.storeAreas===3, JSON.stringify(good.counts));

// ---- 4. a job that did not come across -------------------------------------
let partialStore = JSON.stringify({ schemaVersion:2, jobs:[ JSON.parse(migratedStore).jobs[0] ] });
let partial = D.diagnose({ legacyRaw:LEGACY, storeRaw:partialStore, backups:{} });
ok("a partly-migrated store is identified", partial.migrationState==="partial", partial.migrationState);
ok("a partly-migrated store is DO_NOT_REMOVE", partial.verdict==="DO_NOT_REMOVE");
ok("the absent job is named", partial.reasons.some(r=>/Miller basement/.test(r)), JSON.stringify(partial.reasons));

// ---- 5. an area that did not come across -----------------------------------
let lostArea = JSON.parse(migratedStore); lostArea.jobs[0].areas.pop();
let la = D.diagnose({ legacyRaw:LEGACY, storeRaw:JSON.stringify(lostArea), backups:{} });
ok("a lost area blocks the SAFE verdict", la.verdict==="DO_NOT_REMOVE", la.verdict);
ok("the lost area is named", JSON.stringify(la.reconciliation).indexOf("Garage")>=0);
ok("the job is marked changed rather than matched",
   la.reconciliation.find(r=>r.id==="job_a").status==="changed");

// ---- 6. the SILENT drop — a malformed record the migration skips ----------
let malformed = JSON.parse(LEGACY); malformed.jobs.job_c = { id:"job_c", name:"Shop ceiling" }; // no areas
let md = D.diagnose({ legacyRaw:JSON.stringify(malformed), storeRaw:migratedStore, backups:{} });
ok("a malformed record is counted in the raw total", md.counts.legacyJobs===3, md.counts.legacyJobs);
ok("a malformed record is NAMED, not silently skipped",
   md.legacy.droppedRecords.length===1 && md.legacy.droppedRecords[0].name==="Shop ceiling",
   JSON.stringify(md.legacy.droppedRecords));
ok("a malformed record blocks the SAFE verdict", md.verdict==="DO_NOT_REMOVE", md.verdict);
ok("the drop is explained in words", /not an array/.test(md.legacy.droppedRecords[0].why));

// ---- 7. unreadable payloads ------------------------------------------------
let cl = D.diagnose({ legacyRaw:"{not json", storeRaw:migratedStore, backups:{} });
ok("corrupt legacy is reported", cl.legacy.error==="corrupt" && cl.legacy.ok===false);
ok("corrupt legacy is DO_NOT_REMOVE", cl.verdict==="DO_NOT_REMOVE");
let cs = D.diagnose({ legacyRaw:LEGACY, storeRaw:"{not json", backups:{} });
ok("corrupt store is reported", cs.store.error==="corrupt");
ok("corrupt store is DO_NOT_REMOVE", cs.verdict==="DO_NOT_REMOVE");
let shape = D.diagnose({ legacyRaw:JSON.stringify({nope:1}), storeRaw:migratedStore, backups:{} });
ok("a wrong-shaped legacy payload is reported", shape.legacy.error==="shape");

// ---- 8. a store newer than this app ----------------------------------------
let fut = D.diagnose({ legacyRaw:LEGACY, storeRaw:JSON.stringify({schemaVersion:99, jobs:[]}), backups:{} });
ok("a future schema version is refused a SAFE verdict", fut.verdict==="DO_NOT_REMOVE");

// ---- 9. nothing to do ------------------------------------------------------
let none = D.diagnose({ legacyRaw:null, storeRaw:migratedStore, backups:{} });
ok("no legacy data is its own state", none.migrationState==="no-legacy", none.migrationState);
ok("no legacy data is SAFE (nothing to remove)", none.verdict==="SAFE_TO_REMOVE", JSON.stringify(none.reasons));
let fresh = D.diagnose({ legacyRaw:LEGACY, storeRaw:null, backups:{} });
ok("legacy present + empty store = not yet migrated", fresh.migrationState==="not-migrated", fresh.migrationState);
ok("not-yet-migrated is DO_NOT_REMOVE", fresh.verdict==="DO_NOT_REMOVE");

// ---- 10. backups -----------------------------------------------------------
let withBak = D.diagnose({ legacyRaw:LEGACY, storeRaw:migratedStore,
  backups:{ "stagger.jobs.v1.backup.1700000000000":LEGACY,
            "stagger.jobs.v1.backup.1600000000000":JSON.stringify({schema:1,jobs:{}}) } });
ok("backups are listed", withBak.backups.length===2, withBak.backups.length);
ok("a byte-identical backup is recognised",
   withBak.backups.find(b=>/1700000000000/.test(b.key)).matchesCurrentLegacy===true);
ok("a differing backup is flagged as not matching",
   withBak.backups.find(b=>/1600000000000/.test(b.key)).matchesCurrentLegacy===false);
ok("backup job counts are reported",
   withBak.backups.find(b=>/1700000000000/.test(b.key)).jobCount===2);

// ---- 11. READ-ONLY, structurally -------------------------------------------
// diagnose() takes strings; hand it a storage object as a trap and assert the
// module never calls a single method on it.
let touched = [];
const trap = new Proxy({}, { get(t,k){ touched.push(String(k)); return function(){ touched.push("CALL:"+String(k)); }; } });
D.diagnose({ legacyRaw:LEGACY, storeRaw:migratedStore, backups:{}, storage:trap, localStorage:trap });
ok("the module never touches a storage object handed to it", touched.length===0, touched.join(","));

// arguments must come back unmutated
let src = JSON.parse(LEGACY);
let before = JSON.stringify(src);
D.diagnose({ legacyRaw:JSON.stringify(src), storeRaw:migratedStore, backups:{} });
ok("the caller's data is not mutated", JSON.stringify(src)===before);

// and no global storage API exists in this module's world
ok("module has no localStorage in scope", typeof localStorage==="undefined");

console.log("\n"+p+" passed, "+f+" failed"); process.exit(f?1:0);
