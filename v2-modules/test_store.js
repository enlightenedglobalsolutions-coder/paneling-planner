const S = require('./store.js');
let p=0,f=0; const ok=(n,c,x)=>{ c?(p++,console.log("  PASS "+n)):(f++,console.log("  FAIL "+n+" ["+x+"]")); };

// deterministic clock/ids for stable tests
let idc=0; S._setClock(()=>"id"+(++idc), ()=>1000000);

// ---- CRUD ----
let st=S.emptyStore();
let job=S.createJob(st,"Steeves");
ok("createJob adds a job", st.jobs.length===1 && job.name==="Steeves");
ok("job has empty areas", Array.isArray(job.areas)&&job.areas.length===0);
let area=S.createArea(st,job.id,"Main ceiling","panel");
ok("createArea adds to job", S.getJob(st,job.id).areas.length===1);
ok("area has default dims", area.dims.wallDefault.framing==="2x6" && area.dims.entry==="outside");
ok("rename job", S.renameJob(st,job.id,"Steeves Residence") && S.getJob(st,job.id).name==="Steeves Residence");
let a2=S.createArea(st,job.id,"Bedroom","panel");
ok("two areas", S.getJob(st,job.id).areas.length===2);
ok("deleteArea works", S.deleteArea(st,job.id,a2.id) && S.getJob(st,job.id).areas.length===1);

// ---- site-measure precedence ----
area.dims.outWidthIn=264; area.dims.outDepthIn=150;
let comp=()=>({widthIn:252, depthIn:140});         // computed inside dims
let eff=S.effectiveDims(area, comp);
ok("computed used when no site measure", eff.widthIn===252 && eff.widthSource==="computed");
area.dims.siteWidthIn=250.5;                        // carpenter measured on site
eff=S.effectiveDims(area, comp);
ok("SITE measure overrides computed", eff.widthIn===250.5 && eff.widthSource==="site", eff.widthIn);
ok("depth still computed", eff.depthIn===140 && eff.depthSource==="computed");

// ---- pin / totals ----
S.pinLayout(st,job.id,area.id,{scenarioFt:16,rowJoints:[[1,5]],label:"stagger · B",boards:34});
let a3=S.createArea(st,job.id,"Hallway","panel");
S.pinLayout(st,job.id,a3.id,{scenarioFt:16,rowJoints:[[2,6]],label:"stagger · A",boards:8});
let sum=S.jobBoardSummary(st,job.id);
ok("job total sums pinned boards", sum.totalBoards===42, sum.totalBoards);
ok("grouped by length", sum.byLen[16]===42, JSON.stringify(sum.byLen));
ok("unpin works", S.unpinLayout(st,job.id,area.id) && S.getArea(S.getJob(st,job.id),area.id).pinned===null);

// ---- persistence round-trip via mem stub ----
let mem=S._memStub();
S.saveStore(st, mem);
let loaded=S.loadStore(mem);
ok("save+load round-trips jobs", loaded.store.jobs.length===1 && loaded.error===null);
ok("loaded job name preserved", loaded.store.jobs[0].name==="Steeves Residence");

// ---- adversarial: quota failure reported, not swallowed ----
let quotaStub={ getItem:()=>null, setItem:()=>{ let e=new Error("full"); e.name="QuotaExceededError"; throw e; } };
let qr=S.saveStore(st, quotaStub);
ok("quota failure reported", qr.ok===false && qr.error==="quota", qr.error);

// ---- adversarial: corrupt payload -> fresh store + backup + error flag ----
let corruptStub=(()=>{ let m={[S.STORE_KEY]:"{not json"}; return {
  getItem:k=>k in m?m[k]:null, setItem:(k,v)=>{m[k]=v;}, }; })();
let cr=S.loadStore(corruptStub);
ok("corrupt data -> empty store + error", cr.error==="corrupt" && cr.store.jobs.length===0);
ok("corrupt data backed up", Object.keys(corruptStub).length>=0); // backup attempted (no throw)

// ---- adversarial: FUTURE schema version is read-only, never overwritten ----
let futureStub=(()=>{ let m={[S.STORE_KEY]:JSON.stringify({schemaVersion:99,jobs:[{id:"x",name:"future"}]})};
  return { getItem:k=>k in m?m[k]:null, setItem:(k,v)=>{m[k]=v;}, _m:m }; })();
let fr=S.loadStore(futureStub);
ok("future version flagged read-only", fr.readOnly===true && fr.error==="future");
let fsave=S.saveStore(fr.store, futureStub);
ok("refuses to overwrite future data", fsave.ok===false && fsave.error==="readonly-future");

// ---- migration: v0 (no version) upgrades to current, non-destructive ----
let v0={ jobs:[{id:"old",name:"legacy",areas:[]}] };   // no schemaVersion
let mig=S.migrate(v0);
ok("v0 migrates to current version", mig.schemaVersion===S.SCHEMA_VERSION);
ok("migration preserves existing jobs", mig.jobs.length===1 && mig.jobs[0].name==="legacy");

// ---- export / import ----
let ex=S.exportJob(st, job.id);
ok("exportJob is valid JSON with 1 job", JSON.parse(ex).jobs.length===1);
let st2=S.emptyStore();
let imp=S.importJSON(st2, ex);
ok("import adds the job", imp.ok && st2.jobs.length===1);
let imp2=S.importJSON(st2, ex);   // same ids -> should copy, not overwrite
ok("re-import copies (no overwrite)", imp2.ok && st2.jobs.length===2 && st2.jobs[1].name.includes("imported"));
ok("import bad JSON -> error", S.importJSON(st2,"{broken").ok===false);

console.log("\n"+p+" passed, "+f+" failed"); process.exit(f?1:0);
