/* 多人局模拟：2/3/4 人全 AI 对战，验证流程完整性与任务完成率 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
function load(files, extra) {
  const src = files.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
    + "\n;globalThis.__X = { Game, AI, BODIES, DECISION_TEMPLATES, RULES };";
  const sandbox = extra || {};
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: "bundle.js" });
  return ctx.__X;
}
const { Game, AI, DECISION_TEMPLATES } = load(["js/data.js", "js/game.js", "js/ai.js"]);

const STAR_MISSIONS = ["星系规划师", "星际物质整合者", "逆行自转星球", "行星工程", "卫星引力俘获", "小行星带巡礼"];

function simGame(nPlayers, seed) {
  const players = [];
  for (let i = 0; i < nPlayers; i++) players.push({ name: (i === 0 ? "P1" : "AI" + i), isAI: true });
  let state = Game.initState({ seed, players });
  let steps = 0;
  while (state.phase !== "gameover" && steps++ < 3000) {
    let mv = null;
    try { mv = AI.chooseMove(state); } catch (e) { throw new Error(`AI 异常 seed=${seed}: ${e.stack}`); }
    if (!mv) mv = state.phase === "action" ? { type: "action", action: "skip" } : { type: "pass" };
    let r = Game.applyMove(state, mv);
    if (!r.ok) {
      const fb = state.phase === "action" ? { type: "action", action: "skip" } : { type: "pass" };
      r = Game.applyMove(state, fb);
      if (!r.ok) throw new Error(`死局 seed=${seed} phase=${state.phase}: ${r.error}`);
    }
    state = r.state;
  }
  if (state.phase !== "gameover") throw new Error(`未终局 seed=${seed} round=${state.round}`);
  return state;
}

const stats = {};
for (const n of [2, 3, 4]) {
  stats[n] = { games: 0, ok: 0, missions: 0, starMissions: 0, rounds: 0, formed: 0, err: 0 };
  for (let g = 0; g < 15; g++) {
    const seed = 2000 + n * 100 + g * 7;
    try {
      const st = simGame(n, seed);
      stats[n].games++; stats[n].ok++;
      stats[n].rounds += st.round;
      stats[n].formed += st.formedOrder.length;
      for (const line of st.log) {
        if (line.includes("完成任务「") || line.includes("终局补分")) {
          const name = line.slice(line.indexOf("「") + 1, line.indexOf("」"));
          stats[n].missions++;
          if (STAR_MISSIONS.includes(name)) stats[n].starMissions++;
        }
      }
    } catch (e) {
      stats[n].games++;
      stats[n].err++;
      console.log(`  [${n}人 seed=${seed}] 失败: ${e.message.split("\n")[0]}`);
    }
  }
}
console.log("=== 多人模拟结果（各 15 局全 AI）===");
for (const n of [2, 3, 4]) {
  const s = stats[n];
  const avgRound = s.ok ? (s.rounds / s.ok).toFixed(1) : "-";
  const avgFormed = s.ok ? (s.formed / s.ok).toFixed(1) : "-";
  console.log(`${n} 人局: ${s.ok}/${s.games} 成功 · 平均 ${avgRound} 轮 · 平均形成 ${avgFormed} 天体 · 任务完成 ${s.missions} 次（星球类 ${s.starMissions}） · 失败 ${s.err}`);
}

// 决策牌构筑核对：26 张且星球类占比
{
  const S2 = load(["js/data.js", "js/game.js", "js/ai.js"]);
  const st = S2.Game.initState({ seed: 7, players: [{ name: "甲" }, { name: "乙" }] });
  const decTotal = st.decLib.length + st.players.reduce((a, p) => a + p.hand.filter(S2.Game.isDecCard).length, 0);
  const tidCount = {};
  for (const c of st.decLib) tidCount[c.tid] = (tidCount[c.tid] || 0) + 1;
  for (const p of st.players) for (const c of p.hand) if (S2.Game.isDecCard(c)) tidCount[c.tid] = (tidCount[c.tid] || 0) + 1;
  const total = Object.values(tidCount).reduce((a, b) => a + b, 0);
  const kinds = Object.keys(tidCount).length;
  console.log(`=== 构筑核对 === 决策牌共 ${total} 张（须 26），效果种类 ${kinds}（须 23）: ${total === 26 && kinds === 23 ? "OK" : "FAIL " + JSON.stringify(tidCount)}`);
}
