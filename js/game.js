/* ============================================================
 * 宇宙星尘 — 纯函数规则引擎
 * API: Game.initState(config) / Game.applyMove(state, move) / 辅助查询
 * 依赖: data.js（先于本文件加载；Node 测试时用 eval 注入同一作用域）
 * ============================================================ */
"use strict";

const Game = (() => {

  /* ---------------- 工具 ---------------- */
  function rand(state) { // xorshift32
    let x = state.rngState | 0; if (!x) x = 0x9e3779b9;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    state.rngState = x | 0;
    return (state.rngState >>> 0) / 4294967296;
  }
  function shuffle(state, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(state) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  const bodyDef = id => BODIES.find(b => b.id === id);
  const isDecCard = c => typeof c === "object" && c !== null && !!c.tid;
  const matName = m => MATERIALS[m] ? MATERIALS[m].name : m;
  function clone(state) { return JSON.parse(JSON.stringify(state)); }

  /* ---------------- 初始化 ---------------- */
  function buildDecisionDeck(state) {
    const deck = [];
    for (const t of DECISION_TEMPLATES) {
      const n = DECISION_DECK_MULT[t.id] || 1;
      for (let i = 1; i <= n; i++) deck.push({ tid: t.id, uid: t.id + (i > 1 ? "#" + i : "") });
    }
    return shuffle(state, deck);
  }
  function buildMaterialDeck(state) {
    const deck = [];
    for (const [m, n] of Object.entries(MATERIAL_DECK)) for (let i = 0; i < n; i++) deck.push(m);
    return shuffle(state, deck);
  }

  function initState(config) {
    const players = config.players.map((p, i) => ({
      idx: i, name: p.name, isAI: !!p.isAI, color: p.color || null,
      score: 0, tokens: RULES.TOKENS_PER_PLAYER, hand: [],
    }));
    const n = players.length;
    if (n < 2 || n > 4) throw new Error("玩家数须为 2-4");

    const state = {
      rngState: (config.seed >>> 0) || (Date.now() >>> 0),
      nPlayers: n, players,
      bodies: {}, matLib: null, matDiscard: [], decLib: null, decDiscard: [],
      publicSupply: { atmo: 0, rock: 0, water: 0, mag: 0, ring: 0, inter: 0 },
      seat: 0, phase: "tool", round: 1,
      turnStats: null,
      persist: players.map(() => ({ playedCounts: {}, actionSkipped: false })),
      participated: players.map(() => ({})),
      unitCredits: players.map(() => ({})),
      soloFormed: players.map(() => []),
      formedOrder: [],
      lastRound: false, triggerSeat: -1, triggerReason: null,
      winners: null, log: [], topics: [],
    };
    for (const b of BODIES) {
      state.bodies[b.id] = { units: b.units.map(u => u.map(() => null)), formed: false, rewards: b.baseRewards, unitRewarded: [] };
    }
    state.matLib = buildMaterialDeck(state);
    state.decLib = buildDecisionDeck(state);
    // 公共物质牌区：翻 5 张按种类放置
    for (let i = 0; i < 5; i++) {
      const c = state.matLib.pop();
      if (c) state.publicSupply[c]++;
    }
    // 课题：随机 2 张，标示天体各放 1 个奖励标记
    const topicPool = shuffle(state, TOPICS.slice());
    for (let i = 0; i < RULES.TOPICS_PER_GAME; i++) {
      const t = topicPool[i];
      state.topics.push(t.id);
      for (const bid of t.bodies) state.bodies[bid].rewards += 1;
    }
    // 起始手牌
    const startMats = n === 2 ? RULES.START_MATERIAL_2P : n === 3 ? RULES.START_MATERIAL_3P : RULES.START_MATERIAL_4P;
    players.forEach((p, i) => {
      for (let k = 0; k < startMats[i]; k++) { const c = state.matLib.pop(); if (c) p.hand.push(c); }
      for (let k = 0; k < RULES.START_DECISIONS; k++) { const c = state.decLib.pop(); if (c) p.hand.push(c); }
    });
    newTurnStats(state);
    state.log.push(`游戏开始：${players.map(p => p.name).join("、")} 共同重建太阳系（课题：${state.topics.map(id => TOPICS.find(t => t.id === id).name).join("、")}）`);
    return state;
  }

  function newTurnStats(state) {
    state.turnStats = { playedCounts: {}, actionSkipped: false, crossFill: false, extraAction: 0, actionsDone: 0 };
  }

  /* ---------------- 摸牌 ---------------- */
  function drawMaterial(state, pIdx, n) {
    const p = state.players[pIdx]; let got = 0;
    for (let i = 0; i < n; i++) {
      if (!state.matLib.length) {
        if (!state.matDiscard.length) break;
        state.matLib = shuffle(state, state.matDiscard.splice(0));
      }
      const c = state.matLib.pop(); if (!c) break;
      p.hand.push(c); got++;
    }
    return got;
  }
  function drawDecision(state, pIdx, n) {
    const p = state.players[pIdx]; let got = 0;
    for (let i = 0; i < n; i++) {
      if (!state.decLib.length) {
        if (!state.decDiscard.length) break;
        state.decLib = shuffle(state, state.decDiscard.splice(0));
      }
      const c = state.decLib.pop(); if (!c) break;
      p.hand.push(c); got++;
    }
    return got;
  }
  function removeDecCard(hand, uid) {
    const i = hand.findIndex(c => isDecCard(c) && c.uid === uid);
    if (i < 0) return false;
    hand.splice(i, 1); return true;
  }
  function removeMatCard(hand, mat, n) {
    let left = n;
    for (let i = hand.length - 1; i >= 0 && left > 0; i--) {
      if (hand[i] === mat) { hand.splice(i, 1); left--; }
    }
    return left === 0;
  }
  function matCount(hand, mat) {
    let c = 0; for (const x of hand) if (x === mat) c++;
    return c;
  }

  /* ---------------- 星球查询 ---------------- */
  function slotType(bid, u, s) { return bodyDef(bid).units[u][s]; }
  function bodyTokenCounts(state, bid) {
    const b = state.bodies[bid]; const counts = {};
    for (const unit of b.units) for (const owner of unit) if (owner !== null) counts[owner] = (counts[owner] || 0) + 1;
    return counts;
  }
  function bodyFilledAll(state, bid) {
    return state.bodies[bid].units.every(unit => unit.every(o => o !== null));
  }
  function unitComplete(state, bid, u) {
    return state.bodies[bid].units[u].every(o => o !== null);
  }
  function unitSoleOwner(state, bid, u) {
    const owners = state.bodies[bid].units[u];
    if (owners.some(o => o === null)) return -1;
    const first = owners[0];
    return owners.every(o => o === first) ? first : -1;
  }
  function bodyEmptySlots(state, bid) {
    const out = [];
    const b = state.bodies[bid];
    b.units.forEach((unit, u) => unit.forEach((o, s) => { if (o === null) out.push({ u, s, type: slotType(bid, u, s) }); }));
    return out;
  }
  function bodyTotalSlots(bid) { return bodyDef(bid).units.reduce((a, u) => a + u.length, 0); }

  /* ---------------- 填充与结算 ----------------
   * assignments: [{ bid, u, s, card }]
   * card 三种规格：
   *   { c: mat }              自然打出（含 inter 填 inter 格）
   *   { c: "inter", as: mat } 星际物质指定为 as 使用
   *   { t3: mat, as: mat }    相同种类 3 张指定为 as 的 1 张打出
   */
  function cardEffectiveType(card) {
    if (card.t3) return card.as;
    if (card.c === "inter" && card.as) return card.as;
    return card.c;
  }
  function cardCost(card) { // 从手牌移除 {mat: n}
    if (card.t3) return { [card.t3]: 3 };
    return { [card.c]: 1 };
  }

  function validateFill(state, p, move) {
    const ts = state.turnStats;
    const assignments = move.assignments;
    if (!Array.isArray(assignments) || !assignments.length) return "至少填充 1 个物质格";
    const typesUsed = new Set(); const bodies = new Set();
    for (const a of assignments) {
      const b = state.bodies[a.bid];
      const def = bodyDef(a.bid);
      if (!b || !def) return "星球不存在";
      if (b.formed) return `${def.name} 已形成`;
      if (a.u == null || a.s == null || !def.units[a.u] || def.units[a.u][a.s] === undefined) return "物质格不存在";
      if (b.units[a.u][a.s] !== null) return "该物质格已被填充";
      if (!a.card) return "缺少物质牌指定";
      const eff = cardEffectiveType(a.card);
      if (!eff || !MATERIALS[eff]) return "物质牌种类无效";
      if (a.card.t3 && a.card.t3 === a.card.as) return "三换一不能指定为原种类";
      if (a.card.c === "inter" && a.card.as === "inter") return "星际物质无需指定为星际物质";
      const st = def.units[a.u][a.s];
      if (st !== "wild" && st !== eff) return `${matName(st)}格不能以${matName(eff)}填充`;
      typesUsed.add(eff); bodies.add(a.bid);
    }
    if (!ts.crossFill && bodies.size > 1) return "一次行动只能填充一颗星球（跨星球填充装置除外）";
    if (typesUsed.size > 1) {
      const cost = RULES.MULTI_TYPE_COST[typesUsed.size];
      if (!cost) return "种类数无效";
      if (p.score < cost) return `填充 ${typesUsed.size} 个种类需支付 ${cost} 分，分数不足`;
    }
    const need = {};
    for (const a of assignments) for (const [m, n] of Object.entries(cardCost(a.card))) need[m] = (need[m] || 0) + n;
    for (const [m, n] of Object.entries(need)) if (matCount(p.hand, m) < n) return `${matName(m)}牌不足`;
    if (p.tokens < assignments.length) return "工程标记不足";
    return null;
  }

  function doFill(state, pIdx, assignments) {
    const p = state.players[pIdx];
    const ts = state.turnStats;
    const typesUsed = new Set(assignments.map(a => cardEffectiveType(a.card)));
    for (const a of assignments) {
      for (const [m, n] of Object.entries(cardCost(a.card))) {
        // 打出的物质牌进入弃牌堆（循环利用），从手牌移除
        for (let k = 0; k < n; k++) {
          const idx = p.hand.lastIndexOf(m);
          if (idx >= 0) state.matDiscard.push(p.hand.splice(idx, 1)[0]);
        }
      }
      const eff = cardEffectiveType(a.card);
      ts.playedCounts[eff] = (ts.playedCounts[eff] || 0) + 1;
    }
    if (typesUsed.size > 1) {
      const cost = RULES.MULTI_TYPE_COST[typesUsed.size];
      p.score -= cost;
      state.log.push(`${p.name} 填充 ${typesUsed.size} 个种类，支付 ${cost} 分`);
    }
    const touchedBodies = new Set();
    for (const a of assignments) {
      const def = bodyDef(a.bid);
      state.bodies[a.bid].units[a.u][a.s] = pIdx;
      p.tokens -= 1;
      state.participated[pIdx][a.bid] = true;
      touchedBodies.add(a.bid);
      state.log.push(`${p.name} 以${matName(cardEffectiveType(a.card))}填充 ${def.name} 的一个物质格`);
    }
    for (const bid of touchedBodies) settleUnitsAndFormation(state, pIdx, bid);
    checkEndTrigger(state);
  }

  /* 填充后：单元奖励（摸牌 + 独立单元记录）与星球形成结算 */
  function settleUnitsAndFormation(state, pIdx, bid) {
    const def = bodyDef(bid);
    const b = state.bodies[bid];
    const p = state.players[pIdx];
    for (let u = 0; u < b.units.length; u++) {
      if (b.unitRewarded.includes(u)) continue;      // 已结算过的单元不再重复
      if (!unitComplete(state, bid, u)) continue;    // 尚未填满
      b.unitRewarded.push(u);
      const sole = unitSoleOwner(state, bid, u);
      if (sole >= 0) state.unitCredits[sole][bid] = (state.unitCredits[sole][bid] || 0) + 1;
      const got = drawMaterial(state, pIdx, 1);
      if (got) state.log.push(`${p.name} 填满 ${def.name} 的一个单元，摸 1 张物质牌`);
    }
    if (!b.formed && bodyFilledAll(state, bid)) settleFormation(state, bid);
  }

  function settleFormation(state, bid) {
    const def = bodyDef(bid);
    const b = state.bodies[bid];
    b.formed = true;
    state.formedOrder.push(bid);
    state.log.push(`✨ ${def.name} 形成了！`);

    // 参与者按工程标记数排名
    const counts = bodyTokenCounts(state, bid);
    let parts = Object.entries(counts).map(([pi, c]) => ({ p: +pi, c }));
    parts.sort((a, z) => z.c - a.c || a.p - z.p);
    // 2 人局：须独立完成该星球至少 1 个完整单元才有资格
    if (state.nPlayers === 2) {
      parts = parts.filter(pt => (state.unitCredits[pt.p][bid] || 0) >= 1);
      if (!parts.length) state.log.push(`2 人局规则：无人独立完成 ${def.name} 的完整单元，无分数与决策牌发放`);
    }
    // 名次分组（并列取较高名次分数，后续名次顺延）
    const groups = [];
    for (const pt of parts) {
      if (groups.length && groups[groups.length - 1][0].c === pt.c) groups[groups.length - 1].push(pt);
      else groups.push([pt]);
    }
    const scored = [];
    groups.forEach((g, gi) => {
      const pts = def.scores[gi];
      if (pts != null) for (const pt of g) { pt.pts = pts; scored.push(pt); }
    });
    for (const pt of scored) {
      state.players[pt.p].score += pt.pts;
      state.log.push(`${state.players[pt.p].name} 在 ${def.name} 名次结算中获得 ${pt.pts} 分`);
    }
    // 决策牌发放：奖励标记数 = 发放张数；获分玩家按名次顺序循环摸取
    if (b.rewards > 0 && scored.length > 0) {
      let left = b.rewards, i = 0, total = 0;
      while (left > 0 && total < 1000) {
        const pt = scored[i % scored.length];
        i++; total++;
        const got = drawDecision(state, pt.p, 1);
        if (got) left--;
        else if (!state.decDiscard.length) break;
      }
      state.log.push(`${def.name} 发放了 ${b.rewards} 张决策牌奖励`);
    }
    b.rewards = 0;
    // 独立完成记录（用于小天体任务）
    const owners = [];
    b.units.forEach(u => u.forEach(o => owners.push(o)));
    if (owners.length && owners.every(o => o === owners[0])) {
      state.soloFormed[owners[0]].push(bid);
      state.log.push(`${state.players[owners[0]].name} 独立完成了 ${def.name} 的形成`);
    }
    checkEndTrigger(state);
  }

  /* ---------------- 终局判定 ---------------- */
  function checkEndTrigger(state) {
    if (state.lastRound) return;
    for (const p of state.players) {
      if (p.score >= RULES.SCORE_TARGET) { state.lastRound = true; state.triggerSeat = state.seat; state.triggerReason = `${p.name} 到达 ${p.score} 分`; return; }
      if (p.tokens <= 0) { state.lastRound = true; state.triggerSeat = state.seat; state.triggerReason = `${p.name} 的工程标记用完`; return; }
    }
  }

  function advanceTurn(state) {
    state.persist[state.seat] = { playedCounts: { ...state.turnStats.playedCounts }, actionSkipped: state.turnStats.actionSkipped };
    const next = (state.seat + 1) % state.nPlayers;
    if (state.lastRound && next === 0) { endGame(state); return; }
    if (next === 0) state.round++;
    state.seat = next;
    state.phase = "tool";
    newTurnStats(state);
    state.log.push(`—— 轮到 ${state.players[next].name}（第 ${state.round} 轮）`);
  }

  /* ---------------- 任务（mission）校验 ---------------- */
  function costPayable(hand, cost) {
    const need = {};
    let anyNeed = 0;
    for (const c of cost) { if (c.mat === "any") anyNeed += c.n; else need[c.mat] = (need[c.mat] || 0) + c.n; }
    let matsInHand = 0;
    for (const c of hand) if (!isDecCard(c)) matsInHand++;
    let fixed = 0;
    for (const n of Object.values(need)) fixed += n;
    for (const [m, n] of Object.entries(need)) if (matCount(hand, m) < n) return false;
    return matsInHand - fixed >= anyNeed;
  }
  function payCost(state, hand, cost) {
    for (const c of cost) {
      if (c.mat === "any") {
        for (let i = 0; i < c.n; i++) {
          const idx = hand.findIndex(x => !isDecCard(x));
          if (idx >= 0) state.matDiscard.push(hand.splice(idx, 1)[0]);
        }
      } else {
        let left = c.n;
        for (let i = hand.length - 1; i >= 0 && left > 0; i--) {
          if (hand[i] === c.mat) { state.matDiscard.push(hand.splice(i, 1)[0]); left--; }
        }
      }
    }
  }

  function missionValid(state, pIdx, tid, usePersist) {
    const t = DECISION_TEMPLATES.find(x => x.id === tid);
    if (!t || !t.mission) return false;
    const m = t.mission;
    const p = state.players[pIdx];
    const stats = usePersist ? state.persist[pIdx] : state.turnStats;
    switch (m.kind) {
      case "playedCards":
        return (stats.playedCounts[m.mat] || 0) >= m.n;
      case "skipDiscard":
        return stats.actionSkipped === true && costPayable(p.hand, m.cost);
      case "participateFormed":
        if (!state.bodies["A1"].formed) return false;
        if (!state.participated[pIdx]["A1"]) return false;
        return BODIES.some(b => b.category === m.needCategory && state.bodies[b.id].formed && state.participated[pIdx][b.id]);
      case "participateCategory":
        return participatedCategoryCount(state, pIdx, m.cat) >= m.n;
      case "soloFormed":
        return state.soloFormed[pIdx].some(bid => bodyDef(bid).category === m.needCategory);
      case "bodiesFormed":
        return m.bodies.every(bid => state.bodies[bid].formed);
      default: return false;
    }
  }

  /* 参与且已形成的某类别星球数（用于 participateCategory 任务） */
  function participatedCategoryCount(state, pIdx, cat) {
    return BODIES.filter(b => b.category === cat
      && state.bodies[b.id].formed
      && state.participated[pIdx][b.id]).length;
  }

  /* 任务进度查询（UI 显示用）：{ done, cur, need } 或 { done, cost } */
  function missionProgress(state, pIdx, tid, usePersist) {
    const t = DECISION_TEMPLATES.find(x => x.id === tid);
    if (!t || !t.mission) return null;
    const m = t.mission;
    const stats = usePersist ? state.persist[pIdx] : state.turnStats;
    switch (m.kind) {
      case "playedCards":
        return { done: (stats.playedCounts[m.mat] || 0) >= m.n, cur: stats.playedCounts[m.mat] || 0, need: m.n };
      case "skipDiscard":
        return { done: stats.actionSkipped === true && costPayable(state.players[pIdx].hand, m.cost), skipped: stats.actionSkipped === true };
      case "participateFormed": {
        const sun = state.bodies["A1"].formed && state.participated[pIdx]["A1"] ? 1 : 0;
        const planet = BODIES.filter(b => b.category === m.needCategory && state.bodies[b.id].formed && state.participated[pIdx][b.id]).length > 0 ? 1 : 0;
        return { done: missionValid(state, pIdx, tid, usePersist), cur: sun + planet, need: 2 };
      }
      case "participateCategory": {
        const cur = participatedCategoryCount(state, pIdx, m.cat);
        return { done: cur >= m.n, cur, need: m.n };
      }
      case "soloFormed": {
        const cur = state.soloFormed[pIdx].filter(bid => bodyDef(bid).category === m.needCategory).length;
        return { done: cur >= 1, cur, need: 1 };
      }
      case "bodiesFormed": {
        const cur = m.bodies.filter(bid => state.bodies[bid].formed).length;
        return { done: cur === m.bodies.length, cur, need: m.bodies.length };
      }
      default: return null;
    }
  }

  /* ---------------- 工具效果 ---------------- */
  function applyToolEffect(state, pIdx, t, params) {
    const p = state.players[pIdx];
    const tool = t.tool;
    switch (tool.kind) {
      case "autoFill": {
        const targets = params.targets || [];
        if (!Array.isArray(targets) || targets.length < 1 || targets.length > tool.maxSlots) throw new Error("自动填充装置需指定 1-2 个物质格");
        for (const x of targets) {
          const b = state.bodies[x.bid];
          if (!b || b.formed) throw new Error("目标星球不存在或已形成");
          const def = bodyDef(x.bid);
          if (def.units[x.u] == null || def.units[x.u][x.s] === undefined) throw new Error("目标物质格不存在");
          if (b.units[x.u][x.s] !== null) throw new Error("目标物质格已被填充");
        }
        if (p.tokens < targets.length) throw new Error("工程标记不足");
        const touched = new Set();
        for (const x of targets) {
          state.bodies[x.bid].units[x.u][x.s] = pIdx;
          p.tokens -= 1;
          state.participated[pIdx][x.bid] = true;
          touched.add(x.bid);
          state.log.push(`${p.name} 用自动填充装置填充 ${bodyDef(x.bid).name} 的一个物质格`);
        }
        for (const bid of touched) settleUnitsAndFormation(state, pIdx, bid);
        checkEndTrigger(state);
        return;
      }
      case "crossFill":
        state.turnStats.crossFill = true;
        state.log.push(`${p.name} 启用跨星球填充装置`);
        return;
      case "doubleAction": {
        if (p.score < 1) throw new Error("分数不足以支付双重动力");
        p.score -= 1;
        state.turnStats.extraAction += 1;
        state.log.push(`${p.name} 支付 1 分，本回合行动阶段执行 2 次`);
        return;
      }
      case "stealMaterial": {
        const mat = params.mat, target = params.target;
        if (!MATERIALS[mat]) throw new Error("物质种类无效");
        if (target === pIdx) throw new Error("不能指定自己");
        const tp = state.players[target];
        const got = matCount(tp.hand, mat);
        removeMatCard(tp.hand, mat, got);
        for (let i = 0; i < got; i++) p.hand.push(mat);
        state.log.push(`${p.name} 用物质抽调系统从 ${tp.name} 处获得 ${got} 张${matName(mat)}牌`);
        return;
      }
      case "take2FromLeader": {
        const maxScore = Math.max(...state.players.map(x => x.score));
        const leaders = state.players.filter(x => x.score === maxScore);
        if (leaders.length === 1 && leaders[0].idx === pIdx) { state.log.push(`${p.name} 自己是分数最高玩家，物质调节网络无效果`); return; }
        const cands = leaders.filter(x => x.idx !== pIdx);
        if (!cands.length) { state.log.push(`${p.name} 的物质调节网络无效果`); return; }
        let target;
        if (params.target != null && cands.some(x => x.idx === params.target)) target = params.target;
        else target = cands[0].idx;
        const tp = state.players[target];
        const matIdxs = [];
        tp.hand.forEach((c, i) => { if (!isDecCard(c)) matIdxs.push(i); });
        let taken = 0;
        for (let k = 0; k < 2 && matIdxs.length; k++) {
          const pickIdx = Math.floor(rand(state) * matIdxs.length);
          const pick = matIdxs.splice(pickIdx, 1)[0];
          p.hand.push(tp.hand[pick]);
          tp.hand.splice(pick, 1);
          for (let j = 0; j < matIdxs.length; j++) if (matIdxs[j] > pick) matIdxs[j]--;
          taken++;
        }
        state.log.push(`${p.name} 用物质调节网络从 ${tp.name} 手中抽取 ${taken} 张物质牌`);
        return;
      }
      case "resetTokens": {
        const targets = params.targets || [];
        if (!Array.isArray(targets) || targets.length < 1 || targets.length > tool.maxTokens) throw new Error("工程重置模式需指定 1-2 个物质格");
        for (const x of targets) {
          const b = state.bodies[x.bid];
          if (!b || b.formed) throw new Error("目标星球不存在或已形成");
          const owner = b.units[x.u] && b.units[x.u][x.s];
          if (owner == null || owner === pIdx) throw new Error("目标格须为其他玩家的工程标记");
        }
        for (const x of targets) {
          const owner = state.bodies[x.bid].units[x.u][x.s];
          state.bodies[x.bid].units[x.u][x.s] = null;
          state.players[owner].tokens += 1;
          state.log.push(`${p.name} 用工程重置模式移除了 ${state.players[owner].name} 在 ${bodyDef(x.bid).name} 上的工程标记`);
        }
        return;
      }
      default: throw new Error("未知工具效果");
    }
  }

  /* ---------------- 盲抽放回合法性 ---------------- */
  function legalReturnTypes(state) {
    const p = state.players[state.seat];
    const supplyOrder = Object.keys(MATERIALS).sort((a, b) => state.publicSupply[a] - state.publicSupply[b]);
    const held = supplyOrder.filter(m => matCount(p.hand, m) > 0);
    if (!held.length) return [];
    const minCount = state.publicSupply[held[0]];
    return held.filter(m => state.publicSupply[m] === minCount);
  }

  /* ---------------- 行动 ---------------- */
  function finishAction(state) {
    // 行动计数：完成一次行动后决定下一阶段
    const ts = state.turnStats;
    ts.actionsDone += 1;
    if (ts.actionsDone >= 1 + ts.extraAction) state.phase = "mission";
    else state.log.push(`${state.players[state.seat].name} 还有 1 次行动（双重动力）`);
  }

  function applyAction(state, move) {
    const p = state.players[state.seat];
    const ts = state.turnStats;
    switch (move.action) {
      case "blind": {
        // 两步式盲抽：先摸 3 张，进入放回选择阶段
        drawMaterial(state, state.seat, RULES.BLIND_DRAW);
        if (!legalReturnTypes(state).length) throw new Error("盲抽后手中无物质牌可放回");
        state.log.push(`${p.name} 盲抽 3 张物质牌`);
        state.phase = "blindReturn";
        break;
      }
      case "takePublic": {
        const m = move.mat;
        if (!MATERIALS[m]) throw new Error("物质种类无效");
        if (state.publicSupply[m] <= 0) throw new Error("该种类公共区没有牌");
        const n = state.publicSupply[m];
        state.publicSupply[m] = 0;
        for (let i = 0; i < n; i++) p.hand.push(m);
        state.log.push(`${p.name} 拿取公共物质牌区全部 ${n} 张${matName(m)}牌`);
        finishAction(state);
        break;
      }
      case "fill": {
        const err = validateFill(state, p, move);
        if (err) throw new Error(err);
        doFill(state, state.seat, move.assignments);
        finishAction(state);
        break;
      }
      case "exchange": {
        const uids = move.discards || [];
        if (!Array.isArray(uids) || !uids.length) throw new Error("至少弃 1 张决策牌");
        for (const uid of uids) if (!p.hand.some(c => isDecCard(c) && c.uid === uid)) throw new Error("决策牌不在手牌中");
        for (const uid of uids) {
          const card = p.hand.find(c => isDecCard(c) && c.uid === uid);
          removeDecCard(p.hand, uid);
          state.decDiscard.push({ tid: card.tid, uid });
        }
        drawDecision(state, state.seat, uids.length);
        state.log.push(`${p.name} 换取了 ${uids.length} 张决策牌`);
        finishAction(state);
        break;
      }
      case "skip": {
        ts.actionSkipped = true;
        state.log.push(`${p.name} 跳过了本回合的行动阶段`);
        finishAction(state);
        break;
      }
      default: throw new Error("未知行动");
    }
  }

  /* ---------------- 单个 move 执行 ---------------- */
  function applyMoveInner(state, move) {
    const p = state.players[state.seat];
    switch (move.type) {
      case "tool": {
        if (state.phase !== "tool") throw new Error("当前不在工具阶段");
        const card = p.hand.find(c => isDecCard(c) && c.uid === move.uid);
        if (!card) throw new Error("决策牌不在手牌中");
        const t = DECISION_TEMPLATES.find(x => x.id === card.tid);
        if (!t || !t.tool) throw new Error("该决策牌没有工具效果");
        applyToolEffect(state, state.seat, t, move.params || {});
        removeDecCard(p.hand, move.uid);
        state.decDiscard.push({ tid: card.tid, uid: move.uid });
        break;
      }
      case "toAction": {
        if (state.phase !== "tool") throw new Error("当前不在工具阶段");
        state.phase = "action";
        break;
      }
      case "action": {
        if (state.phase !== "action") throw new Error("当前不在行动阶段");
        applyAction(state, move);
        break;
      }
      case "mission": {
        if (state.phase !== "mission") throw new Error("当前不在任务阶段");
        const uids = move.cards || [];
        if (!Array.isArray(uids) || !uids.length) throw new Error("至少打出 1 张决策牌");
        for (const uid of uids) {
          const card = p.hand.find(c => isDecCard(c) && c.uid === uid);
          if (!card) throw new Error("决策牌不在手牌中");
          const t = DECISION_TEMPLATES.find(x => x.id === card.tid);
          if (!t || !t.mission) throw new Error("该决策牌没有任务效果");
          if (!missionValid(state, state.seat, t.id, false)) throw new Error(`「${t.name}」的任务尚未完成`);
          const m = t.mission;
          if (m.kind === "skipDiscard") payCost(state, p.hand, m.cost);
          p.score += m.pts;
          state.log.push(`${p.name} 完成任务「${t.name}」，获得 ${m.pts} 分`);
          removeDecCard(p.hand, uid);
          state.decDiscard.push({ tid: card.tid, uid });
        }
        drawDecision(state, state.seat, uids.length);
        checkEndTrigger(state);
        break;
      }
      case "blindReturn": {
        if (state.phase !== "blindReturn") throw new Error("当前不在盲抽放回阶段");
        const legal = legalReturnTypes(state);
        if (!legal.length) throw new Error("手牌中没有物质牌可供放回");
        if (!legal.includes(move.returnCard)) throw new Error(`须放回公共区数量最少种类（${legal.map(matName).join("/")}）`);
        removeMatCard(p.hand, move.returnCard, 1);
        state.publicSupply[move.returnCard] += 1;
        state.log.push(`${p.name} 放回 1 张${matName(move.returnCard)}到公共物质牌区`);
        finishAction(state);
        break;
      }
      case "pass": {
        if (state.phase === "tool") { state.phase = "action"; break; }
        if (state.phase === "mission") {
          if (p.hand.length > RULES.HAND_LIMIT) {
            state.phase = "handcheck";
            state.log.push(`${p.name} 手牌超过 ${RULES.HAND_LIMIT} 张，需弃牌`);
          } else advanceTurn(state);
          break;
        }
        throw new Error("当前阶段不能跳过");
      }
      case "discard": {
        if (state.phase !== "handcheck") throw new Error("当前不在弃牌检查阶段");
        const cards = move.cards || [];
        const need = p.hand.length - RULES.HAND_LIMIT;
        if (cards.length !== need) throw new Error(`须恰好弃 ${need} 张牌`);
        const matSpecs = cards.filter(c => c.k === "m");
        const decSpecs = cards.filter(c => c.k === "d");
        const matNeed = {};
        for (const spec of matSpecs) matNeed[spec.mat] = (matNeed[spec.mat] || 0) + 1;
        for (const [m, n] of Object.entries(matNeed)) if (matCount(p.hand, m) < n) throw new Error(`${matName(m)}牌不足`);
        for (const spec of decSpecs) if (!p.hand.some(c => isDecCard(c) && c.uid === spec.uid)) throw new Error("决策牌不在手牌中");
        for (const [m, n] of Object.entries(matNeed)) removeMatCard(p.hand, m, n);
        for (const spec of decSpecs) {
          const c = p.hand.find(x => isDecCard(x) && x.uid === spec.uid);
          state.decDiscard.push({ tid: c.tid, uid: spec.uid });
          removeDecCard(p.hand, spec.uid);
        }
        for (let i = 0; i < matSpecs.length; i++) state.matDiscard.push(matSpecs[i].mat);
        state.log.push(`${p.name} 弃置 ${need} 张手牌至 ${RULES.HAND_LIMIT} 张`);
        advanceTurn(state);
        break;
      }
      default: throw new Error("未知 move 类型");
    }
  }

  /* ---------------- 终局 ---------------- */
  function endGame(state) {
    state.phase = "gameover";
    // 终局补分：手牌中已完成的任务仍可展示得分
    for (let i = 0; i < state.nPlayers; i++) {
      const p = state.players[i];
      for (const c of p.hand.filter(isDecCard).slice()) {
        const t = DECISION_TEMPLATES.find(x => x.id === c.tid);
        if (t && t.mission && missionValid(state, i, t.id, true)) {
          const m = t.mission;
          if (m.kind === "skipDiscard") payCost(state, p.hand, m.cost);
          p.score += m.pts;
          removeDecCard(p.hand, c.uid);
          state.decDiscard.push({ tid: c.tid, uid: c.uid });
          state.log.push(`终局补分：${p.name} 展示任务「${t.name}」，获得 ${m.pts} 分`);
        }
      }
    }
    const maxScore = Math.max(...state.players.map(x => x.score));
    state.winners = state.players.filter(x => x.score === maxScore).map(x => x.idx);
    state.log.push(`游戏结束！${state.winners.map(i => state.players[i].name).join("、")} 以 ${maxScore} 分获胜！（${state.triggerReason || ""}）`);
  }

  /* ---------------- 对外 API ---------------- */
  function applyMove(state, move) {
    if (state.phase === "gameover") return { ok: false, error: "游戏已结束", state };
    const s = clone(state);
    try {
      applyMoveInner(s, move);
      return { ok: true, state: s };
    } catch (e) {
      return { ok: false, error: e.message, state };
    }
  }

  return {
    initState, applyMove,
    legalReturnTypes, missionValid, missionProgress, validateFill,
    bodyDef, slotType, bodyTokenCounts, bodyFilledAll, bodyEmptySlots, bodyTotalSlots,
    unitComplete, unitSoleOwner, matCount, isDecCard, matName, cardEffectiveType,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Game;
