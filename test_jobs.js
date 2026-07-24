// ============================================================================
//  test_jobs.js — the jobs/areas layer as the app actually drives it:
//  create -> add areas -> pin a stock length per area -> whole-job shopping
//  list. Covers the seam between spread.js (which says lengthFt) and store.js
//  (which says scenarioFt) — the mapping the UI performs at the call site.
//
//  Run:  node test_jobs.js
// ============================================================================
const S = require('./store.js');
const SP = require('./spread.js');
let p=0,f=0; const ok=(n,c,x)=>{ c?(p++,console.log("  PASS "+n)):(f++,console.log("  FAIL "+n+" ["+x+"]")); };

let idc=0; S._setClock(()=>"id"+(++idc), ()=>1700000000000);

// the mapping index.html performs when a pin button is tapped
const pinFromRow = (store, jobId, areaId, r) => S.pinLayout(store, jobId, areaId, {
  scenarioFt: r.lengthFt, boards: r.boards,
  rowJoints: r.rowJoints, label: r.label || (r.lengthFt + "' stock")
});

// ---- job lifecycle --------------------------------------------------------
let st = S.emptyStore();
ok("a fresh store has no jobs", st.jobs.length===0);
ok("a fresh store has a currentJobId slot", st.currentJobId===null);
ok("a fresh store carries the schema version", st.schemaVersion===S.SCHEMA_VERSION);

let jobA = S.createJob(st, "Steeves Residence");
ok("createJob adds a job", st.jobs.length===1 && jobA.name==="Steeves Residence");
ok("new job gets waste/box defaults", jobA.wastePct===10 && jobA.boxCov==="");
ok("new job starts with no areas", Array.isArray(jobA.areas) && jobA.areas.length===0);

let jobB = S.createJob(st, "Miller basement");
ok("a second job coexists", st.jobs.length===2);
ok("getJob finds by id", S.getJob(st, jobB.id).name==="Miller basement");
ok("getJob on an unknown id returns null", S.getJob(st, "nope")===null);
ok("renameJob renames", S.renameJob(st, jobB.id, "Miller reno") && S.getJob(st,jobB.id).name==="Miller reno");
ok("renameJob on an unknown id is false", S.renameJob(st,"nope","x")===false);

// ---- area lifecycle -------------------------------------------------------
let ceiling = S.createArea(st, jobA.id, "Main ceiling", "panel");
let hall    = S.createArea(st, jobA.id, "Hallway", "panel");
let bath    = S.createArea(st, jobA.id, "Bathroom", "floor");
ok("areas attach to their job", S.getJob(st,jobA.id).areas.length===3);
ok("each area gets a stable id", [ceiling,hall,bath].every(a=>typeof a.id==="string" && a.id));
ok("area ids are distinct", new Set([ceiling.id,hall.id,bath.id]).size===3);
ok("new areas carry the v2 geometry fields", ceiling.materialType===null && ceiling.excluded===false
   && ceiling.unitsMode==="imperial" && ceiling.sqft===null);
ok("new areas start unpinned", [ceiling,hall,bath].every(a=>a.pinned===null));
ok("createArea on an unknown job returns null", S.createArea(st,"nope","x")===null);
ok("getArea finds within a job", S.getArea(S.getJob(st,jobA.id), hall.id).name==="Hallway");

// ---- pinning --------------------------------------------------------------
ok("pin a 16' layout", pinFromRow(st, jobA.id, ceiling.id,
   { lengthFt:16, boards:34, seams:5, rowJoints:[[1,5]], label:"stagger · B" })===true);
let pinned = S.getArea(S.getJob(st,jobA.id), ceiling.id).pinned;
ok("pin records the stock length as scenarioFt", pinned.scenarioFt===16, pinned.scenarioFt);
ok("pin records the board count", pinned.boards===34, pinned.boards);
ok("pin keeps the row joints", JSON.stringify(pinned.rowJoints)===JSON.stringify([[1,5]]));
ok("pin keeps the engine label", pinned.label==="stagger · B", pinned.label);
ok("pin is timestamped", typeof pinned.pinnedAt==="number");
ok("a label-less row still gets a readable label",
   (pinFromRow(st, jobA.id, bath.id, { lengthFt:12, boards:9, rowJoints:null, label:null }),
    S.getArea(S.getJob(st,jobA.id), bath.id).pinned.label==="12' stock"));
ok("pinning an unknown area is false", pinFromRow(st, jobA.id, "nope", {lengthFt:12,boards:1})===false);

// ---- re-pinning replaces, never accumulates -------------------------------
pinFromRow(st, jobA.id, ceiling.id, { lengthFt:12, boards:44, rowJoints:[[2]], label:"stagger · A" });
ok("re-pinning replaces the previous choice",
   S.getArea(S.getJob(st,jobA.id), ceiling.id).pinned.scenarioFt===12);
pinFromRow(st, jobA.id, ceiling.id, { lengthFt:16, boards:34, rowJoints:[[1,5]], label:"stagger · B" });

// ---- whole-job summary ----------------------------------------------------
pinFromRow(st, jobA.id, hall.id, { lengthFt:16, boards:8, rowJoints:[[2,6]], label:"stagger · A" });
let sum = S.jobBoardSummary(st, jobA.id);
ok("summary groups by stock length", sum.byLen[16]===42, JSON.stringify(sum.byLen));
ok("summary keeps lengths separate", sum.byLen[12]===9, JSON.stringify(sum.byLen));
ok("summary totals every pinned board", sum.totalBoards===51, sum.totalBoards);
ok("summary counts pinned areas", sum.pinnedAreas===3, sum.pinnedAreas);
ok("summary reports nothing unpinned yet", sum.unpinnedAreas===0, sum.unpinnedAreas);

// ---- the shopping list string the Job screen shows -------------------------
ok("shopping list reads as a carpenter would write it",
   SP.shoppingList(sum.byLen)==="9× 12'  +  42× 16'", SP.shoppingList(sum.byLen));
ok("shopping list is ordered shortest stock first",
   SP.shoppingList({16:42,12:9}).indexOf("12'") < SP.shoppingList({16:42,12:9}).indexOf("16'"));
ok("shopping list is empty when nothing is pinned", SP.shoppingList({})==="");

// ---- unpinned areas are reported honestly, not quietly dropped ------------
let solo = S.createArea(st, jobA.id, "Porch", "floor");
let sum2 = S.jobBoardSummary(st, jobA.id);
ok("an unpinned area is counted as unpinned", sum2.unpinnedAreas===1, sum2.unpinnedAreas);
ok("an unpinned area adds no boards", sum2.totalBoards===51, sum2.totalBoards);

// ---- an EXCLUDED area is out of the job, not an unfinished one ------------
// (the board table skips excluded areas, so they can never be pinned; counting
//  them as "unpinned" would report a gap the user has no way to close)
let shed = S.createArea(st, jobA.id, "Shed", "floor");
shed.excluded = true;
let sum3 = S.jobBoardSummary(st, jobA.id);
ok("an excluded area is not counted as unpinned", sum3.unpinnedAreas===1, sum3.unpinnedAreas);
ok("an excluded area is reported separately", sum3.excludedAreas===1, sum3.excludedAreas);
ok("an excluded area adds no boards", sum3.totalBoards===51, sum3.totalBoards);
S.deleteArea(st, jobA.id, shed.id);

// ---- unpin ----------------------------------------------------------------
ok("unpin clears the choice", S.unpinLayout(st, jobA.id, hall.id)===true
   && S.getArea(S.getJob(st,jobA.id), hall.id).pinned===null);
ok("unpin removes those boards from the total", S.jobBoardSummary(st,jobA.id).byLen[16]===34);
ok("unpinning an already-unpinned area is false", S.unpinLayout(st, jobA.id, hall.id)===false);

// ---- deleting an area must not re-point another area's pin ---------------
// (this is why areas needed stable ids rather than array indices)
let ceilingId = ceiling.id, ceilingPin = S.getArea(S.getJob(st,jobA.id), ceilingId).pinned.scenarioFt;
ok("delete the FIRST area", S.deleteArea(st, jobA.id, hall.id)===true);
ok("the surviving area keeps its own pin",
   S.getArea(S.getJob(st,jobA.id), ceilingId).pinned.scenarioFt===ceilingPin);
ok("summary stays correct after the delete", S.jobBoardSummary(st,jobA.id).totalBoards===43,
   S.jobBoardSummary(st,jobA.id).totalBoards);

// ---- pins are per-job, never bleed across jobs ---------------------------
let bArea = S.createArea(st, jobB.id, "Rec room", "floor");
pinFromRow(st, jobB.id, bArea.id, { lengthFt:14, boards:20, rowJoints:null, label:null });
ok("job B has its own summary", S.jobBoardSummary(st,jobB.id).totalBoards===20);
ok("job A is unaffected by job B's pin", S.jobBoardSummary(st,jobA.id).totalBoards===43);
ok("summary for an unknown job is null", S.jobBoardSummary(st,"nope")===null);

// ---- pins survive a save/load round-trip --------------------------------
let mem = S._memStub();
S.saveStore(st, mem);
let back = S.loadStore(mem).store;
ok("pins persist across a reload",
   S.getArea(S.getJob(back,jobA.id), ceilingId).pinned.scenarioFt===16);
ok("the summary is identical after a reload",
   S.jobBoardSummary(back,jobA.id).totalBoards===43);

// ---- deleting a job takes its areas with it -----------------------------
ok("deleteJob removes the job", S.deleteJob(st, jobB.id)===true && S.getJob(st,jobB.id)===null);
ok("deleteJob on an unknown id is false", S.deleteJob(st,"nope")===false);
ok("the other job survives", S.getJob(st,jobA.id)!==null);

console.log("\n"+p+" passed, "+f+" failed"); process.exit(f?1:0);
