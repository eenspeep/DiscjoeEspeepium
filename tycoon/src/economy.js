// JOE TIME content + math. Stats, specialties, adjectives, furniture, the team
// pot, and the item/inventory system (equipment slots + a spatial "Tetris" bag).
// All functions are pure over (me, shared).

import { TUNING } from "./config.js";

// ---- stats ----------------------------------------------------------------

export const STATS = {
  brain: { label: "BRAIN", glyph: "🧠", tint: "#4b56b8" },
  build: { label: "BUILD", glyph: "🔧", tint: "#c9772f" },
};

export const SPECIALTIES = {
  brain: { id: "brain", name: "JOE BRAIN", glyph: "🧠", tint: "#4b56b8", start: { brain: 3, build: 1 }, blurb: "Big ideas. BRAIN gear and furniture work harder for you." },
  build: { id: "build", name: "JOE BUILD", glyph: "🔧", tint: "#c9772f", start: { brain: 1, build: 3 }, blurb: "Big hands. BUILD gear and furniture work harder for you." },
};

export const ADJECTIVES = [
  { word: "SWOLE", buff: { stat: "build", amount: 3 } },
  { word: "BRAINY", buff: { stat: "brain", amount: 3 } },
  { word: "BEEFY", buff: { stat: "build", amount: 2 } },
  { word: "CLEVER", buff: { stat: "brain", amount: 2 } },
  { word: "HANDY", buff: { stat: "build", amount: 2 } },
  { word: "WISE", buff: { stat: "brain", amount: 2 } },
  { word: "GRIZZLED", buff: { brain: 1, build: 1 } },
  { word: "BALANCED", buff: { brain: 1, build: 1 } },
  { word: "LUCKY", buff: { incomeMult: 0.10 } },
  { word: "CAFFEINATED", buff: { incomeMult: 0.08 } },
  { word: "ZESTY", buff: { incomeMult: 0.06 } },
  { word: "NIMBLE", buff: { speedMult: 0.30 } },
  { word: "SPRIGHTLY", buff: { speedMult: 0.22 } },
  { word: "STOIC", buff: { brain: 2, build: 1 } },
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

// ---- furniture ------------------------------------------------------------

export const FURNITURE = {
  snacktable: { name: "Snack Table", glyph: "🍕", tag: "neutral", value: 1.5, cost: 20, buyGrowth: 1.16, upBaseCost: 30, upGrowth: 1.5, h: 10 },
  cooler: { name: "Water Cooler", glyph: "💧", tag: "neutral", value: 1.5, cost: 22, buyGrowth: 1.16, upBaseCost: 32, upGrowth: 1.5, h: 16 },
  chair: { name: "Thinking Chair", glyph: "🪑", tag: "brain", value: 2.2, cost: 45, buyGrowth: 1.18, upBaseCost: 60, upGrowth: 1.55, h: 12 },
  workbench: { name: "Workbench", glyph: "🛠️", tag: "build", value: 2.2, cost: 45, buyGrowth: 1.18, upBaseCost: 60, upGrowth: 1.55, h: 12 },
  whiteboard: { name: "Whiteboard", glyph: "📝", tag: "brain", value: 4.0, cost: 150, buyGrowth: 1.2, upBaseCost: 190, upGrowth: 1.58, h: 20 },
  toolchest: { name: "Tool Chest", glyph: "🧰", tag: "build", value: 4.0, cost: 150, buyGrowth: 1.2, upBaseCost: 190, upGrowth: 1.58, h: 14 },
  server: { name: "Server Rack", glyph: "🖥️", tag: "brain", value: 9.0, cost: 600, buyGrowth: 1.24, upBaseCost: 780, upGrowth: 1.62, h: 22 },
  forge: { name: "Machine Press", glyph: "⚙️", tag: "build", value: 9.0, cost: 600, buyGrowth: 1.24, upBaseCost: 780, upGrowth: 1.62, h: 18 },
};
export const FURNITURE_ORDER = ["snacktable", "cooler", "chair", "workbench", "whiteboard", "toolchest", "server", "forge"];

export function countOfType(shared, type) { return Object.values(shared.furniture).filter((f) => f.type === type).length; }
export function furnitureValue(f) { return FURNITURE[f.type].value * (1 + 0.5 * (f.level - 1)); }
export function furnitureBuyCost(shared, type) { const d = FURNITURE[type]; return Math.ceil(d.cost * Math.pow(d.buyGrowth, countOfType(shared, type))); }
export function upgradeCost(f) { const d = FURNITURE[f.type]; return Math.ceil(d.upBaseCost * Math.pow(d.upGrowth, f.level - 1)); }

// ---- items + inventory ----------------------------------------------------
// Equipment slots hold one item each. The BAG slot's item defines a spatial
// grid; unequipped items (spares, loot, and later black marks) must fit in it.
// Only EQUIPPED gear buffs you, so bag space is the constraint on how much
// power you can carry at once.

export const ITEM_SLOTS = ["head", "eyes", "nose", "torso", "hands", "legs", "feet", "weapon", "bag"];
export const SLOT_LABEL = { head: "Head", eyes: "Eyes", nose: "Nose", torso: "Torso", hands: "Hands", legs: "Legs", feet: "Feet", weapon: "Weapon", bag: "Bag" };
// Order black marks eat gear slots when the bag overflows (feet first, up).
export const OVERFLOW_ORDER = ["feet", "legs", "torso", "hands", "nose", "eyes", "head", "weapon"];

// Shapes are lists of [x,y] cells (normalized so min x/y = 0).
export const SHAPES = {
  dot: [[0, 0]],
  domino: [[0, 0], [1, 0]],
  triL: [[0, 0], [0, 1], [1, 1]],
  square: [[0, 0], [1, 0], [0, 1], [1, 1]],
  line3: [[0, 0], [1, 0], [2, 0]],
};

export const ITEMS = {
  // head
  ballcap: { name: "Ball Cap", slot: "head", art: "ballcap", glyph: "🧢", color: "#2f5fbf", shape: "domino", tag: "neutral", value: 0.6, price: 60 },
  thinkcap: { name: "Thinking Cap", slot: "head", art: "thinkcap", glyph: "🎓", color: "#4b56b8", shape: "triL", tag: "brain", value: 1.6, price: 180 },
  hardhat: { name: "Hard Hat", slot: "head", art: "hardhat", glyph: "⛑️", color: "#f2b134", shape: "triL", tag: "build", value: 1.6, price: 180 },
  partyhat: { name: "Party Hat", slot: "head", art: "partyhat", glyph: "🎉", color: "#e84f9c", shape: "domino", mult: 0.08, price: 500 },
  // eyes
  shades: { name: "Cool Shades", slot: "eyes", art: "shades", glyph: "🕶️", color: "#222831", shape: "domino", mult: 0.05, price: 220 },
  smart: { name: "Smart Glasses", slot: "eyes", art: "smart", glyph: "👓", color: "#3a3f4b", shape: "domino", tag: "brain", value: 1.8, price: 260 },
  goggles: { name: "Safety Goggles", slot: "eyes", art: "goggles", glyph: "🥽", color: "#59c1e8", shape: "domino", tag: "build", value: 1.8, price: 260 },
  // nose (Joey's best feature)
  clownnose: { name: "Clown Nose", slot: "nose", art: "clownnose", glyph: "🔴", color: "#e5433b", shape: "dot", tag: "neutral", value: 1.0, price: 120 },
  nosering: { name: "Nose Ring", slot: "nose", art: "nosering", glyph: "💍", color: "#d8b24a", shape: "dot", mult: 0.04, price: 200 },
  // torso
  vest: { name: "Work Vest", slot: "torso", art: "vest", glyph: "🦺", color: "#f2b134", shape: "square", tag: "build", value: 2.0, price: 320 },
  labcoat: { name: "Lab Coat", slot: "torso", art: "labcoat", glyph: "🥼", color: "#eef1f5", shape: "square", tag: "brain", value: 2.0, price: 320 },
  hoodie: { name: "Cozy Hoodie", slot: "torso", art: "hoodie", glyph: "🧥", color: "#5a6472", shape: "square", mult: 0.06, price: 400 },
  // hands
  mug: { name: "Coffee Mug", slot: "hands", art: "mug", glyph: "☕", color: "#8a5a2b", shape: "dot", mult: 0.10, price: 300 },
  wrench: { name: "Big Wrench", slot: "hands", art: "wrench", glyph: "🔧", color: "#9aa3af", shape: "domino", tag: "build", value: 2.6, price: 340 },
  calc: { name: "Calculator", slot: "hands", art: "calc", glyph: "🧮", color: "#33384a", shape: "domino", tag: "brain", value: 2.6, price: 340 },
  clipboard: { name: "Clipboard", slot: "hands", art: "clipboard", glyph: "📋", color: "#c8a06a", shape: "domino", tag: "neutral", value: 1.2, price: 150 },
  // legs
  cargopants: { name: "Cargo Pants", slot: "legs", art: "cargopants", glyph: "👖", color: "#6b7a52", shape: "domino", tag: "neutral", value: 1.2, price: 180 },
  toolbelt: { name: "Tool Belt", slot: "legs", art: "toolbelt", glyph: "🧰", color: "#7a5230", shape: "domino", tag: "build", value: 2.2, price: 300 },
  // feet
  boots: { name: "Work Boots", slot: "feet", art: "boots", glyph: "🥾", color: "#6b4a2b", shape: "domino", tag: "build", value: 1.6, price: 220 },
  sneakers: { name: "Speedy Sneakers", slot: "feet", art: "sneakers", glyph: "👟", color: "#ec6a5c", shape: "domino", speedMult: 0.15, price: 260 },
  // bag (defines grid; no buff)
  bag_small: { name: "Small Bag", slot: "bag", art: "bag", glyph: "👝", color: "#8a6a3b", shape: "square", grid: { w: 2, h: 2 }, price: 0 },
  bag_med: { name: "Medium Bag", slot: "bag", art: "bag", glyph: "🎒", color: "#7a5230", shape: "square", grid: { w: 3, h: 3 }, price: 300 },
  bag_big: { name: "Big Duffel", slot: "bag", art: "bag", glyph: "🧳", color: "#4b3b6b", shape: "square", grid: { w: 4, h: 4 }, price: 900 },
  bag_wide: { name: "Wide Loadout", slot: "bag", art: "bag", glyph: "🎒", color: "#3b5b6b", shape: "square", grid: { w: 5, h: 3 }, price: 1500 },
  // special: black mark (from killing — added in the combat patch). Immovable.
  blackmark: { name: "Black Mark", slot: null, art: "blackmark", glyph: "🖤", color: "#1c1c22", shape: "dot", immovable: true, noSell: true, noEquip: true },
};

export const SHOP_ORDER = [
  "clownnose", "ballcap", "clipboard", "cargopants", "boots",
  "shades", "nosering", "smart", "goggles", "thinkcap", "hardhat",
  "wrench", "calc", "mug", "toolbelt", "vest", "labcoat", "hoodie",
  "sneakers", "partyhat", "bag_med", "bag_big", "bag_wide",
];

// shape geometry ------------------------------------------------------------

export function rotateCells(cells, rot) {
  rot = ((rot % 4) + 4) % 4;
  let out = cells.map(([x, y]) => [x, y]);
  for (let i = 0; i < rot; i++) out = out.map(([x, y]) => [-y, x]);
  const minx = Math.min(...out.map((c) => c[0])), miny = Math.min(...out.map((c) => c[1]));
  return out.map(([x, y]) => [x - minx, y - miny]);
}
export function itemCells(itemType, rot = 0) {
  const def = ITEMS[itemType];
  return rotateCells(SHAPES[def.shape] || SHAPES.dot, rot);
}
export function cellsExtent(cells) {
  return { w: Math.max(...cells.map((c) => c[0])) + 1, h: Math.max(...cells.map((c) => c[1])) + 1 };
}

// bag grid ------------------------------------------------------------------

export function bagGrid(me) {
  const bagUid = me.equipment && me.equipment.bag;
  const inst = bagUid && me.items[bagUid];
  const def = inst && ITEMS[inst.type];
  return (def && def.grid) ? def.grid : { w: 2, h: 2 };
}

// Set of "x,y" occupied by everything placed in the bag except `ignoreUid`.
export function bagOccupied(me, ignoreUid = null) {
  const occ = new Map(); // "x,y" -> uid
  const pl = (me.bag && me.bag.placements) || {};
  for (const [uid, p] of Object.entries(pl)) {
    if (uid === ignoreUid) continue;
    const inst = me.items[uid];
    if (!inst) continue;
    for (const [dx, dy] of itemCells(inst.type, p.rot || 0)) occ.set(`${p.x + dx},${p.y + dy}`, uid);
  }
  return occ;
}

// Does `itemType` at (x,y,rot) fit the grid without overlapping others?
export function fitsAt(me, itemType, x, y, rot, ignoreUid = null) {
  const grid = bagGrid(me);
  const occ = bagOccupied(me, ignoreUid);
  for (const [dx, dy] of itemCells(itemType, rot)) {
    const cx = x + dx, cy = y + dy;
    if (cx < 0 || cy < 0 || cx >= grid.w || cy >= grid.h) return false;
    if (occ.has(`${cx},${cy}`)) return false;
  }
  return true;
}

// First free slot (scanning rows, trying rotations) for a new item.
export function firstFit(me, itemType, ignoreUid = null) {
  const grid = bagGrid(me);
  for (let y = 0; y < grid.h; y++)
    for (let x = 0; x < grid.w; x++)
      for (const rot of [0, 1, 2, 3])
        if (fitsAt(me, itemType, x, y, rot, ignoreUid)) return { x, y, rot };
  return null;
}

export function bagFreeCells(me) {
  const grid = bagGrid(me);
  return grid.w * grid.h - bagOccupied(me).size;
}

// ---- income ---------------------------------------------------------------

export function statScales(me) {
  const s = me.stats || { brain: 0, build: 0 };
  const brain = (1 + TUNING.statItemScale * s.brain) * (me.specialty === "brain" ? 1 + TUNING.specialtyItemBonus : 1);
  const build = (1 + TUNING.statItemScale * s.build) * (me.specialty === "build" ? 1 + TUNING.specialtyItemBonus : 1);
  return { brain, build };
}
function scaleByTag(v, tag, sc) { return tag === "brain" ? v * sc.brain : tag === "build" ? v * sc.build : v; }

export function equippedDefs(me) {
  const out = [];
  for (const slot of ITEM_SLOTS) {
    if (slot === "bag") continue;
    const uid = me.equipment && me.equipment[slot];
    const inst = uid && me.items[uid];
    if (inst && ITEMS[inst.type]) out.push(ITEMS[inst.type]);
  }
  return out;
}

// Compact map of what to draw on the avatar: { slot: {art, color} }.
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
  const s = me.stats || { brain: 0, build: 0 };
  let flat = TUNING.baseIncome + TUNING.statFlat * (s.brain + s.build);
  let multPct = (me.buffs && me.buffs.incomeMult) || 0;

  for (const def of equippedDefs(me)) {
    if (def.value) flat += scaleByTag(def.value, def.tag, sc);
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

// ---- floor ----------------------------------------------------------------

export function expandCost(shared) {
  const steps = Math.max(0, shared.floor.w - TUNING.startFloor.w);
  return Math.ceil(TUNING.floorExpandCost * Math.pow(TUNING.floorExpandGrowth, steps));
}
export function canExpand(shared) { return shared.floor.w < TUNING.maxFloor; }

// ---- team pot -------------------------------------------------------------

export const PROPOSALS = [
  { id: "espresso", name: "Espresso Machine", glyph: "☕", desc: "Everyone's income +15% next week.", roomBuff: { incomeMult: 0.15 } },
  { id: "rug", name: "Fancy Rug", glyph: "🧶", desc: "Cozy vibes. Income +8% next week.", roomBuff: { incomeMult: 0.08 } },
  { id: "arcade", name: "Arcade Cabinet", glyph: "🕹️", desc: "Morale! Income +12% next week.", roomBuff: { incomeMult: 0.12 } },
  { id: "plants", name: "A Wall of Plants", glyph: "🪴", desc: "Fresh air. Income +10% next week.", roomBuff: { incomeMult: 0.10 } },
];
export function proposalById(id) { return PROPOSALS.find((p) => p.id === id); }

export function weekStartFor(t) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * 86400000;
}
export function voteWeight(pot, playerId) {
  const c = pot.contributions || {};
  const total = Object.values(c).reduce((a, b) => a + b, 0);
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
