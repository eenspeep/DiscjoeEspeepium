// The store. Personal (your Joey, wallet, stats, inventory) saves per-browser and
// optionally to a Supabase profile (log in to recover). The shared room (floor,
// furniture, team pot) syncs through the net adapter.

import { TUNING, ME_KEY, CHARLIE_ID } from "./config.js";
import { now, uid, clamp, hash } from "./util.js";
import { defaultLook, normalizeLook } from "./appearance.js";
import {
  income, FURNITURE, FURNITURE_ORDER, furnitureBuyCost, upgradeCost,
  roomCost, canAddRoom, nextRoom, floorBounds, isWalkable, walkableSet, isProtected,
  buildStats, SPECIALTIES, ADJECTIVES,
  ITEMS, ITEM_SLOTS, firstFit, fitsAt, itemCells, bagGrid,
  weekStartFor, everyoneVoted, tallyVotes, proposalById, PROPOSALS,
  furnitureWork, itemWork, itemPrice, isFurnitureUnlocked, isItemUnlocked,
  buildPower, rpRate, soulRate, siteProgress, isNearFootprint,
  currentTier, currentEso, furnitureTier, itemTier, esoOfFurniture, esoOfItem,
  footprintCells, blockedTiles, furnitureAnchorAt, hasSurface, isModUnlocked, modPrice,
  equippedWeapon, lowestShield, equippedShields, blackMarkCells,
  buildRange, discountFrac, refundFrac, killFreebies, weaponBonus, traitVal, withinReach, repairCost,
  hasLeash, petActive,
  WALL_DECOR, wallPrice, isWallUnlocked, wallIsReal,
  tileCost, canBuyTiles, isBuyableTile,
} from "./economy.js";

const round2 = (n) => Math.round(n * 100) / 100;

export const state = {
  me: null, shared: null, peers: [], isHost: true, net: null,
  netId: null,       // this connection's id (net.myId); the id peers advertise. Host election runs in THIS space, not me.id.
  dirty: false, meDirty: false, lastOffline: null,
  account: null,     // { userId, username } when logged in
};

const listeners = new Set();
export function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
// Coalesce bursts of notify() into one UI refresh per frame (net events, ticks,
// and actions can all fire in quick succession — no need to rebuild DOM each time).
let notifyPending = false;
function runNotify() { notifyPending = false; for (const cb of listeners) cb(); }
function notify() {
  if (notifyPending) return;
  notifyPending = true;
  if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(runNotify);
  else setTimeout(runNotify, 0);
}

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
  me.look = normalizeLook(me.look);
  if (typeof me.credits !== "number") me.credits = TUNING.startCredits;
  me.pos = me.pos || { x: 0, y: 0 };
  me.buildQueue = Array.isArray(me.buildQueue) ? me.buildQueue : [];
  if (typeof me.soul !== "number") me.soul = 0;
  if (typeof me.soulMult !== "number") me.soulMult = 1; // raised by kills
  if (typeof me.kills !== "number") me.kills = 0;       // drives black marks
  if (me.pet && typeof me.pet.since !== "number") me.pet = null; // leashed rat buddy
  if (!me.traits || typeof me.traits !== "object") me.traits = {};
  healInventory(me);
  return me;
}

function loadMe() {
  let me;
  try { me = JSON.parse(localStorage.getItem(ME_KEY)); } catch { me = null; }
  return healMe(me);
}

export function saveMe() {
  state.me.savedAt = Date.now();   // so the freshest copy wins on next load
  try { localStorage.setItem(ME_KEY, JSON.stringify(state.me)); } catch {}
  state.meDirty = false;
  if (profileSaver && state.account) profileSaver(state.me);
}

// Adopt a cloud profile after login. On the same device localStorage is always
// as-fresh-or-fresher (it saves instantly; the cloud save is debounced), so a
// quick refresh must not clobber it with a stale cloud copy. Keep local when
// it's the same created Joey and not older than the cloud copy.
export function adoptProfile(data) {
  if (data && data.id) {
    const local = state.me;
    const keepLocal = local && local.created && local.id === data.id && (local.savedAt || 0) >= (data.savedAt || 0);
    if (!keepLocal) { state.me = healMe(data); if (state.me.created) applyOffline(); else centerMe(); }
  }
  saveMe(); notify();
}
export function setAccount(acc) { state.account = acc; }

export function createJoey({ specialty, adjectiveWord, look }) {
  const me = state.me;
  const adj = ADJECTIVES.find((a) => a.word === adjectiveWord);
  const { stats, traits } = buildStats(specialty, adj);
  me.specialty = SPECIALTIES[specialty] ? specialty : "research";
  me.adjectiveWord = adjectiveWord;
  me.name = "JOEY " + adjectiveWord;
  me.stats = stats; me.traits = traits;
  me.look = normalizeLook(look);
  me.credits = TUNING.startCredits + 100 * (traits.startMoney || 0);   // "Starting money" trait
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
// A spawn/unstick spot: a free tile in a ring AROUND the office center (never the
// center itself, which is the Enzo statue), randomized and avoiding other Joeys
// so people don't all land on one tile and wedge each other. Falls back outward.
function spawnSpot() {
  const s = state.shared, blocked = blockedTiles(s), ents = entityTiles(), r0 = s.rooms[0];
  const cx = r0.x + Math.floor(r0.w / 2), cy = r0.y + Math.floor(r0.h / 2);
  const ok = (x, y) => isWalkable(s, x, y) && !blocked.has(x + "," + y) && !(s.doors && s.doors[x + "," + y]);
  for (let r = 1; r < 40; r++) {
    const ring = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // ring edge only
      const x = cx + dx, y = cy + dy;
      if (ok(x, y)) ring.push([x, y]);
    }
    for (let i = ring.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ring[i], ring[j]] = [ring[j], ring[i]]; }
    const free = ring.find(([x, y]) => !ents.has(x + "," + y));   // prefer a tile nobody's on
    if (free) return { x: free[0], y: free[1] };
    if (ring.length) return { x: ring[0][0], y: ring[0][1] };     // ring is walkable but crowded — still better than center
  }
  return freeTileNear(cx, cy);
}
function centerMe() { state.me.pos = spawnSpot(); }

// "I'm wedged." Escape hatch: warp to a free floor tile at the office center
// (spawn), which is always open. Personal only, no shared change.
export function unstick() {
  if (!state.me || !state.me.created) return { ok: false };
  centerMe();
  state.me.moving = false;
  state.meDirty = true; saveMe(); notify();
  return { ok: true };
}

// ---- shared ---------------------------------------------------------------

function defaultPot() {
  return { balance: 0, contributions: {}, votes: {}, weekStart: weekStartFor(now()), lastInterest: now(), phase: "growing", roomBuff: null, weekIndex: 0, history: [] };
}
function defaultShared() {
  const { w, h } = TUNING.startFloor, furniture = {};
  // keep the centre clear for the Enzo statue (see economy.enzoCells)
  furniture[`1,1`] = { type: "chair", level: 1, by: [] };
  furniture[`2,1`] = { type: "workbench", level: 1, by: [] };
  furniture[`1,2`] = { type: "snacktable", level: 1, by: [] };
  return { rooms: [{ x: 0, y: 0, w, h, protected: true }], halls: [], tiles: {}, doors: {}, floor: { x: 0, y: 0, w, h }, furniture, walls: {}, sites: {}, loot: {}, owed: {}, monsters: {}, charlie: { alive: true, diedAt: null, lastBuy: now(), gear: {} }, research: { contrib: {} }, pot: defaultPot() };
}
function healShared(s) {
  if (!s.rooms) { const w = (s.floor && s.floor.w) || 9, h = (s.floor && s.floor.h) || 9; s.rooms = [{ x: 0, y: 0, w, h }]; }
  // every office room is protected (communal furniture); backfill old saves
  for (const r of s.rooms) if (r.protected === undefined) r.protected = true;
  if (!s.halls) s.halls = [];
  if (!s.tiles) s.tiles = {};
  if (!s.doors) s.doors = {};
  if (!s.furniture) s.furniture = {};
  if (!s.walls) s.walls = {};
  if (!s.sites) s.sites = {};
  if (!s.loot) s.loot = {};
  if (!s.owed) s.owed = {};
  if (!s.monsters) s.monsters = {};
  if (!s.charlie) s.charlie = { alive: true, diedAt: null, lastBuy: now(), gear: {} };
  if (!s.charlie.gear) s.charlie.gear = {};
  if (!s.research) s.research = { contrib: {} };
  if (!s.research.contrib) s.research.contrib = {};
  s.floor = floorBounds(s);
  s.pot = s.pot ? { ...defaultPot(), ...s.pot } : defaultPot();
  return s;
}

// ---- lifecycle ------------------------------------------------------------

export async function initState(net) {
  state.net = net;
  state.netId = net.myId || null;   // peers advertise this id; elect on it, never on me.id (a peer's id and me.id are different id spaces, so comparing them makes host election a coin flip — both-host or both-guest)
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

  // The host IS the authority for the shared office. It must never overwrite its
  // own state from an inbound full-state broadcast — doing so let a stale peer
  // (or a second client that also thinks it's host) resurrect things the host
  // just changed, e.g. furniture you sold reappearing a moment later. Only
  // non-hosts adopt the broadcast.
  net.onShared((rs) => { if (state.isHost) return; if (!rs || !rs.floor) return; state.shared = healShared(rs); notify(); });
  net.onPeers((peers) => {
    state.peers = peers;   // the render loop reads positions from here every frame
    electHost();
    const ids = peers.map((p) => p.id).sort().join(",");   // only rebuild UI when the roster changes, not on every position tick
    if (ids !== state._peerIds) { state._peerIds = ids; notify(); }
  });
  electHost();
  return state;
}

// The office needs exactly one writer. Everyone runs the same rule: lowest id
// wins. The ids MUST come from one space — peers advertise their connection id
// (net.myId), so we compare against ours (state.netId), never me.id.
function electHost() {
  const mine = state.netId || state.me?.id;
  if (!mine) { state.isHost = true; return; }
  let host = true;
  for (const p of state.peers) if (p.id && p.id < mine) { host = false; break; }
  state.isHost = host;
}

function applyOffline() {
  const me = state.me;
  const elapsed = clamp((now() - (me.lastSeen || now())) / 1000, 0, TUNING.offlineCapHours * 3600);
  if (elapsed > 5) {
    const offlineMult = 1 + 0.1 * traitVal(me, "offline");   // "Offline earning" trait
    const gained = round2(income(me, state.shared, { passiveOnly: true }) * elapsed * offlineMult);
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
    if (t - lastContribFlush > 750) { lastContribFlush = t; flushContrib(); }   // batch build/research to the host
    claimOwed();
  }
  potTick(t);
  charlieTick(t);
  monsterTick(t);
}

// Advance construction sites you're helping, research from BRAIN furniture, and
// your personal gear build queue.
function buildTick(dt) {
  const me = state.me, s = state.shared, power = buildPower(me, s);

  const bReach = buildRange(me);
  for (const [key, site] of Object.entries(s.sites || {})) {
    const [gx, gy] = key.split(",").map(Number);
    if (!isNearFootprint(me.pos, site.type, gx, gy, bReach)) continue;
    contribute(key, round2(power * dt));   // my build contribution (batched to the host)
    // Completion is an idempotent op so it fires on whoever is standing here,
    // host or not (a guest relays it; applyOp no-ops if it's already built). This
    // is what stops a site from accruing past its work total and never building
    // when you aren't the authoritative host.
    if (siteProgress(site) >= site.work && !s.furniture[key]) {
      sharedOp({ t: "furnDone", key });
      state.justBuilt = FURNITURE[site.type] ? FURNITURE[site.type].name : site.type;
      if (state.isHost) flushShared(true);
    }
  }

  const rp = rpRate(me, s) * dt * (1 + 0.2 * traitVal(me, "researchWeight"));   // "Research weight" trait
  if (rp > 0) contributeRp(round2(rp));

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

// Only the host writes/broadcasts the shared office. Non-hosts relay their
// changes as ops (below), so concurrent edits no longer clobber each other.
export function flushShared(force = false) {
  if (state.net && state.isHost && (state.dirty || force)) { state.net.pushShared(state.shared); state.dirty = false; }
}
function netSend(msg) { if (state.net && state.net.send) state.net.send(msg); }

// ---- host-authoritative shared ops ----------------------------------------
// A shared mutation is expressed as a small data "op". applyOp reduces it onto
// a shared object (identical on host and single-player). sharedOp applies it
// locally (optimistic) and, if I'm not the host, relays it to the host; the
// host applies relayed ops onto the authoritative state and rebroadcasts.
export function applyOp(s, op) {
  switch (op.t) {
    case "site+": s.sites[op.key] = op.val; break;
    case "site-": delete s.sites[op.key]; break;
    case "furn+": s.furniture[op.key] = op.val; break;
    case "furn-": delete s.furniture[op.key]; break;
    case "furnDone": {   // a construction site finished -> turn it into furniture (idempotent)
      const st = s.sites[op.key];
      if (st && !s.furniture[op.key]) s.furniture[op.key] = { type: st.type, level: 1, by: Object.keys(st.progBy || {}), rot: st.rot || 0, paidBy: st.paidBy || null };
      if (st) delete s.sites[op.key];
      break;
    }
    case "furnLvl": if (s.furniture[op.key]) s.furniture[op.key].level = op.level; break;
    case "furnBroken": if (s.furniture[op.key]) s.furniture[op.key].broken = op.val; break;
    case "mod+": { const f = s.furniture[op.key]; if (f) { f.mods = f.mods || {}; f.mods[op.mk] = op.mod; } break; }
    case "mod-": { const f = s.furniture[op.key]; if (f && f.mods) delete f.mods[op.mk]; break; }
    case "wall+": s.walls = s.walls || {}; s.walls[op.key] = op.val; break;
    case "wall-": if (s.walls) delete s.walls[op.key]; break;
    case "door+": s.doors[op.key] = op.val; break;
    case "door-": delete s.doors[op.key]; break;
    case "doorLock": { const d = s.doors[op.key]; if (d) { d.locked = op.locked; if ("hash" in op) d.hash = op.hash; } break; }
    case "rooms": s.rooms = op.rooms; s.halls = op.halls; s.floor = op.floor; break;
    case "tile+": s.tiles = s.tiles || {}; s.tiles[op.key] = 1; s.floor = floorBounds(s); break;
    case "tile-": if (s.tiles) delete s.tiles[op.key]; s.floor = floorBounds(s); break;
    case "owed+": s.owed = s.owed || {}; s.owed[op.pid] = round2((s.owed[op.pid] || 0) + op.amt); break;
    case "owed-": if (s.owed) delete s.owed[op.pid]; break;
    case "contrib": { s.research = s.research || { contrib: {} }; s.research.contrib = s.research.contrib || {}; s.research.contrib[op.pid] = round2((s.research.contrib[op.pid] || 0) + op.rp); break; }
    case "progBy": { const st = s.sites[op.key]; if (st) { st.progBy = st.progBy || {}; st.progBy[op.pid] = round2((st.progBy[op.pid] || 0) + op.work); } break; }
    case "contribBatch": {   // one message carrying a tick or two of build progress + research
      s.research = s.research || { contrib: {} }; s.research.contrib = s.research.contrib || {};
      if (op.rp) s.research.contrib[op.pid] = round2((s.research.contrib[op.pid] || 0) + op.rp);
      for (const k in (op.prog || {})) { const st = s.sites[k]; if (st) { st.progBy = st.progBy || {}; st.progBy[op.pid] = round2((st.progBy[op.pid] || 0) + op.prog[k]); } }
      break;
    }
    case "loot+": addLootTo(s, op.key, op.types); break;
    case "monster-": if (s.monsters) delete s.monsters[op.id]; break;
    case "monsterGuard": { const m = s.monsters && s.monsters[op.id]; if (m) { m.guard = op.guard; if (op.armorKey) { addLootTo(s, op.armorKey, [op.armorType]); m.armor = null; } } break; }
    case "potInvest": { const p = s.pot; if (p) { p.balance = round2(p.balance + op.amt); p.contributions[op.pid] = round2((p.contributions[op.pid] || 0) + op.amt); } break; }
    case "potVote": { if (s.pot) s.pot.votes[op.pid] = op.proposal; break; }
    case "spawnRat": break;   // resolved on the host only (hostApplyOp)
  }
}
function sharedOp(op, local = true) {
  if (local) applyOp(state.shared, op);
  if (state.isHost) state.dirty = true; else netSend({ type: "__op", op, from: state.me.id });
}
// Host side: apply a relayed op onto the authoritative state, then rebroadcast.
export function hostApplyOp(op) {
  if (!state.isHost || !op) return;
  if (op.t === "spawnRat") spawnRat(op.x, op.y);
  else applyOp(state.shared, op);
  state.dirty = true; flushShared(true); notify();
}

// Build progress + research happen every tick. Applying locally is cheap, but a
// non-host must NOT send one message per tick (Supabase caps events/sec). So we
// apply optimistically and batch the network side, flushed ~1.3×/s.
const pendingProg = {}; let pendingRp = 0; let lastContribFlush = 0;
function contribute(key, work) {
  applyOp(state.shared, { t: "progBy", key, pid: state.me.id, work });
  if (state.isHost) state.dirty = true; else pendingProg[key] = round2((pendingProg[key] || 0) + work);
}
function contributeRp(rp) {
  applyOp(state.shared, { t: "contrib", pid: state.me.id, rp });
  if (state.isHost) state.dirty = true; else pendingRp = round2(pendingRp + rp);
}
function flushContrib() {
  if (state.isHost) return;
  const keys = Object.keys(pendingProg);
  if (!keys.length && pendingRp <= 0) return;
  netSend({ type: "__op", op: { t: "contribBatch", pid: state.me.id, prog: { ...pendingProg }, rp: pendingRp }, from: state.me.id });
  for (const k of keys) delete pendingProg[k];
  pendingRp = 0;
}

// ---- economy actions ------------------------------------------------------

export function income$() { return income(state.me, state.shared); }
function spend(amt) { state.me.credits = round2(state.me.credits - amt); state.meDirty = true; }
// A local action finished: persist my personal state + refresh UI. The shared
// office is synced via sharedOp/flushShared, not here.
function commit() { saveMe(); notify(); if (state.isHost) flushShared(true); }

// Refunds owed to another player are parked in a shared ledger and claimed by
// that player's own client (survives them being offline when you sell).
function creditOwed(playerId, amount) {
  sharedOp({ t: "owed+", pid: playerId, amt: amount });
}
function claimOwed() {
  const s = state.shared, me = state.me;
  if (!s || !s.owed || !me || !me.created) return;
  const amt = s.owed[me.id];
  if (amt && amt > 0) {
    me.credits = round2(me.credits + amt);
    sharedOp({ t: "owed-", pid: me.id });
    state.meDirty = true; state.justRefund = amt;
    if (state.isHost) flushShared(true);
    notify();
  }
}
// Route a furniture/site refund to whoever paid: my wallet if it's mine, the
// shared ledger if it's a real other player, my wallet if the payer is unknown
// or the bot (so gold isn't lost to the void).
function payRefund(payerId, amount) {
  if (payerId && payerId !== state.me.id && payerId !== CHARLIE_ID) { creditOwed(payerId, amount); return true; }
  state.me.credits = round2(state.me.credits + amount); state.meDirty = true; return false;
}

export function tryPlaceFurniture(type, gx, gy, rot = 0) {
  const s = state.shared, key = `${gx},${gy}`;
  if (!withinReach(state.me, gx, gy)) return { ok: false, why: "Too far — stand closer to place it." };
  if (furnitureTier(type) > currentTier(s)) return { ok: false, why: "That tier isn't researched yet — use BRAIN furniture." };
  if (esoOfFurniture(type) > currentEso(state.me)) return { ok: false, why: "Not esoteric enough — channel SOUL at an altar." };
  const cells = footprintCells(type, gx, gy, rot);
  for (const [cx, cy] of cells) if (!isWalkable(s, cx, cy)) return { ok: false, why: "It doesn't fit inside a room." };
  const blocked = blockedTiles(s);
  for (const [cx, cy] of cells) if (blocked.has(cx + "," + cy) || (s.doors && s.doors[cx + "," + cy])) return { ok: false, why: "That space is taken." };
  const occ = entityTiles();
  for (const [cx, cy] of cells) if (occ.has(cx + "," + cy)) return { ok: false, why: "Someone's standing there." };
  const cost = Math.ceil(furnitureBuyCost(s, type) * (1 - discountFrac(state.me)));   // "Shop discount" trait
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits." };
  spend(cost);
  sharedOp({ t: "site+", key, val: { type, rot, work: furnitureWork(type), progBy: {}, started: now(), paidBy: state.me.id, paid: cost } });
  commit();
  return { ok: true, building: true };
}

// Hang a decor piece on a wall edge (gx,gy,side). Instant, no build site.
export function tryPlaceWall(type, gx, gy, side) {
  const s = state.shared; s.walls = s.walls || {};
  if (!WALL_DECOR[type]) return { ok: false, why: "Unknown decor." };
  if (!isWallUnlocked(type, s)) return { ok: false, why: "That tier isn't researched yet." };
  if (!wallIsReal(s, gx, gy, side)) return { ok: false, why: "No wall to hang it on." };
  if (!withinReach(state.me, gx, gy)) return { ok: false, why: "Too far — stand closer to the wall." };
  const key = gx + "," + gy + "," + side;
  if (s.walls[key]) return { ok: false, why: "Something's already on that wall." };
  const cost = Math.ceil(wallPrice(type) * (1 - discountFrac(state.me)));
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits." };
  spend(cost);
  sharedOp({ t: "wall+", key, val: { type, paidBy: state.me.id, paid: cost } });
  commit();
  return { ok: true };
}
export function trySellWall(key) {
  const s = state.shared, w = s.walls && s.walls[key]; if (!w) return { ok: false };
  const [gx, gy] = key.split(",").map(Number), prot = isProtected(s, gx, gy);
  if (!prot && w.paidBy && w.paidBy !== state.me.id) return { ok: false, why: "Only the buyer can take this down." };
  const mine = !w.paidBy || w.paidBy === state.me.id;
  const refund = Math.ceil(wallPrice(w.type) * (mine ? refundFrac(state.me) : 0.4));
  sharedOp({ t: "wall-", key });
  const toOther = payRefund(w.paidBy, refund);
  commit();
  return { ok: true, refund, toOther };
}

export function tryPlaceMod(modType, gx, gy) {
  const s = state.shared, fKey = furnitureAnchorAt(s, gx, gy);
  if (!withinReach(state.me, gx, gy)) return { ok: false, why: "Too far — stand closer." };
  if (!fKey) return { ok: false, why: "Mods go on furniture surfaces." };
  const f = s.furniture[fKey];
  if (!hasSurface(f.type)) return { ok: false, why: "That furniture has no surface." };
  if (!isModUnlocked(modType, s)) return { ok: false, why: "That tier isn't researched yet." };
  f.mods = f.mods || {};
  const mk = gx + "," + gy;
  if (f.mods[mk]) return { ok: false, why: "There's already a mod there." };
  const price = modPrice(modType);
  if (state.me.credits < price) return { ok: false, why: "Not enough credits." };
  spend(price); sharedOp({ t: "mod+", key: fKey, mk, mod: modType }); commit();
  return { ok: true };
}
export function tryRemoveMod(gx, gy) {
  const s = state.shared, fKey = furnitureAnchorAt(s, gx, gy);
  if (!fKey) return { ok: false };
  const f = s.furniture[fKey], mk = gx + "," + gy;
  if (!f.mods || !f.mods[mk]) return { ok: false };
  const refund = Math.ceil(modPrice(f.mods[mk]) * refundFrac(state.me));
  sharedOp({ t: "mod-", key: fKey, mk }); state.me.credits = round2(state.me.credits + refund); state.meDirty = true; commit();
  return { ok: true, refund };
}

export function cancelSite(key) {
  const s = state.shared, site = s.sites[key]; if (!site) return { ok: false };
  const [gx, gy] = key.split(",").map(Number), prot = isProtected(s, gx, gy);
  if (!prot && site.paidBy && site.paidBy !== state.me.id) return { ok: false, why: "Only the buyer can cancel this build." };
  const payer = site.paidBy, mine = !payer || payer === state.me.id;
  const refund = Math.ceil(furnitureBuyCost(s, site.type) * (mine ? refundFrac(state.me) : 0.4));
  sharedOp({ t: "site-", key });
  const toOther = payRefund(payer, refund);
  commit();
  return { ok: true, refund, toOther };
}
export function tryUpgradeFurniture(key) {
  const f = state.shared.furniture[key]; if (!f) return { ok: false };
  const cost = upgradeCost(f);
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits." };
  spend(cost); sharedOp({ t: "furnLvl", key, level: (f.level || 1) + 1 }); commit(); return { ok: true };
}
export function trySellFurniture(key) {
  const s = state.shared, f = s.furniture[key]; if (!f) return { ok: false };
  const [gx, gy] = key.split(",").map(Number), prot = isProtected(s, gx, gy);
  // outside a protected room, only the builders may sell (private-room rule)
  if (!prot && Array.isArray(f.by) && f.by.length && !f.by.includes(state.me.id)) return { ok: false, why: "Only its builders can sell it." };
  const payer = f.paidBy, mine = !payer || payer === state.me.id;
  const refund = Math.ceil(furnitureBuyCost(s, f.type) * (mine ? refundFrac(state.me) : 0.4));
  sharedOp({ t: "furn-", key });
  const toOther = payRefund(payer, refund);
  commit();
  return { ok: true, refund, toOther };
}
export function tryAddRoom() {
  const s = state.shared;
  if (!canAddRoom(s)) return { ok: false, why: "The office is at max size." };
  const cost = roomCost(s);
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits." };
  const { room, hall } = nextRoom(s);
  room.protected = true;   // rooms added onto the office are protected too
  spend(cost);
  const rooms = s.rooms.concat([room]), halls = s.halls.concat([hall]);
  sharedOp({ t: "rooms", rooms, halls, floor: floorBounds({ rooms, halls }) });
  commit();
  return { ok: true, room };
}
// Buy one floor tile out of the fog: it must be void, orthogonally touch existing
// floor, and be within reach (you expand from the edge you're standing on).
export function tryBuyTile(gx, gy) {
  const s = state.shared;
  if (!canBuyTiles(s)) return { ok: false, why: "The office is at its maximum size." };
  if (!isBuyableTile(s, gx, gy)) return { ok: false, why: "Expand into the fog right next to your floor." };
  if (!withinReach(state.me, gx, gy)) return { ok: false, why: "Too far — stand at the edge to expand there." };
  const cost = tileCost(s);
  if (state.me.credits < cost) return { ok: false, why: "Not enough credits (" + cost + ")." };
  spend(cost);
  sharedOp({ t: "tile+", key: gx + "," + gy });
  commit();
  return { ok: true, cost };
}

// ---- doors ----------------------------------------------------------------

export function tryPlaceDoor(gx, gy) {
  const s = state.shared, key = `${gx},${gy}`;
  if (!withinReach(state.me, gx, gy)) return { ok: false, why: "Too far — stand next to the tile." };
  if (currentTier(s) < TUNING.doorTier) return { ok: false, why: "Doors unlock at research Tier " + TUNING.doorTier + "." };
  if (!isWalkable(s, gx, gy)) return { ok: false, why: "Doors go on floor tiles." };
  if (s.doors[key]) return { ok: false, why: "There's already a door there." };
  if (s.furniture[key] || s.sites[key]) return { ok: false, why: "That tile is occupied." };
  if (state.me.credits < TUNING.doorCost) return { ok: false, why: "Not enough credits." };
  spend(TUNING.doorCost);
  sharedOp({ t: "door+", key, val: { by: state.me.id, locked: false, hash: null } });
  commit();
  return { ok: true };
}
export function tryLockDoor(key, password) {
  const d = state.shared.doors[key]; if (!d) return { ok: false };
  if (d.by !== state.me.id) return { ok: false, why: "Only the door's owner can lock it." };
  if (!password) return { ok: false, why: "Type a password first." };
  if (state.me.credits < TUNING.lockCost) return { ok: false, why: "A lock costs " + TUNING.lockCost + "." };
  spend(TUNING.lockCost);
  sharedOp({ t: "doorLock", key, locked: true, hash: hash(String(password)) });
  commit();
  return { ok: true };
}
export function tryUnlockDoor(key) {
  const d = state.shared.doors[key]; if (!d) return { ok: false };
  if (d.by !== state.me.id) return { ok: false, why: "Only the owner can unlock it." };
  sharedOp({ t: "doorLock", key, locked: false }); commit();
  return { ok: true };
}
export function checkDoorPassword(key, password) {
  const d = state.shared.doors[key];
  return !!(d && d.locked && d.hash === hash(String(password)));
}
export function tryRemoveDoor(key) {
  const s = state.shared, d = s.doors[key]; if (!d) return { ok: false };
  if (d.by !== state.me.id) return { ok: false, why: "Only the owner can remove it." };
  const refund = Math.ceil(TUNING.doorCost * refundFrac(state.me) + (d.locked ? TUNING.lockCost * 0.3 : 0));
  sharedOp({ t: "door-", key }); state.me.credits = round2(state.me.credits + refund); state.meDirty = true; commit();
  return { ok: true, refund };
}

// ---- combat ---------------------------------------------------------------

function addLootTo(s, key, types) {
  if (!types || !types.length) return;
  s.loot = s.loot || {};
  const pile = s.loot[key] || { items: [] };
  pile.items.push(...types); s.loot[key] = pile;
}
function addLoot(key, types) {
  if (!types || !types.length) return;
  sharedOp({ t: "loot+", key, types });
}

// Swing the equipped weapon: it loses one use and breaks at zero (a knife has
// exactly one). Returns the weapon def if we had one, else null.
export function useWeapon() {
  const me = state.me, w = equippedWeapon(me);
  if (!w) return null;
  const inst = me.items[w.uid];
  inst.uses = (inst.uses != null ? inst.uses : (w.def.uses + weaponBonus(me))) - 1;   // "Weapon durability" trait
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
  if (isInvulnerable()) {                 // mid-jump: the hit whiffs entirely
    state.justDodged = fromName || "someone"; notify();
    return { blocked: true, dodged: true };
  }
  if (petActive(me)) {                    // your rat buddy jumps in front and dies for you
    me.pet = null;
    state.meDirty = true; saveMe(); notify();
    state.justPetHit = { by: fromName || "someone" };
    return { blocked: true, pet: true };
  }
  const shield = lowestShield(me);
  if (shield) {
    const name = shield.def.name;
    delete me.items[shield.uid]; me.equipment[shield.slot] = null;
    state.meDirty = true; saveMe(); notify();
    state.justBlocked = { by: fromName || "someone", shield: name };
    return { blocked: true, shield: name };
  }
  const coins = Math.floor(me.credits || 0);
  const victimName = me.created ? me.name : "someone";   // killMe resets state.me, so grab it now
  killMe(fromName);
  return { killed: true, coins, name: victimName };
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
  if (me.kills <= killFreebies(me)) state.justFirstKill = true;   // "Forgiveness" trait extends the grace
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
  const take = round2((coins || 0) * (1 + 0.2 * traitVal(state.me, "bounty")));   // "Bounty" trait
  state.me.credits = round2(state.me.credits + take); state.meDirty = true;
  registerKill(victimName || "someone");
}

// Pick up a ground pile into the bag (whatever fits; the rest stays).
export function tryPickup(gx, gy) {
  const s = state.shared, key = gx + "," + gy, pile = s.loot && s.loot[key];
  if (!pile || !pile.items.length) return { ok: false };
  const me = state.me, taken = [], left = [], scav = 0.15 * traitVal(me, "scavenger");   // "Scavenging" trait
  const grab = (type) => { const spot = firstFit(me, type); if (!spot) return false; const id = uid(); me.items[id] = { type }; me.bag.placements[id] = { x: spot.x, y: spot.y, rot: spot.rot }; taken.push(type); return true; };
  for (const type of pile.items) {
    if (grab(type)) { if (scav > 0 && Math.random() < scav) grab(type); }
    else left.push(type);
  }
  if (left.length) pile.items = left; else delete s.loot[key];
  state.meDirty = true; commit();
  return { ok: taken.length > 0, taken: taken.length, left: left.length };
}

// ---- jump + brief invulnerability -----------------------------------------
// A jump always hops (cosmetic). If the guard is off cooldown it also grants 1s
// of kill-immunity, then a 60s cooldown. State is ephemeral (not saved), so a
// reload clears it. Immunity is checked on the victim's own client, same trust
// model as the rest of combat.
export function tryJump() {
  const me = state.me; if (!me || !me.created) return { ok: false };
  const t = now();
  state.jumpAt = t;                       // world reads this for the hop arc
  state.jumpPassUntil = t + TUNING.jumpPassMs;   // glide through one piece of furniture
  state.jumpPassedKey = null;
  if (t >= (state.jumpCdUntil || 0)) {
    state.invulnUntil = t + TUNING.jumpInvulnMs;
    state.jumpCdUntil = t + TUNING.jumpCooldownMs;
    notify();
    return { ok: true, invuln: true };
  }
  return { ok: true, invuln: false, cdLeft: Math.ceil(((state.jumpCdUntil || 0) - t) / 1000) };
}
export function isInvulnerable() { return now() < (state.invulnUntil || 0); }
export function jumpCdLeft() { return Math.max(0, Math.ceil(((state.jumpCdUntil || 0) - now()) / 1000)); }

// ---- Garlic Charlie -------------------------------------------------------

export function isCharlieAlive() { return !!(state.shared && state.shared.charlie && state.shared.charlie.alive); }

function charlieDropPool() {
  const pool = ["knife", "clipboard", "ballcap", "mug", "boots", "shield_torso", "goggles", "hardhat"];
  const n = 1 + Math.floor(Math.random() * 2), out = [];
  for (let i = 0; i < n; i++) out.push(pool[Math.floor(Math.random() * pool.length)]);
  return out;
}
// A player struck Charlie where he stands on their screen. Local resolution:
// he dies, drops whatever gear he was wearing, coins bounty go to the killer,
// host respawns him (naked; he re-shops).
export function killCharlie(cx, cy) {
  const s = state.shared;
  if (!s.charlie || !s.charlie.alive) return { ok: false };
  const key = Math.round(cx) + "," + Math.round(cy);
  const worn = Object.values(s.charlie.gear || {});
  const drop = worn.length >= 2 ? worn : worn.concat(charlieDropPool());   // always drop something
  addLoot(key, drop);
  s.charlie.gear = {};
  const bounty = Math.max(1, Math.round(TUNING.charlieBountyMult * currentTier(s) * (1 + 0.2 * traitVal(state.me, "bounty"))));   // "Bounty" trait
  state.me.credits = round2(state.me.credits + bounty); state.meDirty = true;
  s.charlie.alive = false; s.charlie.diedAt = now();
  registerKill("Garlic Charlie");
  commit();
  return { ok: true, bounty };
}

let lastCharlie = 0;
function charlieBuyInterval() { return TUNING.charlieBuyMinMs + Math.random() * (TUNING.charlieBuyMaxMs - TUNING.charlieBuyMinMs); }
// Gear Charlie can wear: any equippable, buyable, unlocked item with a body slot.
function charlieGearPool(s) {
  return Object.keys(ITEMS).filter((t) => {
    const d = ITEMS[t];
    return d.slot && d.slot !== "bag" && !d.noEquip && (d.costUnit || 0) > 0 && itemTier(t) <= currentTier(s) && esoOfItem(t) === 0;
  });
}
// Charlie buys a random piece of gear. If its slot's full or he's at capacity he
// either swaps it in (tossing the old) or tosses the new one. Discards just vanish.
function charlieMaybeBuyGear(t) {
  const s = state.shared, c = s.charlie;
  c.gear = c.gear || {};
  if (!c.buyGap) c.buyGap = charlieBuyInterval();
  if (t < (c.lastBuy || 0) + c.buyGap) return;
  c.lastBuy = t; c.buyGap = charlieBuyInterval();
  const pool = charlieGearPool(s); if (!pool.length) return;
  const type = pool[Math.floor(Math.random() * pool.length)], slot = ITEMS[type].slot;
  const slots = Object.keys(c.gear);
  if (c.gear[slot]) {                                   // slot taken: swap or toss
    if (Math.random() < 0.5) c.gear[slot] = type;       // switch it out (old is gone)
  } else if (slots.length >= TUNING.charlieMaxGear) {   // no room: toss the new, or drop a worn piece for it
    if (Math.random() < 0.5) { delete c.gear[slots[Math.floor(Math.random() * slots.length)]]; c.gear[slot] = type; }
  } else {
    c.gear[slot] = type;                                // plenty of room: just wear it
  }
  state.dirty = true;
}
function charlieTick(t) {
  if (!state.isHost) return;
  const s = state.shared; if (!s || !s.charlie) return;
  const dt = (t - (lastCharlie || t)) / 1000; lastCharlie = t;
  if (!s.charlie.alive) {
    if (s.charlie.diedAt && t - s.charlie.diedAt >= TUNING.charlieRespawnMs) { s.charlie.alive = true; s.charlie.diedAt = null; s.charlie.lastBuy = t; s.charlie.buyGap = null; s.charlie.gear = {}; state.dirty = true; }
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
  charlieMaybeBuyGear(t);
}

// ---- rats + monsters ------------------------------------------------------
// Monsters live in shared state and are simulated by the host. They walk to the
// nearest player or furniture and attack: furniture breaks (needs repair), a
// player loses armor or dies. Player-damage to a remote peer is relayed like PvP.

const SHIELD_TYPES = Object.keys(ITEMS).filter((t) => ITEMS[t].shield);
let monsterSend = null;
export function setMonsterSender(fn) { monsterSend = fn; }
export function monsterList() { return Object.values((state.shared && state.shared.monsters) || {}); }
function aliveRats() { return monsterList().filter((m) => m.kind === "rat").length; }
function hasKing() { return monsterList().some((m) => m.kind === "king"); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function spawnRat(x, y) {
  const s = state.shared; s.monsters = s.monsters || {};
  if (aliveRats() >= TUNING.ratMaxAlive) { formRatKing(); return; }   // the swarm coalesces
  const armor = Math.random() < TUNING.ratArmorChance ? SHIELD_TYPES[Math.floor(Math.random() * SHIELD_TYPES.length)] : null;
  const id = "rat-" + uid();
  s.monsters[id] = { id, kind: "rat", x, y, attacks: 0, guard: armor ? 1 : 0, armor, cool: 0 };
  state.dirty = true;
}
function formRatKing() {
  const s = state.shared; s.monsters = s.monsters || {};
  if (hasKing()) return;
  const rats = monsterList().filter((m) => m.kind === "rat");
  let sx = 0, sy = 0; for (const r of rats) { sx += r.x; sy += r.y; }
  const n = rats.length || 1;
  for (const r of rats) delete s.monsters[r.id];
  const id = "king-" + uid();
  s.monsters[id] = { id, kind: "king", x: sx / n, y: sy / n, attacks: 0, guard: TUNING.kingGuard, armor: null, cool: 0 };
  state.dirty = true; state.justRatKing = true;
}

// Instant-use rat egg: buy it, a rat pops out next to you.
export function tryBuyRatEgg() {
  if (state.me.credits < TUNING.ratEggCost) return { ok: false, why: "Not enough credits." };
  spend(TUNING.ratEggCost);
  const p = state.me.pos, rx = p.x + (Math.random() * 2 - 1), ry = p.y + (Math.random() * 2 - 1);
  if (state.isHost) spawnRat(rx, ry); else netSend({ type: "__op", op: { t: "spawnRat", x: rx, y: ry }, from: state.me.id });
  commit();
  return { ok: true };
}
export function tryRepairFurniture(key) {
  const s = state.shared, f = s.furniture[key]; if (!f || !f.broken) return { ok: false, why: "Nothing to repair." };
  const cost = repairCost(f);
  if (state.me.credits < cost) return { ok: false, why: "Repair costs " + cost + "." };
  spend(cost); sharedOp({ t: "furnBroken", key, val: false }); commit();
  return { ok: true, cost };
}

// A player struck a monster (from world.doAttack). Its armor eats a hit; else it
// dies, dropping coins to the killer (+ its armor, if any).
export function hitMonster(id) {
  const s = state.shared, m = s.monsters && s.monsters[id]; if (!m) return { ok: false };
  const key = Math.round(m.x) + "," + Math.round(m.y);
  if (m.guard > 0) {
    const newGuard = m.guard - 1, dropsArmor = m.kind === "rat" && m.armor;
    sharedOp({ t: "monsterGuard", id, guard: newGuard, armorKey: dropsArmor ? key : undefined, armorType: dropsArmor ? m.armor : undefined });
    commit();
    return { ok: true, blocked: true, king: m.kind === "king", guard: newGuard };
  }
  const coins = m.kind === "king" ? randInt(TUNING.kingCoinMin, TUNING.kingCoinMax) : randInt(TUNING.ratCoinMin, TUNING.ratCoinMax);
  state.me.credits = round2(state.me.credits + coins); state.meDirty = true;
  if (m.armor) addLoot(key, [m.armor]);
  sharedOp({ t: "monster-", id });
  commit();
  return { ok: true, killed: true, coins, king: m.kind === "king" };
}

// Recruit a tired rat as a buddy. Needs a leash in hand, the rat tired and in
// reach, and no current pet. The rat leaves the shared world and rides on me.pet.
export function recruitRat(id) {
  const me = state.me, s = state.shared;
  if (!me || !me.created) return { ok: false, why: "Make a Joey first." };
  if (!hasLeash(me)) return { ok: false, why: "Hold a leash to recruit a rat." };
  if (petActive(me)) return { ok: false, why: "You already have a rat buddy." };
  const m = s.monsters && s.monsters[id];
  if (!m || m.kind !== "rat" || !m.tired) return { ok: false, why: "That rat can't be recruited." };
  if (!withinReach(me, Math.round(m.x), Math.round(m.y))) return { ok: false, why: "Get closer to the rat." };
  me.pet = { since: Date.now() };
  sharedOp({ t: "monster-", id });
  state.meDirty = true;
  commit(); saveMe();
  state.justPetGot = true;
  return { ok: true };
}

// This player was hit by a monster: lose the lowest 1 (rat) or 2 (king) shields,
// or die if you don't have that many.
export function receiveMonsterHit(king) {
  const me = state.me; if (!me || !me.created) return;
  if (isInvulnerable()) { state.justDodged = king ? "The Rat King" : "a rat"; notify(); return; }
  if (petActive(me)) {                    // the rat buddy takes the hit and is gone
    me.pet = null;
    state.justPetHit = { by: king ? "The Rat King" : "a rat" };
    state.meDirty = true; saveMe(); notify();
    return;
  }
  const need = king ? 2 : 1;
  const shields = equippedShields(me).slice().sort((a, b) => a.value - b.value);
  if (shields.length >= need) {
    for (let i = 0; i < need; i++) { const sh = shields[i]; delete me.items[sh.uid]; me.equipment[sh.slot] = null; }
    state.justMonsterBlock = { by: king ? "The Rat King" : "a rat", n: need };
    state.meDirty = true; saveMe(); notify();
  } else {
    killMe(king ? "the Rat King" : "a rat");
  }
}

function monsterTargets() {
  const s = state.shared, out = [];
  if (state.me.created) out.push({ type: "player", id: state.me.id, x: state.me.pos.x, y: state.me.pos.y, me: true });
  for (const p of state.peers) if (p.x != null) out.push({ type: "player", id: p.id, x: p.x, y: p.y });
  for (const [key, f] of Object.entries(s.furniture)) { if (f.broken) continue; const [gx, gy] = key.split(",").map(Number); out.push({ type: "furn", key, x: gx, y: gy }); }
  return out;
}
function lockedDoorAt(s, x, y) { const d = s.doors && s.doors[x + "," + y]; return !!(d && d.locked); }
// A tired rat wanders slowly to random nearby tiles instead of hunting.
function wanderMonster(m, dt) {
  const s = state.shared;
  if (!m.wt || Math.hypot(m.wt.x - m.x, m.wt.y - m.y) < 0.35 || Math.random() < 0.01) {
    const px = Math.round(m.x), py = Math.round(m.y);
    for (let i = 0; i < 8; i++) { const x = px + (Math.floor(Math.random() * 5) - 2), y = py + (Math.floor(Math.random() * 5) - 2); if (isWalkable(s, x, y) && !lockedDoorAt(s, x, y)) { m.wt = { x, y }; break; } }
  }
  if (m.wt) {
    const step = TUNING.ratSpeed * 0.3 * dt, ddx = m.wt.x - m.x, ddy = m.wt.y - m.y, d = Math.hypot(ddx, ddy) || 1;
    const nx = m.x + (ddx / d) * step, ny = m.y + (ddy / d) * step, rx = Math.round(nx), ry = Math.round(ny);
    if (isWalkable(s, rx, ry) && !lockedDoorAt(s, rx, ry)) { m.x = nx; m.y = ny; }
  }
  state.dirty = true;
}
function monsterAttack(m, tg) {
  const s = state.shared, king = m.kind === "king";
  if (tg.type === "furn") { const f = s.furniture[tg.key]; if (f) f.broken = true; }
  else if (tg.type === "player") { if (tg.me) receiveMonsterHit(king); else if (monsterSend) monsterSend({ type: "monsterHit", to: tg.id, king }); }
}

let lastMonster = 0;
function monsterTick(t) {
  if (!state.isHost) return;
  const s = state.shared; if (!s) return; s.monsters = s.monsters || {};
  const dt = (t - (lastMonster || t)) / 1000; lastMonster = t;
  if (dt <= 0 || dt > 3600) return;

  // Rat Motel spawns (level-many rats per interval)
  for (const [key, f] of Object.entries(s.furniture)) {
    const def = FURNITURE[f.type];
    if (!def || !def.ratSpawner || f.broken) continue;
    if (!f.lastSpawn) { f.lastSpawn = t; continue; }
    if (t - f.lastSpawn >= TUNING.ratSpawnMs) {
      f.lastSpawn = t;
      const [gx, gy] = key.split(",").map(Number);
      for (let i = 0; i < (f.level || 1); i++) spawnRat(gx + (Math.random() * 2 - 1), gy + (Math.random() * 2 - 1));
    }
  }

  const mons = monsterList(); if (!mons.length) return;
  const targets = monsterTargets();
  for (const m of mons) {
    if (m.tired) { wanderMonster(m, dt); continue; }   // spent rats just amble around
    let best = null, bd = Infinity;
    for (const tg of targets) { const d = Math.hypot(tg.x - m.x, tg.y - m.y); if (d < bd) { bd = d; best = tg; } }
    if (!best) continue;
    if (bd > 1.25) {
      const step = TUNING.ratSpeed * dt, ddx = best.x - m.x, ddy = best.y - m.y, dist = Math.hypot(ddx, ddy) || 1;
      const nx = m.x + (ddx / dist) * step, ny = m.y + (ddy / dist) * step, rx = Math.round(nx), ry = Math.round(ny);
      if (isWalkable(s, rx, ry) && !lockedDoorAt(s, rx, ry)) { m.x = nx; m.y = ny; }   // else blocked (locked door): hold
      state.dirty = true;
    } else if (t - (m.cool || 0) >= TUNING.ratAttackMs) {
      m.cool = t; monsterAttack(m, best); m.attacks = (m.attacks || 0) + 1;
      if (m.kind === "rat" && m.attacks >= TUNING.ratAttacks) { m.tired = true; m.wt = null; }   // tired out, stops attacking
      state.dirty = true;
    }
  }
  if (t - (state._monFlush || 0) > 500) { state._monFlush = t; flushShared(true); }   // sync movement to peers
}

// ---- inventory actions ----------------------------------------------------

export function tryBuyItem(type) {
  const def = ITEMS[type], base = itemPrice(type);
  if (!def || !base) return { ok: false, why: "Not for sale." };
  if (itemTier(type) > currentTier(state.shared)) return { ok: false, why: "That tier isn't researched yet — use BRAIN furniture." };
  if (esoOfItem(type) > currentEso(state.me)) return { ok: false, why: "Not esoteric enough — channel SOUL at an altar." };
  const price = Math.ceil(base * (1 - discountFrac(state.me)));   // "Shop discount" trait
  if (state.me.credits < price) return { ok: false, why: "Not enough credits." };
  spend(price);
  state.me.buildQueue.push({ type, work: itemWork(type), prog: 0 });
  saveMe(); notify();
  return { ok: true, queued: true };
}

export function cancelBuild(index) {
  const q = state.me.buildQueue, job = q[index]; if (!job) return { ok: false };
  const refund = Math.ceil(itemPrice(job.type) * refundFrac(state.me, 0.5));
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
  const refund = Math.ceil(itemPrice(inst.type) * refundFrac(me));
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
  sharedOp({ t: "potInvest", pid: state.me.id, amt: amount });
  commit(); return { ok: true };
}
export function votePot(proposalId) {
  const pot = state.shared.pot;
  if (pot.phase !== "voting") return { ok: false, why: "Voting isn't open yet." };
  if (!(pot.contributions[state.me.id] > 0)) return { ok: false, why: "Only contributors vote. Invest next week!" };
  sharedOp({ t: "potVote", pid: state.me.id, proposal: proposalId }); commit(); return { ok: true };
}

// Click the Enzo statue for a coin. Personal wallet only, no shared write.
export function tryClickEnzo() {
  if (!state.me || !state.me.created) return { ok: false };
  state.me.credits = round2(state.me.credits + 1);
  state.meDirty = true; notify();
  return { ok: true };
}

export function inBounds(gx, gy) { const f = state.shared.floor; return gx >= f.x && gy >= f.y && gx < f.x + f.w && gy < f.y + f.h; }

export { FURNITURE };
