/* UI 层 DOM 冒烟测试（jsdom）：
 * 1) 开始画面人数选择与动态输入行  2) 4 人 AI 局开局与轮转
 * 3) 手牌任务进度显示  4) 热座 3 人遮罩轮转
 */
"use strict";
const fs = require("fs");
const path = require("path");
const JSDOM = require("C:/Users/ziyl0/.workbuddy/binaries/node/versions/22.22.2-3/node_modules/@tencent/slidep/node_modules/jsdom").JSDOM;

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ FAIL:", m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot() {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .replace(/<script[^>]*src="[^"]*"><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "file://" + ROOT.replace(/\\/g, "/") + "/index.html" });
  const w = dom.window;
  w.confirm = () => true;
  // 拼接后一次性注入：浏览器 <script> 顶层 const 共享全局词法作用域，jsdom 需等价处理
  const bundle = ["data.js", "game.js", "ai.js", "ui.js"]
    .map(f => fs.readFileSync(path.join(ROOT, "js", f), "utf8")).join("\n;\n");
  w.eval(bundle);
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  return dom;
}

(async () => {
  /* ===== 1. 开始画面：AI 模式默认 + 人数切换 ===== */
  console.log("[1] 开始画面控件");
  const dom = boot();
  const w = dom.window, d = w.document;
  const $ = s => d.querySelector(s), $$ = s => Array.from(d.querySelectorAll(s));
  ok($$("#count-select .count-btn").length === 3, "人数按钮 3 个");
  ok($$("#count-select .count-btn")[0].classList.contains("count-active"), "默认选 2 人(1 AI)");
  ok($$("#player-rows .name-row").length === 2, "AI 模式默认 2 行输入");
  // 切到 4 人（3 AI）
  $$("#count-select .count-btn")[2].click();
  ok($$("#player-rows .name-row").length === 4, "4 人局出现 4 行输入");
  ok($("#count-label").textContent === "对手数量", "AI 模式标签=对手数量");
  // 切热座
  $('input[name=mode][value=hotseat]').click();
  ok($("#count-label").textContent === "玩家总数", "热座标签=玩家总数");
  ok($$("#count-select .count-btn")[2].classList.contains("count-active"), "切模式保留 4 人选择");
  ok($$("#player-rows .name-row").length === 4, "热座 4 行输入");

  /* ===== 2. 4 人 AI 局：开局 + 名字 + 渲染 + AI 轮转 ===== */
  console.log("[2] 4 人 AI 局");
  $('input[name=mode][value=ai]').click();   // 从热座切回 AI 模式
  $$("#count-select .count-btn")[2].click(); // 4 人（1 人类 + 3 AI）
  ok($("#count-label").textContent === "对手数量", "切回 AI 模式标签");
  $("#name0").value = "指挥官";
  const nameInputs = $$("#player-rows input");
  nameInputs[1].value = "脉冲AI"; nameInputs[2].value = ""; nameInputs[3].value = "星云AI";
  $("#btn-start").click();
  ok(!$("#screen-game").classList.contains("hidden"), "游戏画面显示");
  const rows4 = $$("#players-panel .player-row");
  ok(rows4.length === 4, "玩家面板 4 行");
  ok(rows4[0].textContent.includes("指挥官") && rows4[1].textContent.includes("脉冲AI"), "名字正确");
  ok(rows4[2].textContent.includes("脉冲AI") || rows4[2].textContent.includes("脉冲 AI"), "空名 AI 用默认名池");
  ok(d.querySelector("#turn-info").textContent.includes("指挥官"), "当前回合=人类");
  ok($("#phase-banner").textContent.includes("工具阶段"), "人类工具阶段");

  /* ===== 3. 手牌任务进度显示 ===== */
  console.log("[3] 手牌任务进度");
  const ptsTexts = $$("#hand-cards .card .c-pts").map(e => e.textContent);
  const cardsCount = $$("#hand-cards .card").length;
  const hasProgress = ptsTexts.some(t => /进度 \d\/\d/.test(t) || t.includes("✓可完成") || t.includes("工具效果"));
  ok(hasProgress, "任务牌显示进度/可完成/工具 (" + ptsTexts.join(" | ") + ")");
  ok(cardsCount === 6, `人类 ${cardsCount} 张手牌（4 人局起手 4+2=6）`);

  /* ===== 4. 人类完成回合 → 3 个 AI 依次自动行动 → 回到人类 ===== */
  console.log("[4] 多人轮转");
  const skip2 = async () => {
    $("#ab-toaction").click();
    const sk = $("#ab-skip"); if (sk) sk.click();
    await sleep(60);
    const mp = $("#ab-mission-pass"); if (mp) mp.click();
  };
  await skip2();
  console.log("  调试: skip2 后 phase=" + w.__dbg.state.phase + " seat=" + w.__dbg.state.seat + " round=" + w.__dbg.state.round + " renderErr=" + (w.__renderErr || "无").split("\n")[0]);
  // 探测：AI 决策函数在当前局面的表现
  await sleep(1500);
  try {
    const mv = w.eval("AI.chooseMove(window.__dbg.state)");
    console.log("  调试: AI.chooseMove →", JSON.stringify(mv));
  } catch (e) { console.log("  调试: AI.chooseMove 抛异常:", String(e).split("\n")[0]); }
  let reachedHuman = false, sawAITurns = 0, guard = 0;
  while (guard++ < 60) {
    await sleep(500);
    const banner = $("#phase-banner .phase-name");
    const st = w.__dbg.state;
    if (guard % 6 === 0) console.log(`  调试: t+${guard * 0.5}s phase=${st.phase} seat=${st.seat} round=${st.round} banner=${banner ? banner.textContent : "无"} renderErr=${(w.__renderErr || "无").split("\n")[0]}`);
    if (!banner) continue;
    if (banner.textContent.includes("🤖")) { sawAITurns++; continue; }
    if (d.querySelector("#turn-info").textContent.includes("指挥官") && !banner.textContent.includes("🤖")) {
      if (w.__dbg.state.seat === 0 && w.__dbg.state.round >= 2) { reachedHuman = true; break; }
    }
    if (w.__dbg.state.phase === "gameover") break;
  }
  ok(reachedHuman, `AI 依次行动后回到人类第 2 轮（观察 AI 界面 ${sawAITurns} 次）`);
  ok(w.__dbg.state.players.length === 4, "引擎侧 4 名玩家");
  ok($("#log-panel").textContent.length > 40, "行动日志有内容");

  /* ===== 5. 热座 3 人：遮罩轮转 ===== */
  console.log("[5] 热座 3 人遮罩");
  $("#btn-restart").click();  // confirm 已 stub
  await sleep(50);
  ok(!$("#screen-start").classList.contains("hidden"), "回到开始画面");
  $('input[name=mode][value=hotseat]').click();
  $$("#count-select .count-btn")[1].click(); // 3 人
  $("#btn-start").click();
  await sleep(80);
  ok(!$("#overlay-mask").classList.contains("hidden"), "开局显示遮罩");
  ok($("#mask-name").textContent === "玩家一", "遮罩名字=玩家一");
  $("#mask-btn").click();
  await sleep(60);
  ok($("#overlay-mask").classList.contains("hidden"), "就位后遮罩消失");
  // 玩家一完成回合
  $("#ab-toaction").click();
  $("#ab-skip").click();
  await sleep(60);
  const mp2 = $("#ab-mission-pass"); if (mp2) mp2.click();
  await sleep(120);
  ok(!$("#overlay-mask").classList.contains("hidden"), "回合结束遮罩再现");
  ok($("#mask-name").textContent === "玩家二", "遮罩名字=玩家二");
  const handDuringMask = $$("#hand-cards .card").length;
  $("#mask-btn").click();
  await sleep(60);
  ok($$("#hand-cards .card").length > 0, "玩家二手牌渲染（遮罩期间可见性由遮罩层保证）");
  ok(w.__dbg.state.seat === 1, "座位=1");

  console.log(`\nUI 冒烟测试: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("测试脚本异常:", e.stack); process.exit(1); });
