// JOE TIME content + math. Everything a "content patch" touches lives here:
// stats, specialties, adjectives, furniture, gear, and the team-pot proposals.
// All functions are pure over (me, shared).

import { TUNING } from "./config.js";

// ---- stats ----------------------------------------------------------------

export const STATS = {
  brain: { label: "BRAIN", glyph: "🧠", tint: "#4b56b8" },
  build: { label: "BUILD", glyph: "🔧", tint: "#c9772f" },
};

// A Joey's specialty: starting stat spread + a perk that makes matching-tag
// furniture/gear more effective.
export const SPECIALTIES = {
  brain: {
    id: "brain", name: "JOE BRAIN", glyph: "🧠", tint: "#4b56b8",
    start: { brain: 3, build: 1 },
    blurb: "Big ideas. BRAIN gear and furniture work harder for you.",
  },
  build: {
    id: "build", name: "JOE BUILD", glyph: "🔧", tint: "#c9772f",
    start: { brain: 1, build: 3 },
    blurb: "Big hands. BUILD gear and furniture work harder for you.",
  },
};

// The adjective you pick becomes JOEY <ADJ> and bakes in a buff. `buff` is one
// of: {stat, amount} | {brain, build} | {incomeMult} | {speedMult}.
export const ADJECTIVES = [
  { word: "SWOLE",       buff: { stat: "build", amount: 3 } },
  { word: "BRAINY",      buff: { stat: "brain", amount: 3 } },
  { word: "BEEFY",       buff: { stat: "build", amount: 2 } },
  { word: "CLEVER",      buff: { stat: "brain", amount: 2 } },
  { word: "HANDY",       buff: { stat: "build", amount: 2 } },
  { word: "WISE",        buff: { stat: "brain", amount: 2 } },
  { word: "GRIZZLED",    buff: { brain: 1, build: 1 } },
  { word: "BALANCED",    buff: { brain: 1, build: 1 } },
  { word: "LUCKY",       buff: { incomeMult: 0.10 } },
  { word: "CAFFEINATED", buff: { incomeMult: 0.08 } },
  { word: "ZESTY",       buff: { incomeMult: 0.06 } },
  { word: "NIMBLE",      buff: { speedMult: 0.30 } },
  { word: "SPRIGHTLY",   buff: { speedMult: 0.22 } },
  { word: "STOIC",       buff: { brain: 2, build: 1 } },
  { word: "RUGGED",      buff: { brain: 1, build: 2 } },
];

// Turn a picked specialty + adjective into concrete stats and buffs.
export function buildStats(specialtyId, adj) {
  const spec = SPECIALTIES[specialtyId] || SPECIALTIES.brain;
  const stats = { brain: spec.start.brain, build: spec.start.build };
  const buffs = { incomeMult: 0, speedMult: 1 };
  const b = adj?.buff || {};
  if (b.stat) stats[b.stat] += b.amount;
  if (b.brain) stats.brain += b.brain;
  if (b.build) stats.build += b.build;
  if (b.incomeMult) buffs.incomeMult += b.incomeMult;
  if (b.speedMult) buffs.speedMult += b.speedMult;
  return { stats, buffs };
}

export function adjSummary(adj) {
  const b = adj.buff;
  if (b.stat) return `+${b.amount} ${STATS[b.stat].label}`;
  if (b.brain && b.build) return `+${b.brain} BRAIN, +${b.build} BUILD`;
  if (b.incomeMult) return `+${Math.round(b.incomeMult * 100)}% income`;
  if (b.speedMult) return `+${Math.round(b.speedMult * 100)}% speed`;
  return "";
}

// ---- furniture (shared, active while you stand next to it) -----------------

export const FURNITURE = {
  snacktable: { name: "Snack Table", glyph: "🍕", tag: "neutral", value: 1.5, cost: 20, buyGrowth: 1.16, upBaseCost: 30, upGrowth: 1.5, h: 10 },
  cooler:     { name: "Water Cooler", glyph: "💧", tag: "neutral", value: 1.5, cost: 22, buyGrowth: 1.16, upBaseCost: 32, upGrowth: 1.5, h: 16 },
  chair:      { name: "Thinking Chair", glyph: "🪑", tag: "brain", value: 2.2, cost: 45, buyGrowth: 1.18, upBaseCost: 60, upGrowth: 1.55, h: 12 },
  workbench:  { name: "Workbench", glyph: "🛠️", tag: "build", value: 2.2, cost: 45, buyGrowth: 1.18, upBaseCost: 60, upGrowth: 1.55, h: 12 },
  whiteboard: { name: "Whiteboard", glyph: "📝", tag: "brain", value: 4.0, cost: 150, buyGrowth: 1.2, upBaseCost: 190, upGrowth: 1.58, h: 20 },
  toolchest:  { name: "Tool Chest", glyph: "🧰", tag: "build", value: 4.0, cost: 150, buyGrowth: 1.2, upBaseCost: 190, upGrowth: 1.58, h: 14 },
  server:     { name: "Server Rack", glyph: "🖥️", tag: "brain", value: 9.0, cost: 600, buyGrowth: 1.24, upBaseCost: 780, upGrowth: 1.62, h: 22 },
  forge:      { name: "Machine Press", glyph: "⚙️", tag: "build", value: 9.0, cost: 600, buyGrowth: 1.24, upBaseCost: 780, upGrowth: 1.62, h: 18 },
};
export const FURNITURE_ORDER = ["snacktable", "cooler", "chair", "workbench", "whiteboard", "toolchest", "server", "forge"];

export function countOfType(shared, type) {
  return Object.values(shared.furniture).filter((f) => f.type === type).length;
}
export function furnitureValue(f) {
  return FURNITURE[f.type].value * (1 + 0.5 * (f.level - 1));
}
export function furnitureBuyCost(shared, type) {
  const def = FURNITURE[type];
  return Math.ceil(def.cost * Math.pow(def.buyGrowth, countOfType(shared, type)));
}
export function upgradeCost(f) {
  const def = FURNITURE[f.type];
  return Math.ceil(def.upBaseCost * Math.pow(def.upGrowth, f.level - 1));
}

// ---- gear (personal, always-on passive) ------------------------------------
// `art` is the shape id the avatar renderer draws. `value` is flat c/s (scaled
// by matching stat via `tag`); `mult` is a flat income multiplier.

export const GEAR = {
  hat: {
    label: "Hat", slot: "hat",
    options: [
      { id: "none",     name: "Bare Head",   art: "none",     price: 0 },
      { id: "ballcap",  name: "Ball Cap",    art: "ballcap",  tag: "neutral", value: 0.6, price: 60, color: "#2f5fbf" },
      { id: "thinkcap", name: "Thinking Cap", art: "thinkcap", tag: "brain",   value: 1.6, price: 180, color: "#4b56b8" },
      { id: "hardhat",  name: "Hard Hat",    art: "hardhat",  tag: "build",   value: 1.6, price: 180, color: "#f2b134" },
      { id: "partyhat", name: "Party Hat",   art: "partyhat", mult: 0.08, price: 500, color: "#e84f9c" },
    ],
  },
  face: {
    label: "Face", slot: "face",
    options: [
      { id: "none",    name: "Bare Face",     art: "none",    price: 0 },
      { id: "shades",  name: "Cool Shades",   art: "shades",  mult: 0.05, price: 220, color: "#222831" },
      { id: "smart",   name: "Smart Glasses", art: "smart",   tag: "brain", value: 1.8, price: 260, color: "#3a3f4b" },
      { id: "goggles", name: "Safety Goggles", art: "goggles", tag: "build", value: 1.8, price: 260, color: "#59c1e8" },
    ],
  },
  hand: {
    label: "In Hand", slot: "hand",
    options: [
      { id: "none",    name: "Empty Hands", art: "none",    price: 0 },
      { id: "mug",     name: "Coffee Mug",  art: "mug",     mult: 0.10, price: 300, color: "#8a5a2b" },
      { id: "wrench",  name: "Big Wrench",  art: "wrench",  tag: "build", value: 2.6, price: 340, color: "#9aa3af" },
      { id: "calc",    name: "Calculator",  art: "calc",    tag: "brain", value: 2.6, price: 340, color: "#33384a" },
      { id: "clipboard", name: "Clipboard", art: "clipboard", tag: "neutral", value: 1.2, price: 150, color: "#c8a06a" },
    ],
  },
};
export const GEAR_SLOTS = ["hat", "face", "hand"];

export function gearOption(slot, id) {
  const s = GEAR[slot];
  return s?.options.find((o) => o.id === id) || s?.options[0];
}

// ---- income ----------------------------------------------------------------

export function statScales(me) {
  const s = me.stats || { brain: 0, build: 0 };
  const brain = (1 + TUNING.statItemScale * s.brain) * (me.specialty === "brain" ? 1 + TUNING.specialtyItemBonus : 1);
  const build = (1 + TUNING.statItemScale * s.build) * (me.specialty === "build" ? 1 + TUNING.specialtyItemBonus : 1);
  return { brain, build };
}
function scaleByTag(v, tag, sc) {
  return tag === "brain" ? v * sc.brain : tag === "build" ? v * sc.build : v;
}

// A Joey's credits/sec. passiveOnly skips furniture (used for offline income,
// since you weren't standing anywhere).
export function income(me, shared, { passiveOnly = false } = {}) {
  const sc = statScales(me);
  const s = me.stats || { brain: 0, build: 0 };
  let flat = TUNING.baseIncome + TUNING.statFlat * (s.brain + s.build);
  let multPct = (me.buffs && me.buffs.incomeMult) || 0;

  // gear (passive)
  const eq = (me.gear && me.gear.equipped) || {};
  for (const slot of GEAR_SLOTS) {
    const opt = gearOption(slot, eq[slot] || "none");
    if (opt.value) flat += scaleByTag(opt.value, opt.tag, sc);
    if (opt.mult) multPct += opt.mult;
  }

  // furniture (active, only while adjacent)
  if (!passiveOnly && shared && shared.furniture && me.pos) {
    for (const [key, f] of Object.entries(shared.furniture)) {
      const [gx, gy] = key.split(",").map(Number);
      if (isUsing(me.pos, gx, gy)) {
        flat += scaleByTag(furnitureValue(f), FURNITURE[f.type].tag, sc);
      }
    }
  }

  // room-wide buff from last week's winning pot proposal
  if (shared && shared.pot && shared.pot.roomBuff && shared.pot.roomBuff.incomeMult) {
    multPct += shared.pot.roomBuff.incomeMult;
  }

  return Math.round(flat * (1 + multPct) * 100) / 100;
}

// Which furniture cells is `pos` currently using?
export function usingKeys(pos, shared) {
  const keys = [];
  if (!shared || !shared.furniture || !pos) return keys;
  for (const key of Object.keys(shared.furniture)) {
    const [gx, gy] = key.split(",").map(Number);
    if (isUsing(pos, gx, gy)) keys.push(key);
  }
  return keys;
}
export function isUsing(pos, gx, gy) {
  const px = Math.round(pos.x), py = Math.round(pos.y);
  return Math.max(Math.abs(px - gx), Math.abs(py - gy)) <= TUNING.adjacencyRange;
}

// ---- floor -----------------------------------------------------------------

export function expandCost(shared) {
  const steps = Math.max(0, shared.floor.w - TUNING.startFloor.w);
  return Math.ceil(TUNING.floorExpandCost * Math.pow(TUNING.floorExpandGrowth, steps));
}
export function canExpand(shared) { return shared.floor.w < TUNING.maxFloor; }

// ---- team pot --------------------------------------------------------------
// What the pot can buy at week's end. Each grants a room-wide buff for the next
// week. Content-patch territory; extend freely.
export const PROPOSALS = [
  { id: "espresso", name: "Espresso Machine", glyph: "☕", desc: "Everyone's income +15% next week.", roomBuff: { incomeMult: 0.15 } },
  { id: "rug",      name: "Fancy Rug",        glyph: "🧶", desc: "Cozy vibes. Income +8% next week.", roomBuff: { incomeMult: 0.08 } },
  { id: "arcade",   name: "Arcade Cabinet",   glyph: "🕹️", desc: "Morale! Income +12% next week.", roomBuff: { incomeMult: 0.12 } },
  { id: "plants",   name: "A Wall of Plants", glyph: "🪴", desc: "Fresh air. Income +10% next week.", roomBuff: { incomeMult: 0.10 } },
];

export function proposalById(id) { return PROPOSALS.find((p) => p.id === id); }

// Most recent Monday 00:00 UTC at or before `t`.
export function weekStartFor(t) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * 86400000;
  return monday;
}

// Your share of the pot's votes = your contribution / total contributions.
export function voteWeight(pot, playerId) {
  const contribs = pot.contributions || {};
  const total = Object.values(contribs).reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return (contribs[playerId] || 0) / total;
}

// Weighted vote tally -> winning proposal id (or null).
export function tallyVotes(pot) {
  const votes = pot.votes || {};
  const totals = {};
  for (const [pid, prop] of Object.entries(votes)) {
    totals[prop] = (totals[prop] || 0) + voteWeight(pot, pid);
  }
  let best = null, bestW = -1;
  for (const [prop, w] of Object.entries(totals)) {
    if (w > bestW) { bestW = w; best = prop; }
  }
  return best;
}

// Have all this week's contributors cast a vote?
export function everyoneVoted(pot) {
  const contributors = Object.keys(pot.contributions || {}).filter((k) => pot.contributions[k] > 0);
  if (contributors.length === 0) return true;
  const votes = pot.votes || {};
  return contributors.every((pid) => votes[pid]);
}
