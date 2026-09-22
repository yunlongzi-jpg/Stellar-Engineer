/* 一次性诊断：复现 seed=1000 卡死局面，转储关键状态 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const src = ["js/data.js", "js/game.js", "js/ai.js"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
  + "\n;globalThis.__X = { Game, AI, BODIES, RULES, MATERIALS };";
const ctx = vm.createContext({ console });
vm.runInContext(src, ctx, { filename: "bundle.js" });
const { Game, AI, RULES } = ctx.__X;

const seed = Number(process.argv[2] || 1000);
let st = Game.initState({ seed, players: [{ name: "AI-甲", isAI: true }, { name: "AI-乙", isAI: true }] });
let steps = 0;
while (st.phase !== "gameover" && steps < 700) {
  steps++;
  const mv = AI.chooseMove(st);
  if (!mv) { console.log(`step=${steps} AI 返回 null phase=${st.phase}`); break; }
  const r = Game.applyMove(st, mv);
  if (!r.ok) {
    const fb = st.phase === "action" ? { type: "action", action: "skip" } : { type: "pass" };
    const r2 = Game.applyMove(st, fb);
    if (!r2.ok) { console.log(`step=${steps} 非法+降级失败: ${r.error}`); break; }
    st = r2.state; continue;
  }
  st = r.state;
}
console.log(`停在 step=${steps} phase=${st.phase} round=${st.round}`);
console.log(`matLib=${st.matLib.length} matDiscard=${st.matDiscard.length} supply=${JSON.stringify(st.publicSupply)}`);
console.log(`decLib=${st.decLib.length} decDiscard=${st.decDiscard.length}`);
st.players.forEach((p, i) => {
  const mats = p.hand.filter(c => typeof c === "string");
  const decs = p.hand.filter(c => typeof c === "object");
  const matBy = {};
  mats.forEach(m => matBy[m] = (matBy[m] || 0) + 1);
  const decNames = decs.map(c => c.tid);
  console.log(`P${i} ${p.name}: score=${p.score} tokens=${p.tokens} 手牌=${p.hand.length} 物质=${JSON.stringify(matBy)} 决策=${JSON.stringify(decNames)}`);
});
console.log(`formed=${st.formedOrder.join(",")}`);
// 各星球剩余空格
for (const b of Object.values(st.bodies)) {
  if (!b.formed) {
    const empty = b.units.flatMap((u, ui) => u.map((o, si) => o === null ? `${ui}.${si}:${b.units[ui][si]}` : null).filter(Boolean));
    if (empty.length) console.log(`${Object.keys(st.bodies).find(k => st.bodies[k] === b)}: 空格=${empty.length}`);
  }
}
