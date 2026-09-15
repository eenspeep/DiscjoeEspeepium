// The game store: personal data (your identity, wallet-of-cosmetics, position)
// lives per-browser; the shared workplace (credits, build, floor) is synced
// through the net adapter. Also owns save/load, offline catch-up, host election,
// and every action that spends credits.

import { TUNING } from "./config.js";
import { now, uid, clamp } from "./util.js";
import { defaultAppearance, defaultOwned, optionOf, CATALOG } from "./appearance.js";
import {
  MODULES, income, buyCost, upgradeCost, expandCost, canExpand,
} from "./economy.js";

const ME_KEY = "deskovania:me";

export const state = {
  me: null,
  shared: null,
  peers: [],       // other real players (from net)
  isHost: true,
  net: null,
  dirty: false,    // shared has local changes not yet pushed
};

const listeners = new Set();
export function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function notify() { for (const cb of listeners) cb(); }

// ---- personal identity ----------------------------------------------------

function loadMe() {
  let me;
  try { me = JSON.parse(localStorage.getItem(ME_KEY)); } catch { me = null; }
  if (!me || !me.id) {
    me = {
      id: uid(),
      name: "Guest-" + Math.floor(1000 + Math.random() * 9000),
      appearance: defaultAppearance(),
      owned: defaultOwned(),
      pos: { x: 0, y: 0 },
    };
  }
  // heal older/partial saves
  me.appearance = { ...defaultAppearance(), ...(me.appearance || {}) };
  const owned = defaultOwned();
  for (const slot of Object.keys(owned)) {
    const have = new Set([...(owned[slot] || []), ...((me.owned && me.owned[slot]) || [])]);
    owned[slot] = [...have];
  }
  me.owned = owned;
  return me;
}

export function saveMe() {
  try { localStorage.setItem(ME_KEY, JSON.stringify(state.me)); } catch {}
}

export function setName(name) {
  state.me.name = (name || "").trim().slice(0, 16) || state.me.name;
  saveMe();
  notify();
}

// ---- shared defaults ------------------------------------------------------

function defaultShared() {
  const { w, h } = TUNING.startFloor;
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  const modules = {};
  // seed a tiny starter office so the place isn't empty
  modules[`${cx},${cy}`] = { type: "desk", level: 1 };
  modules[`${cx + 1},${cy}`] = { type: "plant", level: 1 };
  return {
    credits: TUNING.startCredits,
    floor: { w, h },
    modules,
    totalEarned: 0,
    lastTick: now(),
  };
}

// ---- lifecycle ------------------------------------------------------------

export async function initState(net) {
  state.net = net;
  state.me = loadMe();

  const remote = await net.getInitialShared();
  if (remote && remote.floor && remote.modules) {
    state.shared = remote;
    // offline catch-up is applied once, by whoever loads it, if plausible host
    applyOfflineIncome();
  } else {
    state.shared = defaultShared();
    state.dirty = true; // seed it for everyone
  }

  // spawn me at the center of the floor
  state.me.pos = {
    x: (state.shared.floor.w - 1) / 2,
    y: (state.shared.floor.h - 1) / 2,
  };

  net.onShared((remoteShared) => {
    if (!remoteShared) return;
    // last-write-wins: accept the remote picture, keep rendering smooth
    state.shared = remoteShared;
    notify();
  });

  net.onPeers((peers) => {
    state.peers = peers;
    electHost();
    notify();
  });

  electHost();
  return state;
}

function electHost() {
  // The host is the connected client with the smallest id. Only the host runs
  // passive income accrual, so credits are not double-counted across clients.
  let host = true;
  for (const p of state.peers) {
    if (p.id && p.id < state.me.id) { host = false; break; }
  }
  state.isHost = host;
}

function applyOfflineIncome() {
  const s = state.shared;
  const elapsed = clamp((now() - (s.lastTick || now())) / 1000, 0, TUNING.offlineCapHours * 3600);
  if (elapsed > 1) {
    const gained = income(s) * elapsed;
    s.credits += gained;
    s.totalEarned += gained;
    state.lastOffline = { seconds: elapsed, gained };
  }
  s.lastTick = now();
}

// ---- economy tick (host advances credits) ---------------------------------

export function tickEconomy() {
  const s = state.shared;
  const t = now();
  const dt = (t - (s.lastTick || t)) / 1000;
  s.lastTick = t;
  if (state.isHost && dt > 0) {
    const gained = income(s) * dt;
    if (gained > 0) {
      s.credits += gained;
      s.totalEarned += gained;
      state.dirty = true;
    }
  }
}

// Push shared to the network if something changed. Called on a cadence.
export function flushShared(force = false) {
  if (state.net && (state.dirty || force)) {
    state.net.pushShared(state.shared);
    state.dirty = false;
  }
}

// ---- spending actions -----------------------------------------------------

export function income$() { return income(state.shared); }

export function tryPlaceModule(type, gx, gy) {
  const s = state.shared;
  const key = `${gx},${gy}`;
  if (!inBounds(gx, gy) || s.modules[key]) return { ok: false, why: "That tile is taken." };
  const cost = buyCost(s, type);
  if (s.credits < cost) return { ok: false, why: "Not enough credits." };
  s.credits -= cost;
  s.modules[key] = { type, level: 1 };
  commit();
  return { ok: true };
}

export function tryUpgrade(key) {
  const s = state.shared;
  const mod = s.modules[key];
  if (!mod) return { ok: false };
  const cost = upgradeCost(mod);
  if (s.credits < cost) return { ok: false, why: "Not enough credits." };
  s.credits -= cost;
  mod.level += 1;
  commit();
  return { ok: true };
}

export function trySellModule(key) {
  const s = state.shared;
  const mod = s.modules[key];
  if (!mod) return { ok: false };
  const refund = Math.ceil(buyCost(s, mod.type) * 0.4);
  delete s.modules[key];
  s.credits += refund;
  commit();
  return { ok: true, refund };
}

export function tryExpandFloor() {
  const s = state.shared;
  if (!canExpand(s)) return { ok: false, why: "The office is at its maximum size." };
  const cost = expandCost(s);
  if (s.credits < cost) return { ok: false, why: "Not enough credits." };
  s.credits -= cost;
  s.floor = { w: s.floor.w + 1, h: s.floor.h + 1 };
  commit();
  return { ok: true };
}

export function tryBuyCosmetic(slot, id) {
  const opt = optionOf(slot, id);
  const price = opt.price || 0;
  if (state.me.owned[slot].includes(id)) return { ok: true, already: true };
  if (state.shared.credits < price) return { ok: false, why: "Not enough credits." };
  state.shared.credits -= price;
  state.me.owned[slot].push(id);
  saveMe();
  commit();
  return { ok: true };
}

export function equipCosmetic(slot, id) {
  if (!state.me.owned[slot].includes(id)) return { ok: false };
  state.me.appearance[slot] = id;
  saveMe();
  notify();
  return { ok: true };
}

function commit() {
  state.dirty = true;
  flushShared(true); // spends are pushed immediately so others see them fast
  notify();
}

// ---- helpers --------------------------------------------------------------

export function inBounds(gx, gy) {
  const f = state.shared.floor;
  return gx >= 0 && gy >= 0 && gx < f.w && gy < f.h;
}

export { MODULES, buyCost, upgradeCost, expandCost, canExpand, CATALOG };
