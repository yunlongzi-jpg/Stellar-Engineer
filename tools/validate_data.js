/* ============================================================
 * 数据自检：校验 data.js 结构完整性（扩充天体/课题后跑一遍）
 * 用法: node validate_data.js
 * 检查项：ID 唯一、units 非空且物质种类合法、名次分非空、
 *         课题/任务牌引用的天体存在、决策牌构筑数量
 * ============================================================ */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ctx = vm.createContext({ module: { exports: {} } });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "data.js"), "utf8"), ctx, { filename: "data.js" });
const D = ctx.module.exports;

const errs = [];
const ids = new Set();
let slots = 0;
for (const b of D.BODIES) {
  if (ids.has(b.id)) errs.push(`天体 ID 重复: ${b.id}`);
  ids.add(b.id);
  if (!Array.isArray(b.units) || !b.units.length) errs.push(`${b.id} 缺少 units`);
  if (!Array.isArray(b.scores) || !b.scores.length) errs.push(`${b.id} 缺少 scores`);
  b.units.forEach((u, i) => {
    if (!Array.isArray(u) || !u.length) errs.push(`${b.id} 第 ${i + 1} 单元为空`);
    for (const s of u) if (s !== "wild" && !D.MATERIALS[s]) errs.push(`${b.id} 物质格种类非法: ${s}`);
  });
  slots += b.units.reduce((a, u) => a + u.length, 0);
}

const catCount = {};
for (const b of D.BODIES) catCount[b.category] = (catCount[b.category] || 0) + 1;

for (const t of D.TOPICS) {
  if (t.bodies.length !== 2) errs.push(`课题 ${t.id} 应标示 2 颗天体`);
  for (const bid of t.bodies) if (!ids.has(bid)) errs.push(`课题 ${t.id} 引用不存在的天体: ${bid}`);
}
for (const t of D.DECISION_TEMPLATES) {
  if (t.mission && t.mission.kind === "bodiesFormed")
    for (const bid of t.mission.bodies) if (!ids.has(bid)) errs.push(`任务牌 ${t.id} 引用不存在的天体: ${bid}`);
  if (t.mission && t.mission.kind === "playedCards" && !D.MATERIALS[t.mission.mat]) errs.push(`任务牌 ${t.id} 物质种类非法`);
  if (t.mission && t.mission.kind === "skipDiscard")
    for (const c of t.mission.cost) if (c.mat !== "any" && !D.MATERIALS[c.mat]) errs.push(`任务牌 ${t.id} 弃牌种类非法`);
}

let cardCount = 0; const kinds = new Set();
for (const t of D.DECISION_TEMPLATES) { kinds.add(t.id); cardCount += D.DECISION_DECK_MULT[t.id] || 1; }
let deckTotal = Object.values(D.MATERIAL_DECK).reduce((a, n) => a + n, 0);

console.log(`星盘: ${D.BODIES.length} 颗天体（${JSON.stringify(catCount)}），共 ${slots} 个物质格`);
console.log(`课题卡: ${D.TOPICS.length} 张 | 物质牌库: ${deckTotal} 张 | 决策牌构筑: ${cardCount} 张 / ${kinds.size} 种`);
if (errs.length) { console.log("发现错误:"); errs.forEach(e => console.log("  - " + e)); process.exit(1); }
console.log("数据自检 OK");
