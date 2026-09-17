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
const RESEARCH_TIERS = [0, 0, 1200, 3600, 9000, 22000, 52000, 120000, 280000, 660000, 1500000];

export const TIER_NAME = [
  "", "Supply Closet", "Break Room", "Cubicle Farm", "Server Room", "R&D Lab",
  "Innovation Wing", "Skunkworks", "Moonshot Floor", "The Singularity Lab", "Post-Work Reality",
];

// ---- stats ----------------------------------------------------------------

export const STATS = {
  brain: { label: "BRAIN", glyph: "🧠", tint: "#4b56b8" },
  build: { label: "BUILD", glyph: "🔧", tint: "#c9772f" },
};
// Three specialties, one per furniture role. A matching specialty DOUBLES that
// role (see roleMult). "brain" is kept as an alias of "research" for old saves.
export const SPECIALTIES = {
  gold: { id: "gold", name: "JOE GOLD", glyph: "💰", tint: "#d4a72c", start: { brain: 1, build: 1 }, blurb: "Money magnet. Gold furniture pays you double." },
  build: { id: "build", name: "JOE BUILD", glyph: "🔧", tint: "#c9772f", start: { brain: 1, build: 3 }, blurb: "Big hands. Build furniture works double, so you build twice as fast." },
  research: { id: "research", name: "JOE BRAIN", glyph: "🔬", tint: "#4b56b8", start: { brain: 3, build: 1 }, blurb: "Big ideas. Research furniture works double, so you research twice as fast." },
};
// A furniture's job, derived from its (legacy) tag: gold multiplies income,
// build adds build speed, research adds research speed.
export const ROLE_OF = { neutral: "gold", build: "build", brain: "research" };
export const ROLE_META = {
  gold: { label: "Gold", glyph: "💰", tint: "#d4a72c" },
  build: { label: "Build", glyph: "🔧", tint: "#c9772f" },
  research: { label: "Research", glyph: "🔬", tint: "#4b56b8" },
  soul: { label: "Soul", glyph: "🔮", tint: "#7a3fb8" },
  utility: { label: "Utility", glyph: "🐀", tint: "#7f8794" },
  hybrid: { label: "Hybrid", glyph: "⚗️", tint: "#3f9e57" },
};
// Every piece produces exactly ONE resource (or is a utility/hybrid). Soul
// channelers (altars) are their own role and never pay gold; rat spawners are
// utility. A piece flagged `hybrid` pays half of two roles (its own `roles`).
export function roleOf(type) {
  const d = FURNITURE[type]; if (!d) return "gold";
  if (d.role) return d.role;            // explicit override (utility pieces)
  if (d.hybrid) return "hybrid";
  if (d.soul) return "soul";
  if (d.ratSpawner) return "utility";
  return ROLE_OF[d.tag] || "gold";
}
// Which role a Joey's specialty doubles ("brain" is the old name for research).
export function specRole(me) {
  const s = me && me.specialty;
  if (s === "build") return "build";
  if (s === "brain" || s === "research") return "research";
  if (s === "gold" || s === "neutral") return "gold";
  return null;
}
// A player's multiplier on a given role: 2x if it's their specialty, plus a
// small per-point bump from the matching stat (build stat -> build furniture,
// brain stat -> research furniture) so stat adjectives still matter. Gold has no
// stat, only the specialty doubling.
export function roleMult(me, role) {
  let m = (specRole(me) === role) ? 2 : 1;
  const st = me && me.stats;
  if (role === "build") m *= 1 + TUNING.statItemScale * ((st && st.build) || 0);
  else if (role === "research") m *= 1 + TUNING.statItemScale * ((st && st.brain) || 0);
  return m;
}
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

// ---- powers (JAAIME-tier, non-stat superpowers) ---------------------------
// Boolean abilities granted by JAAIME adjectives. Wired individually in the
// engine via hasPower(me, key). Each is on/off (stacking JAAIME words just adds
// more powers, they don't scale).
export const POWERS = {
  blink:     { glyph: "✨", label: "Blink",       desc: "Right-click a tile within 10 to teleport to it." },
  aegis:     { glyph: "🛡️", label: "Aegis",       desc: "A free shield blocks one lethal hit, recharging every hour." },
  ratfear:   { glyph: "🐀", label: "Dreaded",     desc: "Rats are afraid of you — they flee instead of attacking." },
  golden:    { glyph: "🪙", label: "Midas",       desc: "+50% gold, always." },
  goldrats:  { glyph: "💰", label: "Rat's Purse", desc: "Rats always drop their maximum gold." },
  vampiric:  { glyph: "🧛", label: "Vampiric",    desc: "Every kill channels a burst of SOUL." },
  magnetic:  { glyph: "🧲", label: "Magnetic",    desc: "Nearby loot flies straight into your bag." },
  phase:     { glyph: "👻", label: "Phasewalk",   desc: "Walk straight through furniture." },
  shameless: { glyph: "😈", label: "Shameless",   desc: "Your kills never leave a black mark." },
  possessed: { glyph: "🔮", label: "Possessed",   desc: "Double SOUL channeling." },
  nimble:    { glyph: "🤸", label: "Weightless",  desc: "Your jump's invincibility has no cooldown." },
};
export function powerList(me) { return (me && me.powers) || []; }
export function hasPower(me, key) { return !!(me && me.powers && me.powers.includes(key)); }
export function interactRange(me) { return TUNING.adjacencyRange + traitVal(me, "interact"); }
export function withinReach(me, gx, gy) {
  if (!me || !me.pos) return false;
  const px = Math.round(me.pos.x), py = Math.round(me.pos.y);
  return Math.max(Math.abs(px - gx), Math.abs(py - gy)) <= interactRange(me);
}
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
  jaaime:    { label: "JAAIME",    weight: 1,   tint: "#d64ad9" },   // grants a superpower, not stats
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
  // JAAIME — non-stat superpowers (see POWERS). Vanishingly rare; some carry a
  // small flavor perk on top of the power.
  { word: "BLINKING", rarity: "jaaime", power: "blink" },
  { word: "BULWARKED", rarity: "jaaime", power: "aegis" },
  { word: "DREADED", rarity: "jaaime", power: "ratfear", traits: { melee: 1 } },
  { word: "GILDED", rarity: "jaaime", power: "golden" },
  { word: "PROSPEROUS", rarity: "jaaime", power: "goldrats", traits: { bounty: 1 } },
  { word: "VAMPIRIC", rarity: "jaaime", power: "vampiric", traits: { pray: 1 } },
  { word: "MAGNETIC", rarity: "jaaime", power: "magnetic", traits: { interact: 1 } },
  { word: "SPECTRAL", rarity: "jaaime", power: "phase", traits: { speed: 1 } },
  { word: "SHAMELESS", rarity: "jaaime", power: "shameless" },
  { word: "POSSESSED", rarity: "jaaime", power: "possessed", traits: { eso: 1 } },
  { word: "WEIGHTLESS", rarity: "jaaime", power: "nimble", traits: { speed: 1 } },
  { word: "JAAIME", rarity: "jaaime", powers: ["golden", "blink"] },   // the namesake: two powers at once
];
export function adjByWord(word) { return ADJECTIVES.find((a) => a.word === word); }
export function adjPowers(adj) { const out = []; if (adj.power) out.push(adj.power); for (const p of adj.powers || []) out.push(p); return out; }
export function adjSummary(adj) {
  const parts = [];
  for (const p of adjPowers(adj)) { const P = POWERS[p]; if (P) parts.push(P.glyph + " " + P.desc); }
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
// Aggregate a specialty's starting stats with EVERY adjective on the Joey's
// name (each word keeps stacking its perks). The chosen SIGNATURE adjective (the
// one shown on your name) counts for signatureMult (1.5x) on its stats + traits.
// Returns stats + traits + powers.
export function aggregateAdjs(specialtyId, adjs, signatureWord) {
  const spec = SPECIALTIES[specialtyId] || SPECIALTIES.research;
  const stats = { brain: spec.start.brain, build: spec.start.build };
  const traits = {}, powers = [];
  for (const adj of (adjs || [])) {
    if (!adj) continue;
    const m = (signatureWord && adj.word === signatureWord) ? (TUNING.signatureMult || 1.5) : 1;
    if (adj.stats) { stats.brain += (adj.stats.brain || 0) * m; stats.build += (adj.stats.build || 0) * m; }
    for (const [k, v] of Object.entries(adj.traits || {})) traits[k] = round1((traits[k] || 0) + v * m);
    for (const p of adjPowers(adj)) if (!powers.includes(p)) powers.push(p);
  }
  stats.brain = Math.round(stats.brain); stats.build = Math.round(stats.build);   // stat "points" stay whole
  return { stats, traits, powers };
}
function round1(n) { return Math.round(n * 10) / 10; }
export function buildStats(specialtyId, adj) { return aggregateAdjs(specialtyId, adj ? [adj] : [], adj && adj.word); }
export function buildStatsFromWords(specialtyId, words, signatureWord) { return aggregateAdjs(specialtyId, (words || []).map(adjByWord).filter(Boolean), signatureWord); }

// ---- Joe Levels (from SOUL) -----------------------------------------------
// Your total SOUL is your Joe Level. Each level past 1 lets you add one more
// adjective to your name. Costs grow so higher levels are a real grind.
// Each level doubles: the marginal cost to reach level i is base * 2^(i-1), so
// tier 1 costs x2, tier 2 x4, tier 3 x8, ... — mountingly more expensive.
export function soulForLevel(L) {
  if (L <= 1) return 0;
  let need = 0;
  for (let i = 2; i <= L; i++) need += TUNING.soulPerLevelBase * Math.pow(2, i - 1);
  return Math.round(need);
}
export function joeLevel(me) {
  const soul = (me && me.soul) || 0; let L = 1;
  while (L < TUNING.maxJoeLevel && soul >= soulForLevel(L + 1)) L++;
  return L;
}
// How many name adjectives this Joey is allowed (= level), and how many open.
export function adjectiveSlots(me) { return joeLevel(me); }
export function openAdjectiveSlots(me) { return Math.max(0, adjectiveSlots(me) - ((me && me.adjectives && me.adjectives.length) || 0)); }
export function nextLevelSoul(me) { const L = joeLevel(me); return L >= TUNING.maxJoeLevel ? null : soulForLevel(L + 1); }

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
  // Rat Motel: no income; every 10 min it spawns (its level) rats. Upgrade it to
  // spawn more. Rats attack the nearest player or furniture. (See state.monsters.)
  ratmotel: { name: "Rat Motel", glyph: "🏚️", tag: "neutral", tier: 3, unit: 0, costUnit: 2.2, h: 16, ratSpawner: true },
};

// ---- expansion: 100 pieces, 10 per tier, generic -> esoteric ---------------
// Compact spec: [tier, key, name, glyph, role, eso, nodes, util?]. Footprint is
// derived from node count (beds are bigger). See FURNITURE_PROPOSAL.md.
//   role: G gold · B build · R research · S soul · U utility(node bed/effect) ·
//         Hxy hybrid of two of g/b/r (half each, costs more)
const NEW_FURN = [
  // Tier 1 — Supply Closet
  [1,"t1a","Folding Table","🪑","G",0,3],[1,"t1b","Water Cooler","🧊","G",0,0],
  [1,"t1c","Supply Shelf","🗄️","U",0,4],[1,"t1d","Cork Board","📌","R",0,2],
  [1,"t1e","Beat-up Toolbox","🧰","B",0,2],[1,"t1f","Mop & Bucket","🧹","U",0,0,"repair"],
  [1,"t1g","Vending Machine","🥤","G",1,1],[1,"t1h","Lost & Found Bin","📦","U",1,1],
  [1,"t1i","Planchette Coaster","🪬","S",2,0],[1,"t1j","Bigger-Inside Closet","🚪","Hgr",3,2],
  // Tier 2 — Break Room
  [2,"t2a","Break Table","🍽️","G",0,4],[2,"t2b","Drip Coffee Maker","☕","B",0,1],
  [2,"t2c","Microwave","📟","G",0,0],[2,"t2d","Magazine Rack","📰","R",0,2],
  [2,"t2e","Snack Pantry","🍫","U",0,3],[2,"t2f","Recycling Station","♻️","U",1,1,"magnet"],
  [2,"t2g","Foosball Table","🎱","G",1,0],[2,"t2h","Fortune Teller","🔮","R",2,1],
  [2,"t2i","Cursed Fridge","🧟","S",2,1],[2,"t2j","Perpetual Stew Cauldron","🍲","S",3,2],
  // Tier 3 — Cubicle Farm
  [3,"t3a","Cubicle Desk","🖥️","G",0,2],[3,"t3b","Ergonomic Chair","💺","B",0,0],
  [3,"t3c","Filing Cabinet","🗃️","U",0,4],[3,"t3d","Desktop Terminal","💻","R",0,1],
  [3,"t3e","Standing Desk Riser","🧍","B",0,2],[3,"t3f","Poster Wall","🖼️","G",1,3],
  [3,"t3g","Paper Shredder","🗑️","U",1,1],[3,"t3h","Executive Aquarium","🐠","G",2,1],
  [3,"t3i","Whispering Cubicle","👂","S",2,1],[3,"t3j","Non-Euclidean Nap Pod","🛌","Hgb",3,1],
  // Tier 4 — Server Room
  [4,"t4a","Patch-Panel Desk","🔌","R",0,3],[4,"t4b","Rack-Mount Server","🖲️","R",0,1],
  [4,"t4c","UPS Battery Bank","🔋","B",0,2],[4,"t4d","Cable Spool Table","🧵","G",0,4],
  [4,"t4e","Cooling Fan Wall","🌀","U",0,0,"repair"],[4,"t4f","Crypto Miner Rig","⛏️","G",1,1],
  [4,"t4g","Backup Tape Vault","💽","U",1,3],[4,"t4h","Rogue AI Sandbox","🤖","R",2,1],
  [4,"t4i","Haunted Mainframe","👾","S",2,1],[4,"t4j","Quantum Blade Server","🌌","Hgr",3,2],
  // Tier 5 — R&D Lab
  [5,"t5a","Lab Bench","🧪","R",0,4],[5,"t5b","Fume Hood","🌫️","R",0,1],
  [5,"t5c","Machine Lathe","⚙️","B",0,2],[5,"t5d","Espresso Lab Rig","☕","G",0,1],
  [5,"t5e","Sample Freezer","🧊","U",0,3],[5,"t5f","Prototype Assembler","🛠️","B",1,1],
  [5,"t5g","Grant Money Printer","💵","G",1,0],[5,"t5h","Cryo-Sleep Chamber","❄️","U",2,1],
  [5,"t5i","Alchemist's Still","⚗️","S",2,2],[5,"t5j","Schrödinger's Incubator","🥚","Hgr",3,1],
  // Tier 6 — Innovation Wing
  [6,"t6a","Brainstorm Pod","💡","R",0,3],[6,"t6b","Modular Maker Bench","🔧","B",0,4],
  [6,"t6c","Investor Pitch Stage","🎤","G",0,1],[6,"t6d","3D Resin Printer","🖨️","B",0,1],
  [6,"t6e","Idea Whiteboard Cube","📊","R",0,2],[6,"t6f","Kombucha Tap Wall","🍵","G",1,2],
  [6,"t6g","Drone Charging Nest","🚁","U",1,1,"magnet"],[6,"t6h","Meditation Egg","🧘","S",2,0],
  [6,"t6i","Idea Siphon","🌪️","R",2,1],[6,"t6j","Möbius Conveyor","♾️","Hgb",3,2],
  // Tier 7 — Skunkworks
  [7,"t7a","Classified Workbench","🗂️","B",0,4],[7,"t7b","Wind Tunnel","🌬️","R",0,1],
  [7,"t7c","Black-Budget Safe","🔒","G",0,2],[7,"t7d","Robotic Arm Cell","🦾","B",0,1],
  [7,"t7e","Signals Intercept Rack","📡","R",0,3],[7,"t7f","Stealth Coating Vat","🛡️","U",1,1],
  [7,"t7g","Jetpack Dock","🚀","G",1,0],[7,"t7h","Isolation Tank","🌊","S",2,1],
  [7,"t7i","Reverse-Engineering Bay","🔬","R",2,2],[7,"t7j","Antigravity Test Rig","🛸","Hbr",3,1],
  // Tier 8 — Moonshot Floor
  [8,"t8a","Mission Control Desk","🕹️","R",0,4],[8,"t8b","Clean-Room Assembler","🧑‍🔬","B",0,2],
  [8,"t8c","Venture Fund Vault","🏦","G",0,1],[8,"t8d","Fusion Prototype","⚛️","B",0,1],
  [8,"t8e","Orbital Comms Array","🛰️","R",0,3],[8,"t8f","Hydroponic Money Tree","🌳","G",1,3],
  [8,"t8g","Cryonics Ward","⚰️","U",1,1],[8,"t8h","Astral Projection Rig","🌌","S",2,0],
  [8,"t8i","Dyson Swarm Model","☀️","R",2,1],[8,"t8j","Wormhole Prototype","🕳️","Hgr",3,2],
  // Tier 9 — The Singularity Lab
  [9,"t9a","Neural-Net Terminal","🧠","R",0,3],[9,"t9b","Nanofab Cradle","🔩","B",0,2],
  [9,"t9c","Autonomous Trading Desk","📈","G",0,1],[9,"t9d","Self-Assembling Scaffold","🏗️","B",0,4],
  [9,"t9e","Digital Twin Rack","👥","R",0,2],[9,"t9f","Attention Engine","👁️","G",1,1],
  [9,"t9g","Uploaded-Intern Server","🧟","U",1,2,"magnet"],[9,"t9h","Egregore Vat","🌀","S",2,1],
  [9,"t9i","Recursive Idea Foundry","🔁","R",2,2],[9,"t9j","Basilisk Shrine","🐍","S",3,1],
  // Tier 10 — Post-Work Reality
  [10,"t10a","Infinite Desk","♾️","G",0,5],[10,"t10b","Matter Compiler","🧱","B",0,2],
  [10,"t10c","Post-Scarcity Vault","💎","G",0,1],[10,"t10d","Labor Abolition Engine","🏭","B",0,1],
  [10,"t10e","Omniscient Oracle Core","🔮","R",0,3],[10,"t10f","Reality Rendering Farm","🖥️","R",1,2],
  [10,"t10g","Philanthropy Fountain","⛲","G",1,4],[10,"t10h","Godhead Terminal","👁️‍🗨️","S",2,1],
  [10,"t10i","Time Machine","⏳","Hbr",3,1],[10,"t10j","The Last Cubicle","🕯️","U",3,6],
];
const HROLE = { g: "gold", b: "build", r: "research" };
function footForNodes(n) { return n <= 1 ? [[0, 0]] : n === 2 ? rect(2, 1) : n <= 4 ? rect(2, 2) : rect(3, 2); }
for (const [tier, key, name, glyph, role, eso, nodes, util] of NEW_FURN) {
  const d = { name, glyph, tier, h: 11 + tier, nodes, eso, unit: 0, costUnit: Math.round((0.9 + tier * 0.16) * 100) / 100, tag: "neutral" };
  if (util) d.util = util;
  if (role === "G") d.unit = Math.round((0.7 + tier * 0.15) * 100) / 100;
  else if (role === "B") d.tag = "build";
  else if (role === "R") d.tag = "brain";
  else if (role === "S") d.soul = Math.round((0.4 + tier * 0.25) * 100) / 100;
  else if (role === "U") d.role = "utility";
  else if (role[0] === "H") { d.hybrid = true; d.roles = role.slice(1).split("").map((c) => HROLE[c]); d.unit = d.roles.includes("gold") ? Math.round((0.7 + tier * 0.15) * 100) / 100 : 0; }
  if (nodes > 1) d.foot = footForNodes(nodes);
  FURNITURE[key] = d;
}

export const FURNITURE_ORDER = Object.keys(FURNITURE).sort((a, b) => FURNITURE[a].tier - FURNITURE[b].tier);

export function countOfType(shared, type) { return Object.values(shared.furniture).filter((f) => f.type === type).length; }
export function furnitureValue(f) { const d = FURNITURE[f.type]; return d.unit * tierPower(d.tier) * (1 + 0.5 * (f.level - 1)); }
// Every piece produces exactly one resource; a `hybrid` pays HALF of each of its
// two `roles`. roleShareOf is that fraction (1 for a single-role piece, 0.5 for
// each of a hybrid's roles, 0 otherwise) — the single knob that keeps a piece
// from paying two resources at full rate.
export function roleShareOf(type, role) {
  const d = FURNITURE[type]; if (!d) return 0;
  if (d.hybrid && Array.isArray(d.roles)) return d.roles.includes(role) ? 0.5 : 0;
  return roleOf(type) === role ? 1 : 0;
}
// Role effects of one piece for a given Joey (0 unless it produces that role):
// gold -> a % added to the income multiplier; build -> build power; research -> RP/s.
export function goldPctOf(f, me) { const s = roleShareOf(f.type, "gold"); return s ? furnitureValue(f) * roleMult(me, "gold") * s : 0; }
function tierTerm(d, f) { return (d.tier + 0.5 * ((f.level || 1) - 1)); }
export function buildAddOf(f, me) { const d = FURNITURE[f.type], s = roleShareOf(f.type, "build"); return s ? TUNING.buildFurnScale * tierTerm(d, f) * roleMult(me, "build") * s : 0; }
export function researchAddOf(f, me) { const d = FURNITURE[f.type], s = roleShareOf(f.type, "research"); return s ? TUNING.researchScale * tierTerm(d, f) * roleMult(me, "research") * s : 0; }
// Soul channelled per second by one altar/obelisk (before your personal mult).
export function soulPerSec(f) { const d = FURNITURE[f.type]; return d && d.soul ? Math.round(d.soul * (1 + 0.5 * ((f.level || 1) - 1)) * TUNING.soulScale * 100) / 100 : 0; }
// Hybrids (half-and-half) cost more to buy and upgrade.
export function furnitureBaseCost(type) { const d = FURNITURE[type]; return d.costUnit * tierCost(d.tier) * (d.hybrid ? (TUNING.hybridCostMult || 1.6) : 1); }
export function furnitureBuyCost(shared, type) { return Math.ceil(furnitureBaseCost(type) * Math.pow(1.15, countOfType(shared, type))); }
export function upgradeCost(f) { return Math.ceil(furnitureBaseCost(f.type) * 0.5 * Math.pow(1.5, f.level - 1)); }
// A rat-mauled piece is repaired for half the item + half of every upgrade paid.
export function totalUpgradeSpend(type, level) { let s = 0; for (let L = 1; L < level; L++) s += upgradeCost({ type, level: L }); return s; }
export function repairCost(f) { return Math.ceil(0.5 * furnitureBaseCost(f.type) + 0.5 * totalUpgradeSpend(f.type, f.level || 1)); }
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
export function footprintOf(type) { const d = FURNITURE[type]; return (d && d.foot) || FOOTPRINT[type] || [[0, 0]]; }
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
  for (const [cx, cy] of enzoCells(shared)) set.add(cx + "," + cy);   // Enzo statue is solid
  return set;
}

// Enzo the Cat: an indestructible 2x2 statue anchored to the main room's centre.
// You can't build on it or walk through it — you click it for +1c.
export function enzoAnchor(shared) {
  const r = (shared.rooms && shared.rooms[0]) || { x: 0, y: 0, w: 9, h: 9 };
  return [r.x + Math.floor(r.w / 2) - 1, r.y + Math.floor(r.h / 2) - 1];
}
export function enzoCells(shared) {
  const [ax, ay] = enzoAnchor(shared);
  return [[ax, ay], [ax + 1, ay], [ax, ay + 1], [ax + 1, ay + 1]];
}
export function isEnzoTile(shared, gx, gy) {
  const [ax, ay] = enzoAnchor(shared);
  return gx >= ax && gx <= ax + 1 && gy >= ay && gy <= ay + 1;
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
// How many mod/node slots a piece hosts. New pieces carry `nodes`; legacy
// SURFACE pieces default to their footprint tile count.
export function nodeCap(type) {
  const d = FURNITURE[type]; if (!d) return 0;
  if (typeof d.nodes === "number") return d.nodes;
  return SURFACE.has(type) ? footprintOf(type).length : 0;
}
export function hasSurface(type) { return nodeCap(type) > 0; }
export function utilOf(type) { const d = FURNITURE[type]; return d && d.util; }

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

// ---- wall decor -----------------------------------------------------------
// Cosmetic pieces that hang on a wall edge (a walkable tile whose neighbor across
// that side is void). Placed instantly, no build site, no income (yet). Keyed
// "gx,gy,side" with side "W" (up-left wall) or "N" (up-right wall).
export const WALL_DECOR = {
  poster:    { name: "Motivational Poster", glyph: "🖼️", tier: 1, costUnit: 0.5, color: "#c9772f" },
  clock:     { name: "Wall Clock",          glyph: "🕰️", tier: 1, costUnit: 0.6, color: "#3a3f4b" },
  dartboard: { name: "Dartboard",           glyph: "🎯", tier: 2, costUnit: 0.7, color: "#b0413e" },
  sconce:    { name: "Wall Sconce",         glyph: "🕯️", tier: 2, costUnit: 0.7, color: "#c98a2b" },
  painting:  { name: "Framed Painting",     glyph: "🎨", tier: 3, costUnit: 1.0, color: "#4b56b8" },
  walltv:    { name: "Wall TV",             glyph: "📺", tier: 4, costUnit: 1.4, color: "#20242e" },
  neon:      { name: "Neon Sign",           glyph: "🪧", tier: 5, costUnit: 1.6, color: "#b8459b" },
};
export const WALL_ORDER = Object.keys(WALL_DECOR).sort((a, b) => WALL_DECOR[a].tier - WALL_DECOR[b].tier);
export function wallTier(type) { return WALL_DECOR[type] ? WALL_DECOR[type].tier : 1; }
export function wallPrice(type) { const d = WALL_DECOR[type]; return d ? Math.ceil(d.costUnit * tierCost(d.tier)) : 0; }
export function isWallUnlocked(type, shared) { return WALL_DECOR[type] && WALL_DECOR[type].tier <= currentTier(shared); }
// A real wall exists on `side` of a walkable tile when the neighbor across it is void.
export function wallIsReal(shared, gx, gy, side) {
  if (!isWalkable(shared, gx, gy)) return false;
  if (side === "W") return !isWalkable(shared, gx - 1, gy);
  if (side === "N") return !isWalkable(shared, gx, gy - 1);
  return false;
}
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
    if (!f.mods || f.broken) continue;
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
  fingerless: { name: "Fingerless Gloves", slot: "hands", tier: 1, enzoPet: 5, shape: "domino", glyph: "🧤", color: "#5a4632", costUnit: 1.15 },   // priciest tier-1: petting Enzo pays +5
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
  // ---- leash: hold it (weapon slot) to recruit a tired rat as a buddy -------
  leash: { name: "Rat Leash", slot: "weapon", tier: 2, leash: true, shape: "domino", art: "leash", glyph: "🪢", color: "#9a6b3f", costUnit: 1.1 },
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
export function blackMarkSlots(me) { if (hasPower(me, "shameless")) return 0; return Math.max(0, (me && me.kills || 0) - killFreebies(me)); }
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

// ---- pet rat (leash) ------------------------------------------------------
// A leash in the weapon slot lets you recruit one tired rat. The rat rides in
// me.pet and stays as long as the leash is in hand (put the leash away or swap
// to a weapon and the rat wanders off). It boosts soul channeling and eats one
// hit before your shields.
export function hasLeash(me) {
  const uid = me && me.equipment && me.equipment.weapon, inst = uid && me.items[uid], def = inst && ITEMS[inst.type];
  return !!(def && def.leash);
}
export function petActive(me) { return !!(me && me.pet && hasLeash(me)); }
export function petSoulMult(me) { return petActive(me) ? TUNING.petSoulMult : 1; }

// ---- income + effects -----------------------------------------------------

function itemValue(def) { return def.value ? def.value * tierPower(def.tier) : 0; }

// Coins a single Enzo pet pays: base 1, raised by the best equipped enzoPet item.
export function enzoPetValue(me) {
  let v = 1;
  for (const def of equippedDefs(me)) if (def.enzoPet) v = Math.max(v, def.enzoPet);
  return v;
}
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
// Resolve a slot->itemType map (e.g. Charlie's gear) to worn art for drawing.
export function gearWorn(gear) {
  const out = {};
  for (const [slot, type] of Object.entries(gear || {})) if (ITEMS[type]) out[slot] = { art: ITEMS[type].art, color: ITEMS[type].color };
  return out;
}
// Income is MULTIPLICATIVE now: your raw gold (base + gear value + income node
// mods) is multiplied by your gold-furniture multiplier and your gear/percent
// multipliers. Build/research furniture no longer pay gold — they give speed.
export function income(me, shared, { passiveOnly = false } = {}) {
  let flat = TUNING.baseIncome;                 // raw gold, before multipliers
  let goldMult = 0;                              // from gold furniture (multiplies flat)
  let multPct = 0.08 * traitVal(me, "income");   // gear %, pot buff, "Income" trait
  if (hasPower(me, "golden")) multPct += 0.5;    // Midas: +50% gold, always
  for (const def of equippedDefs(me)) {
    if (def.value) flat += itemValue(def);       // gear value = flat raw gold
    if (def.mult) multPct += def.mult;
  }
  if (!passiveOnly && shared && shared.furniture && me.pos) {
    const range = interactRange(me);
    for (const [key, f] of Object.entries(shared.furniture)) {
      if (f.broken) continue;   // rat-mauled furniture pays nothing until repaired
      const [gx, gy] = key.split(",").map(Number);
      if (isNearFootprint(me.pos, f.type, gx, gy, range, f.rot || 0)) {
        goldMult += goldPctOf(f, me);            // gold furniture = a multiplier
        flat += modBonusOf(f).income;            // income node mods = flat gold (gets multiplied)
      }
    }
  }
  if (shared && shared.pot && shared.pot.roomBuff && shared.pot.roomBuff.incomeMult) multPct += shared.pot.roomBuff.incomeMult;
  return Math.round(flat * (1 + goldMult + multPct) * 100) / 100;
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

// Free-form expansion: you buy floor one tile at a time out of the surrounding
// void ("fog"). Owned single tiles live in shared.tiles as a { "gx,gy": 1 } map.
export function tileCount(shared) { return shared.tiles ? Object.keys(shared.tiles).length : 0; }
export function tileCost(shared) { return Math.ceil(TUNING.tileCost * Math.pow(TUNING.tileGrowth, tileCount(shared))); }
export function canBuyTiles(shared) { return tileCount(shared) < TUNING.maxTiles; }
// A tile is buyable if it's void now but orthogonally touches existing floor
// (you can only grow the shape outward from its edge).
export function isBuyableTile(shared, gx, gy) {
  if (isWalkable(shared, gx, gy)) return false;
  return isWalkable(shared, gx - 1, gy) || isWalkable(shared, gx + 1, gy) || isWalkable(shared, gx, gy - 1) || isWalkable(shared, gx, gy + 1);
}
// The set of buyable void tiles hugging the whole office edge (the "fog frontier").
export function tileFrontier(shared) {
  const walk = walkableSet(shared), out = new Set();
  for (const k of walk) { const [x, y] = k.split(",").map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nk = (x + dx) + "," + (y + dy); if (!walk.has(nk)) out.add(nk); } }
  return out;
}

export function walkableSet(shared) {
  const s = new Set();
  for (const r of (shared.rooms || [])) for (let i = 0; i < r.w; i++) for (let j = 0; j < r.h; j++) s.add((r.x + i) + "," + (r.y + j));
  for (const h of (shared.halls || [])) for (let i = 0; i < h.w; i++) for (let j = 0; j < h.h; j++) s.add((h.x + i) + "," + (h.y + j));
  if (shared.tiles) for (const k in shared.tiles) s.add(k);
  return s;
}
export function isWalkable(shared, gx, gy) {
  if (shared.tiles && shared.tiles[gx + "," + gy]) return true;
  for (const r of (shared.rooms || [])) if (gx >= r.x && gx < r.x + r.w && gy >= r.y && gy < r.y + r.h) return true;
  for (const h of (shared.halls || [])) if (gx >= h.x && gx < h.x + h.w && gy >= h.y && gy < h.y + h.h) return true;
  return false;
}
export function inHall(shared, gx, gy) {
  for (const h of (shared.halls || [])) if (gx >= h.x && gx < h.x + h.w && gy >= h.y && gy < h.y + h.h) return true;
  return false;
}
// A tile is "protected" (communal) if it sits in a room flagged protected, in any
// office hallway, or is a bought free-form tile. Furniture in a protected tile can
// be sold by anyone, and the refund goes back to whoever paid for it.
export function isProtected(shared, gx, gy) {
  if (shared.tiles && shared.tiles[gx + "," + gy]) return true;
  for (const r of (shared.rooms || [])) if (r.protected && gx >= r.x && gx < r.x + r.w && gy >= r.y && gy < r.y + r.h) return true;
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
  if (shared.tiles) for (const k in shared.tiles) { const [x, y] = k.split(",").map(Number); eat({ x, y, w: 1, h: 1 }); }
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
  let p = TUNING.baseBuild;
  p += 0.5 * traitVal(me, "build");   // "Build speed" trait
  for (const def of equippedDefs(me)) if (def.buildBonus) p += def.buildBonus;
  if (shared && shared.furniture && me.pos) {
    const range = interactRange(me);
    for (const [key, f] of Object.entries(shared.furniture)) {
      if (f.broken) continue;
      const [gx, gy] = key.split(",").map(Number);
      if (isNearFootprint(me.pos, f.type, gx, gy, range, f.rot || 0)) p += buildAddOf(f, me);   // build furniture = build speed
    }
    p += nearbyModBonus(me, shared).build; // node mods (tools) = flat build
  }
  return p;
}
export function rpRate(me, shared) {
  if (!shared || !shared.furniture || !me.pos) return 0;
  const range = interactRange(me);
  let rp = 0;
  for (const [key, f] of Object.entries(shared.furniture)) {
    if (f.broken) continue;
    const [gx, gy] = key.split(",").map(Number);
    if (!isNearFootprint(me.pos, f.type, gx, gy, range, f.rot || 0)) continue;
    rp += researchAddOf(f, me);      // research furniture = research speed
    rp += modBonusOf(f).research;    // node mods (lamps) = flat research
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
// Progress within the CURRENT research tier, for a progress bar.
export function tierProgress(shared) {
  const tier = currentTier(shared), have = researchTotal(shared), from = RESEARCH_TIERS[tier] || 0;
  if (tier >= TIER_COUNT) return { tier, have, from, to: from, frac: 1, max: true };
  const to = RESEARCH_TIERS[tier + 1];
  return { tier, have, from, to, frac: Math.max(0, Math.min(1, (have - from) / (to - from))), max: false, next: tier + 1, name: TIER_NAME[tier + 1] };
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
export function esoOfFurniture(type) { const d = FURNITURE[type]; return (d && d.eso) || ESO_FURN[type] || 0; }

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
// Progress within the CURRENT esotericism level, for a progress bar.
export function esoProgress(me) {
  const th = esoThresholds(me), lvl = currentEso(me), have = (me && me.soul) || 0, from = th[lvl] || 0;
  if (lvl >= ESO_MAX) return { lvl, have, from, to: from, frac: 1, max: true };
  const to = th[lvl + 1];
  return { lvl, have, from, to, frac: Math.max(0, Math.min(1, (have - from) / (to - from))), max: false, next: lvl + 1, name: ESO_NAME[lvl + 1] };
}
export function esoNeed(level) { return ESO_THRESHOLDS[level] || 0; }

// SOUL/sec you channel from adjacent altars, times your soul-gear multiplier and
// the (future, kill-driven) soulMult.
export function soulRate(me, shared) {
  if (!shared || !shared.furniture || !me.pos) return 0;
  let base = 0; const range = interactRange(me);
  for (const [key, f] of Object.entries(shared.furniture)) {
    if (f.broken) continue;
    const [gx, gy] = key.split(",").map(Number);
    const def = FURNITURE[f.type];
    if (def.soul && isNearFootprint(me.pos, f.type, gx, gy, range, f.rot || 0)) base += def.soul * (1 + 0.5 * (f.level - 1));
  }
  if (base <= 0) return 0;
  let mult = 1 + 0.2 * traitVal(me, "pray");   // "Praying speed" trait
  for (const d of equippedDefs(me)) if (d.soulBonus) mult += d.soulBonus;
  mult *= petSoulMult(me);                      // a leashed rat buddy boosts channeling
  if (hasPower(me, "possessed")) mult *= 2;     // Possessed: double soul channeling
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
