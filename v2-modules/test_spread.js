const S = require('./spread.js');
let p=0,f=0; const ok=(n,c,x)=>{ c?(p++,console.log("  PASS "+n)):(f++,console.log("  FAIL "+n+" ["+x+"]")); };

// Realistic engine stub: mirrors the real finding — on a 262" run, 12' boards
// are cramped (more boards, more waste, a relaxed row), 16' opens up (fewer
// boards, clean). 8' can't even make a legal layout on a long run.
function stubEngine(){
  return { generate:function(runIn, acrossIn, boardIn, opts){
    var ft = boardIn/12;
    if(runIn > boardIn && ft <= 8) return { ok:false };          // too short to span -> illegal here
    var rows = Math.ceil(acrossIn/5);                            // ~5" face
    var perRow = Math.ceil(runIn/boardIn);                       // boards per row
    var boards = rows*perRow + (ft===12?4:0);                    // 12' wastes a few more
    var waste = ft===12 ? 9.0 : ft===16 ? 6.0 : 7.5;
    var relaxed = ft===12 ? 1 : 0;
    return { ok:true, rowJoints:[[1,5]], boards:boards, seams:rows*(perRow-1),
             relaxedRows:relaxed, wastePct:waste, label:"stagger · B" };
  }};
}

// --- main spread on Edwin's ceiling-ish numbers ---
let res = S.runSpread(stubEngine(), { runIn:262, acrossIn:150, lengthsAvailFt:[8,12,14,16] });
ok("spread runs, ok", res.ok===true);
ok("8' flagged as no legal layout", res.rows.find(r=>r.lengthFt===8).ok===false);
ok("legal lengths ranked", res.ranked.length===3);
ok("16' is best (fewest boards, clean)", res.best===16, res.best);
ok("12' shows relaxed row", res.rows.find(r=>r.lengthFt===12).quality.includes("relaxed"));
ok("16' shows clean", res.rows.find(r=>r.lengthFt===16).quality==="clean");
ok("best row flagged", res.ranked[0].best===true && res.ranked[0].lengthFt===16);
ok("waste rounded", res.rows.find(r=>r.lengthFt===16).waste===6.0);

// --- table model ---
let t = S.spreadTable(res);
ok("table has 5 columns", t.header.length===5);
ok("table row count matches lengths", t.rows.length===4);
ok("illegal row shows dashes", t.rows.find(r=>r.cells[0]==="8'").cells[1]==="\u2014");
ok("best row marked in table", t.rows.find(r=>r.best)!==undefined);

// --- adversarial ---
ok("bad dimensions -> error", S.runSpread(stubEngine(),{runIn:0,acrossIn:150,lengthsAvailFt:[12]}).ok===false);
ok("no lengths -> error", S.runSpread(stubEngine(),{runIn:262,acrossIn:150,lengthsAvailFt:[]}).ok===false);
ok("engine throws -> row marked illegal, no crash", (()=>{
  let bad={generate:()=>{throw new Error("boom");}};
  let r=S.runSpread(bad,{runIn:262,acrossIn:150,lengthsAvailFt:[12]});
  return r.ok===true && r.rows[0].ok===false;
})());
ok("ALL lengths illegal -> ok true but no best", (()=>{
  let none={generate:()=>({ok:false})};
  let r=S.runSpread(none,{runIn:262,acrossIn:150,lengthsAvailFt:[8,10]});
  return r.ok===true && r.best===null && r.ranked.length===0;
})());

// --- shopping list (pairs with store.jobBoardSummary) ---
ok("shopping list formats", S.shoppingList({16:34,12:12})==="12\u00d7 12'  +  34\u00d7 16'", S.shoppingList({16:34,12:12}));
ok("empty shopping list", S.shoppingList({})==="");

console.log("\n"+p+" passed, "+f+" failed"); process.exit(f?1:0);
