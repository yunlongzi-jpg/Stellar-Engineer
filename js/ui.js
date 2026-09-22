/* ============================================================
 * 宇宙星尘 — UI 渲染与交互
 * 依赖: data.js / game.js / ai.js（先于本文件加载）
 * 设计: 全量重渲染；slot-first 填充交互；file:// 直开
 * ============================================================ */
"use strict";

const UI = (() => {

  /* ---------------- 模块状态 ---------------- */
  const PHASE_NAMES = {
    tool: "工具阶段", action: "行动阶段", blindReturn: "盲抽放回",
    mission: "任务阶段", handcheck: "弃牌调整", gameover: "终局",
  };
  const PLAYER_COLORS = ["#ff8a5c", "#5cc8ff", "#ffd45c", "#7ee787"];
  const FILLABLE_TYPES = ["atmo", "rock", "water", "mag", "ring"];

  let state = null;
  let mode = "ai";               // ai | hotseat
  let playerCount = 2;           // 玩家总数 2-4（ai 模式 = 1 人 + N-1 AI）
  let pendingFill = [];           // [{bid,u,s,card,desc}]
  let slotPick = null;            // {kind:'autoFill'|'resetTokens', uid, max, picked:[]}
  let exchangeMode = false;       // 行动阶段：换决策牌模式
  let exchangeSel = [];           // uid[]
  let missionSel = [];            // uid[]
  let discardSel = [];            // 手牌索引[]
  let drawer = null;              // {bid,u,s,as?}
  let maskSeat = -1;              // 热座遮罩：已就位的座位
  let toastTimer = null;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const curPlayer = () => state.players[state.seat];
  const humanTurn = () => state.phase !== "gameover" && !curPlayer().isAI;
  const colorOf = i => PLAYER_COLORS[i % 4];
  const tpl = tid => DECISION_TEMPLATES.find(t => t.id === tid);
  const bodyName = bid => Game.bodyDef(bid).name;

  /* ---------------- Toast ---------------- */
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
  }

  /* ---------------- move 提交 ---------------- */
  function doMove(move, opt) {
    const r = Game.applyMove(state, move);
    if (!r.ok) { toast(r.error || "操作失败"); return false; }
    state = r.state;
    if (!opt || !opt.keepPending) pendingFill = [];
    if (opt && opt.reset) resetSelections();
    afterStateChange();
    return true;
  }
  function resetSelections() {
    pendingFill = []; slotPick = null; exchangeMode = false;
    exchangeSel = []; missionSel = []; discardSel = []; drawer = null;
  }

  function afterStateChange() {
    if (state.phase === "gameover") { render(); showGameOver(); return; }
    render();
    if (curPlayer().isAI) setTimeout(stepAI, 800);
  }

  /* ================= AI 回合 ---------------- */
  function stepAI() {
    if (!state || state.phase === "gameover" || !curPlayer().isAI) return;
    if ($("#screen-game").classList.contains("hidden")) return;
    let mv = null;
    try { mv = AI.chooseMove(state); } catch (e) { mv = null; }
    if (!mv) mv = state.phase === "action" ? { type: "action", action: "skip" } : { type: "pass" };
    let r = Game.applyMove(state, mv);
    if (!r.ok) {
      const fb = state.phase === "action" ? { type: "action", action: "skip" } : { type: "pass" };
      r = Game.applyMove(state, fb);
      if (!r.ok) { toast("AI 回合异常：" + r.error); return; }
    }
    state = r.state;
    afterStateChange();
  }

  /* ================= 开局 ================= */
  const AI_NAMES = ["星尘 AI", "脉冲 AI", "星云 AI"];
  const HUMAN_NAMES = ["玩家一", "玩家二", "玩家三", "玩家四"];

  function startGame() {
    resetSelections();
    maskSeat = -1;
    const players = [];
    if (mode === "ai") {
      const n0 = ($("#name0") && $("#name0").value.trim()) || "指挥官";
      players.push({ name: n0 });
      for (let i = 1; i < playerCount; i++) {
        const el = $("#name" + i);
        players.push({ name: (el && el.value.trim()) || AI_NAMES[i - 1], isAI: true });
      }
    } else {
      for (let i = 0; i < playerCount; i++) {
        const el = $("#name" + i);
        players.push({ name: (el && el.value.trim()) || HUMAN_NAMES[i] });
      }
    }
    state = Game.initState({ seed: Date.now() & 0x7fffffff, players });
    $("#screen-start").classList.add("hidden");
    $("#screen-game").classList.remove("hidden");
    render();
    if (curPlayer().isAI) setTimeout(stepAI, 800);
    else if (mode === "hotseat") maybeMask();
  }

  /* 开始画面：人数选择 + 玩家名输入行（按模式与人数动态生成） */
  function renderStartControls() {
    const label = $("#count-label");
    const sel = $("#count-select");
    label.textContent = mode === "ai" ? "对手数量" : "玩家总数";
    sel.innerHTML = [2, 3, 4].map(n => {
      const sub = mode === "ai" ? `${n - 1} 个 AI` : `${n} 人`;
      return `<button class="btn btn-sm count-btn ${playerCount === n ? "count-active" : ""}" data-count="${n}">${sub}</button>`;
    }).join("");
    $$("#count-select .count-btn").forEach(b => b.onclick = () => {
      playerCount = +b.dataset.count;
      renderStartControls();
    });
    // 玩家名输入行
    const rows = $("#player-rows");
    let html = "";
    for (let i = 0; i < playerCount; i++) {
      if (mode === "ai" && i === 0) {
        html += `<div class="name-row"><span class="name-label">你的名字</span>
          <input id="name0" type="text" maxlength="8" placeholder="指挥官"></div>`;
      } else if (mode === "ai") {
        html += `<div class="name-row"><span class="name-label">AI ${i} 名字</span>
          <input id="name${i}" type="text" maxlength="8" placeholder="${AI_NAMES[i - 1]}"></div>`;
      } else {
        html += `<div class="name-row"><span class="name-label">${HUMAN_NAMES[i]}</span>
          <input id="name${i}" type="text" maxlength="8" placeholder="${HUMAN_NAMES[i]}"></div>`;
      }
    }
    rows.innerHTML = html;
  }

  function backToStart() {
    state = null; resetSelections(); maskSeat = -1;
    $("#screen-game").classList.add("hidden");
    $("#overlay-gameover").classList.add("hidden");
    $("#overlay-mask").classList.add("hidden");
    $("#screen-start").classList.remove("hidden");
  }

  /* ================= 热座遮罩 ================= */
  function maybeMask() {
    if (mode !== "hotseat" || state.phase === "gameover") return;
    if (curPlayer().isAI) return;
    if (maskSeat === state.seat) return;
    maskSeat = state.seat;
    $("#mask-name").textContent = curPlayer().name;
    $("#mask-name").style.color = colorOf(state.seat);
    $("#overlay-mask").classList.remove("hidden");
    render(); // 遮罩之下不渲染新手牌内容
  }

  /* ================= 渲染总入口 ================= */
  function render() {
    if (!state) return;
    try {
      renderTurnInfo();
      renderBoard();
      renderPlayers();
      renderSupply();
      renderLog();
      renderHand();
      renderActionBar();
      renderDrawer();
      maybeMask();
    } catch (e) {
      console.error("render error:", e);
      window.__renderErr = e && (e.stack || e.message) || String(e);
      throw e;
    }
  }

  function renderTurnInfo() {
    const p = curPlayer();
    const phaseTxt = PHASE_NAMES[state.phase] || state.phase;
    const topics = state.topics.map(id => TOPICS.find(t => t.id === id).name).join(" · ");
    $("#turn-info").innerHTML =
      `<span>第 <span class="strong">${state.round}</span> 轮</span>` +
      `<span>阶段 <span class="strong" style="color:var(--accent)">${phaseTxt}</span></span>` +
      `<span>当前 <span class="strong" style="color:${colorOf(state.seat)}">${esc(p.name)}</span></span>` +
      `<span title="本局课题：${esc(topics)}">课题 <span class="strong">${esc(topics)}</span></span>` +
      (state.lastRound ? `<span style="color:var(--gold)">⏰ 最后一轮！</span>` : "");
  }

  /* ================= 星盘 ================= */
  function renderBoard() {
    const board = $("#board");
    const groups = [
      ["star", "☉ 恒星"], ["planet", "🪐 行星"], ["moon", "🌕 卫星"], ["dwarf", "☄ 小天体"],
    ];
    let html = "";
    for (const [cat, title] of groups) {
      const list = BODIES.filter(b => b.category === cat);
      if (!list.length) continue;
      html += `<div class="board-section-title">${title}</div>`;
      for (const b of list) html += bodyCardHtml(b);
    }
    board.innerHTML = html;
  }

  function bodyCardHtml(b) {
    const bs = state.bodies[b.id];
    const cats = { star: "恒星", planet: "行星", moon: "卫星", dwarf: "小天体" };
    let unitsHtml = "";
    bs.units.forEach((unit, u) => {
      unitsHtml += `<div class="unit-row">` + unit.map((owner, s) => {
        const st = Game.slotType(b.id, u, s);
        const inPending = pendingFill.some(a => a.bid === b.id && a.u === u && a.s === s);
        const picked = slotPick && slotPick.picked.some(x => x.bid === b.id && x.u === u && x.s === s);
        let cls = "slot";
        if (owner === null) {
          cls += " empty";
          if (slotPick && slotPick.kind === "autoFill" && !bs.formed) cls += " pickable";
          if (picked) cls += " picked";
          if (inPending) cls += " in-pending";
          return `<div class="${cls}" data-bid="${b.id}" data-u="${u}" data-s="${s}" data-st="${st}" title="空物质格：${slotLabel(st)}">${slotIcon(st)}</div>`;
        }
        // 已填充格：工程重置模式下可点选
        if (slotPick && slotPick.kind === "resetTokens" && owner !== state.seat && !bs.formed) cls += " pickable";
        if (picked) cls += " picked";
        const color = colorOf(owner);
        return `<div class="slot" data-bid="${b.id}" data-u="${u}" data-s="${s}" data-st="${st}" data-owner="${owner}" title="${bodyName(b.id)} ${u + 1}单元 · ${slotLabel(st)}（${esc(state.players[owner].name)} 的标记）">${slotIcon(st)}<span class="owner-dot" style="background:${color}"></span></div>`;
      }).join("") + `</div>`;
    });
    return `<div class="body-card ${bs.formed ? "formed" : ""}">
      <div class="body-head"><span class="body-name">${esc(b.name)}</span><span class="body-cat">${cats[b.category]}</span></div>
      <div class="body-scores">名次分 <b>${b.scores.join(" / ")}</b>${bs.rewards ? ` <span class="body-rewards">★奖励牌 ×${bs.rewards}</span>` : ""}</div>
      ${unitsHtml}
    </div>`;
  }
  function slotIcon(st) {
    if (st === "wild") return "○";
    return MATERIALS[st] ? MATERIALS[st].icon : "?";
  }
  function slotLabel(st) {
    if (st === "wild") return "万能格（任意种类）";
    return MATERIALS[st] ? MATERIALS[st].name + "格" : st;
  }

  /* ================= 侧栏 ================= */
  function renderPlayers() {
    let html = `<div class="panel-title">玩家 · 分数 / 标记 / 手牌</div>`;
    state.players.forEach((p, i) => {
      html += `<div class="player-row ${i === state.seat && state.phase !== "gameover" ? "active" : ""}">
        <span class="player-color" style="background:${colorOf(i)}"></span>
        <span class="player-name">${esc(p.name)}${p.isAI ? " 🤖" : ""}</span>
        <span class="player-stats"><b>${p.score}</b>分 · ⬛${p.tokens} · 🃏${p.hand.length}</span>
      </div>`;
    });
    html += `<div class="player-stats" style="margin-top:8px;font-size:11px;color:var(--text-dim)">终局条件：${RULES.SCORE_TARGET} 分或工程标记用完</div>`;
    $("#players-panel").innerHTML = html;
  }

  function renderSupply() {
    let html = `<div class="panel-title">公共物质牌区</div><div class="supply-grid">`;
    for (const m of Object.keys(MATERIALS)) {
      const n = state.publicSupply[m];
      const clickable = humanTurn() && state.phase === "action" && n > 0;
      html += `<span class="supply-chip ${clickable ? "clickable" : ""} ${n ? "" : "zero"}" data-supply="${m}" title="拿取公共区全部该种类牌">${MATERIALS[m].icon} ${MATERIALS[m].name} <span class="n" style="color:${MATERIALS[m].color}">${n}</span></span>`;
    }
    html += `</div>`;
    $("#supply-panel").innerHTML = html;
    $$("#supply-panel .supply-chip.clickable").forEach(ch => {
      ch.onclick = () => {
        if (!humanTurn() || state.phase !== "action") return;
        doMove({ type: "action", action: "takePublic", mat: ch.dataset.supply });
      };
    });
  }

  function renderLog() {
    const lines = state.log.slice(-60);
    $("#log-panel").innerHTML = `<div class="panel-title">行动日志</div><div id="log-scroll">` +
      lines.map(l => {
        if (l.startsWith("——")) return `<div class="sep">${esc(l)}</div>`;
        if (l.includes("形成了") || l.includes("游戏结束")) return `<div class="hl">${esc(l)}</div>`;
        return `<div>${esc(l)}</div>`;
      }).join("") + `</div>`;
    const sc = $("#log-scroll");
    if (sc) sc.scrollTop = sc.scrollHeight;
  }

  /* ================= 手牌 ================= */
  function renderHand() {
    const area = $("#hand-cards");
    if (state.phase === "gameover") { area.innerHTML = `<span class="hand-count">游戏结束</span>`; return; }
    const p = curPlayer();
    if (p.isAI) {
      let backs = "";
      for (let i = 0; i < p.hand.length; i++) backs += `<div class="card back-card">✦</div>`;
      area.innerHTML = `<span class="hand-count" style="align-self:center">🤖 ${esc(p.name)} 的手牌（${p.hand.length} 张）</span>` + backs;
      return;
    }
    let html = "";
    p.hand.forEach((c, idx) => { html += handCardHtml(c, idx); });
    area.innerHTML = html + `<span class="hand-count">${p.hand.length} / ${RULES.HAND_LIMIT}</span>`;
    // 交互
    $$("#hand-cards .card").forEach(el => {
      el.onclick = () => onHandCardClick(+el.dataset.idx);
    });
  }

  function handCardHtml(c, idx) {
    const p = curPlayer();
    if (!Game.isDecCard(c)) {
      return `<div class="card mat-card" data-idx="${idx}" style="border-color:${MATERIALS[c].color}66">
        <div class="c-icon" style="color:${MATERIALS[c].color}">${MATERIALS[c].icon}</div>
        <div class="c-name">${MATERIALS[c].name}</div>
      </div>`;
    }
    const t = tpl(c.tid);
    const valid = t.mission && Game.missionValid(state, state.seat, t.id, false);
    let cls = "card dec-card";
    if (t.tool) cls += " tool-card";
    if ((exchangeSel.includes(c.uid)) || missionSel.includes(c.uid) || discardSel.includes(idx)) cls += " selected";
    // 任务进度行：可完成 → ✓；否则显示 cur/need（跳过类显示弃牌要求）
    let ptsHtml;
    if (t.mission) {
      const prog = Game.missionProgress(state, state.seat, t.id, false);
      if (valid) ptsHtml = `任务 ${t.mission.pts} 分 <span class="ok-badge">✓可完成</span>`;
      else if (prog && prog.need != null) ptsHtml = `任务 ${t.mission.pts} 分 · 进度 ${prog.cur}/${prog.need}`;
      else if (t.mission.kind === "skipDiscard") ptsHtml = `任务 ${t.mission.pts} 分 · 须跳过行动${t.mission.cost ? "并弃 " + costText(t.mission.cost) : ""}`;
      else ptsHtml = `任务 ${t.mission.pts} 分`;
    } else ptsHtml = "工具效果";
    return `<div class="${cls}" data-idx="${idx}" title="${esc(decFullText(t))}">
      <div class="c-name">${t.mission && t.tool ? "⇅ " : ""}${esc(t.name)}</div>
      <div class="c-desc">${esc(decShortText(t))}</div>
      <div class="c-pts">${ptsHtml}</div>
    </div>`;
  }

  function decShortText(t) {
    if (t.tool) return toolDesc(t.tool);
    return missionDesc(t.mission);
  }
  function toolDesc(tool) {
    switch (tool.kind) {
      case "autoFill": return "填充 1-2 个物质格";
      case "crossFill": return "行动可跨两颗星球";
      case "doubleAction": return "付 1 分 → 本回合 2 次行动";
      case "stealMaterial": return "夺走对手全部同种物质牌";
      case "take2FromLeader": return "从分数最高者抽 2 张物质牌";
      case "resetTokens": return "移走他人 1-2 个工程标记";
    }
    return "";
  }
  function missionDesc(m) {
    switch (m.kind) {
      case "playedCards": return `回合内打出 ${m.n} 张${Game.matName(m.mat)}`;
      case "skipDiscard": return `跳过行动，弃 ${costText(m.cost)}`;
      case "participateFormed": return "参与形成太阳与任一行星";
      case "participateCategory": return m.n > 1
        ? `参与形成 ${m.n} 颗不同${CATEGORY_NAMES[m.cat]}`
        : `参与形成任意 1 颗${CATEGORY_NAMES[m.cat]}`;
      case "soloFormed": return "独立形成任一小天体";
      case "bodiesFormed": return m.bodies.map(bodyName).join("与") + "均形成";
    }
    return "";
  }
  function costText(cost) {
    return cost.map(c => c.mat === "any" ? "任意牌 ×" + c.n : `${MATERIALS[c.mat].icon}×${c.n}`).join(" ");
  }
  function decFullText(t) {
    if (t.mission) return `任务：${missionDesc(t.mission)} → ${t.mission.pts} 分`;
    return `工具：${toolDesc(t.tool)}`;
  }

  function onHandCardClick(idx) {
    if (!humanTurn()) return;
    const c = curPlayer().hand[idx];
    if (!c) return;
    const phase = state.phase;
    if (phase === "tool") {
      if (!Game.isDecCard(c)) { toast("物质牌请在行动阶段填充时使用（点击星盘空物质格）"); return; }
      const t = tpl(c.tid);
      if (t.tool) startToolUse(c);
      else toast("这张是任务牌：在任务阶段打出，或行动阶段换牌");
      return;
    }
    if (phase === "action") {
      if (exchangeMode) {
        if (!Game.isDecCard(c)) { toast("只能选择决策牌进行更换"); return; }
        const i = exchangeSel.indexOf(c.uid);
        if (i >= 0) exchangeSel.splice(i, 1); else exchangeSel.push(c.uid);
        renderHand(); renderActionBar();
      } else {
        toast(Game.isDecCard(c) ? "决策牌：工具阶段使用 / 换牌模式弃换 / 任务阶段打出" : "填充：点击星盘上的空物质格来打出物质牌");
      }
      return;
    }
    if (phase === "mission") {
      if (!Game.isDecCard(c)) return;
      const t = tpl(c.tid);
      if (!t.mission) { toast("这不是任务牌"); return; }
      if (!Game.missionValid(state, state.seat, t.id, false)) { toast(`任务「${t.name}」尚未完成：${missionDesc(t.mission)}`); return; }
      const i = missionSel.indexOf(c.uid);
      if (i >= 0) missionSel.splice(i, 1); else missionSel.push(c.uid);
      renderHand(); renderActionBar();
      return;
    }
    if (phase === "handcheck") {
      const need = curPlayer().hand.length - RULES.HAND_LIMIT;
      const i = discardSel.indexOf(idx);
      if (i >= 0) discardSel.splice(i, 1);
      else {
        if (discardSel.length >= need) { toast(`最多只需弃 ${need} 张`); return; }
        discardSel.push(idx);
      }
      renderHand(); renderActionBar();
      return;
    }
    if (phase === "blindReturn") { toast("请先选择放回公共区的物质种类"); return; }
  }

  /* ================= 行动条 ================= */
  function renderActionBar() {
    const bar = $("#action-bar");
    const banner = $("#phase-banner");
    if (!humanTurn()) {
      banner.innerHTML = `<span class="phase-name">🤖 ${esc(curPlayer().name)} 行动中…</span><span class="hint">请稍候</span>`;
      bar.innerHTML = "";
      return;
    }
    const p = curPlayer();
    let b = "";
    switch (state.phase) {
      case "tool": {
        banner.innerHTML = `<span class="phase-name">工具阶段</span><span class="hint">可先使用手牌中的工具决策牌（蓝色边框），或直接进入行动</span>`;
        bar.innerHTML = renderSlotPickBar() + `<button class="btn btn-primary" id="ab-toaction" ${slotPick ? "disabled" : ""}>进入行动阶段 ▶</button>`;
        $("#ab-toaction").onclick = () => doMove({ type: "pass" });
        bindSlotPick();
        break;
      }
      case "action": {
        banner.innerHTML = `<span class="phase-name">行动阶段</span><span class="hint">选择一项：盲抽 / 拿公共牌 / 填充星盘 / 换决策牌 / 跳过</span>`;
        // 待填充清单
        let pendingHtml = "";
        if (pendingFill.length) {
          const types = new Set(pendingFill.map(a => Game.cardEffectiveType(a.card)));
          let costHtml = "";
          if (types.size > 1) {
            const cost = RULES.MULTI_TYPE_COST[types.size];
            costHtml = ` 多种类（${types.size}）需支付 <span class="cost-badge">${cost} 分</span>${p.score < cost ? " <span class='cost-badge'>分数不足！</span>" : ""}`;
          }
          pendingHtml = `<div class="pending-bar">待填充：
            ${pendingFill.map((a, i) => `<span class="pending-chip">${bodyName(a.bid)}·${a.u + 1}单元 ← ${a.desc}<button class="btn-x" data-rm="${i}">✕</button></span>`).join("")}
            ${costHtml}
            <button class="btn btn-sm btn-primary" id="ab-fill-ok">打出（${pendingFill.length} 格 / ${pendingFill.length} 标记）</button>
            <button class="btn btn-sm" id="ab-fill-clear">清空</button>
          </div>`;
        }
        if (exchangeMode) {
          bar.innerHTML = pendingHtml + `
            <button class="btn btn-primary" id="ab-exch-ok" ${exchangeSel.length ? "" : "disabled"}>确认换牌（弃 ${exchangeSel.length} 张）</button>
            <button class="btn" id="ab-exch-cancel">取消换牌</button>`;
        } else {
          bar.innerHTML = pendingHtml + `
            <button class="btn" id="ab-blind">🎴 盲抽 3 张</button>
            <span style="color:var(--text-dim);font-size:12px">拿公共：</span>
            ${Object.keys(MATERIALS).filter(m => state.publicSupply[m] > 0).map(m =>
              `<button class="btn btn-sm" data-takepub="${m}">${MATERIALS[m].icon} ×${state.publicSupply[m]}</button>`).join("") || `<span style="color:var(--text-dim);font-size:12px">（空）</span>`}
            <button class="btn" id="ab-exchange">🔁 换决策牌</button>
            <button class="btn btn-ghost" id="ab-skip">跳过行动</button>`;
        }
        bindCommon();
        break;
      }
      case "blindReturn": {
        const legal = Game.legalReturnTypes(state);
        banner.innerHTML = `<span class="phase-name">盲抽放回</span><span class="hint">须放回 1 张「公共区数量最少」且你持有的种类</span>`;
        bar.innerHTML = legal.map(m =>
          `<button class="btn" data-return="${m}" style="border-color:${MATERIALS[m].color}66">${MATERIALS[m].icon} ${MATERIALS[m].name}（公共区 ${state.publicSupply[m]} · 手中 ${Game.matCount(p.hand, m)}）</button>`).join("");
        $$("[data-return]").forEach(btn => btn.onclick = () => doMove({ type: "blindReturn", returnCard: btn.dataset.return }));
        break;
      }
      case "mission": {
        banner.innerHTML = `<span class="phase-name">任务阶段</span><span class="hint">点击手牌中 ✓可完成 的任务牌选中，然后打出（也可跳过）</span>`;
        bar.innerHTML = `
          <button class="btn btn-primary" id="ab-mission-ok" ${missionSel.length ? "" : "disabled"}>打出所选任务（${missionSel.length} 张）</button>
          <button class="btn" id="ab-mission-pass">跳过任务阶段</button>`;
        $("#ab-mission-ok").onclick = () => doMove({ type: "mission", cards: missionSel.slice() }, { reset: true });
        $("#ab-mission-pass").onclick = () => doMove({ type: "pass" }, { reset: true });
        break;
      }
      case "handcheck": {
        const need = p.hand.length - RULES.HAND_LIMIT;
        banner.innerHTML = `<span class="phase-name">弃牌调整</span><span class="hint">手牌超过 ${RULES.HAND_LIMIT} 张，须弃 ${need} 张（已选 ${discardSel.length}）</span>`;
        bar.innerHTML = `<button class="btn btn-danger" id="ab-discard-ok" ${discardSel.length === need ? "" : "disabled"}>确认弃牌（${discardSel.length}/${need}）</button>`;
        $("#ab-discard-ok").onclick = () => {
          const hand = p.hand;
          const specs = discardSel.map(idx => {
            const c = hand[idx];
            return Game.isDecCard(c) ? { k: "d", uid: c.uid } : { k: "m", mat: c };
          });
          doMove({ type: "discard", cards: specs }, { reset: true });
        };
        break;
      }
      case "gameover": {
        banner.innerHTML = `<span class="phase-name">游戏结束</span>`;
        bar.innerHTML = "";
        break;
      }
    }

    function bindCommon() {
      const ok = $("#ab-fill-ok"); if (ok) ok.onclick = commitFill;
      const clr = $("#ab-fill-clear"); if (clr) clr.onclick = () => { pendingFill = []; render(); };
      const bl = $("#ab-blind"); if (bl) bl.onclick = () => doMove({ type: "action", action: "blind" });
      const sk = $("#ab-skip"); if (sk) sk.onclick = () => doMove({ type: "action", action: "skip" }, { reset: true });
      const ex = $("#ab-exchange"); if (ex) ex.onclick = () => { exchangeMode = true; exchangeSel = []; render(); };
      const exc = $("#ab-exch-cancel"); if (exc) exc.onclick = () => { exchangeMode = false; exchangeSel = []; render(); };
      const exo = $("#ab-exch-ok"); if (exo) exo.onclick = () => {
        if (exchangeSel.length < 1) return;
        doMove({ type: "action", action: "exchange", discards: exchangeSel.slice() }, { reset: true });
      };
      $$("[data-takepub]").forEach(btn => btn.onclick = () =>
        doMove({ type: "action", action: "takePublic", mat: btn.dataset.takepub }));
      $$("[data-rm]").forEach(btn => btn.onclick = () => {
        pendingFill.splice(+btn.dataset.rm, 1); render();
      });
    }
  }

  function commitFill() {
    if (!pendingFill.length) return;
    const assignments = pendingFill.map(a => ({ bid: a.bid, u: a.u, s: a.s, card: a.card }));
    doMove({ type: "action", action: "fill", assignments }, { reset: true });
  }

  /* ================= 填充抽屉 ================= */
  function renderDrawer() {
    const dEl = $("#fill-drawer");
    if (!drawer) { dEl.classList.add("hidden"); return; }
    const { bid, u, s } = drawer;
    const st = Game.slotType(bid, u, s);
    const p = curPlayer();
    if (!humanTurn() || state.phase !== "action") { drawer = null; dEl.classList.add("hidden"); return; }
    dEl.classList.remove("hidden");
    const tName = st === "wild" ? (drawer.as ? `万能格 → ${MATERIALS[drawer.as].name}` : "万能格") : MATERIALS[st].name;
    $("#drawer-title").textContent = `${bodyName(bid)} · ${u + 1}单元 · ${tName}`;
    let html = "";
    if (st === "wild" && !drawer.as) {
      html = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">选择当作哪种物质打出：</div>`;
      const interNat = Game.matCount(p.hand, "inter");
      html += `<button class="drawer-opt" data-mode="natinter" ${interNat ? "" : "disabled"}>✦ 打出星际物质（作为星际物质）<span class="sub">手中 ${interNat} 张</span></button>`;
      for (const m of FILLABLE_TYPES) {
        const n = Game.matCount(p.hand, m);
        html += `<button class="drawer-opt" data-as="${m}">${MATERIALS[m].icon} 当作${MATERIALS[m].name}<span class="sub">（手中 ${n} 张 + 星际物质 ${interNat} 张）</span></button>`;
      }
    } else {
      const T = st === "wild" ? drawer.as : st;
      const nat = Game.matCount(p.hand, T);
      const inter = Game.matCount(p.hand, "inter");
      html += `<button class="drawer-opt" data-mode="nat" ${nat ? "" : "disabled"}>${MATERIALS[T].icon} 打出 1 张${MATERIALS[T].name}牌<span class="sub">手中 ${nat} 张</span></button>`;
      html += `<button class="drawer-opt" data-mode="inter" ${inter && T !== "inter" ? "" : "disabled"}>✦ 以星际物质作为${MATERIALS[T].name}<span class="sub">手中 ${inter} 张</span></button>`;
      for (const Y of Object.keys(MATERIALS)) {
        if (Y === T) continue;
        const cnt = Game.matCount(p.hand, Y);
        if (cnt >= 3) html += `<button class="drawer-opt" data-mode="t3" data-y="${Y}">${MATERIALS[Y].icon} 以 3 张${MATERIALS[Y].name}换作 1 张${MATERIALS[T].name}<span class="sub">手中 ${cnt} 张</span></button>`;
      }
      html += `<div style="font-size:11px;color:var(--text-dim);margin-top:2px">可继续点击其他空物质格叠加，然后统一打出</div>`;
    }
    $("#drawer-body").innerHTML = html;

    $$("#drawer-body .drawer-opt").forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.as) { drawer.as = btn.dataset.as; renderDrawer(); return; }
        const T = st === "wild" ? drawer.as : st;
        let card, desc;
        if (btn.dataset.mode === "natinter") { card = { c: "inter" }; desc = "✦星际物质"; }
        else if (btn.dataset.mode === "nat") { card = { c: T }; desc = MATERIALS[T].icon + MATERIALS[T].name; }
        else if (btn.dataset.mode === "inter") { card = { c: "inter", as: T }; desc = "✦→" + MATERIALS[T].name; }
        else { card = { t3: btn.dataset.y, as: T }; desc = `3×${MATERIALS[btn.dataset.y].icon}→${MATERIALS[T].name}`; }
        pendingFill.push({ bid, u, s, card, desc });
        drawer = null;
        render();
      };
    });
  }

  /* ================= 工具使用 ================= */
  function startToolUse(card) {
    const t = tpl(card.tid);
    const K = t.tool.kind;
    if (K === "autoFill") {
      slotPick = { kind: "autoFill", uid: card.uid, max: t.tool.maxSlots, picked: [] };
      toast("请在星盘上点选 1-2 个空物质格（无需物质牌）");
      render();
    } else if (K === "resetTokens") {
      slotPick = { kind: "resetTokens", uid: card.uid, max: t.tool.maxTokens, picked: [] };
      toast("请点选要移除的对手工程标记（1-2 个）");
      render();
    } else if (K === "stealMaterial") {
      let html = `<h3 style="margin-bottom:10px">物质抽调系统</h3>
        <p style="font-size:12.5px;color:var(--text-dim);margin-bottom:10px">选择对手与物质种类，夺走其手中该种类全部物质牌</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">` +
        state.players.map((pp, i) => i === state.seat ? "" :
          `<button class="btn btn-sm" data-tgt="${i}" style="border-color:${colorOf(i)}">${esc(pp.name)}（🃏${Game.matCount(pp.hand, "atmo") + Game.matCount(pp.hand, "rock") + Game.matCount(pp.hand, "water") + Game.matCount(pp.hand, "mag") + Game.matCount(pp.hand, "ring") + Game.matCount(pp.hand, "inter")}）</button>`).join("") +
        `</div><div style="display:flex;gap:6px;flex-wrap:wrap">` +
        Object.keys(MATERIALS).map(m => `<button class="btn btn-sm" data-mat="${m}">${MATERIALS[m].icon} ${MATERIALS[m].name}</button>`).join("") +
        `</div>`;
      openModal(html);
      let target = null;
      $$("[data-tgt]").forEach(b => b.onclick = () => {
        target = +b.dataset.tgt;
        $$("[data-tgt]").forEach(x => x.style.background = "");
        b.style.background = "rgba(110,231,255,0.15)";
      });
      $$("[data-mat]").forEach(b => b.onclick = () => {
        if (target == null) { toast("请先选择对手"); return; }
        closeModal();
        doMove({ type: "tool", uid: card.uid, params: { mat: b.dataset.mat, target } });
      });
    } else if (K === "take2FromLeader") {
      const maxScore = Math.max(...state.players.map(x => x.score));
      const leaders = state.players.filter(x => x.score === maxScore && x.idx !== state.seat);
      if (!leaders.length) {
        openModal(`<h3 style="margin-bottom:10px">物质调节网络</h3><p style="font-size:13px;margin-bottom:14px">当前你就是分数最高玩家，此牌无效果。</p>
          <div style="text-align:center"><button class="btn" onclick="document.getElementById('modal').classList.add('hidden')">关闭</button>
          <button class="btn btn-primary" id="m-still">仍然打出</button></div>`);
        $("#m-still").onclick = () => { closeModal(); doMove({ type: "tool", uid: card.uid, params: {} }); };
        return;
      }
      let html = `<h3 style="margin-bottom:10px">物质调节网络</h3>
        <p style="font-size:12.5px;color:var(--text-dim);margin-bottom:10px">从分数最高玩家（${maxScore} 分）手中随机抽 2 张物质牌</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">` +
        leaders.map(pp => `<button class="btn btn-primary" data-l="${pp.idx}">${esc(pp.name)}</button>`).join("") +
        `</div>`;
      openModal(html);
      $$("[data-l]").forEach(b => b.onclick = () => {
        closeModal();
        doMove({ type: "tool", uid: card.uid, params: { target: +b.dataset.l } });
      });
    } else if (K === "crossFill") {
      openModal(`<h3 style="margin-bottom:10px">跨星球填充装置</h3>
        <p style="font-size:13px;line-height:1.7;margin-bottom:14px">使用后，本次行动阶段的一次填充行动可以同时覆盖两颗不同星球的物质格。</p>
        <div style="text-align:center"><button class="btn btn-primary" id="m-ok">使用</button></div>`);
      $("#m-ok").onclick = () => { closeModal(); doMove({ type: "tool", uid: card.uid, params: {} }); };
    } else if (K === "doubleAction") {
      openModal(`<h3 style="margin-bottom:10px">双重动力</h3>
        <p style="font-size:13px;line-height:1.7;margin-bottom:14px">支付 1 分，本回合行动阶段可执行 <b>2 次</b>行动（当前 ${curPlayer().score} 分）。</p>
        <div style="text-align:center"><button class="btn btn-primary" id="m-ok2">支付并使用</button></div>`);
      $("#m-ok2").onclick = () => { closeModal(); doMove({ type: "tool", uid: card.uid, params: {} }); };
    }
  }

  function openModal(html) { $("#modal-box").innerHTML = html; $("#modal").classList.remove("hidden"); }
  function closeModal() { $("#modal").classList.add("hidden"); }

  /* ================= 星盘点击 ================= */
  function onBoardClick(ev) {
    const slotEl = ev.target.closest(".slot");
    if (!slotEl) return;
    const bid = slotEl.dataset.bid, u = +slotEl.dataset.u, s = +slotEl.dataset.s;
    const st = slotEl.dataset.st;
    if (slotPick) {
      if (slotPick.kind === "autoFill") {
        if (state.bodies[bid].formed) { toast("该星球已形成"); return; }
        if (state.bodies[bid].units[u][s] !== null) { toast("该格已被填充"); return; }
      } else {
        const owner = state.bodies[bid].units[u][s];
        if (owner == null || owner === state.seat) { toast("须选择其他玩家的工程标记"); return; }
      }
      const i = slotPick.picked.findIndex(x => x.bid === bid && x.u === u && x.s === s);
      if (i >= 0) slotPick.picked.splice(i, 1);
      else {
        if (slotPick.picked.length >= slotPick.max) { toast(`最多选择 ${slotPick.max} 个`); return; }
        slotPick.picked.push({ bid, u, s });
      }
      render();
      return;
    }
    if (humanTurn() && state.phase === "action" && slotEl.classList.contains("empty")) {
      drawer = { bid, u, s };
      renderDrawer();
    }
  }

  function renderSlotPickBar() {
    if (!slotPick) return "";
    const names = slotPick.picked.map(x => `${bodyName(x.bid)}·${x.u + 1}单元`).join("、");
    return `<div class="pending-bar">已选目标：${names || "（尚未选择）"}
      <button class="btn btn-sm btn-primary" id="sp-ok" ${slotPick.picked.length ? "" : "disabled"}>确认使用</button>
      <button class="btn btn-sm" id="sp-cancel">取消</button></div>`;
  }

  function bindSlotPick() {
    const ok = $("#sp-ok"); if (ok) ok.onclick = () => {
      doMove({ type: "tool", uid: slotPick.uid, params: { targets: slotPick.picked.slice() } }, { reset: true });
    };
    const cl = $("#sp-cancel"); if (cl) cl.onclick = () => { slotPick = null; render(); };
  }

  /* ================= 终局 ================= */
  function showGameOver() {
    const box = $("#gameover-box");
    const maxScore = Math.max(...state.players.map(p => p.score));
    const standings = state.players.map(p => ({ ...p })).sort((a, b) => b.score - a.score);
    const formed = state.formedOrder.map(bodyName).join("、");
    box.innerHTML = `
      <div class="go-title">🌌 太阳系再造${state.winners.length > 1 ? " —— 并列胜利！" : " 完成！"}</div>
      <div class="go-reason">终局原因：${esc(state.triggerReason || "—")} · 形成 ${state.formedOrder.length}/${BODIES.length} 颗天体</div>
      <div class="go-standings">
        ${standings.map((p, i) => `
          <div class="go-row ${p.score === maxScore ? "winner" : ""}">
            <span class="go-rank">${i + 1}</span>
            <span class="player-color" style="background:${colorOf(p.idx)}"></span>
            <span style="flex:1;font-weight:600">${esc(p.name)}${p.isAI ? " 🤖" : ""} ${state.winners.includes(p.idx) ? "🏆" : ""}</span>
            <span><b style="color:var(--gold);font-size:17px">${p.score}</b> 分 · ⬛${p.tokens}</span>
          </div>`).join("")}
      </div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:16px">形成的天体：${esc(formed || "无")}</div>
      <div class="go-actions">
        <button class="btn btn-primary" id="go-again">🔁 再来一局</button>
        <button class="btn" id="go-home">🏠 返回首页</button>
      </div>`;
    $("#overlay-gameover").classList.remove("hidden");
    $("#go-again").onclick = () => { $("#overlay-gameover").classList.add("hidden"); startGame(); };
    $("#go-home").onclick = backToStart;
  }

  /* ================= 帮助 ================= */
  function helpHtml() {
    return `<h2>📖 玩法说明</h2>
      <h3>目标</h3>
      <p>与 2-4 名玩家（或 AI 对手）竞逐再造太阳系。当有人达到 <b>${RULES.SCORE_TARGET} 分</b>或工程标记耗尽时，本轮结束后游戏结束，分数最高者获胜。</p>
      <h3>回合流程</h3>
      <ul>
        <li><b>工具阶段</b>：可打出工具类决策牌（自动填充、跨星球填充、双重动力、抽调、调节、重置），或直接进入行动。</li>
        <li><b>行动阶段</b>（每回合 1 次）：从以下选一——
          <ul>
            <li>🎴 <b>盲抽</b>：摸 3 张物质牌，然后放回公共区「数量最少且你持有」的种类 1 张。</li>
            <li>🛒 <b>拿公共牌</b>：拿走公共物质牌区某一<em>种类</em>的全部牌。</li>
            <li>🪐 <b>填充</b>：点击星盘空物质格，打出对应物质牌并放置 1 个工程标记；一次行动可填多格（同一颗星球；用到 2 种以上物质需按表扣分：2 种 -1 分 / 3 种 -3 分 / 4 种 -6 分…）。<b>星际物质 ✦</b>可作为任意种类打出；同种 3 张可「三换一」当作其他种类打出。</li>
            <li>🔁 <b>换决策牌</b>：弃任意决策牌，摸等量新牌。</li>
          </ul></li>
        <li><b>任务阶段</b>：打出满足条件的任务决策牌得分（部分任务须在打出当回合完成条件，如「本回合打出 3 张大气」）。</li>
        <li><b>弃牌调整</b>：手牌超过 ${RULES.HAND_LIMIT} 张时弃至 ${RULES.HAND_LIMIT} 张。</li>
      </ul>
      <h3>单元与形成结算</h3>
      <p>白色连线围成的一组物质格为「单元」；单元填满时，最后放置者摸 1 张物质牌。整颗天体全部填满即「形成」，按各玩家工程标记数排名发放名次分与奖励决策牌（课题标示的天体奖励更多 ★）。<b>2 人局</b>：须独立完成该天体至少 1 个完整单元才有结算资格。</p>
      <h3>任务牌</h3>
      <p>任务牌多为「参与形成某类星球」条件（填 1 格即算参与），随对局推进自然达成；「回合内打出 N 张 X」须在打出任务的同一回合完成；「跳过行动」类须本回合放弃行动并支付弃牌。任务完成后在任务阶段打出得分，终局时手牌中已完成任务也自动补分。</p>
      <h3>终局补分</h3>
      <p>游戏结束时，手牌中已完成的任务仍可展示得分。</p>
      <div class="close-row"><button class="btn btn-primary" id="help-close">明白了</button></div>`;
  }

  /* ================= 初始化 ================= */
  function init() {
    // 模式切换
    $$("input[name=mode]").forEach(r => r.onchange = () => {
      mode = r.value;
      renderStartControls();
    });
    renderStartControls();
    $("#btn-start").onclick = startGame;
    $("#btn-restart").onclick = () => {
      if (confirm("确定要放弃当前对局并重新开始吗？")) backToStart();
    };
    $("#mask-btn").onclick = () => { $("#overlay-mask").classList.add("hidden"); };
    $("#drawer-close").onclick = () => { drawer = null; renderDrawer(); };
    $("#board").addEventListener("click", onBoardClick);
    $("#modal").addEventListener("click", ev => { if (ev.target.id === "modal") closeModal(); });
    $("#btn-help-open").onclick = () => {
      $("#help-content").innerHTML = helpHtml();
      $("#help-modal").classList.remove("hidden");
      $("#help-close").onclick = () => $("#help-modal").classList.add("hidden");
    };
    $("#btn-help-game").onclick = () => {
      $("#help-content").innerHTML = helpHtml();
      $("#help-modal").classList.remove("hidden");
      $("#help-close").onclick = () => $("#help-modal").classList.add("hidden");
    };
    $("#help-modal").addEventListener("click", ev => {
      if (ev.target.id === "help-modal") $("#help-modal").classList.add("hidden");
    });
  }

  document.addEventListener("DOMContentLoaded", init);

  /* 调试句柄：暴露内部 state / render（生产无副作用） */
  const dbg = {
    get state() { return state; },
    render,
  };
  window.__dbg = dbg;

  return {};
})();
