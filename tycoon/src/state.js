// The store. Personal (your Joey, wallet, stats, inventory) saves per-browser and
// optionally to a Supabase profile (log in to recover). The shared room (floor,
// furniture, team pot) syncs through the net adapter.

import { TUNING, ME_KEY, CHARLIE_ID } from "./config.js";
import { now, uid, clamp, hash } from "./util.js";
import { defaultLook } from "./appearance.js";
import {
  income, FURNITURE, FURNITURE_ORDER, furnitureBuyCost, upgradeCost,
  roomCost, canAddRoom, nextRoom, floorBounds, isWalkable, inHall, walkableSet,
  buildStats, SPECIALTIES, ADJECTIVES,
  ITEMS, ITEM_SLOTS, firstFit, fitsAt, itemCells, bagGrid,
  weekStartFor, everyoneVoted, tallyVotes, proposalById, PROPOSALS,
  furnitureWork, itemWork, itemPrice, isFurnitureUnlocked, isItemUnlocked,
  buildPower, rpRate, soulRate, siteProgress, isNearFootprint,
  currentTier, currentEso, furnitureTier, itemTier, esoOfFurniture, esoOfItem,
  footprintCells, blockedTiles, furnitureAnchorAt, hasSurface, isModUnlocked, modPrice,
  equippedWeapon, lowestShield, blackMarkCells,
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
  const grid = bagGrid(me), seen = new Set(blackMarkCells(me));
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
  if (typeof me.soul !== "number") me.soul = 0;
  if (typeof me.soulMult !== "number") me.soulMult = 1; // raised by kills
  if (typeof me.kills !== "number") me.kills = 0;       // drives black marks
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

function entityTiles() {
  const s = new Set(), m = state.me && state.me.pos;
  if (m) s.add(Math.round(m.x) + "," + Math.round(m.y));
  for (const p of state.peers) if (p.x != null) s.add(Math.round(p.x) + "," + Math.round(p.y));
  return s;
}
function freeTileNear(gx, gy) {
  const s = state.shared, blocked = blockedTiles(s);
  const ok = (x, y) => isWalkable(s, x, y) && !blocked.has(x + "," + y) && !(s.doors && s.doors[x + "," + y]);
  if (ok(gx, gy)) return { x: gx, y: gy };
  for (let r = 1; r < 60; r++)
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = gx + dx, y = gy + dy;
      if (ok(x, y)) return { x, y };
    }
  return { x: gx, y: gy };
}
function centerMe() { const r0 = state.shared.rooms[0]; state.me.pos = freeTileNear(r0.x + Math.floor(r0.w / 2), r0.y + Math.floor(r0.h / 2)); }

// ---- shared ---------------------------------------------------------------

function defaultPot() {
  return { balance: 0, contributions: {}, votes: {}, weekStart: weekStartFor(now()), lastInterest: now(), phase: "growing", roomBuff: null, weekIndex: 0, history: [] };
}
function defaultShared() {
  const { w, h } = TUNING.startFloor, cx = Math.floor(w / 2), cy = Math.floor(h / 2), furniture = {};
  furniture[`${cx},${cy}`] = { type: "chair", level: 1, by: [] };
  furniture[`${cx + 1},${cy}`] = { type: "workbench", level: 1, by: [] };
  furniture[`${cx},${cy + 1}`] = { type: "snacktable", level: 1, by: [] };
  return { rooms: [{ x: 0, y: 0, w, h }], halls: [], doors: {}, floor: { x: 0, y: 0, w, h }, furniture, sites: {}, loot: {}, charlie: { alive: true, diedAt: null, lastBuy: now() }, research: { contrib: {} }, pot: defaultPot() };
}
function healShared(s) {
  if (!s.rooms) { const w = (s.floor && s.floor.w) || 9, h = (s.floor && s.floor.h) || 9; s.rooms = [{ x: 0, y: 0, w, h }]; }
  if (!s.halls) s.halls = [];
  if (!s.doors) s.doors = {};
  if (!s.furniture) s.furniture = {};
  if (!s.sites) s.sites = {};
  if (!s.loot) s.loot = {};
  if (!s.charlie) s.charlie = { alive: true, diedAt: null, lastBuy: now() };
  if (!s.research) s.research = { contrib: {} };
  if (!s.research.contrib) s.research.contrib = {};
  s.floor = floorBounds(s);
  s.pot = s.pot ? { ...defaultPot(), ...s.pot } : defaultPot();
  return s;
}

// ---- lifecycle ------------------------------------------------------------

export async function initState(net) {
  state.net = net;
  state.me = loadMe();

  const remote = await net.getInitialShared();
  state.shared = (remote && remote.floor) ? healShared(remote) : (state.dirty = true, defaultShared());

  if (state.me.created) {
    if (!state.me.pos || state.me.pos.x == null) centerMe();
    else {
      const rx = Math.round(state.me.pos.x), ry = Math.round(state.me.pos.y);
      if (!isWalkable(state.shared, rx, ry) || blockedTiles(state.shared).has(rx + "," + ry)) state.me.pos = freeTileNear(rx, ry);
    }
    applyOffline();
  } else centerMe();

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
      const soul = soulRate(me, state.shared) * dt;
      if (soul > 0) me.soul = round2(me.soul + soul);
      state.meDirty = true;
      buildTick(dt);
    }
    me.lastSeen = t;
  }
  potTick(t);
  charlieTick(t);
}

// Advance construction sites you're helping, research from BRAIN furniture, and
// your personal gear build queue.
function buildTick(dt) {
  const me = state.me, s = state.shared, power = buildPower(me, s);

  for (const [key, site] of Object.entries(s.sites || {})) {
    const [gx, gy] = key.split(",").map(Number);
    if (!isNearFootprint(me.pos, site.type, gx, gy, TUNING.adjacencyRange)) continue;
    site.progBy = site.progBy || {};
    site.progBy[me.id] = round2((site.progBy[me.id] || 0) + power * dt);
    state.dirty = true;
    if (siteProgress(site) >= site.work) {
      if (!s.furniture[key]) s.furniture[key] = { type: site.type, level: 1, by: Object.keys(site.progBy), rot: site.rot || 0 };
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

export function tryPlaceFurniture(type, gx, gy, rot = 0) {
  const s = state.shared, key = `${gx},${gy}`;
  if (furnitureTier(type) > currentTier(s)) return { ok: false, why: "That tier isn't researched yet — use BRAIN furniture." };
  if (esoOfFurniture(type) > currentEso(state.me)) return { ok: false, why: "Not esoteric enough — channel SOUL at an altar." };
  const cells = footprintCells(type, gx, gy, rot);
  for (const [cx, cy] of cells) if (!isWalkable(s, cx, cy)) return { ok: false, why: "It doesn't fit inside a room." };
  const blocked = blockedTiles(s);
  for (const [cx, cy] of cells) if (blocked.has(cx + "," + cy) || (s.doors && s.doors[cx + "," + cy])) return { ok: false, why: "That space is taken." };
  const occ = entityTiles();
  for (const [cx, cy] of cells) if (occ.has(cx + "," + cy)) return { ok: false, why: "Someone's standing there." };
  const cost = furnitureBuyCost(s, type);
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits." };
  spend(cost);
  s.sites[key] = { type, rot, work: furnitureWork(type), progBy: {}, started: now() };
  commit();
  return { ok: true, building: true };
}

export function tryPlaceMod(modType, gx, gy) {
  const s = state.shared, fKey = furnitureAnchorAt(s, gx, gy);
  if (!fKey) return { ok: false, why: "Mods go on furniture surfaces." };
  const f = s.furniture[fKey];
  if (!hasSurface(f.type)) return { ok: false, why: "That furniture has no surface." };
  if (!isModUnlocked(modType, s)) return { ok: false, why: "That tier isn't researched yet." };
  f.mods = f.mods || {};
  const mk = gx + "," + gy;
  if (f.mods[mk]) return { ok: false, why: "There's already a mod there." };
  const price = modPrice(modType);
  if (state.me.credits < price) return { ok: false, why: "Not enough credits." };
  spend(price); f.mods[mk] = modType; commit();
  return { ok: true };
}
export function tryRemoveMod(gx, gy) {
  const s = state.shared, fKey = furnitureAnchorAt(s, gx, gy);
  if (!fKey) return { ok: false };
  const f = s.furniture[fKey], mk = gx + "," + gy;
  if (!f.mods || !f.mods[mk]) return { ok: false };
  const refund = Math.ceil(modPrice(f.mods[mk]) * 0.4);
  delete f.mods[mk]; state.me.credits = round2(state.me.credits + refund); state.meDirty = true; commit();
  return { ok: true, refund };
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
export function tryAddRoom() {
  const s = state.shared;
  if (!canAddRoom(s)) return { ok: false, why: "The office is at max size." };
  const cost = roomCost(s);
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits." };
  const { room, hall } = nextRoom(s);
  spend(cost);
  s.rooms.push(room); s.halls.push(hall); s.floor = floorBounds(s);
  commit();
  return { ok: true, room };
}

// ---- doors ----------------------------------------------------------------

export function tryPlaceDoor(gx, gy) {
  const s = state.shared, key = `${gx},${gy}`;
  if (currentTier(s) < TUNING.doorTier) return { ok: false, why: "Doors unlock at research Tier " + TUNING.doorTier + "." };
  if (!inHall(s, gx, gy)) return { ok: false, why: "Doors go in hallways." };
  if (s.doors[key]) return { ok: false, why: "There's already a door there." };
  if (s.furniture[key] || s.sites[key]) return { ok: false, why: "That tile is occupied." };
  if (state.me.credits < TUNING.doorCost) return { ok: false, why: "Not enough credits." };
  spend(TUNING.doorCost);
  s.doors[key] = { by: state.me.id, locked: false, hash: null };
  commit();
  return { ok: true };
}
export function tryLockDoor(key, password) {
  const d = state.shared.doors[key]; if (!d) return { ok: false };
  if (d.by !== state.me.id) return { ok: false, why: "Only the door's owner can lock it." };
  if (!password) return { ok: false, why: "Type a password first." };
  if (state.me.credits < TUNING.lockCost) return { ok: false, why: "A lock costs " + TUNING.lockCost + "." };
  spend(TUNING.lockCost);
  d.locked = true; d.hash = hash(String(password));
  commit();
  return { ok: true };
}
export function tryUnlockDoor(key) {
  const d = state.shared.doors[key]; if (!d) return { ok: false };
  if (d.by !== state.me.id) return { ok: false, why: "Only the owner can unlock it." };
  d.locked = false; commit();
  return { ok: true };
}
export function checkDoorPassword(key, password) {
  const d = state.shared.doors[key];
  return !!(d && d.locked && d.hash === hash(String(password)));
}
export function tryRemoveDoor(key) {
  const s = state.shared, d = s.doors[key]; if (!d) return { ok: false };
  if (d.by !== state.me.id) return { ok: false, why: "Only the owner can remove it." };
  const refund = Math.ceil(TUNING.doorCost * 0.4 + (d.locked ? TUNING.lockCost * 0.3 : 0));
  delete s.doors[key]; state.me.credits = round2(state.me.credits + refund); state.meDirty = true; commit();
  return { ok: true, refund };
}

// ---- combat ---------------------------------------------------------------

function addLoot(key, types) {
  if (!types || !types.length) return;
  const s = state.shared; s.loot = s.loot || {};
  const pile = s.loot[key] || { items: [] };
  pile.items.push(...types); s.loot[key] = pile; state.dirty = true;
}

// Swing the equipped weapon: it loses one use and breaks at zero (a knife has
// exactly one). Returns the weapon def if we had one, else null.
export function useWeapon() {
  const me = state.me, w = equippedWeapon(me);
  if (!w) return null;
  const inst = me.items[w.uid];
  inst.uses = (inst.uses != null ? inst.uses : w.def.uses) - 1;
  if (inst.uses <= 0) { delete me.items[w.uid]; me.equipment.weapon = null; }
  state.meDirty = true; saveMe(); notify();
  return w.def;
}

// Everything this Joey is carrying spills onto the ground pile at `key`.
function dropAllItems(me, key) {
  const types = [];
  for (const slot of ITEM_SLOTS) {
    const id = me.equipment[slot], inst = id && me.items[id];
    if (inst && ITEMS[inst.type] && inst.type !== "blackmark") types.push(inst.type);
    me.equipment[slot] = null;
  }
  for (const p of Object.keys(me.bag.placements)) {
    const inst = me.items[p]; if (inst && inst.type !== "blackmark") types.push(inst.type);
  }
  me.items = {}; me.bag.placements = {};
  addLoot(key, types);
}

// I was attacked. A shield (lowest value first) eats the hit and shatters;
// otherwise I die, drop everything, and hand my coins to the attacker.
export function receiveAttack(fromName) {
  const me = state.me;
  if (!me.created) return { ignore: true };
  const shield = lowestShield(me);
  if (shield) {
    const name = shield.def.name;
    delete me.items[shield.uid]; me.equipment[shield.slot] = null;
    state.meDirty = true; saveMe(); notify();
    state.justBlocked = { by: fromName || "someone", shield: name };
    return { blocked: true, shield: name };
  }
  const coins = Math.floor(me.credits || 0);
  killMe(fromName);
  return { killed: true, coins };
}

// Wipe this character (no respawn — you remake). Drops all gear where you fell.
export function killMe(byName) {
  const me = state.me, key = Math.round(me.pos.x) + "," + Math.round(me.pos.y);
  dropAllItems(me, key);
  const keepId = me.id, keepLook = { ...me.look };
  const fresh = blankMe();
  fresh.id = keepId; fresh.look = keepLook; fresh.credits = 0;
  state.me = fresh;
  state.justKilled = byName || "someone";
  flushShared(true); centerMe(); saveMe(); notify();
}

// A kill I landed: black mark (first one is just a warning), soul nudge, and
// black marks evict whatever they land on.
export function registerKill(victimName) {
  const me = state.me;
  me.kills = (me.kills || 0) + 1;
  me.soulMult = round2((me.soulMult || 1) + TUNING.killSoulMult);
  if (me.kills === 1) state.justFirstKill = true;
  else state.justBlackMark = true;
  absorbBlackMarks(me);
  state.meDirty = true; saveMe(); notify();
}
function absorbBlackMarks(me) {
  const black = blackMarkCells(me); if (!black.size) return;
  const displaced = [];
  for (const [id, p] of Object.entries({ ...me.bag.placements })) {
    const inst = me.items[id]; if (!inst) continue;
    if (itemCells(inst.type, p.rot || 0).some(([dx, dy]) => black.has((p.x + dx) + "," + (p.y + dy)))) { delete me.bag.placements[id]; displaced.push(id); }
  }
  const key = Math.round(me.pos.x) + "," + Math.round(me.pos.y), dropped = [];
  for (const id of displaced) {
    const inst = me.items[id], spot = firstFit(me, inst.type);
    if (spot) me.bag.placements[id] = { x: spot.x, y: spot.y, rot: spot.rot };
    else { dropped.push(inst.type); delete me.items[id]; }
  }
  addLoot(key, dropped);
}

// The attacker's client got word that its strike killed a peer.
export function applyKillReward(coins, victimName) {
  state.me.credits = round2(state.me.credits + (coins || 0)); state.meDirty = true;
  registerKill(victimName || "someone");
}

// Pick up a ground pile into the bag (whatever fits; the rest stays).
export function tryPickup(gx, gy) {
  const s = state.shared, key = gx + "," + gy, pile = s.loot && s.loot[key];
  if (!pile || !pile.items.length) return { ok: false };
  const me = state.me, taken = [], left = [];
  for (const type of pile.items) {
    const spot = firstFit(me, type);
    if (spot) { const id = uid(); me.items[id] = { type }; me.bag.placements[id] = { x: spot.x, y: spot.y, rot: spot.rot }; taken.push(type); }
    else left.push(type);
  }
  if (left.length) pile.items = left; else delete s.loot[key];
  state.meDirty = true; commit();
  return { ok: taken.length > 0, taken: taken.length, left: left.length };
}

// ---- Garlic Charlie -------------------------------------------------------

export function isCharlieAlive() { return !!(state.shared && state.shared.charlie && state.shared.charlie.alive); }

function charlieDrop() {
  const pool = ["knife", "clipboard", "ballcap", "mug", "boots", "shield_torso", "goggles", "hardhat"];
  const n = 2 + Math.floor(Math.random() * 3), out = [];
  for (let i = 0; i < n; i++) out.push(pool[Math.floor(Math.random() * pool.length)]);
  return out;
}
// A player struck Charlie where he stands on their screen. Local resolution:
// he dies, drops loot, the coins bounty goes to the killer, host respawns him.
export function killCharlie(cx, cy) {
  const s = state.shared;
  if (!s.charlie || !s.charlie.alive) return { ok: false };
  const key = Math.round(cx) + "," + Math.round(cy);
  addLoot(key, charlieDrop());
  const bounty = Math.max(1, Math.round(TUNING.charlieBountyMult * currentTier(s)));
  state.me.credits = round2(state.me.credits + bounty); state.meDirty = true;
  s.charlie.alive = false; s.charlie.diedAt = now();
  registerKill("Garlic Charlie");
  commit();
  return { ok: true, bounty };
}

let lastCharlie = 0;
function charlieBuyInterval() { return TUNING.charlieBuyMinMs + Math.random() * (TUNING.charlieBuyMaxMs - TUNING.charlieBuyMinMs); }
function charlieFreeTile() {
  const s = state.shared, r0 = s.rooms[0], blocked = blockedTiles(s), ents = entityTiles();
  for (let i = 0; i < 40; i++) {
    const x = r0.x + Math.floor(Math.random() * r0.w), y = r0.y + Math.floor(Math.random() * r0.h), k = x + "," + y;
    if (!isWalkable(s, x, y) || blocked.has(k) || ents.has(k)) continue;
    if ((s.doors && s.doors[k]) || (s.loot && s.loot[k]) || s.furniture[k] || s.sites[k]) continue;
    return k;
  }
  return null;
}
function charlieMaybeBuy(t) {
  const s = state.shared, c = s.charlie;
  if (!c.buyGap) c.buyGap = charlieBuyInterval();
  if (t < (c.lastBuy || 0) + c.buyGap) return;
  c.lastBuy = t; c.buyGap = charlieBuyInterval();
  if (Object.keys(s.furniture).length + Object.keys(s.sites).length >= TUNING.charlieMaxFurniture) return;
  const cap = Math.min(2, currentTier(s));
  const types = FURNITURE_ORDER.filter((ty) => furnitureTier(ty) <= cap && esoOfFurniture(ty) === 0 && footprintCells(ty, 0, 0, 0).length === 1);
  if (!types.length) return;
  const spot = charlieFreeTile(); if (!spot) return;
  s.furniture[spot] = { type: types[Math.floor(Math.random() * types.length)], level: 1, by: [CHARLIE_ID] };
  state.dirty = true;
}
function charlieTick(t) {
  if (!state.isHost) return;
  const s = state.shared; if (!s || !s.charlie) return;
  const dt = (t - (lastCharlie || t)) / 1000; lastCharlie = t;
  if (!s.charlie.alive) {
    if (s.charlie.diedAt && t - s.charlie.diedAt >= TUNING.charlieRespawnMs) { s.charlie.alive = true; s.charlie.diedAt = null; s.charlie.lastBuy = t; s.charlie.buyGap = null; state.dirty = true; }
    return;
  }
  const pot = s.pot;
  if (pot && pot.phase !== "voting" && dt > 0 && dt < 3600) {
    const give = round2(TUNING.charlieDonatePerSec * dt);
    pot.balance = round2(pot.balance + give);
    pot.contributions[CHARLIE_ID] = round2((pot.contributions[CHARLIE_ID] || 0) + give);
    state.dirty = true;
  }
  if (pot && pot.phase === "voting" && !pot.votes[CHARLIE_ID] && (pot.contributions[CHARLIE_ID] || 0) > 0) {
    pot.votes[CHARLIE_ID] = PROPOSALS[Math.floor(Math.random() * PROPOSALS.length)].id; state.dirty = true;
  }
  charlieMaybeBuy(t);
}

// ---- inventory actions ----------------------------------------------------

export function tryBuyItem(type) {
  const def = ITEMS[type], price = itemPrice(type);
  if (!def || !price) return { ok: false, why: "Not for sale." };
  if (itemTier(type) > currentTier(state.shared)) return { ok: false, why: "That tier isn't researched yet — use BRAIN furniture." };
  if (esoOfItem(type) > currentEso(state.me)) return { ok: false, why: "Not esoteric enough — channel SOUL at an altar." };
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

export function inBounds(gx, gy) { const f = state.shared.floor; return gx >= f.x && gy >= f.y && gx < f.x + f.w && gy < f.y + f.h; }

export { FURNITURE };
