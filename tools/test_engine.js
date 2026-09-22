/* 引擎单元测试：Node 运行。把 data.js / game.js / ai.js 依序注入同一作用域。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
function load(files) {
  const src = files.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
    + "\n;globalThis.__X = { Game, MATERIALS, MATERIAL_DECK, BODIES, TOPICS, DECISION_TEMPLATES, DECISION_DECK_MULT, RULES, CATEGORY_NAMES };";
  const sandbox = {};
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: "bundle.js" });
  return ctx.__X;
}

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ FAIL:", msg); }
}

/* ============ 1. 基础引擎测试（不含 AI） ============ */
(function testBasics() {
  const S = load(["js/data.js", "js/game.js"]);
  const { Game, BODIES, RULES, MATERIAL_DECK } = S;

  console.log("[1] 初始化与配件核对");
  let st = Game.initState({ seed: 42, players: [{ name: "甲" }, { name: "乙" }] });
  ok(st.players.length === 2, "2 人");
  ok(st.players[0].hand.length === 4 + 2 && st.players[1].hand.length === 5 + 2, "起始手牌 4/5 物质 +2 决策");
  const supplyTotal = Object.values(st.publicSupply).reduce((a, b) => a + b, 0);
  ok(supplyTotal === 5, "公共区 5 张");
  ok(st.bodies["A1"].rewards === 2, "太阳 2 个奖励标记");
  for (const b of BODIES) if (b.category === "planet") ok(st.bodies[b.id].rewards >= 1, `${b.name} 至少 1 个奖励标记`);
  const totalCards = st.matLib.length + st.matDiscard.length + supplyTotal + st.players.reduce((a, p) => a + p.hand.filter(c => typeof c === "string").length, 0);
  ok(totalCards === 93, `物质牌守恒 93（实际 ${totalCards}）`);
  const decTotal = st.decLib.length + st.players.reduce((a, p) => a + p.hand.filter(Game.isDecCard).length, 0);
  ok(decTotal === 26, `决策牌共 26（实际 ${decTotal}）`);
  // 奖励标记总数 ≤ 34
  const rewardsTotal = Object.values(st.bodies).reduce((a, b) => a + b.rewards, 0);
  ok(rewardsTotal === 10 + 4, `奖励标记 10 固定 + 课题 4（实际 ${rewardsTotal}）`);

  console.log("[2] 盲抽与放回规则（两步式）");
  // 甲手牌物质
  const p0mats = st.players[0].hand.filter(c => typeof c === "string");
  ok(p0mats.length === 4, "甲 4 张物质");
  st = Game.applyMove(st, { type: "toAction" }).state;
  const before = st.players[0].hand.length;
  let r = Game.applyMove(st, { type: "action", action: "blind" });
  ok(r.ok === true, `盲抽摸牌成功（${r.error || ""}）`);
  st = r.state;
  ok(st.players[0].hand.length === before + 3, `先摸 3：${before} → ${st.players[0].hand.length}`);
  ok(st.phase === "blindReturn", "进入放回选择阶段");
  const legal = Game.legalReturnTypes(st);
  ok(legal.length >= 1, "有合法放回种类");
  // 非法种类放回被拒绝
  const bad = Object.keys(st.publicSupply).filter(m => !legal.includes(m) && st.players[0].hand.includes(m));
  if (bad.length) {
    const rb = Game.applyMove(st, { type: "blindReturn", returnCard: bad[0] });
    ok(rb.ok === false, "放回非最少种类被拒绝");
  }
  r = Game.applyMove(st, { type: "blindReturn", returnCard: legal[0] });
  ok(r.ok === true, `放回成功（${r.error || ""}）`);
  st = r.state;
  ok(st.players[0].hand.length === before + 2, `摸3还1：${before} → ${st.players[0].hand.length}`);
  ok(st.phase === "mission", "进入任务阶段");

  console.log("[3] 填充星球与形成结算（ scripted 完整流程）");
  st = Game.initState({ seed: 2024, players: [{ name: "红" }, { name: "蓝" }] });
  // 手动构造：把红的手牌换成填满 智神星(D6: rock,rock) 的 2 张岩石 + 让蓝过
  st.players[0].hand = ["rock", "rock", "rock", "rock", "rock", "rock"];
  st.players[1].hand = ["water"];
  st = Game.applyMove(st, { type: "toAction" }).state;
  r = Game.applyMove(st, { type: "action", action: "fill", assignments: [
    { bid: "D6", u: 0, s: 0, card: { c: "rock" } },
    { bid: "D6", u: 0, s: 1, card: { c: "rock" } },
  ] });
  ok(r.ok === true, `填充成功（${r.error || ""}）`);
  st = r.state;
  ok(st.bodies["D6"].formed === true, "智神星形成");
  ok(st.players[0].score === 2, `独立完成者得第一名 2 分（实际 ${st.players[0].score}）`);
  ok(st.players[0].tokens === 38, "消耗 2 个工程标记");
  ok(st.soloFormed[0].includes("D6"), "记录独立完成小天体");
  // 任务：星际物质整合者（独立完成 1 颗小天体）→ 需要 decision 卡在手
  st.players[0].hand.push({ tid: "inter_integrator", uid: "inter_integrator" });
  ok(Game.missionValid(st, 0, "inter_integrator", false) === true, "星际物质整合者任务可完成");
  r = Game.applyMove(st, { type: "mission", cards: ["inter_integrator"] });
  ok(r.ok === true, `任务结算成功（${r.error || ""}）`);
  st = r.state;
  ok(st.players[0].score === 7, `2+5=7 分（实际 ${st.players[0].score}）`);
  ok(st.players[0].hand.filter(Game.isDecCard).length === 1, "补充摸 1 张决策牌");

  console.log("[4] 2 人局单元资格规则");
  st = Game.initState({ seed: 99, players: [{ name: "红" }, { name: "蓝" }] });
  // 红填月球(C1: rock rock) 一个格、蓝填另一个格 → 蓝未独立完成单元 → 双方都无分
  st.players[0].hand = ["rock"];
  st.players[1].hand = ["rock"];
  st = Game.applyMove(st, { type: "toAction" }).state;
  st = Game.applyMove(st, { type: "action", action: "fill", assignments: [{ bid: "C1", u: 0, s: 0, card: { c: "rock" } }] }).state;
  st = Game.applyMove(st, { type: "pass" }).state; // 甲任务阶段过
  ok(st.seat === 1, "轮到蓝");
  st = Game.applyMove(st, { type: "toAction" }).state;
  st = Game.applyMove(st, { type: "action", action: "fill", assignments: [{ bid: "C1", u: 0, s: 1, card: { c: "rock" } }] }).state;
  ok(st.bodies["C1"].formed === true, "月球形成");
  ok(st.players[0].score === 0 && st.players[1].score === 0, "2 人局：双方都无完整单元 → 均不得分");

  console.log("[5] 三换一 / 星际物质指定 / 多种类付费");
  st = Game.initState({ seed: 5, players: [{ name: "红" }, { name: "蓝" }] });
  st.players[0].hand = ["rock", "rock", "rock", "inter", "atmo", "atmo"];
  st.players[0].score = 10;
  st = Game.applyMove(st, { type: "toAction" }).state;
  // 谷神星 D17: units [[water, rock, rock]]
  r = Game.applyMove(st, { type: "action", action: "fill", assignments: [
    { bid: "D17", u: 0, s: 1, card: { c: "rock" } },                     // rock → rock 格
    { bid: "D17", u: 0, s: 2, card: { c: "rock" } },                     // rock → rock 格
    { bid: "D17", u: 0, s: 0, card: { t3: "inter", as: "water" } },      // 错：t3 须为相同种类 3 张（inter 只有1张）
  ] });
  ok(r.ok === false, "三换一牌数不足被拒绝");
  st.players[0].hand = ["rock", "rock", "rock", "inter", "inter", "inter", "atmo", "atmo"];
  r = Game.applyMove(st, { type: "action", action: "fill", assignments: [
    { bid: "D17", u: 0, s: 1, card: { c: "rock" } },
    { bid: "D17", u: 0, s: 2, card: { c: "rock" } },
    { bid: "D17", u: 0, s: 0, card: { t3: "inter", as: "water" } },
  ] });
  ok(r.ok === true, `三换一成功（${r.error || ""}）`);
  st = r.state;
  ok(st.bodies["D17"].formed === true, "谷神星形成");
  ok(st.players[0].score === 12, `rock+water 两种类付费 1 分：10 -1 +3 = 12（实际 ${st.players[0].score}）`);
  ok(st.turnStats.playedCounts["rock"] === 2 && st.turnStats.playedCounts["water"] === 1, "任务计数：指定牌计入");

  console.log("[6] 跨星球限制与工具");
  st = Game.initState({ seed: 11, players: [{ name: "红" }, { name: "蓝" }] });
  st.players[0].hand = ["rock", "rock", "rock", "rock", "rock", "rock"];
  st = Game.applyMove(st, { type: "toAction" }).state;
  r = Game.applyMove(st, { type: "action", action: "fill", assignments: [
    { bid: "D6", u: 0, s: 0, card: { c: "rock" } },
    { bid: "D19", u: 0, s: 0, card: { c: "rock" } },
  ] });
  ok(r.ok === false, "无工具时跨星球被拒绝");
  // 新局面：先打跨星球填充装置，再跨星球填充
  st = Game.initState({ seed: 12, players: [{ name: "红" }, { name: "蓝" }] });
  st.players[0].hand = ["rock", "rock", "rock", "rock", "rock", "rock"];
  st.players[0].hand.push({ tid: "cross_fill", uid: "cross_fill" });
  r = Game.applyMove(st, { type: "tool", uid: "cross_fill", params: {} });
  ok(r.ok === true, `跨星球工具成功（${r.error || ""}）`);
  st = r.state;
  st = Game.applyMove(st, { type: "toAction" }).state;
  r = Game.applyMove(st, { type: "action", action: "fill", assignments: [
    { bid: "D6", u: 0, s: 0, card: { c: "rock" } },
    { bid: "D19", u: 0, s: 0, card: { c: "rock" } },
  ] });
  ok(r.ok === true, `跨星球填充成功（${r.error || ""}）`);

  console.log("[7] 手牌上限与流程推进");
  st = Game.initState({ seed: 33, players: [{ name: "甲" }, { name: "乙" }] });
  st.players[0].hand = ["rock", "rock", "rock", "rock", "rock", "rock", "rock", "rock", "rock", "rock", "rock", "rock", "rock", "rock"];
  st = Game.applyMove(st, { type: "toAction" }).state;
  st = Game.applyMove(st, { type: "action", action: "skip" }).state;
  st = Game.applyMove(st, { type: "pass" }).state;
  ok(st.phase === "handcheck", "进入弃牌检查");
  r = Game.applyMove(st, { type: "discard", cards: [{ k: "m", mat: "rock" }] });
  ok(r.ok === false, "弃牌数量错误被拒绝");
  r = Game.applyMove(st, { type: "discard", cards: Array(2).fill({ k: "m", mat: "rock" }) });
  ok(r.ok === true, `弃 2 张至 12（${r.error || ""}）`);
  ok(r.state.seat === 1, "轮到下一位玩家");

  console.log(`基础测试：${pass} 通过 / ${fail} 失败`);
})();

process.exit(fail > 0 ? 1 : 0);
