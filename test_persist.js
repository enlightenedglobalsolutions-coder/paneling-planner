// ============================================================================
//  test_persist.js — the stagger.jobs.v1 -> stagger.store.v1 migration.
//
//  This is the harness that stands between a carpenter's real job list and a
//  schema change. Every case here exists because losing or silently corrupting
//  one of those jobs is the failure that matters.
//
//  Run:  node test_persist.js
// ============================================================================
const M = require('./migrate_jobs.js');
const S = require('./store.js');
let p=0,f=0; const ok=(n,c,x)=>{ c?(p++,console.log("  PASS "+n)):(f++,console.log("  FAIL "+n+" ["+x+"]")); };

// deterministic ids/clock so assertions are stable
let ac=0; M._setClock(()=>"ar"+(++ac), ()=>1700000000000);

// ---- a realistic legacy payload: 2 jobs, 3 areas, one excluded -------------
const LEGACY = {
  schema: 1,
  currentId: "job_b",
  jobs: {
    job_a: { id:"job_a", name:"Steeves Residence", created:1000, updated:5000,
             wastePct:12, boxCov:"23.5",
             areas:[
               { name:"Main ceiling", material:"Pine T&G", excluded:false,
                 rects:[{x:0,y:0,w:10,h:12}], edges:[[0,0],[10,0],[10,12],[0,12]],
                 inches:[120,144,120,144], mode:"imperial", runOverride:null,
                 sqft:120, engineInput:{ ok:true, kind:"rect", rect:{runIn:144,acrossIn:120} } },
               { name:"Garage", material:"__exclude", excluded:true,
                 rects:[], edges:[[0,0]], inches:[240], mode:"metric",
                 runOverride:"across", sqft:400, engineInput:{ ok:false } }
             ] },
    job_b: { id:"job_b", name:"Miller basement", created:2000, updated:9000,
             wastePct:10, boxCov:"",
             areas:[
               { name:"Rec room", material:"Laminate", excluded:false,
                 rects:[{x:0,y:0,w:20,h:15}], edges:[[0,0],[20,0],[20,15],[0,15]],
                 inches:[240,180,240,180], mode:"imperial", runOverride:null,
                 sqft:300, engineInput:{ ok:true, kind:"rect", rect:{runIn:240,acrossIn:180} } }
             ] }
  }
};
const RAW = JSON.stringify(LEGACY);

// ---- 1. preview: what the user is shown BEFORE anything is written ---------
let pv = M.previewLegacy(RAW);
ok("preview reads both jobs", pv.ok && pv.totalJobs===2, pv.totalJobs);
ok("preview counts every area", pv.totalAreas===3, pv.totalAreas);
ok("preview orders newest-updated first", pv.jobs[0].name==="Miller basement", pv.jobs[0].name);
ok("preview sq ft excludes excluded areas", pv.jobs[1].sqft===120, pv.jobs[1].sqft);
ok("preview reports area count per job", pv.jobs[1].areaCount===2, pv.jobs[1].areaCount);

// ---- 2. the translation carries every job and area ------------------------
let res = M.migrateLegacy(RAW, S.SCHEMA_VERSION);
ok("migration succeeds", res.ok && res.error===null, res.error);
ok("all jobs migrated", res.migrated.jobs===2, res.migrated.jobs);
ok("all areas migrated", res.migrated.areas===3, res.migrated.areas);
ok("store carries current schema version", res.store.schemaVersion===S.SCHEMA_VERSION, res.store.schemaVersion);
ok("jobs became an array", Array.isArray(res.store.jobs));

// ---- 3. job-level field mapping -------------------------------------------
let mj = res.store.jobs.find(j=>j.id==="job_a");
ok("job id preserved verbatim", !!mj && mj.id==="job_a");
ok("job name preserved", mj.name==="Steeves Residence");
ok("created -> createdAt", mj.createdAt===1000, mj.createdAt);
ok("updated -> updatedAt", mj.updatedAt===5000, mj.updatedAt);
ok("wastePct survives the crossing", mj.wastePct===12, mj.wastePct);
ok("boxCov survives the crossing", mj.boxCov==="23.5", mj.boxCov);
ok("currentId -> currentJobId", res.store.currentJobId==="job_b", res.store.currentJobId);

// ---- 4. the two same-name/different-meaning collisions ---------------------
let ceiling = mj.areas[0], garage = mj.areas[1];
ok("material STRING lands in materialType", ceiling.materialType==="Pine T&G", ceiling.materialType);
ok("store's own material stays the stock OBJECT",
   ceiling.material && ceiling.material.faceIn===5.0 && Array.isArray(ceiling.material.lengthsAvailFt));
ok("units mode lands in unitsMode", garage.unitsMode==="metric", garage.unitsMode);
ok("store's own mode is the WORK mode, not units", ceiling.mode==="floor", ceiling.mode);
ok("a bad units value falls back to imperial",
   M.migrateArea({ name:"x", mode:"nonsense" }).unitsMode==="imperial");

// ---- 5. geometry survives intact (this is the drawn room) -----------------
ok("edges preserved", JSON.stringify(ceiling.edges)===JSON.stringify([[0,0],[10,0],[10,12],[0,12]]));
ok("inches preserved", JSON.stringify(ceiling.inches)===JSON.stringify([120,144,120,144]));
ok("rects preserved", ceiling.rects.length===1 && ceiling.rects[0].w===10);
ok("sqft preserved", ceiling.sqft===120, ceiling.sqft);
ok("engineInput preserved whole", ceiling.engineInput.rect.runIn===144, JSON.stringify(ceiling.engineInput));
ok("runOverride preserved", garage.runOverride==="across", garage.runOverride);
ok("excluded flag preserved", garage.excluded===true && ceiling.excluded===false);

// ---- 6. areas gain the stable id that pinning depends on ------------------
ok("every area gets an id", res.store.jobs.every(j=>j.areas.every(a=>typeof a.id==="string" && a.id)));
let allIds = res.store.jobs.flatMap(j=>j.areas.map(a=>a.id));
ok("area ids are unique", new Set(allIds).size===allIds.length, allIds.join(","));
ok("every area starts unpinned", res.store.jobs.every(j=>j.areas.every(a=>a.pinned===null)));

// ---- 7. NON-DESTRUCTIVE: the source is never touched ----------------------
ok("raw legacy string is unchanged", RAW===JSON.stringify(LEGACY));
ok("legacy object not mutated", LEGACY.jobs.job_a.areas[0].material==="Pine T&G");
ok("legacy object gained no new fields", LEGACY.jobs.job_a.areas[0].materialType===undefined);
let before = JSON.stringify(LEGACY);
M.migrateLegacy(RAW, S.SCHEMA_VERSION);
ok("re-running leaves the source identical", JSON.stringify(LEGACY)===before);

// ---- 8. idempotency guard: never duplicate a job list --------------------
let dest = res.store;
ok("refuses to migrate into a populated store",
   M.shouldMigrate(RAW, dest).should===false && M.shouldMigrate(RAW, dest).reason==="destination-not-empty");
ok("agrees to migrate into an empty store", M.shouldMigrate(RAW, S.emptyStore()).should===true);
ok("no legacy data -> nothing to do", M.shouldMigrate(null, S.emptyStore()).should===false);

// ---- 9. adversarial input is reported, never half-written ----------------
ok("corrupt JSON reported", M.migrateLegacy("{not json").error==="corrupt");
ok("corrupt JSON yields no store", M.migrateLegacy("{not json").store===null);
ok("empty payload reported", M.migrateLegacy("").error==="empty");
ok("wrong shape reported", M.migrateLegacy(JSON.stringify({nope:1})).error==="shape");
ok("a job missing its areas array is skipped, not crashed on",
   M.previewLegacy(JSON.stringify({schema:1,jobs:{x:{id:"x",name:"broken"}}})).totalJobs===0);

// ---- 10. the migrated store is loadable by store.js itself ---------------
let mem = S._memStub();
S.saveStore(res.store, mem);
let back = S.loadStore(mem);
ok("migrated store round-trips through store.js", back.error===null && back.store.jobs.length===2, back.error);
ok("round-trip keeps geometry", back.store.jobs.find(j=>j.id==="job_a").areas[0].sqft===120);
ok("round-trip keeps currentJobId", back.store.currentJobId==="job_b", back.store.currentJobId);

// ---- 11. storage failure is reported, never silently lost ---------------
let quota={ getItem:()=>null, setItem:()=>{ let e=new Error("full"); e.name="QuotaExceededError"; throw e; } };
ok("quota failure on the migrated write is reported",
   S.saveStore(res.store, quota).error==="quota");

// ---- 12. the backup key is timestamped and distinct ---------------------
ok("backup key is derived from the legacy key",
   M.backupKeyFor(1700000000000)==="stagger.jobs.v1.backup.1700000000000", M.backupKeyFor(1700000000000));
ok("hasLegacy detects a present key", M.hasLegacy({getItem:k=>k===M.LEGACY_KEY?RAW:null})===true);
ok("hasLegacy is false on a clean device", M.hasLegacy({getItem:()=>null})===false);

console.log("\n"+p+" passed, "+f+" failed"); process.exit(f?1:0);
