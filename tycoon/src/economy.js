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
// ---- traits (adjective modifiers) -----------------------------------------
// Every adjective grants one or more of these at an integer "amount" that is
// the level (build 1/2/3 = stronger). Wired into the engine through traitVal()
// and the range/discount/etc. getters below.
export const TRAITS = {
  build:      { label: "Build speed",       glyph: "🔧", per: (a) => `+${a} build power` },
  research:   { label: "Research speed",    glyph: "🔬", per: (a) => `+${a * 15}% research` },
  pray:       { label: "Praying speed",     glyph: "🔮", per: (a) => `+${a * 20}% soul` },
  melee:      { label: "Melee range",       glyph: "🔪", per: (a) => `+${a} melee reach` },
  interact:   { label: "Interact range",    glyph: "🖐️", per: (a) => `+${a} use range` },
  speed:      { label: "Move speed",        glyph: "👟", per: (a) => `+${a * 12}% move speed` },
  size:       { label: "Size",              glyph: "📏", per: (a) => `${a > 0 ? "+" : ""}${a * 8}% size` },
  startMoney: { label: "Starting money",    glyph: "💰", per: (a) => `+${a * 100}¢ to start` },
  buildReach: { label: "Build aura",        glyph: "📡", per: (a) => `+${a} build aura` },
  income:     { label: "Income",            glyph: "¢",  per: (a) => `+${a * 8}% income` },
  offline:    { label: "Offline earning",   glyph: "🌙", per: (a) => `+${a * 10}% offline` },
  discount:   { label: "Shop discount",     glyph: "🏷️", per: (a) => `${a * 6}% off shop` },
  refund:     { label: "Refunds",           glyph: "♻️", per: (a) => `+${a * 8}% refunds` },
  bag:        { label: "Bag size",          glyph: "🎒", per: (a) => `+${a} bag column${a > 1 ? "s" : ""}` },
  weapon:     { label: "Weapon durability", glyph: "⚔️", per: (a) => `+${a} weapon use${a > 1 ? "s" : ""}` },
  eso:        { label: "Esoteric affinity", glyph: "🕯️", per: (a) => `−${a * 12}% soul to ascend` },
  researchWeight: { label: "Research weight", glyph: "📚", per: (a) => `+${a * 20}% research credit` },
  forgiveness:{ label: "Forgiveness",       glyph: "😇", per: (a) => `+${a} guilt-free kill${a > 1 ? "s" : ""}` },
  bounty:     { label: "Bounty",            glyph: "☠️", per: (a) => `+${a * 20}% kill bounty` },
  scavenger:  { label: "Scavenging",        glyph: "🧲", per: (a) => `${a * 15}% loot duplication` },
};
export function traitVal(me, key) { return (me && me.traits && me.traits[key]) || 0; }
export function interactRange(me) { return TUNING.adjacencyRange + traitVal(me, "interact"); }
export function buildRange(me) { return TUNING.adjacencyRange + traitVal(me, "buildReach"); }
export function attackRangeFor(me) { return TUNING.attackRange + 0.5 * traitVal(me, "melee"); }
export function weaponBonus(me) { return traitVal(me, "weapon"); }
export function discountFrac(me) { return Math.min(0.5, 0.06 * traitVal(me, "discount")); }
export function refundFrac(me, base = 0.4) { return Math.min(0.9, base + 0.08 * traitVal(me, "refund")); }
export function sizeMult(me) { return 1 + 0.08 * traitVal(me, "size"); }
export function killFreebies(me) { return 1 + traitVal(me, "forgiveness"); }

// ---- adjectives (name + trait bundle, by rarity) --------------------------
export const RARITY = {
  common:    { label: "Common",    weight: 100, tint: "#8a94a6" },
  uncommon:  { label: "Uncommon",  weight: 42,  tint: "#3f9e57" },
  rare:      { label: "Rare",      weight: 13,  tint: "#3f6fb8" },
  legendary: { label: "Legendary", weight: 3,   tint: "#b8862f" },
};
export const ADJECTIVES = [
  // common — one small perk
  { word: "SWOLE", rarity: "common", stats: { build: 2 } },
  { word: "BRAINY", rarity: "common", stats: { brain: 2 } },
  { word: "GRIZZLED", rarity: "common", stats: { brain: 1, build: 1 } },
  { word: "HANDY", rarity: "common", traits: { build: 1 } },
  { word: "STUDIOUS", rarity: "common", traits: { research: 1 } },
  { word: "SPRIGHTLY", rarity: "common", traits: { speed: 1 } },
  { word: "THRIFTY", rarity: "common", traits: { discount: 1 } },
  { word: "FRUGAL", rarity: "common", traits: { refund: 1 } },
  { word: "WELL-FED", rarity: "common", traits: { startMoney: 1 } },
  { word: "LONG-ARMED", rarity: "common", traits: { interact: 1 } },
  { word: "STABBY", rarity: "common", traits: { melee: 1 } },
  { word: "PIOUS", rarity: "common", traits: { pray: 1 } },
  { word: "PACKRAT", rarity: "common", traits: { bag: 1 } },
  { word: "NOCTURNAL", rarity: "common", traits: { offline: 1 } },
  { word: "LUCKY", rarity: "common", traits: { income: 1 } },
  // uncommon — a bigger perk or two small
  { word: "BUFF", rarity: "uncommon", traits: { build: 2 } },
  { word: "CLEVER", rarity: "uncommon", traits: { research: 2 } },
  { word: "FLEET", rarity: "uncommon", traits: { speed: 2 } },
  { word: "MONKISH", rarity: "uncommon", traits: { pray: 2 } },
  { word: "LOADED", rarity: "uncommon", traits: { startMoney: 2 } },
  { word: "HAGGLER", rarity: "uncommon", traits: { discount: 2 } },
  { word: "SCHOLARLY", rarity: "uncommon", traits: { research: 1, researchWeight: 1 } },
  { word: "HOARDER", rarity: "uncommon", traits: { bag: 2 } },
  { word: "INSOMNIAC", rarity: "uncommon", traits: { offline: 2 } },
  { word: "CAFFEINATED", rarity: "uncommon", traits: { income: 2 } },
  { word: "DUELIST", rarity: "uncommon", traits: { melee: 2, weapon: 1 } },
  { word: "FORESIGHTED", rarity: "uncommon", traits: { buildReach: 2 } },
  { word: "SAINTLY", rarity: "uncommon", traits: { pray: 1, forgiveness: 1 } },
  { word: "GRABBY", rarity: "uncommon", traits: { interact: 1, scavenger: 1 } },
  // rare — level-3 or strong combos
  { word: "HERCULEAN", rarity: "rare", traits: { build: 3 } },
  { word: "GENIUS", rarity: "rare", traits: { research: 3 } },
  { word: "MERCURIAL", rarity: "rare", traits: { speed: 3 } },
  { word: "MONASTIC", rarity: "rare", traits: { pray: 2, eso: 2 } },
  { word: "TYCOON", rarity: "rare", traits: { income: 2, startMoney: 2 } },
  { word: "WARLORD", rarity: "rare", traits: { melee: 2, weapon: 2, bounty: 2 } },
  { word: "ARCHITECT", rarity: "rare", traits: { build: 2, buildReach: 2 } },
  { word: "BOTTOMLESS", rarity: "rare", traits: { bag: 3 } },
  { word: "SCAVENGER", rarity: "rare", traits: { scavenger: 2, bounty: 1 } },
  { word: "REPENTANT", rarity: "rare", traits: { forgiveness: 2, pray: 1 } },
  // legendary — multi-trait monsters + the size rolls
  { word: "GIGANTIC", rarity: "legendary", traits: { size: 2, melee: 1 } },
  { word: "TINY", rarity: "legendary", traits: { size: -2, speed: 2, interact: 1 } },
  { word: "ASCENDANT", rarity: "legendary", traits: { pray: 3, eso: 3 } },
  { word: "OVERLORD", rarity: "legendary", traits: { income: 3, build: 2, speed: 1 } },
  { word: "ANOINTED", rarity: "legendary", traits: { forgiveness: 3, pray: 2, eso: 1 } },
  { word: "POLYMATH", rarity: "legendary", traits: { research: 2, build: 2, income: 1 } },
];
export function adjByWord(word) { return ADJECTIVES.find((a) => a.word === word); }
export function adjSummary(adj) {
  const parts = [];
  if (adj.stats) { if (adj.stats.brain) parts.push("🧠 +" + adj.stats.brain + " BRAIN"); if (adj.stats.build) parts.push("🔧 +" + adj.stats.build + " BUILD"); }
  for (const [k, v] of Object.entries(adj.traits || {})) { const T = TRAITS[k]; if (T) parts.push(T.glyph + " " + T.per(v)); }
  return parts.join(" · ");
}
// weighted random distinct adjectives (rarer ones show up less often)
export function rollAdjectives(n, excludeWords = []) {
  const ex = new Set(excludeWords), bag = ADJECTIVES.filter((a) => !ex.has(a.word)), out = [];
  while (out.length < n && bag.length) {
    let total = 0; for (const a of bag) total += RARITY[a.rarity].weight;
    let r = Math.random() * total, idx = bag.length - 1;
    for (let i = 0; i < bag.length; i++) { r -= RARITY[bag[i].rarity].weight; if (r <= 0) { idx = i; break; } }
    out.push(bag.splice(idx, 1)[0]);
  }
  return out;
}
export function buildStats(specialtyId, adj) {
  const spec = SPECIALTIES[specialtyId] || SPECIALTIES.brain;
  const stats = { brain: spec.start.brain, build: spec.start.build };
  const traits = {};
  if (adj) {
    if (adj.stats) { stats.brain += adj.stats.brain || 0; stats.build += adj.stats.build || 0; }
    for (const [k, v] of Object.entries(adj.traits || {})) traits[k] = (traits[k] || 0) + v;
  }
  return { stats, traits };
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
  ldesk: { name: "L-Desk", glyph: "🗒️", tag: "build", tier: 3, unit: 1.1, costUnit: 1.3, h: 12 },
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
  // Esoteric altars generate personal SOUL for whoever channels (stands) at them.
  altar: { name: "Esoteric Altar", glyph: "🔮", tag: "neutral", tier: 2, unit: 0.3, costUnit: 1.3, h: 14, soul: 1.0 },
  obelisk: { name: "Obsidian Obelisk", glyph: "🗿", tag: "neutral", tier: 6, unit: 0.5, costUnit: 1.6, h: 22, soul: 3.0 },
};
export const FURNITURE_ORDER = Object.keys(FURNITURE).sort((a, b) => FURNITURE[a].tier - FURNITURE[b].tier);

export function countOfType(shared, type) { return Object.values(shared.furniture).filter((f) => f.type === type).length; }
export function furnitureValue(f) { const d = FURNITURE[f.type]; return d.unit * tierPower(d.tier) * (1 + 0.5 * (f.level - 1)); }
export function furnitureBaseCost(type) { const d = FURNITURE[type]; return d.costUnit * tierCost(d.tier); }
export function furnitureBuyCost(shared, type) { return Math.ceil(furnitureBaseCost(type) * Math.pow(1.15, countOfType(shared, type))); }
export function upgradeCost(f) { return Math.ceil(furnitureBaseCost(f.type) * 0.5 * Math.pow(1.5, f.level - 1)); }
export function furnitureTier(type) { return FURNITURE[type].tier; }
export function furnitureWork(type) { return 6 + (FURNITURE[type].tier - 1) * 8; }

// ---- footprints + collision -----------------------------------------------
// Footprints are arbitrary cell lists (relative to the anchor), so pieces can be
// L-shaped, and can be rotated (0..3). Default is a single 1x1 tile.
function rect(w, h) { const c = []; for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) c.push([i, j]); return c; }
const FOOTPRINT = {
  pingpong: rect(2, 1), whiteboard: rect(2, 1), server: rect(2, 1), espresso: rect(2, 1), standdesk: rect(2, 1),
  researchterm: rect(2, 1), printer3d: rect(2, 1), quantumboard: rect(2, 1),
  forge: rect(2, 2), robotarm: rect(2, 2), aicluster: rect(2, 2), nanoforge: rect(2, 2), oracle: rect(2, 2), fabricator: rect(2, 2),
  singularity: rect(3, 2), realitypress: rect(3, 2),
  ldesk: [[0, 0], [1, 0], [0, 1]], // L-shaped desk
};
export function footprintOf(type) { return FOOTPRINT[type] || [[0, 0]]; }
export function footprintCells(type, ax, ay, rot = 0) {
  return rotateCells(footprintOf(type), rot).map(([x, y]) => [ax + x, ay + y]);
}
export function isNearFootprint(pos, type, ax, ay, range, rot = 0) {
  const px = Math.round(pos.x), py = Math.round(pos.y);
  for (const [cx, cy] of footprintCells(type, ax, ay, rot)) if (Math.max(Math.abs(px - cx), Math.abs(py - cy)) <= range) return true;
  return false;
}
// Set of "x,y" tiles that are solid (furniture + construction sites).
export function blockedTiles(shared) {
  const set = new Set();
  for (const [key, f] of Object.entries(shared.furniture || {})) { const [ax, ay] = key.split(",").map(Number); for (const [cx, cy] of footprintCells(f.type, ax, ay, f.rot || 0)) set.add(cx + "," + cy); }
  for (const [key, s] of Object.entries(shared.sites || {})) { const [ax, ay] = key.split(",").map(Number); for (const [cx, cy] of footprintCells(s.type, ax, ay, s.rot || 0)) set.add(cx + "," + cy); }
  return set;
}
function coversTile(type, ax, ay, rot, gx, gy) {
  for (const [cx, cy] of footprintCells(type, ax, ay, rot)) if (cx === gx && cy === gy) return true;
  return false;
}
export function furnitureAnchorAt(shared, gx, gy) {
  for (const [key, f] of Object.entries(shared.furniture || {})) { const [ax, ay] = key.split(",").map(Number); if (coversTile(f.type, ax, ay, f.rot || 0, gx, gy)) return key; }
  return null;
}
export function siteAnchorAt(shared, gx, gy) {
  for (const [key, s] of Object.entries(shared.sites || {})) { const [ax, ay] = key.split(",").map(Number); if (coversTile(s.type, ax, ay, s.rot || 0, gx, gy)) return key; }
  return null;
}

// ---- node mods (surface furniture) ----------------------------------------
// Flat bonuses mounted on a surface furniture's tiles. NOT multipliers (that's
// furniture's job). Magnitude scales with the mod's own tier so it stays useful.
const SURFACE = new Set(["snacktable", "workbench", "pingpong", "toolchest", "espresso", "standdesk", "ldesk", "printer3d", "researchterm", "robotarm", "nanoforge", "fabricator"]);
export function hasSurface(type) { return SURFACE.has(type); }

export const MODS = {
  plant: { name: "Desk Plant", glyph: "🪴", kind: "income", tier: 1, unit: 6, costUnit: 0.5 },
  lamp: { name: "Desk Lamp", glyph: "💡", kind: "research", tier: 1, unit: 6, costUnit: 0.5 },
  toolcaddy: { name: "Tool Caddy", glyph: "🧰", kind: "build", tier: 1, unit: 6, costUnit: 0.5 },
  bonsai: { name: "Bonsai Tree", glyph: "🌳", kind: "income", tier: 4, unit: 8, costUnit: 0.7 },
  lavalamp: { name: "Lava Lamp", glyph: "🔦", kind: "research", tier: 4, unit: 8, costUnit: 0.7 },
  powerdrill: { name: "Power Drill", glyph: "🛠️", kind: "build", tier: 4, unit: 8, costUnit: 0.7 },
  crystal: { name: "Crystal Orb", glyph: "🔮", kind: "research", tier: 7, unit: 11, costUnit: 0.9 },
  fern: { name: "Giant Fern", glyph: "🪴", kind: "income", tier: 7, unit: 11, costUnit: 0.9 },
};
export const MOD_ORDER = ["plant", "lamp", "toolcaddy", "bonsai", "lavalamp", "powerdrill", "fern", "crystal"];
export function modFlat(type) { const m = MODS[type]; return m ? m.unit * tierPower(m.tier) : 0; }
export function modPrice(type) { const m = MODS[type]; return m ? Math.ceil(m.costUnit * tierCost(m.tier)) : 0; }
export function isModUnlocked(type, shared) { return MODS[type] && MODS[type].tier <= currentTier(shared); }
// Sum of a furniture's mounted mods, by kind.
export function modBonusOf(f) {
  const out = { income: 0, research: 0, build: 0 };
  for (const type of Object.values(f.mods || {})) { const m = MODS[type]; if (m) out[m.kind] += modFlat(type); }
  return out;
}
// Sum of mod bonuses from every furniture the player is adjacent to.
export function nearbyModBonus(me, shared) {
  const out = { income: 0, research: 0, build: 0 };
  if (!shared || !shared.furniture || !me.pos) return out;
  const range = interactRange(me);
  for (const [key, f] of Object.entries(shared.furniture)) {
    if (!f.mods) continue;
    const [gx, gy] = key.split(",").map(Number);
    if (isNearFootprint(me.pos, f.type, gx, gy, range, f.rot || 0)) {
      const b = modBonusOf(f); out.income += b.income; out.research += b.research; out.build += b.build;
    }
  }
  return out;
}

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
  // SOUL gear — boosts how fast you channel soul at altars. The first is Eso 0
  // so you can bootstrap soul before the esoteric column opens.
  candlehat: { name: "Candle Hat", slot: "head", tier: 3, soulBonus: 0.4, shape: "triL", glyph: "🕯️", color: "#c98a2b", costUnit: 1.2 },
  ouija: { name: "Ouija Pendant", slot: "nose", tier: 4, soulBonus: 0.6, shape: "dot", glyph: "🔯", color: "#5a3fb8", costUnit: 1.4 },
  ritualrobes: { name: "Ritual Robes", slot: "torso", tier: 6, soulBonus: 1.2, shape: "square", glyph: "👘", color: "#3b2b5b", costUnit: 1.8 },
  // ---- COMBAT: weapons (hand) — attacking needs one; it breaks after `uses` ---
  knife: { name: "Knife", slot: "weapon", tier: 1, weapon: true, uses: 1, shape: "domino", art: "weapon", glyph: "🔪", color: "#b6bcc6", costUnit: 0.8 },
  machete: { name: "Machete", slot: "weapon", tier: 4, weapon: true, uses: 3, shape: "domino", art: "weapon", glyph: "🗡️", color: "#8a939f", costUnit: 1.4 },
  katana: { name: "Katana", slot: "weapon", tier: 7, weapon: true, uses: 8, shape: "line3", art: "weapon", glyph: "⚔️", color: "#dcdce4", costUnit: 2.1 },
  // ---- COMBAT: shields — each absorbs one lethal hit; the lowest-value one breaks
  // first. Tier 1 is torso; every higher tier opens a shield for another slot.
  shield_torso: { name: "Riot Shield", slot: "torso", tier: 1, shield: true, shape: "square", art: "shield", glyph: "🛡️", color: "#54648a", costUnit: 0.9 },
  shield_head: { name: "Helm Shield", slot: "head", tier: 2, shield: true, shape: "domino", art: "shield", glyph: "🛡️", color: "#54648a", costUnit: 1.0 },
  shield_legs: { name: "Plate Greaves", slot: "legs", tier: 3, shield: true, shape: "domino", art: "shield", glyph: "🛡️", color: "#54648a", costUnit: 1.1 },
  shield_feet: { name: "Boot Plates", slot: "feet", tier: 4, shield: true, shape: "domino", art: "shield", glyph: "🛡️", color: "#54648a", costUnit: 1.2 },
  shield_hands: { name: "Bracers", slot: "hands", tier: 5, shield: true, shape: "domino", art: "shield", glyph: "🛡️", color: "#54648a", costUnit: 1.3 },
  shield_eyes: { name: "Visor Shield", slot: "eyes", tier: 6, shield: true, shape: "domino", art: "shield", glyph: "🛡️", color: "#54648a", costUnit: 1.4 },
  shield_nose: { name: "Face Guard", slot: "nose", tier: 7, shield: true, shape: "dot", art: "shield", glyph: "🛡️", color: "#54648a", costUnit: 1.5 },
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
  const g = (def && def.grid) ? def.grid : { w: 2, h: 2 };
  const bonus = traitVal(me, "bag");   // "Bag size" trait adds columns
  return bonus ? { w: g.w + bonus, h: g.h } : { w: g.w, h: g.h };
}
// Black marks (from kills) eat bag cells from the back. They can exceed the
// current bag size (overflow isn't shown but still counts), so a bigger bag just
// reveals more of your sins — you can't "bag" your way out of them.
export function blackMarkSlots(me) { return Math.max(0, (me && me.kills || 0) - killFreebies(me)); }
export function blackMarkCells(me) {
  const g = bagGrid(me), total = g.w * g.h, n = Math.min(total, blackMarkSlots(me)), set = new Set();
  for (let i = 0; i < n; i++) { const idx = total - 1 - i; set.add((idx % g.w) + "," + Math.floor(idx / g.w)); }
  return set;
}
export function bagOccupied(me, ignoreUid = null) {
  const occ = new Map();
  for (const [uid, p] of Object.entries((me.bag && me.bag.placements) || {})) {
    if (uid === ignoreUid) continue;
    const inst = me.items[uid]; if (!inst) continue;
    for (const [dx, dy] of itemCells(inst.type, p.rot || 0)) occ.set(`${p.x + dx},${p.y + dy}`, uid);
  }
  for (const k of blackMarkCells(me)) if (!occ.has(k)) occ.set(k, "blackmark");
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

// ---- combat helpers -------------------------------------------------------
export function equippedWeapon(me) {
  const uid = me.equipment && me.equipment.weapon, inst = uid && me.items[uid], def = inst && ITEMS[inst.type];
  return def && def.weapon ? { uid, inst, def } : null;
}
export function equippedShields(me) {
  const out = [];
  for (const slot of ITEM_SLOTS) {
    const uid = me.equipment && me.equipment[slot], inst = uid && me.items[uid], def = inst && ITEMS[inst.type];
    if (def && def.shield) out.push({ slot, uid, def, value: tierPower(def.tier) });
  }
  return out;
}
export function lowestShield(me) {
  const s = equippedShields(me);
  if (!s.length) return null;
  return s.reduce((a, b) => (b.value < a.value ? b : a));
}
export function shieldCount(me) { return equippedShields(me).length; }

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
  let multPct = 0.08 * traitVal(me, "income");   // "Income" trait
  for (const def of equippedDefs(me)) {
    if (def.value) flat += scaleByTag(itemValue(def), def.tag, sc);
    if (def.mult) multPct += def.mult;
  }
  if (!passiveOnly && shared && shared.furniture && me.pos) {
    const range = interactRange(me);
    for (const [key, f] of Object.entries(shared.furniture)) {
      const [gx, gy] = key.split(",").map(Number);
      if (isNearFootprint(me.pos, f.type, gx, gy, range, f.rot || 0)) {
        flat += scaleByTag(furnitureValue(f), FURNITURE[f.type].tag, sc);
        flat += modBonusOf(f).income; // node mods (plants) = flat income
      }
    }
  }
  if (shared && shared.pot && shared.pot.roomBuff && shared.pot.roomBuff.incomeMult) multPct += shared.pot.roomBuff.incomeMult;
  return Math.round(flat * (1 + multPct) * 100) / 100;
}
export function effectiveSpeedMult(me) {
  let m = 1 + 0.12 * traitVal(me, "speed");   // "Move speed" trait
  for (const def of equippedDefs(me)) if (def.speedMult) m += def.speedMult;
  return m;
}
export function usingKeys(pos, shared, range = TUNING.adjacencyRange) {
  const keys = [];
  if (!shared || !shared.furniture || !pos) return keys;
  for (const [key, f] of Object.entries(shared.furniture)) { const [gx, gy] = key.split(",").map(Number); if (isNearFootprint(pos, f.type, gx, gy, range, f.rot || 0)) keys.push(key); }
  return keys;
}
export function isUsing(pos, gx, gy) {
  const px = Math.round(pos.x), py = Math.round(pos.y);
  return Math.max(Math.abs(px - gx), Math.abs(py - gy)) <= TUNING.adjacencyRange;
}

// ---- rooms + hallways + doors ---------------------------------------------
// The floor is a set of rectangular rooms joined by 1-wide hallways. rooms[0] is
// the main room. Walkable = union of room + hall cells; everything else is void.

export function roomCost(shared) {
  const n = Math.max(0, (shared.rooms ? shared.rooms.length : 1) - 1);
  return Math.ceil(TUNING.roomCost * Math.pow(TUNING.roomGrowth, n));
}
export function canAddRoom(shared) { return (shared.rooms ? shared.rooms.length : 1) < TUNING.maxRooms; }

export function walkableSet(shared) {
  const s = new Set();
  for (const r of (shared.rooms || [])) for (let i = 0; i < r.w; i++) for (let j = 0; j < r.h; j++) s.add((r.x + i) + "," + (r.y + j));
  for (const h of (shared.halls || [])) for (let i = 0; i < h.w; i++) for (let j = 0; j < h.h; j++) s.add((h.x + i) + "," + (h.y + j));
  return s;
}
export function isWalkable(shared, gx, gy) {
  for (const r of (shared.rooms || [])) if (gx >= r.x && gx < r.x + r.w && gy >= r.y && gy < r.y + r.h) return true;
  for (const h of (shared.halls || [])) if (gx >= h.x && gx < h.x + h.w && gy >= h.y && gy < h.y + h.h) return true;
  return false;
}
export function inHall(shared, gx, gy) {
  for (const h of (shared.halls || [])) if (gx >= h.x && gx < h.x + h.w && gy >= h.y && gy < h.y + h.h) return true;
  return false;
}

// The next side room + connecting hallway to add. Rooms grow along 4 arms
// (E, S, W, N) so every hallway is a straight 1-wide corridor.
export function nextRoom(shared) {
  const RS = TUNING.rooms.size, GAP = TUNING.rooms.gap, step = RS + GAP;
  const main = shared.rooms[0];
  const midX = main.x + Math.floor(main.w / 2), midY = main.y + Math.floor(main.h / 2);
  const n = (shared.rooms.length - 1), arm = n % 4, k = Math.floor(n / 4) + 1;
  const half = Math.floor(RS / 2);
  let room, hall;
  if (arm === 0) { const rx = main.x + main.w + GAP + (k - 1) * step; room = { x: rx, y: midY - half, w: RS, h: RS }; hall = { x: rx - GAP, y: midY, w: GAP, h: 1 }; }
  else if (arm === 1) { const ry = main.y + main.h + GAP + (k - 1) * step; room = { x: midX - half, y: ry, w: RS, h: RS }; hall = { x: midX, y: ry - GAP, w: 1, h: GAP }; }
  else if (arm === 2) { const rx = main.x - GAP - (k - 1) * step - RS; room = { x: rx, y: midY - half, w: RS, h: RS }; hall = { x: rx + RS, y: midY, w: GAP, h: 1 }; }
  else { const ry = main.y - GAP - (k - 1) * step - RS; room = { x: midX - half, y: ry, w: RS, h: RS }; hall = { x: midX, y: ry + RS, w: 1, h: GAP }; }
  return { room, hall };
}

// Bounding box of all rooms + halls (can be negative), used for grid bounds.
export function floorBounds(shared) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const eat = (r) => { minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); maxX = Math.max(maxX, r.x + r.w - 1); maxY = Math.max(maxY, r.y + r.h - 1); };
  for (const r of (shared.rooms || [])) eat(r);
  for (const h of (shared.halls || [])) eat(h);
  if (minX === Infinity) return { x: 0, y: 0, w: 9, h: 9 };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Whether `me` can pass the door at `key` (owner + already-unlocked pass free).
export function doorPassable(door, key, meId, unlocked) {
  if (!door) return true;
  if (!door.locked) return true;
  if (door.by === meId) return true;
  return !!(unlocked && unlocked.has(key));
}

// ---- BUILD + BRAIN --------------------------------------------------------

export function buildPower(me, shared) {
  let p = TUNING.baseBuild + TUNING.buildScale * ((me.stats && me.stats.build) || 0);
  p += 0.5 * traitVal(me, "build");   // "Build speed" trait
  for (const def of equippedDefs(me)) if (def.buildBonus) p += def.buildBonus;
  if (shared) p += nearbyModBonus(me, shared).build; // node mods (tools) = flat build
  return p;
}
export function rpRate(me, shared) {
  if (!shared || !shared.furniture || !me.pos) return 0;
  const brain = (me.stats && me.stats.brain) || 0, range = interactRange(me);
  let rp = 0;
  for (const [key, f] of Object.entries(shared.furniture)) {
    const [gx, gy] = key.split(",").map(Number);
    const def = FURNITURE[f.type];
    if (!isNearFootprint(me.pos, f.type, gx, gy, range, f.rot || 0)) continue;
    // research scales with the furniture's TIER (not its factorial income).
    if (def.tag === "brain") rp += (def.tier + 0.5 * (f.level - 1)) * TUNING.researchScale * (1 + brain * TUNING.researchStatBonus);
    rp += modBonusOf(f).research; // node mods (lamps) = flat research
  }
  for (const def of equippedDefs(me)) if (def.researchBonus) rp += def.researchBonus;
  rp *= 1 + 0.15 * traitVal(me, "research");   // "Research speed" trait
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
export function tierUnlocked(tier, shared) { return tier <= currentTier(shared); }

// ---- SOUL / esotericism (personal, horizontal axis) -----------------------
// Vertical = research tier (shared). Horizontal = esotericism level, unlocked by
// your personal SOUL (channeled at altars, boosted by soul gear and later kills).

const ESO_THRESHOLDS = [0, 120, 600, 2400];   // soul needed for eso level 0..3
export const ESO_MAX = ESO_THRESHOLDS.length - 1;
export const ESO_NAME = ["Mundane", "Curious", "Uncanny", "Eldritch"];
// which items/furniture are esoteric (>0). Everything else is a default (Eso 0).
const ESO_ITEM = { focusvisor: 1, mustachewax: 1, goldstapler: 1, ouija: 1, thirdeye: 2, neurallace: 2, antigravboots: 2, ritualrobes: 2, crown: 2, timewatch: 3, hivemind: 3, sentienttie: 3, ringbinder: 3, infinitybag: 3 };
const ESO_FURN = { quantumboard: 1, obelisk: 1, fabricator: 1, aicluster: 2, oracle: 2, singularity: 2 };
export function esoOfItem(type) { return ESO_ITEM[type] || 0; }
export function esoOfFurniture(type) { return ESO_FURN[type] || 0; }

// "Esoteric affinity" trait lowers every soul threshold, so you ascend on less.
export function esoThresholds(me) {
  const f = 1 - 0.12 * traitVal(me, "eso");
  return ESO_THRESHOLDS.map((t) => Math.floor(t * f));
}
export function currentEso(me) {
  const s = (me && me.soul) || 0, th = esoThresholds(me); let e = 0;
  for (let i = 0; i < th.length; i++) if (s >= th[i]) e = i;
  return e;
}
export function esoUnlocked(level, me) { return level <= currentEso(me); }
export function nextEso(me) {
  const e = currentEso(me);
  if (e >= ESO_MAX) return null;
  return { level: e + 1, name: ESO_NAME[e + 1], need: esoThresholds(me)[e + 1], have: Math.floor((me && me.soul) || 0) };
}
export function esoNeed(level) { return ESO_THRESHOLDS[level] || 0; }

// SOUL/sec you channel from adjacent altars, times your soul-gear multiplier and
// the (future, kill-driven) soulMult.
export function soulRate(me, shared) {
  if (!shared || !shared.furniture || !me.pos) return 0;
  let base = 0; const range = interactRange(me);
  for (const [key, f] of Object.entries(shared.furniture)) {
    const [gx, gy] = key.split(",").map(Number);
    const def = FURNITURE[f.type];
    if (def.soul && isNearFootprint(me.pos, f.type, gx, gy, range, f.rot || 0)) base += def.soul * (1 + 0.5 * (f.level - 1));
  }
  if (base <= 0) return 0;
  let mult = 1 + 0.2 * traitVal(me, "pray");   // "Praying speed" trait
  for (const d of equippedDefs(me)) if (d.soulBonus) mult += d.soulBonus;
  return Math.round(base * TUNING.soulScale * mult * ((me && me.soulMult) || 1) * 100) / 100;
}

// Unlock = research tier reached AND (personal) esotericism reached.
export function isFurnitureUnlocked(type, shared, me) { return furnitureTier(type) <= currentTier(shared) && esoOfFurniture(type) <= currentEso(me); }
export function isItemUnlocked(type, shared, me) { return itemTier(type) <= currentTier(shared) && esoOfItem(type) <= currentEso(me); }

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
