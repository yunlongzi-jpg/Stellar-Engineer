/* ============================================================
 * 宇宙星尘（再造太阳系 / STELLAR ENGINEER）— 规则数据
 * 依据 docs/rules.md（人工校对 + 网页适配星盘）
 * 全部数据内联，支持 file:// 协议直接打开（无 fetch）
 * ============================================================ */
"use strict";

/** 物质种类定义 */
const MATERIALS = {
  atmo: { key: "atmo",  name: "大气",     icon: "☁", color: "#7ec8f2", desc: "在太阳风的强烈吹拂下，若无磁场保护，星球的大气将很快损失殆尽。大气像一层玻璃温室，可以保存住星球表面的热量。" },
  rock: { key: "rock",  name: "岩石",     icon: "⛰", color: "#c9a06a", desc: "岩石这类“重”物质，占据了宇宙所有物质的绝大多数。" },
  water:{ key: "water", name: "水",       icon: "💧", color: "#5fd4d4", desc: "从地球的海洋到木卫三的冰壳，太阳系充满了液态、固态和气态的水。水冰可以反射阳光。" },
  mag:  { key: "mag",   name: "磁场",     icon: "🧲", color: "#b98ef0", desc: "在太阳风的强烈吹拂下，若无磁场保护，星球的大气将很快损失。" },
  ring: { key: "ring",  name: "星环",     icon: "🪐", color: "#e8c76a", desc: "土星环看起来如此炫目，是因为它含有大量的水冰，可以反射阳光。" },
  inter:{ key: "inter", name: "星际物质", icon: "✦",  color: "#9aa7c7", desc: "星际物质由 99% 的气体和 1% 的尘埃构成。可作为任意种类打出。" },
};

/** 物质牌库构成（共 93 张） */
const MATERIAL_DECK = { atmo: 16, rock: 25, water: 20, mag: 7, ring: 7, inter: 18 };

/**
 * 星盘：28 颗可形成天体（原版 21 颗 + 扩充 7 颗：木卫二/土卫六/土卫二/海卫一/灶神星/创神星/赛德娜）。
 * units: 单元（白色线条相连的物质格组）数组；每格为物质 key 或 "wild"（○ 万能格）。
 * scores: 形成名次分数（从高名次到低名次）。
 * baseRewards: 开局固定奖励标记数（太阳 2、八大行星各 1）。
 */
const BODIES = [
  { id: "A1",  name: "太阳",   category: "star",   scores: [7, 4, 2], baseRewards: 2,
    units: [["atmo","atmo","atmo"], ["rock","rock","inter"], ["rock","rock","wild"]] },
  { id: "B2",  name: "水星",   category: "planet", scores: [5, 3, 2], baseRewards: 1,
    units: [["rock","rock"], ["rock","inter"]] },
  { id: "B3",  name: "金星",   category: "planet", scores: [5, 3, 2], baseRewards: 1,
    units: [["atmo","atmo"], ["atmo","rock"]] },
  { id: "B8",  name: "地球",   category: "planet", scores: [4, 2, 1], baseRewards: 1,
    units: [["atmo","atmo"], ["water","water"], ["mag"]] },
  { id: "B12", name: "火星",   category: "planet", scores: [4, 2, 1], baseRewards: 1,
    units: [["atmo"], ["rock","rock","water"]] },
  { id: "B19", name: "木星",   category: "planet", scores: [6, 3, 1], baseRewards: 1,
    units: [["atmo","atmo"], ["atmo","atmo","inter","inter"]] },
  { id: "B24", name: "土星",   category: "planet", scores: [6, 3, 1], baseRewards: 1,
    units: [["ring","ring"], ["atmo","atmo"], ["inter","inter"]] },
  { id: "B31", name: "天王星", category: "planet", scores: [4, 2, 1], baseRewards: 1,
    units: [["mag","mag","ring"], ["water","water"]] },
  { id: "B37", name: "海王星", category: "planet", scores: [4, 2, 1], baseRewards: 1,
    units: [["water","water"], ["water","mag","mag"]] },
  { id: "C1",  name: "月球",   category: "moon",   scores: [2, 1],     baseRewards: 0,
    units: [["rock","rock"]] },
  { id: "C2",  name: "木卫三", category: "moon",   scores: [5, 3, 2], baseRewards: 0,
    units: [["water","water"], ["inter","wild"]] },
  { id: "C3",  name: "天卫五", category: "moon",   scores: [3, 2],     baseRewards: 0,
    units: [["water","water","inter"]] },
  { id: "C4",  name: "木卫二", category: "moon",   scores: [4, 2, 1],  baseRewards: 0,
    units: [["water","water"], ["rock"]] },
  { id: "C5",  name: "土卫六", category: "moon",   scores: [4, 2, 1],  baseRewards: 0,
    units: [["atmo","atmo"], ["water","wild"]] },
  { id: "C6",  name: "土卫二", category: "moon",   scores: [2, 1],     baseRewards: 0,
    units: [["water","inter"]] },
  { id: "C7",  name: "海卫一", category: "moon",   scores: [3, 2],     baseRewards: 0,
    units: [["water","rock","wild"]] },
  { id: "D4",  name: "冥王星", category: "dwarf",  scores: [3, 2, 1],  baseRewards: 0,
    units: [["rock","wild","wild"]] },
  { id: "D6",  name: "智神星", category: "dwarf",  scores: [2, 1],     baseRewards: 0,
    units: [["rock","rock"]] },
  { id: "D8",  name: "灵神星", category: "dwarf",  scores: [3, 2, 1],  baseRewards: 0,
    units: [["rock","rock","mag"]] },
  { id: "D10", name: "妊神星", category: "dwarf",  scores: [3, 2, 1],  baseRewards: 0,
    units: [["rock","rock"], ["water"]] },
  { id: "D12", name: "鸟神",   category: "dwarf",  scores: [2, 1],     baseRewards: 0,
    units: [["rock","inter"]] },
  { id: "D14", name: "阋神星", category: "dwarf",  scores: [2, 1],     baseRewards: 0,
    units: [["rock","inter"]] },
  { id: "D15", name: "共工星", category: "dwarf",  scores: [2, 1],     baseRewards: 0,
    units: [["water","inter"]] },
  { id: "D17", name: "谷神星", category: "dwarf",  scores: [3, 2, 1],  baseRewards: 0,
    units: [["water","rock","rock"]] },
  { id: "D19", name: "婚神星", category: "dwarf",  scores: [2, 1],     baseRewards: 0,
    units: [["rock","rock"]] },
  { id: "D21", name: "灶神星", category: "dwarf",  scores: [3, 2, 1],  baseRewards: 0,
    units: [["rock","rock","rock"]] },
  { id: "D22", name: "创神星", category: "dwarf",  scores: [3, 2, 1],  baseRewards: 0,
    units: [["rock","ring"], ["water"]] },
  { id: "D23", name: "赛德娜", category: "dwarf",  scores: [2, 1],     baseRewards: 0,
    units: [["rock","wild"]] },
];

/** 课题卡 ×15（每张开局随机抽 2 张，在标示天体上各放 1 个奖励标记；T11-T15 为扩充天体课题） */
const TOPICS = [
  { id: "T1",  name: "内行星带",     bodies: ["B2", "B3"] },
  { id: "T2",  name: "生命摇篮",     bodies: ["B8", "C1"] },
  { id: "T3",  name: "红色边疆",     bodies: ["B12", "D17"] },
  { id: "T4",  name: "气态巨行星",   bodies: ["B19", "B24"] },
  { id: "T5",  name: "冰巨星",       bodies: ["B31", "B37"] },
  { id: "T6",  name: "大卫星巡礼",   bodies: ["C2", "C3"] },
  { id: "T7",  name: "金属之心",     bodies: ["D8", "D6"] },
  { id: "T8",  name: "柯伊伯远征",   bodies: ["D4", "D14"] },
  { id: "T9",  name: "经典柯伊伯带", bodies: ["D10", "D12"] },
  { id: "T10", name: "太阳系尽头",   bodies: ["D15", "D19"] },
  { id: "T11", name: "浓密大气",     bodies: ["B3", "C5"] },
  { id: "T12", name: "冰下海洋",     bodies: ["C4", "C6"] },
  { id: "T13", name: "海王俘获",     bodies: ["B37", "C7"] },
  { id: "T14", name: "环带奇观",     bodies: ["B24", "D22"] },
  { id: "T15", name: "主带双雄",     bodies: ["D21", "D17"] },
];

/**
 * 决策牌模板（23 种效果名，构筑 26 张：3 种 ×2 + 20 种 ×1）
 * 每张牌上下两部分二选一使用，故每条同时给出 tool / mission 规格。
 * 任务牌取向（依玩家反馈）：以"参与/完成某类型星球"类条件为主（6 种），
 * 完成门槛低、随游戏进程自然达成；跳过弃牌类精简保留 5 种。
 */
const DECISION_TEMPLATES = [
  // —— A 组：星球形成类（参与即计，门槛低 → 分值低；全条件 → 分值高）——
  { id: "galaxy_planner", name: "星系规划师",
    mission: { kind: "participateFormed", needSun: true, needCategory: "planet", pts: 5 } },
  { id: "inter_integrator", name: "星际物质整合者",
    mission: { kind: "soloFormed", needCategory: "dwarf", pts: 5 } },
  { id: "retrograde", name: "逆行自转星球",
    mission: { kind: "bodiesFormed", bodies: ["B19", "B24"], pts: 4 } },
  { id: "planet_engine", name: "行星工程",
    mission: { kind: "participateCategory", cat: "planet", n: 2, pts: 4 } },
  { id: "moon_gravity", name: "卫星引力俘获",
    mission: { kind: "participateCategory", cat: "moon", n: 1, pts: 3 } },
  { id: "belt_sweep", name: "小行星带巡礼",
    mission: { kind: "participateCategory", cat: "dwarf", n: 1, pts: 2 } },

  // —— B 组：弃牌跳过行动类任务（保留原版 5 种）——
  { id: "fusion",        name: "恒星核聚变",   mission: { kind: "skipDiscard", cost: [{mat:"rock",n:1},{mat:"inter",n:1}], pts: 4 } },
  { id: "greenhouse",    name: "失控温室效应", mission: { kind: "skipDiscard", cost: [{mat:"atmo",n:1},{mat:"water",n:1}], pts: 4 } },
  { id: "moon_break",    name: "卫星解体",     mission: { kind: "skipDiscard", cost: [{mat:"rock",n:2}], pts: 3 } },
  { id: "nebula",        name: "星云核坍缩",   mission: { kind: "skipDiscard", cost: [{mat:"inter",n:2}], pts: 4 } },
  { id: "cryovolcano",   name: "冰火山喷发",   mission: { kind: "skipDiscard", cost: [{mat:"water",n:2}], pts: 3 } },

  // —— C 组：打出 N 张 X 牌类任务 ——
  { id: "dense_atmo", name: "稠密大气", mission: { kind: "playedCards", mat: "atmo",  n: 3, pts: 2 } },
  { id: "rock_core",  name: "岩质核心", mission: { kind: "playedCards", mat: "rock",  n: 4, pts: 3 } },
  { id: "rich_water", name: "丰沛水体", mission: { kind: "playedCards", mat: "water", n: 4, pts: 2 } },
  { id: "mag_shield", name: "强磁护盾", mission: { kind: "playedCards", mat: "mag",   n: 2, pts: 3 } },
  { id: "grand_ring", name: "壮丽光环", mission: { kind: "playedCards", mat: "ring",  n: 2, pts: 3 } },
  { id: "mass_boost", name: "增幅质量", mission: { kind: "playedCards", mat: "inter", n: 3, pts: 2 } },

  // —— D 组：工具效果 ——
  { id: "autofill",    name: "自动填充装置",
    tool:   { kind: "autoFill", maxSlots: 2 } },
  { id: "cross_fill",  name: "跨星球填充装置",
    tool:   { kind: "crossFill" } },
  { id: "double_power", name: "双重动力",
    tool:   { kind: "doubleAction" } },
  { id: "pump",        name: "物质抽调系统",
    tool:   { kind: "stealMaterial" } },
  { id: "regulate",    name: "物质调节网络",
    tool:   { kind: "take2FromLeader" } },
  { id: "reset_mode",  name: "工程重置模式",
    tool:   { kind: "resetTokens", maxTokens: 2 } },
];

/** 决策牌构筑：26 张（23 种 + 3 种 ×2，星球类任务提高出现率） */
const DECISION_DECK_MULT = { dense_atmo: 2, planet_engine: 2, belt_sweep: 2 };

/** 规则常数 */
const RULES = {
  HAND_LIMIT: 12,                 // 手牌上限（物质+决策）
  SCORE_TARGET: 40,               // 触发终局分数
  TOKENS_PER_PLAYER: 40,          // 每人工程标记
  PLAYERS_MAX: 4,
  START_MATERIAL_2P: [4, 5],      // 2 人局起始物质牌
  START_MATERIAL_3P: [4, 5, 6],
  START_MATERIAL_4P: [4, 5, 6, 7],
  START_DECISIONS: 2,             // 每人起始决策牌
  PUBLIC_TYPES: 6,                 // 公共物质牌区种类数
  BLIND_DRAW: 3,                  // 盲抽张数
  MULTI_TYPE_COST: { 2: 1, 3: 3, 4: 6, 5: 10, 6: 15 }, // 多种类填充付费
  TOPICS_PER_GAME: 2,
};

/** 类别中文 */
const CATEGORY_NAMES = { star: "恒星", planet: "行星", moon: "卫星", dwarf: "小天体" };

/* 导出（浏览器全局；Node 测试用 globalThis） */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { MATERIALS, MATERIAL_DECK, BODIES, TOPICS, DECISION_TEMPLATES, DECISION_DECK_MULT, RULES, CATEGORY_NAMES };
}
