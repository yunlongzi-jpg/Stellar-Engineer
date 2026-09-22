/* ============================================================
 * 宇宙星尘 — 启发式 AI 对手
 * 策略：候选生成 + 真实模拟评估（直接用规则引擎 applyMove 模拟结果）
 * 依赖: data.js / game.js（先于本文件加载）
 * API: AI.chooseMove(state) → 合法 move（或 null 表示无从选择）
 * ============================================================ */
"use strict";

const AI = (() => {

  const ME = st => st.seat;

  /* ---------- 模拟：按序执行 moves，任一步失败返回 null ---------- */
  function simSeq(state, moves) {
    let s = state;
    for (const m of moves) {
      const r = Game.applyMove(s, m);
      if (!r.ok) return null;
      s = r.state;
    }
    return s;
  }
  function sim(state, move) { return simSeq(state, [move]); }

  /* 盲抽两步自动完成：摸 3 → 放回手中最多的合法种类 */
  function applyAuto(state, move) {
    if (move && move.type === "action" && move.action === "blind") {
      const s1 = sim(state, move);
      if (!s1) return null;
      const legal = Game.legalReturnTypes(s1);
      if (!legal.length) return null;
      const p = s1.players[s1.seat];
      const pick = legal.slice().sort((a, z) => Game.matCount(p.hand, z) - Game.matCount(p.hand, a))[0];
      return sim(s1, { type: "blindReturn", returnCard: pick });
    }
    return sim(state, move);
  }

  /* ---------- 局面评估（视角：当前座位玩家） ---------- */
  function evaluate(state, me) {
    if (state.phase === "gameover") {
      if (state.winners && state.winners.includes(me)) return state.winners.length > 1 ? 400 : 1000;
      return -1000;
    }
    let val = 0;
    const my = state.players[me];
    let oppBest = -Infinity;
    state.players.forEach((p, i) => { if (i !== me) oppBest = Math.max(oppBest, p.score); });
    val += (my.score - oppBest) * 1.0;
    // 手牌价值
    for (const c of my.hand) val += Game.isDecCard(c) ? 0.22 : 0.11;
    // 盘面期望份额
    for (const b of BODIES) {
      const bs = state.bodies[b.id];
      if (bs.formed) continue;
      const counts = Game.bodyTokenCounts(state, b.id);
      const mine = counts[me] || 0;
      const total = Object.values(counts).reduce((a, x) => a + x, 0) + Game.bodyEmptySlots(state, b.id).length;
      if (mine > 0) {
        const share = mine / Math.max(total, 1);
        val += b.scores.reduce((a, x) => a + x, 0) * share * 0.45;
        if (bs.rewards > 0) val += bs.rewards * 0.12;
      }
    }
    // 手中可直接完成的任务
    for (const c of my.hand) {
      if (Game.isDecCard(c) && Game.missionValid(state, me, c.tid, false)) val += 1.6;
    }
    // 手中未完成任务的推进程度（鼓励朝任务目标填充星球）
    for (const c of my.hand) {
      if (!Game.isDecCard(c)) continue;
      const prog = Game.missionProgress(state, me, c.tid, false);
      if (prog && !prog.done && prog.need != null && prog.cur > 0) val += prog.cur * 0.35;
      else if (prog && !prog.done && prog.skipped) val += 0.4; // 已跳过行动，只差弃牌
    }
    return val;
  }

  /* ---------- 物质牌需求度（用于弃牌与偷牌目标） ---------- */
  function typeDemand(state, me) {
    const demand = { atmo: 0, rock: 0, water: 0, mag: 0, ring: 0, inter: 0.5 };
    for (const b of BODIES) {
      const bs = state.bodies[b.id];
      if (bs.formed) continue;
      const counts = Game.bodyTokenCounts(state, b.id);
      const mine = counts[me] || 0;
      if (mine === 0 && b.scores[0] < 4) continue; // 没参与的低分星球不追
      const total = Object.values(counts).reduce((a, x) => a + x, 0);
      for (const s of Game.bodyEmptySlots(state, b.id)) {
        if (s.type === "wild") { for (const k of Object.keys(demand)) demand[k] += 0.2; }
        else demand[s.type] += 0.3 + b.scores[0] * 0.05;
      }
    }
    return demand;
  }

  /* ---------- 为类型 t 生成 n 张牌的打出规格（自然牌优先，星际物质指定补足） ---------- */
  function makeCards(hand, t, n) {
    const nat = Game.matCount(hand, t);
    const inter = Game.matCount(hand, "inter");
    const out = [];
    const useNat = Math.min(nat, n);
    const useInter = Math.min(inter, n - useNat);
    if (useNat + useInter < n) return null;
    for (let i = 0; i < useNat; i++) out.push({ c: t });
    for (let i = 0; i < useInter; i++) out.push({ c: "inter", as: t });
    return out;
  }

  /* ---------- 行动候选生成 ---------- */
  function fillCandidates(state) {
    const p = state.players[ME(state)];
    const cands = [];
    for (const b of BODIES) {
      const bs = state.bodies[b.id];
      if (bs.formed) continue;
      const empty = Game.bodyEmptySlots(state, b.id);
      if (!empty.length || !p.tokens) continue;
      for (const t of Object.keys(MATERIALS)) {
        let slots = empty.filter(s => s.type === t || s.type === "wild");
        if (!slots.length) continue;
        const avail = Game.matCount(p.hand, t) + (t !== "inter" ? Game.matCount(p.hand, "inter") : 0);
        if (!avail) continue;
        const n = Math.min(slots.length, avail, p.tokens);
        // 选格：优先单元内剩余空格少的（更容易触发单元奖励/形成）
        slots = slots.slice().sort((a, z) => a.u - z.u);
        const chosen = slots.slice(0, n);
        const cards = makeCards(p.hand, t, n);
        if (!cards) continue;
        const assignments = chosen.map((s, i) => ({ bid: b.id, u: s.u, s: s.s, card: cards[i] }));
        cands.push({ move: { type: "action", action: "fill", assignments }, key: b.id + ":" + t });
      }
      // 多种类完整填充（终局冲刺）
      const combo = comboFill(state, b, empty);
      if (combo) cands.push(combo);
    }
    return cands;
  }

  function comboFill(state, b, empty) {
    const p = state.players[ME(state)];
    if (!empty.length || empty.length > 6 || p.tokens < empty.length) return null;
    // 万能格指定为手中可打出数量最多的种类
    const counts = {};
    for (const m of p.hand) if (typeof m === "string") counts[m] = (counts[m] || 0) + 1;
    const best = Object.keys(counts).sort((a, z) => counts[z] - counts[a])[0];
    if (!best) return null;
    // 按有效类型分组（万能格归入 best）
    const byType = {};
    empty.forEach((s, i) => {
      const t = s.type === "wild" ? best : s.type;
      (byType[t] = byType[t] || []).push(i);
    });
    const finalAssign = [];
    for (const [t, idxs] of Object.entries(byType)) {
      const cards = makeCards(p.hand, t, idxs.length);
      if (!cards) return null;
      idxs.forEach((ei, k) => { finalAssign[ei] = { bid: b.id, u: empty[ei].u, s: empty[ei].s, card: cards[k] }; });
    }
    const nTypes = Object.keys(byType).length;
    if (nTypes > 1 && p.score < (RULES.MULTI_TYPE_COST[nTypes] || 99)) return null;
    return { move: { type: "action", action: "fill", assignments: finalAssign }, key: b.id + ":combo" };
  }

  /* ---------- 无工具时的最佳行动 ---------- */
  function bestAction(state) {
    const p = state.players[ME(state)];
    const cands = [];
    // 盲抽（放回选择在模拟中自动完成；手牌无物质也可抽——模拟失败会自动过滤）
    cands.push({ move: { type: "action", action: "blind" }, key: "blind" });
    // 拿公共
    for (const t of Object.keys(MATERIALS)) {
      if (state.publicSupply[t] > 0) cands.push({ move: { type: "action", action: "takePublic", mat: t }, key: "pub:" + t });
    }
    // 填充
    for (const c of fillCandidates(state)) cands.push(c);
    // 换决策
    const decs = p.hand.filter(Game.isDecCard);
    if (decs.length >= 2) {
      const dead = decs.filter(c => {
        const t = DECISION_TEMPLATES.find(x => x.id === c.tid);
        return t && !Game.missionValid(state, ME(state), c.tid, false);
      }).map(c => c.uid);
      if (dead.length >= 2) cands.push({ move: { type: "action", action: "exchange", discards: dead.slice(0, 3) }, key: "exch" });
    }
    // 跳过（配合弃牌任务）
    for (const c of decs) {
      const t = DECISION_TEMPLATES.find(x => x.id === c.tid);
      if (t && t.mission && t.mission.kind === "skipDiscard") cands.push({ move: { type: "action", action: "skip" }, key: "skip" });
    }
    let best = null, bestVal = -Infinity, bestMove = null;
    for (const c of cands) {
      const s = applyAuto(state, c.move);
      if (!s) continue;
      let v = evaluate(s, ME(state));
      // skip 行动要联动任务模拟
      if (c.key === "skip") {
        const decs2 = s.players[ME(state)].hand.filter(Game.isDecCard);
        const playable = decs2.filter(cc => {
          const t = DECISION_TEMPLATES.find(x => x.id === cc.tid);
          return t && t.mission && t.mission.kind === "skipDiscard" && Game.missionValid(s, ME(state), t.id, false);
        });
        if (!playable.length) continue;
        const s2 = sim(s, { type: "mission", cards: playable.map(x => x.uid) });
        if (s2) v = evaluate(s2, ME(state));
        else continue;
      }
      if (v > bestVal) { bestVal = v; bestMove = c.move; }
    }
    return bestMove ? { move: bestMove, val: bestVal } : null;
  }

  /* ---------- 工具阶段 ---------- */
  function chooseTool(state) {
    const me = ME(state);
    const p = state.players[me];
    const base = bestAction(state);
    const baseVal = base ? base.val : evaluate(state, me);
    let bestTool = null, bestVal = baseVal + 0.05; // 工具须优于不用
    const decs = p.hand.filter(Game.isDecCard);
    for (const card of decs) {
      const t = DECISION_TEMPLATES.find(x => x.id === card.tid);
      if (!t || !t.tool) continue;
      const moves = toolMoves(state, t, card);
      for (const tm of moves) {
        if (t.tool.kind === "doubleAction") {
          // 双重动力：工具 → toAction → 两个行动
          const a1 = base ? base.move : null;
          if (!a1) continue;
          const s1 = sim(state, tm);
          if (!s1) continue;
          const s2 = sim(s1, { type: "toAction" });
          if (!s2) continue;
          const act1 = applyAuto(s2, a1);
          if (!act1) continue;
          const second = bestAction(act1);
          const finalS = second ? applyAuto(act1, second.move) : sim(act1, { type: "pass" });
          if (finalS) {
            const v = evaluate(finalS, me);
            if (v > bestVal) { bestVal = v; bestTool = tm; }
          }
          continue;
        }
        if (t.tool.kind === "crossFill") {
          // 跨星球：找两个同类型、不同星球的填充合并
          const combos = crossCombos(state);
          for (const cc of combos) {
            const s1 = sim(state, tm);
            if (!s1) continue;
            const s2 = sim(s1, { type: "toAction" });
            if (!s2) continue;
            const s3 = sim(s2, cc);
            if (s3) {
              const v = evaluate(s3, me);
              if (v > bestVal) { bestVal = v; bestTool = tm; }
            }
          }
          continue;
        }
        // 其余工具：工具 → toAction → 最佳行动
        const s1 = sim(state, tm);
        if (!s1) continue;
        const s2 = sim(s1, { type: "toAction" });
        if (!s2) continue;
        const act = bestAction(s2);
        const finalS = act ? applyAuto(s2, act.move) : sim(s2, { type: "pass" });
        if (finalS) {
          const v = evaluate(finalS, me);
          if (v > bestVal) { bestVal = v; bestTool = tm; }
        }
      }
    }
    return bestTool || { type: "toAction" };
  }

  function crossCombos(state) {
    const p = state.players[ME(state)];
    const byType = {};
    for (const b of BODIES) {
      const bs = state.bodies[b.id];
      if (bs.formed) continue;
      const counts = Game.bodyTokenCounts(state, b.id);
      if (!(counts[ME(state)] > 0)) continue;
      const empty = Game.bodyEmptySlots(state, b.id);
      for (const t of Object.keys(MATERIALS)) {
        const slots = empty.filter(s => s.type === t);
        if (!slots.length) continue;
        const avail = Game.matCount(p.hand, t) + (t !== "inter" ? Game.matCount(p.hand, "inter") : 0);
        if (!avail) continue;
        const n = Math.min(slots.length, avail, p.tokens);
        const cards = makeCards(p.hand, t, n);
        if (!cards) continue;
        const assignments = slots.slice(0, n).map((s, i) => ({ bid: b.id, u: s.u, s: s.s, card: cards[i] }));
        (byType[t] = byType[t] || []).push(assignments);
      }
    }
    const out = [];
    for (const assignments of Object.values(byType)) {
      if (assignments.length >= 2) {
        const merged = assignments[0].concat(assignments[1]);
        if (merged.length <= p.tokens) out.push({ type: "action", action: "fill", assignments: merged });
      }
    }
    return out;
  }

  function toolMoves(state, t, card) {
    const me = ME(state);
    const moves = [];
    const K = t.tool.kind;
    if (K === "autoFill") {
      const cands = [];
      for (const b of BODIES) {
        const bs = state.bodies[b.id];
        if (bs.formed) continue;
        const empty = Game.bodyEmptySlots(state, b.id).map(s => ({ ...s, bid: b.id }));
        if (!empty.length) continue;
        for (const s of empty.slice(0, 4)) cands.push([s]);
        if (empty.length <= 4) for (let i = 0; i < empty.length; i++) for (let j = i + 1; j < empty.length; j++) cands.push([empty[i], empty[j]]);
      }
      for (const slots of cands.slice(0, 30)) {
        moves.push({ type: "tool", uid: card.uid, params: { targets: slots.map(s => ({ bid: s.bid, u: s.u, s: s.s })) } });
      }
    } else if (K === "stealMaterial") {
      for (const t2 of Object.keys(MATERIALS)) {
        for (let i = 0; i < state.nPlayers; i++) if (i !== me) moves.push({ type: "tool", uid: card.uid, params: { mat: t2, target: i } });
      }
    } else if (K === "resetTokens") {
      const cands = [];
      for (const b of BODIES) {
        const bs = state.bodies[b.id];
        if (bs.formed) continue;
        const oppSlots = [];
        b.units.forEach((u2, ui) => u2.forEach((o, si) => { if (o !== null && o !== me) oppSlots.push({ bid: b.id, u: ui, s: si }); }));
        if (oppSlots.length >= 2) cands.push([oppSlots[0], oppSlots[1]]);
      }
      for (const targets of cands.slice(0, 5)) moves.push({ type: "tool", uid: card.uid, params: { targets } });
    } else {
      // crossFill / doubleAction / take2FromLeader：无需参数（或自动选择目标）
      moves.push({ type: "tool", uid: card.uid, params: {} });
    }
    return moves;
  }

  /* ---------- 任务阶段 ---------- */
  function chooseMission(state) {
    const me = ME(state);
    const p = state.players[me];
    const cards = p.hand.filter(Game.isDecCard).filter(c => Game.missionValid(state, me, c.tid, false)).map(c => c.uid);
    if (cards.length) return { type: "mission", cards };
    return { type: "pass" };
  }

  /* ---------- 弃牌检查 ---------- */
  function chooseDiscard(state) {
    const me = ME(state);
    const p = state.players[me];
    const need = p.hand.length - RULES.HAND_LIMIT;
    const demand = typeDemand(state, me);
    const values = p.hand.map((c, i) => {
      if (Game.isDecCard(c)) {
        const t = DECISION_TEMPLATES.find(x => x.id === c.tid);
        let v = 0.3;
        if (t && t.mission && Game.missionValid(state, me, t.id, false)) v = 3;
        else if (t && t.mission && t.mission.kind === "playedCards") v = 0.5;
        return { i, v };
      }
      return { i, v: 0.1 + Math.min(demand[c], 1.5) };
    }).sort((a, b) => a.v - b.v);
    const cards = values.slice(0, need).map(x => {
      const c = p.hand[x.i];
      if (Game.isDecCard(c)) return { k: "d", uid: c.uid };
      return { k: "m", mat: c };
    });
    return { type: "discard", cards };
  }

  /* ---------- 主入口 ---------- */
  function chooseMove(state) {
    try {
      switch (state.phase) {
        case "tool": return chooseTool(state);
        case "action": {
          const a = bestAction(state);
          if (a) return a.move;
          return { type: "action", action: "skip" };
        }
        case "blindReturn": {
          const legal = Game.legalReturnTypes(state);
          if (!legal.length) return null;
          const p = state.players[state.seat];
          const pick = legal.slice().sort((a, z) => Game.matCount(p.hand, z) - Game.matCount(p.hand, a))[0];
          return { type: "blindReturn", returnCard: pick };
        }
        case "mission": return chooseMission(state);
        case "handcheck": return chooseDiscard(state);
        default: return null;
      }
    } catch (e) {
      return null;
    }
  }

  return { chooseMove, evaluate };
})();

if (typeof module !== "undefined" && module.exports) module.exports = AI;
