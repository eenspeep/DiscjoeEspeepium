// JOE TIME content + math. Ten factorial research tiers of furniture and gear.
// Research unlocks whole tiers (not individual items); price and usefulness both
// scale factorially per tier, and items get more esoteric the higher you go.
// All functions are pure over (me, shared).

import { TUNING } from "./config.js";

// ---- tiers + scaling ------------------------------------------------------

export const TIER_COUNT = 10;
// factorial by tier (index = tier; index 0 unused)
const FACT = [0, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
// Anchors: tier-1 furniture costs ~900 (=15 min idle at 1c/s); a tier-3 item is
// worth ~0.5/s, so four adjacent give +2/s = 3x base = ~5 min. (See DESIGN_NOTES.)
const COST_K = 900;      // tierCost(1) = 900
const POWER_P = 1 / 12;  // tierPower(3) = 0.5

export function tierCost(t) { return COST_K * FACT[t]; }
export function tierPower(t) { return POWER_P * FACT[t]; }

// cumulative research points to reach each tier (index = tier; tier 1 is free)
const RESEARCH_TIERS = [0, 0, 120, 360, 900, 2200, 5200, 12000, 28000, 66000, 150000];

export const TIER_NAME = [
  "", "Supply Closet", "Break Room", "Cubicle Farm", "Server Room", "R&D Lab",
  "Innovation Wing", "Skunkworks", "Moonshot Floor", "The Singularity Lab", "Post-Work Reality",
];

// ---- stats ----------------------------------------------------------------

export const STATS = {
  brain: { label: "BRAIN", glyph: "🧠", tint: "#4b56b8" },
  build: { label: "BUILD", glyph: "🔧", tint: "#c9772f" },
};
export const SPECIALTIES = {
  brain: { id: "brain", name: "JOE BRAIN", glyph: "🧠", tint: "#4b56b8", start: { brain: 3, build: 1 }, blurb: "Big ideas. BRAIN gear and furniture work harder, and you research faster." },
  build: { id: "build", name: "JOE BUILD", glyph: "🔧", tint: "#c9772f", start: { brain: 1, build: 3 }, blurb: "Big hands. BUILD gear and furniture work harder, and you build faster." },
};
export const ADJECTIVES = [
  { word: "SWOLE", buff: { stat: "build", amount: 3 } }, { word: "BRAINY", buff: { stat: "brain", amount: 3 } },
  { word: "BEEFY", buff: { stat: "build", amount: 2 } }, { word: "CLEVER", buff: { stat: "brain", amount: 2 } },
  { word: "HANDY", buff: { stat: "build", amount: 2 } }, { word: "WISE", buff: { stat: "brain", amount: 2 } },
  { word: "GRIZZLED", buff: { brain: 1, build: 1 } }, { word: "BALANCED", buff: { brain: 1, build: 1 } },
  { word: "LUCKY", buff: { incomeMult: 0.10 } }, { word: "CAFFEINATED", buff: { incomeMult: 0.08 } },
  { word: "ZESTY", buff: { incomeMult: 0.06 } }, { word: "NIMBLE", buff: { speedMult: 0.30 } },
  { word: "SPRIGHTLY", buff: { speedMult: 0.22 } }, { word: "STOIC", buff: { brain: 2, build: 1 } },
  { word: "RUGGED", buff: { brain: 1, build: 2 } },
];
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

// ---- furniture (tiered) ---------------------------------------------------
// value(level1) = unit * tierPower(tier); base cost = costUnit * tierCost(tier).

export const FURNITURE = {
  snacktable: { name: "Snack Table", glyph: "🍕", tag: "neutral", tier: 1, unit: 0.8, costUnit: 1.0, h: 10 },
  cooler: { name: "Water Cooler", glyph: "💧", tag: "neutral", tier: 1, unit: 0.8, costUnit: 1.1, h: 16 },
  chair: { name: "Thinking Chair", glyph: "🪑", tag: "brain", tier: 1, unit: 1.0, costUnit: 1.0, h: 12 },
  workbench: { name: "Workbench", glyph: "🛠️", tag: "build", tier: 2, unit: 1.0, costUnit: 1.0, h: 12 },
  pingpong: { name: "Ping-Pong Table", glyph: "🏓", tag: "neutral", tier: 3, unit: 1.0, costUnit: 1.2, h: 10 },
  whiteboard: { name: "Whiteboard", glyph: "📝", tag: "brain", tier: 3, unit: 1.0, costUnit: 1.2, h: 20 },
  toolchest: { name: "Tool Chest", glyph: "🧰", tag: "build", tier: 3, unit: 1.0, costUnit: 1.2, h: 14 },
  server: { name: "Server Rack", glyph: "🖥️", tag: "brain", tier: 4, unit: 1.2, costUnit: 1.3, h: 22 },
  forge: { name: "Machine Press", glyph: "⚙️", tag: "build", tier: 4, unit: 1.2, costUnit: 1.3, h: 18 },
  espresso: { name: "Espresso Bar", glyph: "☕", tag: "neutral", tier: 5, unit: 1.3, costUnit: 1.4, h: 12 },
  standdesk: { name: "Standing Desk", glyph: "🗄️", tag: "build", tier: 5, unit: 1.3, costUnit: 1.4, h: 16 },
  researchterm: { name: "Research Terminal", glyph: "🔬", tag: "brain", tier: 6, unit: 1.4, costUnit: 1.5, h: 20 },
  printer3d: { name: "3D Printer", glyph: "🖨️", tag: "build", tier: 6, unit: 1.4, costUnit: 1.5, h: 16 },
  quantumboard: { name: "Quantum Whiteboard", glyph: "⚛️", tag: "brain", tier: 7, unit: 1.5, costUnit: 1.6, h: 22 },
  robotarm: { name: "Robot Arm", glyph: "🦾", tag: "build", tier: 7, unit: 1.5, costUnit: 1.6, h: 18 },
  aicluster: { name: "AI Cluster", glyph: "🧠", tag: "brain", tier: 8, unit: 1.7, costUnit: 1.8, h: 24 },
  nanoforge: { name: "Nanoforge", glyph: "🔩", tag: "build", tier: 8, unit: 1.7, costUnit: 1.8, h: 18 },
  oracle: { name: "Oracle Engine", glyph: "🔮", tag: "brain", tier: 9, unit: 1.9, costUnit: 2.0, h: 24 },
  fabricator: { name: "Fabricator Bay", glyph: "🏭", tag: "build", tier: 9, unit: 1.9, costUnit: 2.0, h: 20 },
  singularity: { name: "Singularity Server", glyph: "🌌", tag: "brain", tier: 10, unit: 2.2, costUnit: 2.5, h: 26 },
  realitypress: { name: "Reality Press", glyph: "💥", tag: "build", tier: 10, unit: 2.2, costUnit: 2.5, h: 22 },
};
export const FURNITURE_ORDER = Object.keys(FURNITURE).sort((a, b) => FURNITURE[a].tier - FURNITURE[b].tier);

export function countOfType(shared, type) { return Object.values(shared.furniture).filter((f) => f.type === type).length; }
export function furnitureValue(f) { const d = FURNITURE[f.type]; return d.unit * tierPower(d.tier) * (1 + 0.5 * (f.level - 1)); }
export function furnitureBaseCost(type) { const d = FURNITURE[type]; return d.costUnit * tierCost(d.tier); }
export function furnitureBuyCost(shared, type) { return Math.ceil(furnitureBaseCost(type) * Math.pow(1.15, countOfType(shared, type))); }
export function upgradeCost(f) { return Math.ceil(furnitureBaseCost(f.type) * 0.5 * Math.pow(1.5, f.level - 1)); }
export function furnitureTier(type) { return FURNITURE[type].tier; }
export function furnitureWork(type) { return 6 + (FURNITURE[type].tier - 1) * 8; }

// ---- gear / items (tiered) ------------------------------------------------
// Effect is exactly one of: value (flat, unit*tierPower, tag-scaled) | mult |
// speedMult | buildBonus (work/sec) | researchBonus (rp/sec) | grid (bag).
// price = costUnit * tierCost(tier).

export const ITEMS = {
  // Tier 1 — grounded
  clipboard: { name: "Clipboard", slot: "hands", tier: 1, value: 0.8, tag: "neutral", shape: "domino", art: "clipboard", glyph: "📋", color: "#c8a06a", costUnit: 0.6 },
  ballcap: { name: "Ball Cap", slot: "head", tier: 1, value: 0.6, tag: "neutral", shape: "domino", art: "ballcap", glyph: "🧢", color: "#2f5fbf", costUnit: 0.6 },
  cargopants: { name: "Cargo Pants", slot: "legs", tier: 1, value: 0.8, tag: "neutral", shape: "domino", art: "cargopants", glyph: "👖", color: "#6b7a52", costUnit: 0.7 },
  bag_small: { name: "Small Bag", slot: "bag", tier: 1, grid: { w: 2, h: 2 }, shape: "square", art: "bag", glyph: "👝", color: "#8a6a3b", costUnit: 0 },
  // Tier 2
  clownnose: { name: "Clown Nose", slot: "nose", tier: 2, value: 1.0, tag: "neutral", shape: "dot", art: "clownnose", glyph: "🔴", color: "#e5433b", costUnit: 0.8 },
  boots: { name: "Work Boots", slot: "feet", tier: 2, value: 1.0, tag: "build", shape: "domino", art: "boots", glyph: "🥾", color: "#6b4a2b", costUnit: 0.9 },
  mug: { name: "Coffee Mug", slot: "hands", tier: 2, mult: 0.06, shape: "dot", art: "mug", glyph: "☕", color: "#8a5a2b", costUnit: 1.0 },
  // Tier 3
  goggles: { name: "Safety Goggles", slot: "eyes", tier: 3, value: 1.0, tag: "build", shape: "domino", art: "goggles", glyph: "🥽", color: "#59c1e8", costUnit: 1.0 },
  smart: { name: "Smart Glasses", slot: "eyes", tier: 3, value: 1.0, tag: "brain", shape: "domino", art: "smart", glyph: "👓", color: "#3a3f4b", costUnit: 1.0 },
  toolbelt: { name: "Tool Belt", slot: "legs", tier: 3, value: 1.0, tag: "build", shape: "domino", art: "toolbelt", glyph: "🧰", color: "#7a5230", costUnit: 1.0 },
  bag_med: { name: "Medium Bag", slot: "bag", tier: 3, grid: { w: 3, h: 3 }, shape: "square", art: "bag", glyph: "🎒", color: "#7a5230", costUnit: 1.2 },
  // Tier 4
  hardhat: { name: "Hard Hat", slot: "head", tier: 4, value: 1.2, tag: "build", shape: "triL", art: "hardhat", glyph: "⛑️", color: "#f2b134", costUnit: 1.1 },
  thinkcap: { name: "Thinking Cap", slot: "head", tier: 4, value: 1.2, tag: "brain", shape: "triL", art: "thinkcap", glyph: "🎓", color: "#4b56b8", costUnit: 1.1 },
  wrench: { name: "Big Wrench", slot: "hands", tier: 4, value: 1.3, tag: "build", shape: "domino", art: "wrench", glyph: "🔧", color: "#9aa3af", costUnit: 1.2 },
  calc: { name: "Calculator", slot: "hands", tier: 4, value: 1.3, tag: "brain", shape: "domino", art: "calc", glyph: "🧮", color: "#33384a", costUnit: 1.2 },
  // Tier 5
  labcoat: { name: "Lab Coat", slot: "torso", tier: 5, value: 1.3, tag: "brain", shape: "square", art: "labcoat", glyph: "🥼", color: "#eef1f5", costUnit: 1.4 },
  vest: { name: "Work Vest", slot: "torso", tier: 5, value: 1.3, tag: "build", shape: "square", art: "vest", glyph: "🦺", color: "#f2b134", costUnit: 1.4 },
  sneakers: { name: "Speedy Sneakers", slot: "feet", tier: 5, speedMult: 0.15, shape: "domino", art: "sneakers", glyph: "👟", color: "#ec6a5c", costUnit: 1.3 },
  bag_big: { name: "Big Duffel", slot: "bag", tier: 5, grid: { w: 4, h: 4 }, shape: "square", art: "bag", glyph: "🧳", color: "#4b3b6b", costUnit: 1.6 },
  // Tier 6 — first exotics
  shades: { name: "Cool Shades", slot: "eyes", tier: 6, mult: 0.08, shape: "domino", art: "shades", glyph: "🕶️", color: "#222831", costUnit: 1.5 },
  focusvisor: { name: "Focus Visor", slot: "eyes", tier: 6, researchBonus: 1.5, shape: "domino", glyph: "🧿", color: "#5a3fb8", costUnit: 1.6 },
  powergloves: { name: "Power Gloves", slot: "hands", tier: 6, buildBonus: 1.5, shape: "domino", glyph: "🧤", color: "#b8455a", costUnit: 1.6 },
  // Tier 7
  caffeineiv: { name: "Caffeine IV", slot: "torso", tier: 7, mult: 0.15, shape: "square", glyph: "💉", color: "#8a5a2b", costUnit: 1.8 },
  exoskeleton: { name: "Exoskeleton", slot: "torso", tier: 7, buildBonus: 3, shape: "square", glyph: "🦿", color: "#7f8794", costUnit: 2.0 },
  neurallace: { name: "Neural Lace", slot: "head", tier: 7, researchBonus: 3, shape: "domino", glyph: "🕸️", color: "#4b56b8", costUnit: 2.0 },
  bag_wide: { name: "Wide Loadout", slot: "bag", tier: 7, grid: { w: 5, h: 4 }, shape: "square", art: "bag", glyph: "🎒", color: "#3b5b6b", costUnit: 2.2 },
  // Tier 8
  timewatch: { name: "Time-Dilation Watch", slot: "hands", tier: 8, speedMult: 0.3, shape: "dot", glyph: "⌚", color: "#d8b24a", costUnit: 2.2 },
  goldstapler: { name: "Golden Stapler", slot: "hands", tier: 8, mult: 0.2, shape: "domino", glyph: "📎", color: "#f2b134", costUnit: 2.4 },
  thirdeye: { name: "Third Eye", slot: "eyes", tier: 8, value: 2.0, tag: "brain", shape: "dot", glyph: "👁️", color: "#7a3fb8", costUnit: 2.2 },
  partyhat: { name: "Party Hat", slot: "head", tier: 8, mult: 0.1, shape: "domino", art: "partyhat", glyph: "🎉", color: "#e84f9c", costUnit: 2.0 },
  // Tier 9 — esoteric
  mustachewax: { name: "Quantum 'Stache Wax", slot: "nose", tier: 9, mult: 0.18, shape: "dot", glyph: "💈", color: "#a4471f", costUnit: 2.5 },
  antigravboots: { name: "Anti-Gravity Boots", slot: "feet", tier: 9, speedMult: 0.5, shape: "domino", glyph: "🚀", color: "#4b56b8", costUnit: 2.6 },
  hivemind: { name: "Hivemind Headset", slot: "head", tier: 9, researchBonus: 6, shape: "triL", glyph: "📡", color: "#3c7a4a", costUnit: 2.8 },
  // Tier 10 — post-work reality
  crown: { name: "Crown of Middle Management", slot: "head", tier: 10, mult: 0.5, shape: "domino", glyph: "👑", color: "#f2b134", costUnit: 3.0 },
  ringbinder: { name: "The One Ring Binder", slot: "hands", tier: 10, mult: 0.4, shape: "domino", glyph: "📕", color: "#b8455a", costUnit: 3.2 },
  sentienttie: { name: "Sentient Necktie", slot: "torso", tier: 10, mult: 0.6, shape: "square", glyph: "👔", color: "#4b3b6b", costUnit: 3.4 },
  infinitybag: { name: "Infinity Briefcase", slot: "bag", tier: 10, grid: { w: 6, h: 6 }, mult: 0.1, shape: "square", art: "bag", glyph: "💼", color: "#1c1c22", costUnit: 3.6 },
  // special: black mark (combat patch). Immovable.
  blackmark: { name: "Black Mark", slot: null, tier: 1, art: "blackmark", glyph: "🖤", color: "#1c1c22", shape: "dot", immovable: true, noSell: true, noEquip: true },
};

export function itemTier(type) { return ITEMS[type] ? ITEMS[type].tier : 1; }
export function itemPrice(type) { const d = ITEMS[type]; return d && d.costUnit ? Math.ceil(d.costUnit * tierCost(d.tier)) : 0; }
export function itemWork(type) { return 5 + itemTier(type) * 3; }
export function itemBuyable(type) { const d = ITEMS[type]; return d && !d.noEquip && d.costUnit != null && d.costUnit > 0 || (d && d.grid && d.costUnit > 0) || (d && d.costUnit != null && d.costUnit > 0); }

// items grouped by tier, in shop order (skip the free starter + specials)
export function shopByTier() {
  const out = [];
  for (let t = 1; t <= TIER_COUNT; t++) {
    const ids = Object.keys(ITEMS).filter((id) => ITEMS[id].tier === t && !ITEMS[id].noEquip && (ITEMS[id].costUnit || 0) > 0);
    out.push({ tier: t, name: TIER_NAME[t], items: ids });
  }
  return out;
}
export const ITEM_SLOTS = ["head", "eyes", "nose", "torso", "hands", "legs", "feet", "weapon", "bag"];
export const SLOT_LABEL = { head: "Head", eyes: "Eyes", nose: "Nose", torso: "Torso", hands: "Hands", legs: "Legs", feet: "Feet", weapon: "Weapon", bag: "Bag" };
export const OVERFLOW_ORDER = ["feet", "legs", "torso", "hands", "nose", "eyes", "head", "weapon"];

export function gearOption(slot, id) { return ITEMS[id] && ITEMS[id].slot === slot ? ITEMS[id] : null; }

// ---- inventory geometry ---------------------------------------------------

export const SHAPES = {
  dot: [[0, 0]], domino: [[0, 0], [1, 0]], triL: [[0, 0], [0, 1], [1, 1]],
  square: [[0, 0], [1, 0], [0, 1], [1, 1]], line3: [[0, 0], [1, 0], [2, 0]],
};
export function rotateCells(cells, rot) {
  rot = ((rot % 4) + 4) % 4;
  let out = cells.map(([x, y]) => [x, y]);
  for (let i = 0; i < rot; i++) out = out.map(([x, y]) => [-y, x]);
  const minx = Math.min(...out.map((c) => c[0])), miny = Math.min(...out.map((c) => c[1]));
  return out.map(([x, y]) => [x - minx, y - miny]);
}
export function itemCells(itemType, rot = 0) { return rotateCells(SHAPES[ITEMS[itemType].shape] || SHAPES.dot, rot); }
export function cellsExtent(cells) { return { w: Math.max(...cells.map((c) => c[0])) + 1, h: Math.max(...cells.map((c) => c[1])) + 1 }; }
export function bagGrid(me) {
  const inst = me.equipment && me.items[me.equipment.bag];
  const def = inst && ITEMS[inst.type];
  return (def && def.grid) ? def.grid : { w: 2, h: 2 };
}
export function bagOccupied(me, ignoreUid = null) {
  const occ = new Map();
  for (const [uid, p] of Object.entries((me.bag && me.bag.placements) || {})) {
    if (uid === ignoreUid) continue;
    const inst = me.items[uid]; if (!inst) continue;
    for (const [dx, dy] of itemCells(inst.type, p.rot || 0)) occ.set(`${p.x + dx},${p.y + dy}`, uid);
  }
  return occ;
}
export function fitsAt(me, itemType, x, y, rot, ignoreUid = null) {
  const grid = bagGrid(me), occ = bagOccupied(me, ignoreUid);
  for (const [dx, dy] of itemCells(itemType, rot)) {
    const cx = x + dx, cy = y + dy;
    if (cx < 0 || cy < 0 || cx >= grid.w || cy >= grid.h) return false;
    if (occ.has(`${cx},${cy}`)) return false;
  }
  return true;
}
export function firstFit(me, itemType, ignoreUid = null) {
  const grid = bagGrid(me);
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) for (const rot of [0, 1, 2, 3])
    if (fitsAt(me, itemType, x, y, rot, ignoreUid)) return { x, y, rot };
  return null;
}
export function bagFreeCells(me) { const g = bagGrid(me); return g.w * g.h - bagOccupied(me).size; }

// ---- income + effects -----------------------------------------------------

export function statScales(me) {
  const s = me.stats || { brain: 0, build: 0 };
  const brain = (1 + TUNING.statItemScale * s.brain) * (me.specialty === "brain" ? 1 + TUNING.specialtyItemBonus : 1);
  const build = (1 + TUNING.statItemScale * s.build) * (me.specialty === "build" ? 1 + TUNING.specialtyItemBonus : 1);
  return { brain, build };
}
function scaleByTag(v, tag, sc) { return tag === "brain" ? v * sc.brain : tag === "build" ? v * sc.build : v; }
function itemValue(def) { return def.value ? def.value * tierPower(def.tier) : 0; }

export function equippedDefs(me) {
  const out = [];
  for (const slot of ITEM_SLOTS) {
    if (slot === "bag") { const u = me.equipment && me.equipment.bag; const inst = u && me.items[u]; if (inst && ITEMS[inst.type]) out.push(ITEMS[inst.type]); continue; }
    const uid = me.equipment && me.equipment[slot];
    const inst = uid && me.items[uid];
    if (inst && ITEMS[inst.type]) out.push(ITEMS[inst.type]);
  }
  return out;
}
export function wornArt(me) {
  const out = {};
  for (const slot of ["head", "eyes", "nose", "torso", "hands", "legs", "feet", "weapon"]) {
    const uid = me.equipment && me.equipment[slot];
    const inst = uid && me.items && me.items[uid];
    if (inst && ITEMS[inst.type]) out[slot] = { art: ITEMS[inst.type].art, color: ITEMS[inst.type].color };
  }
  return out;
}
export function income(me, shared, { passiveOnly = false } = {}) {
  const sc = statScales(me);
  let flat = TUNING.baseIncome + TUNING.statFlat * ((me.stats?.brain || 0) + (me.stats?.build || 0));
  let multPct = (me.buffs && me.buffs.incomeMult) || 0;
  for (const def of equippedDefs(me)) {
    if (def.value) flat += scaleByTag(itemValue(def), def.tag, sc);
    if (def.mult) multPct += def.mult;
  }
  if (!passiveOnly && shared && shared.furniture && me.pos) {
    for (const [key, f] of Object.entries(shared.furniture)) {
      const [gx, gy] = key.split(",").map(Number);
      if (isUsing(me.pos, gx, gy)) flat += scaleByTag(furnitureValue(f), FURNITURE[f.type].tag, sc);
    }
  }
  if (shared && shared.pot && shared.pot.roomBuff && shared.pot.roomBuff.incomeMult) multPct += shared.pot.roomBuff.incomeMult;
  return Math.round(flat * (1 + multPct) * 100) / 100;
}
export function effectiveSpeedMult(me) {
  let m = (me.buffs && me.buffs.speedMult) || 1;
  for (const def of equippedDefs(me)) if (def.speedMult) m += def.speedMult;
  return m;
}
export function usingKeys(pos, shared) {
  const keys = [];
  if (!shared || !shared.furniture || !pos) return keys;
  for (const key of Object.keys(shared.furniture)) { const [gx, gy] = key.split(",").map(Number); if (isUsing(pos, gx, gy)) keys.push(key); }
  return keys;
}
export function isUsing(pos, gx, gy) {
  const px = Math.round(pos.x), py = Math.round(pos.y);
  return Math.max(Math.abs(px - gx), Math.abs(py - gy)) <= TUNING.adjacencyRange;
}

// ---- floor ----------------------------------------------------------------

export function expandCost(shared) {
  const steps = Math.max(0, shared.floor.w - TUNING.startFloor.w);
  return Math.ceil(TUNING.floorExpandCost * Math.pow(TUNING.floorExpandGrowth, steps));
}
export function canExpand(shared) { return shared.floor.w < TUNING.maxFloor; }

// ---- BUILD + BRAIN --------------------------------------------------------

export function buildPower(me) {
  let p = TUNING.baseBuild + TUNING.buildScale * ((me.stats && me.stats.build) || 0);
  for (const def of equippedDefs(me)) if (def.buildBonus) p += def.buildBonus;
  return p;
}
export function rpRate(me, shared) {
  if (!shared || !shared.furniture || !me.pos) return 0;
  const brain = (me.stats && me.stats.brain) || 0;
  let rp = 0;
  for (const [key, f] of Object.entries(shared.furniture)) {
    const [gx, gy] = key.split(",").map(Number);
    const def = FURNITURE[f.type];
    // research scales with the furniture's TIER (not its factorial income), so
    // early research isn't glacial and late research isn't instant.
    if (def.tag === "brain" && isUsing(me.pos, gx, gy)) rp += (def.tier + 0.5 * (f.level - 1)) * TUNING.researchScale * (1 + brain * TUNING.researchStatBonus);
  }
  for (const def of equippedDefs(me)) if (def.researchBonus) rp += def.researchBonus;
  return Math.round(rp * 100) / 100;
}
export function siteProgress(site) { return Object.values(site.progBy || {}).reduce((a, b) => a + b, 0); }

// research tiers
export function researchTotal(shared) { return Object.values((shared.research && shared.research.contrib) || {}).reduce((a, b) => a + b, 0); }
export function currentTier(shared) {
  const total = researchTotal(shared); let t = 1;
  for (let i = 1; i <= TIER_COUNT; i++) if (total >= RESEARCH_TIERS[i]) t = i;
  return t;
}
export function nextTier(shared) {
  const t = currentTier(shared);
  if (t >= TIER_COUNT) return null;
  return { tier: t + 1, name: TIER_NAME[t + 1], need: RESEARCH_TIERS[t + 1], have: Math.floor(researchTotal(shared)) };
}
export function isFurnitureUnlocked(type, shared) { return furnitureTier(type) <= currentTier(shared); }
export function isItemUnlocked(type, shared) { return itemTier(type) <= currentTier(shared); }
export function tierUnlocked(tier, shared) { return tier <= currentTier(shared); }

// ---- team pot -------------------------------------------------------------

export const PROPOSALS = [
  { id: "espresso", name: "Espresso Machine", glyph: "☕", desc: "Everyone's income +15% next week.", roomBuff: { incomeMult: 0.15 } },
  { id: "rug", name: "Fancy Rug", glyph: "🧶", desc: "Cozy vibes. Income +8% next week.", roomBuff: { incomeMult: 0.08 } },
  { id: "arcade", name: "Arcade Cabinet", glyph: "🕹️", desc: "Morale! Income +12% next week.", roomBuff: { incomeMult: 0.12 } },
  { id: "plants", name: "A Wall of Plants", glyph: "🪴", desc: "Fresh air. Income +10% next week.", roomBuff: { incomeMult: 0.10 } },
];
export function proposalById(id) { return PROPOSALS.find((p) => p.id === id); }
export function weekStartFor(t) {
  const d = new Date(t), day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * 86400000;
}
export function voteWeight(pot, playerId) {
  const c = pot.contributions || {}, total = Object.values(c).reduce((a, b) => a + b, 0);
  return total <= 0 ? 0 : (c[playerId] || 0) / total;
}
export function tallyVotes(pot) {
  const votes = pot.votes || {}, totals = {};
  for (const [pid, prop] of Object.entries(votes)) totals[prop] = (totals[prop] || 0) + voteWeight(pot, pid);
  let best = null, bestW = -1;
  for (const [prop, w] of Object.entries(totals)) if (w > bestW) { bestW = w; best = prop; }
  return best;
}
export function everyoneVoted(pot) {
  const contributors = Object.keys(pot.contributions || {}).filter((k) => pot.contributions[k] > 0);
  if (!contributors.length) return true;
  const votes = pot.votes || {};
  return contributors.every((pid) => votes[pid]);
}
