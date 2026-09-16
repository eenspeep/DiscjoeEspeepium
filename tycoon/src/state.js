// The store. Personal (your Joey, wallet, stats, inventory) saves per-browser and
// optionally to a Supabase profile (log in to recover). The shared room (floor,
// furniture, team pot) syncs through the net adapter.

import { TUNING, ME_KEY } from "./config.js";
import { now, uid, clamp } from "./util.js";
import { defaultLook } from "./appearance.js";
import {
  income, FURNITURE, furnitureBuyCost, upgradeCost, expandCost, canExpand,
  buildStats, SPECIALTIES, ADJECTIVES,
  ITEMS, ITEM_SLOTS, firstFit, fitsAt, itemCells, bagGrid,
  weekStartFor, everyoneVoted, tallyVotes, proposalById, PROPOSALS,
  furnitureWork, itemWork, itemPrice, isFurnitureUnlocked, isItemUnlocked,
  buildPower, rpRate, siteProgress, isUsing,
} from "./economy.js";

const round2 = (n) => Math.round(n * 100) / 100;

export const state = {
  me: null, shared: null, peers: [], isHost: true, net: null,
  dirty: false, meDirty: false, lastOffline: null,
  account: null,     // { userId, username } when logged in
};

const listeners = new Set();
export function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function notify() { for (const cb of listeners) cb(); }

let profileSaver = null;
export function setProfileSaver(fn) { profileSaver = fn; }

// ---- inventory helpers ----------------------------------------------------

function starterInventory() {
  const bagUid = uid();
  const equipment = {}; for (const s of ITEM_SLOTS) equipment[s] = null;
  equipment.bag = bagUid;
  return { equipment, items: { [bagUid]: { type: "bag_small" } }, bag: { placements: {} } };
}

function healInventory(me) {
  if (!me.equipment || !me.items || !me.bag) Object.assign(me, starterInventory());
  for (const s of ITEM_SLOTS) if (!(s in me.equipment)) me.equipment[s] = null;
  me.bag.placements = me.bag.placements || {};
  if (!me.equipment.bag || !me.items[me.equipment.bag]) {
    const bagUid = uid(); me.items[bagUid] = { type: "bag_small" }; me.equipment.bag = bagUid;
  }
}

function snapInv(me) { return JSON.stringify({ e: me.equipment, b: me.bag }); }
function restoreInv(me, snap) { const o = JSON.parse(snap); me.equipment = o.e; me.bag = o.b; }

function validateBag(me) {
  const grid = bagGrid(me), seen = new Set();
  for (const [id, p] of Object.entries(me.bag.placements)) {
    const inst = me.items[id]; if (!inst) return false;
    for (const [dx, dy] of itemCells(inst.type, p.rot || 0)) {
      const cx = p.x + dx, cy = p.y + dy;
      if (cx < 0 || cy < 0 || cx >= grid.w || cy >= grid.h) return false;
      const k = cx + "," + cy; if (seen.has(k)) return false; seen.add(k);
    }
  }
  return true;
}

// ---- personal identity ----------------------------------------------------

function blankMe() {
  const me = { id: uid(), created: false };
  Object.assign(me, starterInventory());
  me.look = defaultLook();
  me.credits = TUNING.startCredits;
  me.pos = { x: 0, y: 0 };
  return me;
}

function healMe(me) {
  if (!me || !me.id) me = blankMe();
  me.look = { ...defaultLook(), ...(me.look || {}) };
  if (typeof me.credits !== "number") me.credits = TUNING.startCredits;
  me.pos = me.pos || { x: 0, y: 0 };
  me.buildQueue = Array.isArray(me.buildQueue) ? me.buildQueue : [];
  healInventory(me);
  return me;
}

function loadMe() {
  let me;
  try { me = JSON.parse(localStorage.getItem(ME_KEY)); } catch { me = null; }
  return healMe(me);
}

export function saveMe() {
  try { localStorage.setItem(ME_KEY, JSON.stringify(state.me)); } catch {}
  state.meDirty = false;
  if (profileSaver && state.account) profileSaver(state.me);
}

// Replace local Joey with a cloud profile after login (or start fresh if null).
export function adoptProfile(data) {
  if (data && data.id) { state.me = healMe(data); if (state.me.created) applyOffline(); else centerMe(); }
  saveMe(); notify();
}
export function setAccount(acc) { state.account = acc; }

export function createJoey({ specialty, adjectiveWord, look }) {
  const me = state.me;
  const adj = ADJECTIVES.find((a) => a.word === adjectiveWord);
  const { stats, buffs } = buildStats(specialty, adj);
  me.specialty = SPECIALTIES[specialty] ? specialty : "brain";
  me.adjectiveWord = adjectiveWord;
  me.name = "JOEY " + adjectiveWord;
  me.stats = stats; me.buffs = buffs;
  me.look = { ...defaultLook(), ...(look || {}) };
  me.credits = TUNING.startCredits;
  me.created = true;
  me.lastTick = now(); me.lastSeen = now();
  centerMe(); saveMe(); notify();
}

function centerMe() { const f = state.shared.floor; state.me.pos = { x: (f.w - 1) / 2, y: (f.h - 1) / 2 }; }

// ---- shared ---------------------------------------------------------------

function defaultPot() {
  return { balance: 0, contributions: {}, votes: {}, weekStart: weekStartFor(now()), lastInterest: now(), phase: "growing", roomBuff: null, weekIndex: 0, history: [] };
}
function defaultShared() {
  const { w, h } = TUNING.startFloor, cx = Math.floor(w / 2), cy = Math.floor(h / 2), furniture = {};
  furniture[`${cx},${cy}`] = { type: "chair", level: 1, by: [] };
  furniture[`${cx + 1},${cy}`] = { type: "workbench", level: 1, by: [] };
  furniture[`${cx},${cy + 1}`] = { type: "snacktable", level: 1, by: [] };
  return { floor: { w, h }, furniture, sites: {}, research: { contrib: {} }, pot: defaultPot() };
}
function healShared(s) {
  if (!s.floor) s.floor = { ...TUNING.startFloor };
  if (!s.furniture) s.furniture = {};
  if (!s.sites) s.sites = {};
  if (!s.research) s.research = { contrib: {} };
  if (!s.research.contrib) s.research.contrib = {};
  s.pot = s.pot ? { ...defaultPot(), ...s.pot } : defaultPot();
  return s;
}

// ---- lifecycle ------------------------------------------------------------

export async function initState(net) {
  state.net = net;
  state.me = loadMe();

  const remote = await net.getInitialShared();
  state.shared = (remote && remote.floor) ? healShared(remote) : (state.dirty = true, defaultShared());

  if (state.me.created) { if (!state.me.pos || state.me.pos.x == null) centerMe(); applyOffline(); }
  else centerMe();

  net.onShared((rs) => { if (!rs || !rs.floor) return; state.shared = healShared(rs); notify(); });
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
    const gained = round2(income(me, state.shared, { passiveOnly: true }) * elapsed);
    me.credits = round2(me.credits + gained);
    state.lastOffline = { seconds: elapsed, gained };
  }
  me.lastSeen = now(); me.lastTick = now();
}

// ---- ticks ----------------------------------------------------------------

export function tickEconomy() {
  const t = now(), me = state.me;
  if (me && me.created) {
    const dt = (t - (me.lastTick || t)) / 1000; me.lastTick = t;
    if (dt > 0) {
      me.credits = round2(me.credits + income(me, state.shared) * dt);
      state.meDirty = true;
      buildTick(dt);
    }
    me.lastSeen = t;
  }
  potTick(t);
}

// Advance construction sites you're helping, research from BRAIN furniture, and
// your personal gear build queue.
function buildTick(dt) {
  const me = state.me, s = state.shared, power = buildPower(me);

  for (const [key, site] of Object.entries(s.sites || {})) {
    const [gx, gy] = key.split(",").map(Number);
    if (!isUsing(me.pos, gx, gy)) continue;
    site.progBy = site.progBy || {};
    site.progBy[me.id] = round2((site.progBy[me.id] || 0) + power * dt);
    state.dirty = true;
    if (siteProgress(site) >= site.work) {
      if (!s.furniture[key]) s.furniture[key] = { type: site.type, level: 1, by: Object.keys(site.progBy) };
      delete s.sites[key];
      state.justBuilt = FURNITURE[site.type] ? FURNITURE[site.type].name : site.type;
      flushShared(true);
    }
  }

  const rp = rpRate(me, s) * dt;
  if (rp > 0) {
    s.research.contrib = s.research.contrib || {};
    s.research.contrib[me.id] = round2((s.research.contrib[me.id] || 0) + rp);
    state.dirty = true;
  }

  const q = me.buildQueue;
  if (q && q.length) {
    const job = q[0];
    if (!job.done) { job.prog = round2((job.prog || 0) + power * dt); if (job.prog >= job.work) job.done = true; }
    if (job.done) {
      const id = uid(); me.items[id] = { type: job.type };
      const spot = firstFit(me, job.type);
      if (spot) { me.bag.placements[id] = { x: spot.x, y: spot.y, rot: spot.rot }; q.shift(); state.justCrafted = ITEMS[job.type] ? ITEMS[job.type].name : job.type; }
      else { delete me.items[id]; job.blocked = true; }
    }
    state.meDirty = true;
  }
}

function potTick(t) {
  const pot = state.shared && state.shared.pot;
  if (!pot || !state.isHost) return;
  if (!pot.weekStart) pot.weekStart = weekStartFor(t);
  const dt = (t - (pot.lastInterest || t)) / 1000; pot.lastInterest = t;
  const weekEnd = pot.weekStart + TUNING.weekMs;
  if (pot.phase !== "voting") {
    if (t < weekEnd) { if (pot.balance > 0 && dt > 0) { const r = TUNING.potInterestPerHour / 3600; pot.balance = round2(pot.balance * Math.pow(1 + r, dt)); state.dirty = true; } }
    else { pot.phase = "voting"; state.dirty = true; }
  } else if (everyoneVoted(pot) || t > weekEnd + TUNING.voteGraceMs) resolvePot(t);
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
  state.dirty = true; flushShared(true); notify();
}

export function flushShared(force = false) {
  if (state.net && (state.dirty || force)) { state.net.pushShared(state.shared); state.dirty = false; }
}

// ---- economy actions ------------------------------------------------------

export function income$() { return income(state.me, state.shared); }
function spend(amt) { state.me.credits = round2(state.me.credits - amt); state.meDirty = true; }
function commit() { state.dirty = true; flushShared(true); saveMe(); notify(); }

export function tryPlaceFurniture(type, gx, gy) {
  const s = state.shared, key = `${gx},${gy}`;
  if (!inBounds(gx, gy)) return { ok: false, why: "Outside the floor." };
  if (s.furniture[key] || s.sites[key]) return { ok: false, why: "That tile is taken." };
  if (!isFurnitureUnlocked(type, s)) return { ok: false, why: "Not researched yet — use BRAIN furniture." };
  const cost = furnitureBuyCost(s, type);
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits." };
  spend(cost);
  s.sites[key] = { type, work: furnitureWork(type), progBy: {}, started: now() };
  commit();
  return { ok: true, building: true };
}

export function cancelSite(key) {
  const s = state.shared, site = s.sites[key]; if (!site) return { ok: false };
  const refund = Math.ceil(furnitureBuyCost(s, site.type) * 0.4);
  delete s.sites[key]; state.me.credits = round2(state.me.credits + refund); state.meDirty = true; commit();
  return { ok: true, refund };
}
export function tryUpgradeFurniture(key) {
  const f = state.shared.furniture[key]; if (!f) return { ok: false };
  const cost = upgradeCost(f);
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits." };
  spend(cost); f.level += 1; commit(); return { ok: true };
}
export function trySellFurniture(key) {
  const s = state.shared, f = s.furniture[key]; if (!f) return { ok: false };
  if (Array.isArray(f.by) && f.by.length && !f.by.includes(state.me.id)) return { ok: false, why: "Only its builders can sell it." };
  const refund = Math.ceil(furnitureBuyCost(s, f.type) * 0.4);
  delete s.furniture[key]; state.me.credits = round2(state.me.credits + refund); state.meDirty = true; commit();
  return { ok: true, refund };
}
export function tryExpandFloor() {
  const s = state.shared; if (!canExpand(s)) return { ok: false, why: "The office is at max size." };
  const cost = expandCost(s);
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits." };
  spend(cost); s.floor = { w: s.floor.w + 1, h: s.floor.h + 1 }; commit(); return { ok: true };
}

// ---- inventory actions ----------------------------------------------------

export function tryBuyItem(type) {
  const def = ITEMS[type], price = itemPrice(type);
  if (!def || !price) return { ok: false, why: "Not for sale." };
  if (!isItemUnlocked(type, state.shared)) return { ok: false, why: "That tier isn't researched yet — use BRAIN furniture." };
  if (state.me.credits < price) return { ok: false, why: "Not enough credits." };
  spend(price);
  state.me.buildQueue.push({ type, work: itemWork(type), prog: 0 });
  saveMe(); notify();
  return { ok: true, queued: true };
}

export function cancelBuild(index) {
  const q = state.me.buildQueue, job = q[index]; if (!job) return { ok: false };
  const refund = Math.ceil(itemPrice(job.type) * 0.5);
  q.splice(index, 1); state.me.credits = round2(state.me.credits + refund); saveMe(); notify();
  return { ok: true, refund };
}

export function equipItem(id) {
  const me = state.me, inst = me.items[id]; if (!inst) return { ok: false };
  const def = ITEMS[inst.type];
  if (def.noEquip || !def.slot) return { ok: false, why: "Can't equip that." };
  if (!me.bag.placements[id]) return { ok: false, why: "It must be in your bag first." };
  const slot = def.slot, prev = me.equipment[slot], snap = snapInv(me);
  delete me.bag.placements[id];
  if (prev) {
    const spot = firstFit(me, me.items[prev].type);
    if (!spot) { restoreInv(me, snap); return { ok: false, why: "No bag room to swap that out." }; }
    me.bag.placements[prev] = { x: spot.x, y: spot.y, rot: spot.rot };
  }
  me.equipment[slot] = id;
  if (!validateBag(me)) { restoreInv(me, snap); return { ok: false, why: "That bag is too small for what you're carrying." }; }
  saveMe(); notify(); return { ok: true };
}

export function unequipItem(slot) {
  const me = state.me, id = me.equipment[slot]; if (!id) return { ok: false };
  if (slot === "bag") return { ok: false, why: "You can't remove your only bag." };
  const spot = firstFit(me, me.items[id].type);
  if (!spot) return { ok: false, why: "No bag room to stow it." };
  me.equipment[slot] = null; me.bag.placements[id] = { x: spot.x, y: spot.y, rot: spot.rot };
  saveMe(); notify(); return { ok: true };
}

export function moveItem(id, x, y, rot) {
  const me = state.me, inst = me.items[id]; if (!inst || !me.bag.placements[id]) return { ok: false };
  if (ITEMS[inst.type].immovable) return { ok: false, why: "It won't budge." };
  if (!fitsAt(me, inst.type, x, y, rot, id)) return { ok: false };
  me.bag.placements[id] = { x, y, rot }; saveMe(); notify(); return { ok: true };
}

export function rotateItem(id) {
  const me = state.me, inst = me.items[id], p = me.bag.placements[id];
  if (!inst || !p || ITEMS[inst.type].immovable) return { ok: false };
  const rot = ((p.rot || 0) + 1) % 4;
  if (fitsAt(me, inst.type, p.x, p.y, rot, id)) { p.rot = rot; saveMe(); notify(); return { ok: true }; }
  return { ok: false, why: "No room to rotate." };
}

export function trySellItem(id) {
  const me = state.me, inst = me.items[id]; if (!inst) return { ok: false };
  const def = ITEMS[inst.type];
  if (def.noSell) return { ok: false, why: "You can't get rid of that." };
  if (!me.bag.placements[id]) return { ok: false, why: "Unequip it first." };
  const refund = Math.ceil(itemPrice(inst.type) * 0.4);
  delete me.bag.placements[id]; delete me.items[id];
  me.credits = round2(me.credits + refund); saveMe(); notify();
  return { ok: true, refund };
}

export function setLook(slot, id) { state.me.look[slot] = id; saveMe(); notify(); }

// ---- team pot -------------------------------------------------------------

export function investPot(amount) {
  const pot = state.shared.pot;
  if (pot.phase === "voting") return { ok: false, why: "Voting is open; the pot is locked." };
  amount = Math.floor(amount);
  if (amount <= 0) return { ok: false, why: "Invest a positive amount." };
  if (state.me.credits < amount) return { ok: false, why: "Not enough credits." };
  state.me.credits = round2(state.me.credits - amount); state.meDirty = true;
  pot.balance = round2(pot.balance + amount);
  pot.contributions[state.me.id] = round2((pot.contributions[state.me.id] || 0) + amount);
  commit(); return { ok: true };
}
export function votePot(proposalId) {
  const pot = state.shared.pot;
  if (pot.phase !== "voting") return { ok: false, why: "Voting isn't open yet." };
  if (!(pot.contributions[state.me.id] > 0)) return { ok: false, why: "Only contributors vote. Invest next week!" };
  pot.votes[state.me.id] = proposalId; commit(); return { ok: true };
}

export function inBounds(gx, gy) { const f = state.shared.floor; return gx >= 0 && gy >= 0 && gx < f.w && gy < f.h; }

export { FURNITURE };
