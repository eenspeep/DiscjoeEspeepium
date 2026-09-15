// The store. Personal (your Joey, wallet, gear, stats) lives per-browser; the
// shared room (floor, furniture, team pot) syncs through the net adapter.

import { TUNING, ME_KEY } from "./config.js";
import { now, uid, clamp } from "./util.js";
import { defaultLook } from "./appearance.js";
import {
  income, FURNITURE, furnitureBuyCost, upgradeCost, expandCost, canExpand,
  buildStats, SPECIALTIES, ADJECTIVES, GEAR, GEAR_SLOTS, gearOption,
  weekStartFor, everyoneVoted, tallyVotes, proposalById, PROPOSALS,
} from "./economy.js";

const round2 = (n) => Math.round(n * 100) / 100;

export const state = {
  me: null,
  shared: null,
  peers: [],
  isHost: true,     // only the host advances the shared pot's interest/week
  net: null,
  dirty: false,     // shared changed, needs push
  meDirty: false,   // personal save pending
  lastOffline: null,
};

const listeners = new Set();
export function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function notify() { for (const cb of listeners) cb(); }

// ---- personal -------------------------------------------------------------

function defaultOwnedGear() {
  const owned = {};
  for (const slot of GEAR_SLOTS) owned[slot] = GEAR[slot].options.filter((o) => (o.price || 0) === 0).map((o) => o.id);
  return owned;
}

function loadMe() {
  let me;
  try { me = JSON.parse(localStorage.getItem(ME_KEY)); } catch { me = null; }
  if (!me || !me.id) {
    me = { id: uid(), created: false };
  }
  // fill defaults / heal
  me.look = { ...defaultLook(), ...(me.look || {}) };
  me.gear = me.gear || {};
  const owned = defaultOwnedGear();
  for (const slot of GEAR_SLOTS) {
    const have = new Set([...(owned[slot] || []), ...((me.gear.owned && me.gear.owned[slot]) || [])]);
    owned[slot] = [...have];
  }
  me.gear.owned = owned;
  me.gear.equipped = { hat: "none", face: "none", hand: "none", ...(me.gear.equipped || {}) };
  if (typeof me.credits !== "number") me.credits = TUNING.startCredits;
  me.pos = me.pos || { x: 0, y: 0 };
  return me;
}

export function saveMe() {
  try { localStorage.setItem(ME_KEY, JSON.stringify(state.me)); state.meDirty = false; } catch {}
}

// Build Your Joey: lock in specialty + adjective (name + stat buff) + look.
export function createJoey({ specialty, adjectiveWord, look }) {
  const me = state.me;
  const adj = ADJECTIVES.find((a) => a.word === adjectiveWord);
  const { stats, buffs } = buildStats(specialty, adj);
  me.specialty = SPECIALTIES[specialty] ? specialty : "brain";
  me.adjectiveWord = adjectiveWord;
  me.name = "JOEY " + adjectiveWord;
  me.stats = stats;
  me.buffs = buffs;
  me.look = { ...defaultLook(), ...(look || {}) };
  me.credits = TUNING.startCredits;
  me.created = true;
  me.lastTick = now();
  me.lastSeen = now();
  centerMe();
  saveMe();
  notify();
}

function centerMe() {
  const f = state.shared.floor;
  state.me.pos = { x: (f.w - 1) / 2, y: (f.h - 1) / 2 };
}

// ---- shared ---------------------------------------------------------------

function defaultPot() {
  return {
    balance: 0, contributions: {}, votes: {},
    weekStart: weekStartFor(now()), lastInterest: now(),
    phase: "growing", roomBuff: null, weekIndex: 0, history: [],
  };
}

function defaultShared() {
  const { w, h } = TUNING.startFloor;
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  const furniture = {};
  furniture[`${cx},${cy}`] = { type: "chair", level: 1 };
  furniture[`${cx + 1},${cy}`] = { type: "workbench", level: 1 };
  furniture[`${cx},${cy + 1}`] = { type: "snacktable", level: 1 };
  return { floor: { w, h }, furniture, pot: defaultPot() };
}

function healShared(s) {
  if (!s.floor) s.floor = { ...TUNING.startFloor };
  if (!s.furniture) s.furniture = {};
  if (!s.pot) s.pot = defaultPot();
  else s.pot = { ...defaultPot(), ...s.pot };
  return s;
}

// ---- lifecycle ------------------------------------------------------------

export async function initState(net) {
  state.net = net;
  state.me = loadMe();

  const remote = await net.getInitialShared();
  if (remote && remote.floor) {
    state.shared = healShared(remote);
  } else {
    state.shared = defaultShared();
    state.dirty = true;
  }

  if (state.me.created) {
    if (!state.me.pos || state.me.pos.x == null) centerMe();
    applyOffline();
  } else {
    centerMe();
  }

  net.onShared((rs) => {
    if (!rs || !rs.floor) return;
    state.shared = healShared(rs);
    notify();
  });
  net.onPeers((peers) => { state.peers = peers; electHost(); notify(); });
  electHost();
  return state;
}

function electHost() {
  let host = true;
  for (const p of state.peers) if (p.id && p.id < state.me.id) { host = false; break; }
  state.isHost = host;
}

function applyOffline() {
  const me = state.me;
  const elapsed = clamp((now() - (me.lastSeen || now())) / 1000, 0, TUNING.offlineCapHours * 3600);
  if (elapsed > 5) {
    const rate = income(me, state.shared, { passiveOnly: true });
    const gained = round2(rate * elapsed);
    me.credits = round2(me.credits + gained);
    state.lastOffline = { seconds: elapsed, gained };
  }
  me.lastSeen = now();
  me.lastTick = now();
}

// ---- ticks ----------------------------------------------------------------

export function tickEconomy() {
  const t = now();
  const me = state.me;
  if (me && me.created) {
    const dt = (t - (me.lastTick || t)) / 1000;
    me.lastTick = t;
    if (dt > 0) { me.credits = round2(me.credits + income(me, state.shared) * dt); state.meDirty = true; }
    me.lastSeen = t;
  }
  potTick(t);
}

function potTick(t) {
  const pot = state.shared && state.shared.pot;
  if (!pot || !state.isHost) return;
  if (!pot.weekStart) pot.weekStart = weekStartFor(t);
  const dt = (t - (pot.lastInterest || t)) / 1000;
  pot.lastInterest = t;
  const weekEnd = pot.weekStart + TUNING.weekMs;

  if (pot.phase !== "voting") {
    if (t < weekEnd) {
      if (pot.balance > 0 && dt > 0) {
        const r = TUNING.potInterestPerHour / 3600;
        pot.balance = round2(pot.balance * Math.pow(1 + r, dt));
        state.dirty = true;
      }
    } else {
      pot.phase = "voting";
      state.dirty = true;
    }
  } else if (everyoneVoted(pot) || t > weekEnd + TUNING.voteGraceMs) {
    resolvePot(t);
  }
}

function resolvePot(t) {
  const pot = state.shared.pot;
  const winnerId = tallyVotes(pot) || PROPOSALS[Math.floor(Math.random() * PROPOSALS.length)].id;
  const prop = proposalById(winnerId);
  pot.roomBuff = prop ? prop.roomBuff : null;
  pot.history = (pot.history || []).slice(-5);
  pot.history.push({ week: pot.weekIndex || 0, proposal: winnerId, spent: pot.balance });
  pot.weekIndex = (pot.weekIndex || 0) + 1;
  pot.balance = 0; pot.contributions = {}; pot.votes = {};
  pot.phase = "growing"; pot.weekStart = weekStartFor(t); pot.lastInterest = t;
  state.dirty = true;
  flushShared(true);
  notify();
}

export function flushShared(force = false) {
  if (state.net && (state.dirty || force)) { state.net.pushShared(state.shared); state.dirty = false; }
}

// ---- actions --------------------------------------------------------------

export function income$() { return income(state.me, state.shared); }

export function tryPlaceFurniture(type, gx, gy) {
  const s = state.shared, key = `${gx},${gy}`;
  if (!inBounds(gx, gy) || s.furniture[key]) return { ok: false, why: "That tile is taken." };
  const cost = furnitureBuyCost(s, type);
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits." };
  spend(cost);
  s.furniture[key] = { type, level: 1 };
  commit();
  return { ok: true };
}

export function tryUpgradeFurniture(key) {
  const f = state.shared.furniture[key];
  if (!f) return { ok: false };
  const cost = upgradeCost(f);
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits." };
  spend(cost);
  f.level += 1;
  commit();
  return { ok: true };
}

export function trySellFurniture(key) {
  const s = state.shared, f = s.furniture[key];
  if (!f) return { ok: false };
  const refund = Math.ceil(furnitureBuyCost(s, f.type) * 0.4);
  delete s.furniture[key];
  state.me.credits = round2(state.me.credits + refund);
  state.meDirty = true;
  commit();
  return { ok: true, refund };
}

export function tryExpandFloor() {
  const s = state.shared;
  if (!canExpand(s)) return { ok: false, why: "The office is at max size." };
  const cost = expandCost(s);
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits." };
  spend(cost);
  s.floor = { w: s.floor.w + 1, h: s.floor.h + 1 };
  commit();
  return { ok: true };
}

export function tryBuyGear(slot, id) {
  const opt = gearOption(slot, id);
  const price = opt.price || 0;
  if (state.me.gear.owned[slot].includes(id)) return { ok: true, already: true };
  if (state.me.credits < price) return { ok: false, why: "Not enough credits." };
  spend(price);
  state.me.gear.owned[slot].push(id);
  saveMe();
  notify();
  return { ok: true };
}

export function equipGear(slot, id) {
  if (!state.me.gear.owned[slot].includes(id)) return { ok: false };
  state.me.gear.equipped[slot] = id;
  saveMe(); notify();
  return { ok: true };
}

export function setLook(slot, id) {
  state.me.look[slot] = id;
  saveMe(); notify();
}

export function investPot(amount) {
  const pot = state.shared.pot;
  if (pot.phase === "voting") return { ok: false, why: "Voting is open; the pot is locked until it resolves." };
  amount = Math.floor(amount);
  if (amount <= 0) return { ok: false, why: "Invest a positive amount." };
  if (state.me.credits < amount) return { ok: false, why: "Not enough credits." };
  state.me.credits = round2(state.me.credits - amount);
  state.meDirty = true;
  pot.balance = round2(pot.balance + amount);
  pot.contributions[state.me.id] = round2((pot.contributions[state.me.id] || 0) + amount);
  commit();
  return { ok: true };
}

export function votePot(proposalId) {
  const pot = state.shared.pot;
  if (pot.phase !== "voting") return { ok: false, why: "Voting isn't open yet." };
  if (!(pot.contributions[state.me.id] > 0)) return { ok: false, why: "Only contributors vote. Invest next week!" };
  pot.votes[state.me.id] = proposalId;
  commit();
  return { ok: true };
}

// small helpers
function spend(amt) {
  state.me.credits = round2(state.me.credits - amt);
  state.meDirty = true;
}
function commit() { state.dirty = true; flushShared(true); saveMe(); notify(); }

export function inBounds(gx, gy) {
  const f = state.shared.floor;
  return gx >= 0 && gy >= 0 && gx < f.w && gy < f.h;
}

export { FURNITURE };
