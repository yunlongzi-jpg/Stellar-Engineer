/* AI 对战模拟测试：AI vs AI 完整对局，校验终局、守恒与性能。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const src = ["js/data.js", "js/game.js", "js/ai.js"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
  + "\n;globalThis.__X = { Game, AI, BODIES, RULES, MATERIALS, MATERIAL_DECK, TOPICS };";
const ctx = vm.createContext({ console });
vm.runInContext(src, ctx, { filename: "bundle.js" });
const { Game, AI, RULES, MATERIALS, BODIES } = ctx.__X;

const N_GAMES = Number(process.argv[2] || 5);
let fails = 0;

for (let g = 0; g < N_GAMES; g++) {
  const seed = 1000 + g * 7;
  const t0 = Date.now();
  let st = Game.initState({ seed, players: [{ name: "AI-甲", isAI: true }, { name: "AI-乙", isAI: true }] });
  let steps = 0, fallbacks = 0, lastMove = null, lastErr = null;
  while (st.phase !== "gameover" && steps < 20000) {
    steps++;
    if (steps > 3000) {
      // 诊断：疑似死循环，输出局面摘要
      console.error(`seed=${seed} step=${steps} phase=${st.phase} seat=${st.seat} round=${st.round} scores=${st.players.map(p => p.score)} tokens=${st.players.map(p => p.tokens)} formed=${st.formedOrder.length} lastMove=${JSON.stringify(lastMove)} lastErr=${lastErr || "-"}`);
      if (steps > 3060) break;
    }
    const mv = AI.chooseMove(st);
    lastMove = mv;
    if (!mv) { console.error(`seed=${seed} step=${steps} phase=${st.phase}: AI 返回 null`); fails++; break; }
    const r = Game.applyMove(st, mv);
    if (!r.ok) {
      lastErr = r.error;
      // 降级：安全通过
      const fb = st.phase === "action" ? { type: "action", action: "skip" } : { type: "pass" };
      const r2 = Game.applyMove(st, fb);
      if (!r2.ok) { console.error(`seed=${seed} step=${steps}: AI 非法 move「${JSON.stringify(mv).slice(0, 160)}」→ ${r.error}；降级也失败：${r2.error}`); fails++; break; }
      fallbacks++;
      st = r2.state;
      continue;
    }
    st = r.state;
  }
  const dur = Date.now() - t0;
  if (st.phase !== "gameover") { console.error(`seed=${seed}: ${steps} 步未终局`); fails++; continue; }
  // 守恒检查（物质牌：牌库+弃牌+公共区+手牌；盘面上是工程标记而非牌）
  const matTotal = st.matLib.length + st.matDiscard.length
    + Object.values(st.publicSupply).reduce((a, b) => a + b, 0)
    + st.players.reduce((a, p) => a + p.hand.filter(c => typeof c === "string").length, 0);
  const decTotal = st.decLib.length + st.decDiscard.length + st.players.reduce((a, p) => a + p.hand.filter(Game.isDecCard).length, 0);
  const ok1 = matTotal === 93, ok2 = decTotal === 26;
  if (!ok1 || !ok2) { console.error(`seed=${seed}: 守恒破坏 物质=${matTotal} 决策=${decTotal}`); fails++; }
  const tokensTotal = st.players.reduce((a, p) => a + p.tokens, 0) + Object.values(st.bodies).reduce((a, b) => a + b.units.flat().filter(o => o !== null).length, 0);
  if (tokensTotal !== 80) { console.error(`seed=${seed}: 标记守恒破坏 ${tokensTotal}`); fails++; }
  const formed = st.formedOrder.length;
  const scores = st.players.map(p => p.score).join("/");
  console.log(`seed=${seed}: ${steps} 步 ${dur}ms 降级=${fallbacks} 形成=${formed}/${BODIES.length} 分数=${scores} 胜者=${st.winners.join(",")} 终因=${st.triggerReason || "?"}  ${fails ? "有失败" : "OK"}`);
}

console.log(fails ? `\n共 ${fails} 项失败` : "\n全部通过");
process.exit(fails ? 1 : 0);
