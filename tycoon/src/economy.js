// The tycoon layer: what you can build in the shared workplace, what it earns,
// and how upgrades/expansion scale. All pure functions over state.

import { TUNING } from "./config.js";

// Placeable workplace modules. `rate` is credits/sec at level 1.
// Cost of the Nth copy of a type scales with how many already exist (buyGrowth),
// and upgrading a single module scales with its own level (upGrowth).
export const MODULES = {
  desk: {
    name: "Workstation", glyph: "💻", tint: "#4b56b8",
    rate: 1.0, baseCost: 25, buyGrowth: 1.18, upBaseCost: 40, upGrowth: 1.55, h: 10,
    blurb: "The bread and butter. Someone quietly shipping tickets.",
  },
  plant: {
    name: "Plant", glyph: "🪴", tint: "#3c7a4a",
    rate: 0.4, baseCost: 15, buyGrowth: 1.14, upBaseCost: 22, upGrowth: 1.5, h: 14,
    blurb: "Morale. Small, steady, and it never asks for a raise.",
  },
  coffee: {
    name: "Coffee Bar", glyph: "☕", tint: "#8a5a2b",
    rate: 3.5, baseCost: 140, buyGrowth: 1.22, upBaseCost: 200, upGrowth: 1.6, h: 12,
    blurb: "Caffeinated throughput. Pricey, but it hums.",
  },
  server: {
    name: "Server Rack", glyph: "🖥️", tint: "#3a3f4b",
    rate: 12, baseCost: 850, buyGrowth: 1.25, upBaseCost: 1100, upGrowth: 1.62, h: 20,
    blurb: "Heavy iron. Runs the numbers up fast.",
  },
  meeting: {
    name: "Meeting Pod", glyph: "🗣️", tint: "#b8459b",
    rate: 40, baseCost: 5200, buyGrowth: 1.28, upBaseCost: 6800, upGrowth: 1.66, h: 16,
    blurb: "Where decisions (and a lot of credits) get made.",
  },
};

export const MODULE_ORDER = ["desk", "plant", "coffee", "server", "meeting"];

const round = (n) => Math.round(n * 100) / 100;

// How many of a given type are placed.
export function countOfType(shared, type) {
  return Object.values(shared.modules).filter((m) => m.type === type).length;
}

// Cost to place the next module of a type (scales with how many exist).
export function buyCost(shared, type) {
  const def = MODULES[type];
  return Math.ceil(def.baseCost * Math.pow(def.buyGrowth, countOfType(shared, type)));
}

// Cost to upgrade one module from its current level.
export function upgradeCost(mod) {
  const def = MODULES[mod.type];
  return Math.ceil(def.upBaseCost * Math.pow(def.upGrowth, mod.level - 1));
}

// One module's income at its level. Each level is +60% of base rate.
export function moduleRate(mod) {
  const def = MODULES[mod.type];
  return round(def.rate * (1 + 0.6 * (mod.level - 1)));
}

// Total credits/sec from the whole floor, with a small synergy bonus so a
// denser, more varied office is worth more (rewards the "grow it" loop).
export function income(shared) {
  const mods = Object.values(shared.modules);
  let base = 0;
  for (const m of mods) base += moduleRate(m);
  const variety = new Set(mods.map((m) => m.type)).size; // 0..5
  const synergy = 1 + variety * 0.04;
  return round(base * synergy);
}

// Cost to expand the shared floor by one ring.
export function expandCost(shared) {
  const steps = Math.max(0, shared.floor.w - TUNING.startFloor.w);
  return Math.ceil(TUNING.floorExpandCost * Math.pow(TUNING.floorExpandGrowth, steps));
}

export function canExpand(shared) {
  return shared.floor.w < TUNING.maxFloor;
}
