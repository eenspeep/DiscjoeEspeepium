// DOM overlay: Build-Your-Joey gate, HUD, build bar, furniture inspector, the
// Locker (account + equipment slots + spatial bag + shop), and the Team Pot.

import { el, fmt, clamp } from "./util.js";
import { TUNING } from "./config.js";
import {
  state, onChange, income$, createJoey,
  tryUpgradeFurniture, trySellFurniture, tryExpandFloor, investPot, votePot, setLook,
  tryBuyItem, equipItem, unequipItem, moveItem, rotateItem, trySellItem,
  cancelSite, cancelBuild,
} from "./state.js";
import {
  FURNITURE, FURNITURE_ORDER, furnitureBuyCost, upgradeCost, furnitureValue,
  expandCost, canExpand, statScales, SPECIALTIES, ADJECTIVES, adjSummary, STATS,
  PROPOSALS, proposalById, voteWeight,
  ITEMS, ITEM_SLOTS, SLOT_LABEL, SHOP_ORDER, itemCells, bagGrid, bagFreeCells,
  furnitureTier, itemTier, furnitureWork, itemWork, isFurnitureUnlocked, isItemUnlocked,
  currentTier, nextTier, researchTotal, siteProgress,
} from "./economy.js";
import { BASE_LOOK, drawJoey, defaultLook } from "./appearance.js";
import { setBuild, getBuild, setSelected } from "./world.js";

let hud, buildbar, panel, toast;
let openKey = null, openView = null;
let investDraft = "";
let selBagItem = null;
let auth = { enabled: false };

export function initUI(authApi) {
  auth = authApi || { enabled: false };
  hud = document.getElementById("hud");
  buildbar = document.getElementById("buildbar");
  panel = document.getElementById("panel");
  toast = document.getElementById("toast");
  onChange(refresh);
  refresh();
  if (!state.me.created) openCreator();
  setInterval(renderHud, 500);
  setInterval(() => {
    if (openView === "pot") renderPot();
    else if (openView === "site") renderSite();
    else if (openView === "locker" && state.me.buildQueue.length) renderLocker();
  }, 1000);
  setInterval(() => {
    if (state.justBuilt) { flash("Built: " + state.justBuilt + "!"); state.justBuilt = null; }
    if (state.justCrafted) { flash("Crafted: " + state.justCrafted + " — in your bag."); state.justCrafted = null; }
  }, 500);
}

function researchTitle() {
  const nt = nextTier(state.shared);
  if (!nt) return "Research maxed — all tiers unlocked";
  return "Research tier " + currentTier(state.shared) + " · " + Math.floor(researchTotal(state.shared)) + "/" + nt.need + " to Tier " + nt.tier + " (use BRAIN furniture)";
}

export function flash(msg) {
  const t = el("div", { class: "toast-item", text: msg });
  toast.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2400);
}

function refresh() {
  renderHud(); renderBuildbar();
  if (openView === "furn") renderFurniture();
  else if (openView === "locker") renderLocker();
  else if (openView === "pot") renderPot();
  else if (openView === "site") renderSite();
}

// ---- HUD ------------------------------------------------------------------

function renderHud() {
  if (!hud) return;
  const me = state.me;
  const mode = state.net?.mode === "cloud" ? "CLOUD" : "LOCAL";
  const host = state.isHost ? " ★" : "";
  const voting = state.shared.pot && state.shared.pot.phase === "voting";
  hud.replaceChildren(
    el("div", { class: "hud-left" }, [
      el("div", { class: "coin" }, [el("span", { class: "coin-amt", text: fmt(me.credits || 0) }), el("span", { class: "coin-rate", text: "+" + fmt(income$()) + "/s" })]),
      me.created ? el("div", { class: "stat-chips" }, [
        el("span", { class: "schip brain", title: "BRAIN", text: STATS.brain.glyph + " " + me.stats.brain }),
        el("span", { class: "schip build", title: "BUILD", text: STATS.build.glyph + " " + me.stats.build }),
        el("span", { class: "schip research", title: researchTitle(), text: "🔬 T" + currentTier(state.shared) }),
      ]) : null,
    ]),
    el("div", { class: "hud-right" }, [
      el("span", { class: "badge", text: mode + host }),
      el("span", { class: "badge muted", text: "👥 " + (state.peers.length + 1) }),
      el("button", { class: "btn", onclick: toggleLocker }, ["Locker"]),
      el("button", { class: "btn" + (voting ? " alert" : ""), onclick: togglePot }, [voting ? "Vote!" : "Team Pot"]),
      el("button", { class: "btn ghost", onclick: () => flash("WASD/click to walk · stand by furniture to use it · Locker for gear & bag · Team Pot to invest"), title: "Help" }, ["?"]),
    ])
  );
}

// ---- build bar ------------------------------------------------------------

const TAG_CLASS = { brain: "t-brain", build: "t-build", neutral: "t-neutral" };
function renderBuildbar() {
  if (!buildbar) return;
  if (!state.me.created) { buildbar.replaceChildren(); return; }
  const s = state.shared, active = getBuild();
  const cursor = el("button", { class: "build-btn cursor" + (active ? "" : " active"), title: "Walk mode", onclick: () => selectBuild(null) }, [el("span", { class: "b-glyph", text: "👆" }), el("span", { class: "b-name", text: "Walk" })]);
  const btns = FURNITURE_ORDER.map((type) => {
    const def = FURNITURE[type], cost = furnitureBuyCost(s, type), afford = state.me.credits >= cost;
    const locked = !isFurnitureUnlocked(type, s);
    if (locked) return el("button", { class: "build-btn locked", title: def.name + " — needs research Tier " + furnitureTier(type), onclick: () => flash(def.name + " needs research Tier " + furnitureTier(type) + ". Use BRAIN furniture.") },
      [el("span", { class: "b-glyph", text: "🔒" }), el("span", { class: "b-name", text: def.name }), el("span", { class: "b-cost", text: "T" + furnitureTier(type) })]);
    return el("button", { class: "build-btn " + (TAG_CLASS[def.tag] || "") + (active === type ? " active" : "") + (afford ? "" : " poor"), title: def.name + " — " + def.tag.toUpperCase() + ", +" + def.value + "/s adjacent · " + furnitureWork(type) + " build work", onclick: () => selectBuild(type) },
      [el("span", { class: "b-glyph", text: def.glyph }), el("span", { class: "b-name", text: def.name }), el("span", { class: "b-cost", text: fmt(cost) })]);
  });
  const expand = canExpand(s)
    ? el("button", { class: "build-btn expand" + (state.me.credits >= expandCost(s) ? "" : " poor"), title: "Grow the floor", onclick: () => { const r = tryExpandFloor(); flash(r.ok ? "The office grew." : (r.why || "Can't expand.")); } }, [el("span", { class: "b-glyph", text: "➕" }), el("span", { class: "b-name", text: "Expand" }), el("span", { class: "b-cost", text: fmt(expandCost(s)) })])
    : el("button", { class: "build-btn expand disabled" }, [el("span", { class: "b-glyph", text: "🏢" }), el("span", { class: "b-name", text: "Max" })]);
  buildbar.replaceChildren(cursor, ...btns, expand);
}
function selectBuild(type) { setBuild(getBuild() === type ? null : type); if (getBuild()) flash("Click a tile to place your " + FURNITURE[getBuild()].name + "."); renderBuildbar(); }

// ---- furniture inspector --------------------------------------------------

export function openFurniture(key, f) { openKey = key; openView = "furn"; setSelected(key); setBuild(null); renderBuildbar(); renderFurniture(); showPanel(); }
function renderFurniture() {
  const f = state.shared.furniture[openKey]; if (!f) return closePanel();
  const def = FURNITURE[f.type], sc = statScales(state.me), raw = furnitureValue(f);
  const mine = def.tag === "brain" ? raw * sc.brain : def.tag === "build" ? raw * sc.build : raw;
  const up = upgradeCost(f);
  panel.replaceChildren(
    panelHeader(def.glyph + " " + def.name),
    el("p", { class: "muted small", text: def.tag.toUpperCase() + " furniture. Buffs anyone standing next to it." }),
    stat("Level", String(f.level)), stat("Base value", "+" + fmt(raw) + "/s"), stat("For you (stats)", "+" + fmt(Math.round(mine * 100) / 100) + "/s"),
    el("div", { class: "panel-actions" }, [
      el("button", { class: "btn primary" + (state.me.credits >= up ? "" : " poor"), onclick: () => { const r = tryUpgradeFurniture(openKey); flash(r.ok ? def.name + " upgraded." : (r.why || "Can't upgrade.")); } }, ["Upgrade — " + fmt(up)]),
      el("button", { class: "btn", onclick: () => { const r = trySellFurniture(openKey); flash(r.ok ? "Sold for " + fmt(r.refund) + "." : "Can't sell."); closePanel(); } }, ["Sell"]),
    ])
  );
}

// ---- construction site ----------------------------------------------------

export function openSite(key, site) { openKey = key; openView = "site"; setSelected(key); setBuild(null); renderBuildbar(); renderSite(); showPanel(); }
function renderSite() {
  const site = state.shared.sites[openKey]; if (!site) return closePanel();
  const def = FURNITURE[site.type];
  const pct = Math.min(100, Math.round(siteProgress(site) / site.work * 100));
  const builders = Object.keys(site.progBy || {}).length;
  panel.replaceChildren(
    panelHeader("🔨 Building: " + def.name),
    el("p", { class: "muted small", text: "Stand next to it to build. More builders finish it faster, and everyone who helps co-owns it." }),
    stat("Progress", pct + "%"), stat("Builders so far", String(builders)), stat("Work", Math.floor(siteProgress(site)) + " / " + site.work),
    el("div", { class: "panel-actions" }, [el("button", { class: "btn", onclick: () => { const r = cancelSite(openKey); flash(r.ok ? "Build cancelled, refunded " + fmt(r.refund) + "." : "Can't cancel."); closePanel(); } }, ["Cancel build"])])
  );
}

// ---- Locker: account + equipment + bag + shop -----------------------------

function toggleLocker() { if (openView === "locker") return closePanel(); openView = "locker"; setSelected(null); renderLocker(); showPanel(); }

function itemBuffText(def) {
  if (def.value) return "+" + def.value + "/s" + (def.tag && def.tag !== "neutral" ? " " + def.tag[0].toUpperCase() : "");
  if (def.mult) return "+" + Math.round(def.mult * 100) + "%";
  if (def.speedMult) return "+" + Math.round(def.speedMult * 100) + "% spd";
  if (def.grid) return def.grid.w + "×" + def.grid.h + " bag";
  return "";
}

function renderLocker() {
  const me = state.me, spec = SPECIALTIES[me.specialty];
  // drop a stale selection once the item leaves the bag (equipped or sold)
  if (selBagItem && !me.bag.placements[selBagItem]) selBagItem = null;
  const kids = [panelHeader("🧳 " + me.name)];
  kids.push(el("div", { class: "spec-line" }, [
    el("span", { class: "badge big", text: (spec?.glyph || "") + " " + (spec?.name || "") }),
    el("span", { class: "schip brain", text: STATS.brain.glyph + " " + me.stats.brain }),
    el("span", { class: "schip build", text: STATS.build.glyph + " " + me.stats.build }),
  ]));

  // account row
  kids.push(accountRow());

  // equipment slots
  kids.push(el("div", { class: "ward-label", text: "Equipped" }));
  kids.push(el("div", { class: "equip-grid" }, ITEM_SLOTS.map((slot) => {
    const uid = me.equipment[slot], inst = uid && me.items[uid], def = inst && ITEMS[inst.type];
    return el("button", {
      class: "equip-slot" + (def ? " filled" : ""), title: def ? def.name + (slot === "bag" ? " (bag)" : " — click to stow") : SLOT_LABEL[slot],
      onclick: () => { if (!def) return; if (slot === "bag") return flash("You can't remove your only bag."); const r = unequipItem(slot); flash(r.ok ? "Stowed " + def.name + "." : (r.why || "Can't stow.")); },
    }, [el("span", { class: "eq-glyph", text: def ? def.glyph : "" }), el("span", { class: "eq-label", text: SLOT_LABEL[slot] })]);
  })));

  // bag grid
  const grid = bagGrid(me);
  kids.push(el("div", { class: "ward-label", text: "Bag · " + grid.w + "×" + grid.h + " · " + bagFreeCells(me) + " free" }));
  kids.push(renderBag(me, grid));

  // selected-item actions
  if (selBagItem && me.items[selBagItem]) {
    const def = ITEMS[me.items[selBagItem].type];
    const acts = [];
    if (def.slot && !def.noEquip) acts.push(el("button", { class: "btn primary", onclick: () => { const r = equipItem(selBagItem); flash(r.ok ? "Equipped " + def.name + "." : (r.why || "Can't equip.")); if (r.ok) selBagItem = null; } }, ["Equip"]));
    if (!def.immovable) acts.push(el("button", { class: "btn", onclick: () => { const r = rotateItem(selBagItem); if (!r.ok) flash(r.why || "No room to rotate."); } }, ["Rotate"]));
    if (!def.noSell) acts.push(el("button", { class: "btn", onclick: () => { const r = trySellItem(selBagItem); flash(r.ok ? "Sold for " + fmt(r.refund) + "." : (r.why || "Can't sell.")); if (r.ok) selBagItem = null; } }, ["Sell"]));
    kids.push(el("div", { class: "sel-info" }, [el("span", { class: "small", text: def.glyph + " " + def.name + (itemBuffText(def) ? " · " + itemBuffText(def) : "") })]));
    kids.push(el("div", { class: "panel-actions" }, acts));
  } else {
    kids.push(el("p", { class: "muted small", text: "Click a bag item to equip, rotate, or sell it. Click an empty square to move the selected item there. Only equipped gear buffs you." }));
  }

  // personal build queue (gear)
  if (me.buildQueue.length) {
    kids.push(el("div", { class: "ward-label", text: "Building · BUILD speeds this up" }));
    me.buildQueue.forEach((job, i) => {
      const def = ITEMS[job.type];
      const pct = job.blocked ? 100 : Math.min(100, Math.round((job.prog || 0) / job.work * 100));
      kids.push(el("div", { class: "queue-row" }, [
        el("span", { class: "shop-glyph", text: def.glyph }),
        el("div", { class: "queue-body" }, [
          el("span", { class: "shop-name", text: def.name + (job.blocked ? " — bag full!" : "") }),
          el("div", { class: "qbar" }, [el("div", { class: "qbar-fill", style: `width:${pct}%` })]),
        ]),
        el("button", { class: "btn small", title: "Cancel", onclick: () => { const r = cancelBuild(i); flash(r.ok ? "Cancelled, refunded " + fmt(r.refund) + "." : "Can't cancel."); } }, ["✕"]),
      ]));
    });
  }

  // shop
  kids.push(el("div", { class: "ward-label", text: "Shop" }));
  for (const type of SHOP_ORDER) {
    const def = ITEMS[type]; if (!def) continue;
    const ext = itemCells(type).reduce((m, c) => ({ w: Math.max(m.w, c[0] + 1), h: Math.max(m.h, c[1] + 1) }), { w: 1, h: 1 });
    const locked = !isItemUnlocked(type, state.shared);
    if (locked) {
      kids.push(el("button", { class: "shop-row locked", onclick: () => flash(def.name + " needs research Tier " + itemTier(type) + ". Use BRAIN furniture.") }, [
        el("span", { class: "shop-glyph", text: "🔒" }),
        el("span", { class: "shop-body" }, [el("span", { class: "shop-name", text: def.name }), el("span", { class: "shop-meta muted small", text: "Research Tier " + itemTier(type) })]),
        el("span", { class: "shop-price", text: fmt(def.price) }),
      ]));
      continue;
    }
    kids.push(el("button", { class: "shop-row", onclick: () => { const r = tryBuyItem(type); flash(r.ok ? "Building " + def.name + " (" + itemWork(type) + " work)…" : (r.why || "Can't buy.")); } }, [
      el("span", { class: "shop-glyph", text: def.glyph }),
      el("span", { class: "shop-body" }, [el("span", { class: "shop-name", text: def.name }), el("span", { class: "shop-meta muted small", text: (itemBuffText(def) || SLOT_LABEL[def.slot] || "") + " · " + ext.w + "×" + ext.h + " · " + itemWork(type) + "w" })]),
      el("span", { class: "shop-price", text: fmt(def.price) }),
    ]));
  }

  // base look
  kids.push(el("div", { class: "ward-label", text: "Look" }));
  for (const [slot, cfg] of Object.entries(BASE_LOOK)) {
    kids.push(el("div", { class: "ward-slot" }, [el("div", { class: "ward-sub", text: cfg.label }), el("div", { class: "look-row" }, cfg.options.map((o) => el("button", { class: "swatch" + (me.look[slot] === o.id ? " on" : ""), style: `background:${o.color}`, title: o.name, onclick: () => setLook(slot, o.id) })))]));
  }

  panel.replaceChildren(...kids);
}

function renderBag(me, grid) {
  // cell -> uid map + per-item anchor cell (for the glyph)
  const cellMap = new Map(); const anchor = new Map();
  for (const [id, p] of Object.entries(me.bag.placements)) {
    const inst = me.items[id]; if (!inst) continue;
    let ax = Infinity, ay = Infinity;
    for (const [dx, dy] of itemCells(inst.type, p.rot || 0)) {
      const cx = p.x + dx, cy = p.y + dy; cellMap.set(cx + "," + cy, id);
      if (cy < ay || (cy === ay && cx < ax)) { ay = cy; ax = cx; }
    }
    anchor.set(id, ax + "," + ay);
  }
  const wrap = el("div", { class: "bag-grid", style: `grid-template-columns:repeat(${grid.w},34px);grid-template-rows:repeat(${grid.h},34px)` });
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
    const key = x + "," + y, id = cellMap.get(key), inst = id && me.items[id], def = inst && ITEMS[inst.type];
    const isAnchor = id && anchor.get(id) === key;
    const cell = el("button", {
      class: "bag-cell" + (id ? " occ" : "") + (id && id === selBagItem ? " sel" : "") + (def && def.immovable ? " immov" : ""),
      style: def ? `background:${def.color}` : "",
      onclick: () => onBagCell(x, y, id),
    }, [isAnchor ? el("span", { class: "bag-glyph", text: def.glyph }) : null]);
    wrap.appendChild(cell);
  }
  return wrap;
}

function onBagCell(x, y, id) {
  const me = state.me;
  if (id) { selBagItem = (selBagItem === id) ? null : id; renderLocker(); return; }
  if (selBagItem) {
    const rot = me.bag.placements[selBagItem]?.rot || 0;
    const r = moveItem(selBagItem, x, y, rot);
    if (!r.ok) flash("Won't fit there.");
  }
}

function accountRow() {
  if (!auth.enabled) return el("p", { class: "muted small", text: "Local mode: your Joey saves to this browser only." });
  if (state.account) {
    return el("div", { class: "acct-row" }, [
      el("span", { class: "small", text: "☁️ Saved as " + state.account.username }),
      el("button", { class: "btn small", onclick: async () => { await auth.doLogout(); flash("Logged out."); refresh(); } }, ["Log out"]),
    ]);
  }
  return el("div", { class: "acct-row" }, [
    el("span", { class: "small muted", text: "Log in to save across devices" }),
    el("button", { class: "btn small primary", onclick: openLogin }, ["Log in / Sign up"]),
  ]);
}

// ---- Team Pot -------------------------------------------------------------

function togglePot() { if (openView === "pot") return closePanel(); openView = "pot"; setSelected(null); renderPot(); showPanel(); }
function renderPot() {
  const pot = state.shared.pot, me = state.me;
  const myContrib = pot.contributions[me.id] || 0, share = voteWeight(pot, me.id);
  const weekEnd = pot.weekStart + TUNING.weekMs, growing = pot.phase !== "voting";
  const kids = [panelHeader("🏦 Team Pot")];
  kids.push(el("div", { class: "pot-balance" }, [el("span", { class: "pot-amt", text: fmt(pot.balance) }), el("span", { class: "pot-sub", text: "shared, compounding at " + Math.round(TUNING.potInterestPerHour * 100) + "%/hr" })]));
  kids.push(growing ? el("div", { class: "pot-phase grow", text: "Growing · week ends in " + countdown(weekEnd - Date.now()) }) : el("div", { class: "pot-phase vote", text: "🗳️ Voting open — pot is locked until it resolves" }));
  kids.push(stat("Your stake", fmt(myContrib))); kids.push(stat("Your vote share", Math.round(share * 100) + "%"));
  if (pot.roomBuff && pot.roomBuff.incomeMult) kids.push(el("p", { class: "muted small", text: "Active perk: +" + Math.round(pot.roomBuff.incomeMult * 100) + "% room income (last week's winner)." }));
  if (growing) {
    const input = el("input", { class: "name-input", inputmode: "numeric", placeholder: "amount", value: investDraft, oninput: (e) => { investDraft = e.target.value.replace(/[^0-9]/g, ""); } });
    const doInvest = (amt) => { const r = investPot(amt); if (!r.ok) return flash(r.why || "Can't invest."); investDraft = ""; flash("Invested " + fmt(amt) + " into the pot."); };
    kids.push(el("div", { class: "invest-row" }, [input, el("button", { class: "btn primary", onclick: () => doInvest(parseInt(investDraft || "0", 10)) }, ["Invest"])]));
    kids.push(el("div", { class: "quick-row" }, [quick("25", () => doInvest(25)), quick("100", () => doInvest(100)), quick("Half", () => doInvest(Math.floor(me.credits / 2))), quick("Max", () => doInvest(Math.floor(me.credits)))]));
  } else {
    kids.push(el("div", { class: "ward-label", text: "Vote how to spend it" }));
    const votes = pot.votes || {}, tally = {};
    for (const [pid, prop] of Object.entries(votes)) tally[prop] = (tally[prop] || 0) + voteWeight(pot, pid);
    for (const p of PROPOSALS) {
      const mine = votes[me.id] === p.id, w = Math.round((tally[p.id] || 0) * 100);
      kids.push(el("button", { class: "prop" + (mine ? " mine" : ""), onclick: () => { const r = votePot(p.id); flash(r.ok ? "Voted for " + p.name + "." : (r.why || "Can't vote.")); } },
        [el("span", { class: "prop-glyph", text: p.glyph }), el("span", { class: "prop-body" }, [el("span", { class: "prop-name", text: p.name }), el("span", { class: "prop-desc muted small", text: p.desc })]), el("span", { class: "prop-tally", text: w + "%" })]));
    }
  }
  if (pot.history && pot.history.length) { const last = pot.history[pot.history.length - 1], prop = proposalById(last.proposal); kids.push(el("p", { class: "muted small", text: "Last week the team bought: " + (prop ? prop.name : last.proposal) + "." })); }
  panel.replaceChildren(...kids);
}
function quick(label, fn) { return el("button", { class: "qbtn", onclick: fn }, [label]); }

// ---- login modal ----------------------------------------------------------

function openLogin() {
  const err = el("div", { class: "login-err small" });
  const u = el("input", { class: "name-input", placeholder: "username", autocomplete: "username" });
  const p = el("input", { class: "name-input", type: "password", placeholder: "password", autocomplete: "current-password" });
  const run = async (mode) => {
    err.textContent = "";
    try {
      const acc = mode === "signup" ? await auth.signUp(u.value.trim(), p.value) : await auth.signIn(u.value.trim(), p.value);
      if (!acc) throw new Error("Could not sign in.");
      await auth.applyAuthed(acc);
      back.remove(); flash("Signed in as " + acc.username + "."); refresh();
    } catch (e) { err.textContent = (e && e.message) || "Something went wrong."; }
  };
  const back = el("div", { class: "modal-back" }, [el("div", { class: "modal login-modal" }, [
    el("h2", { text: "Joe Account" }),
    el("p", { class: "muted small", text: "Optional. Saves your Joey to the cloud so it survives a cookie wipe or follows you to another device." }),
    el("label", { class: "field" }, [el("span", { class: "field-label", text: "Username" }), u]),
    el("label", { class: "field" }, [el("span", { class: "field-label", text: "Password" }), p]),
    err,
    el("div", { class: "panel-actions" }, [el("button", { class: "btn primary", onclick: () => run("login") }, ["Log in"]), el("button", { class: "btn", onclick: () => run("signup") }, ["Sign up"])]),
    el("button", { class: "btn ghost small", onclick: () => back.remove() }, ["Cancel"]),
  ])]);
  document.body.appendChild(back);
}

// ---- panel plumbing -------------------------------------------------------

function panelHeader(title) { return el("div", { class: "panel-head" }, [el("h2", { text: title }), el("button", { class: "x", onclick: closePanel, title: "Close" }, ["✕"])]); }
function stat(l, v) { return el("div", { class: "stat" }, [el("span", { class: "stat-l", text: l }), el("span", { class: "stat-v", text: v })]); }
function showPanel() { panel.classList.add("open"); }
function closePanel() { panel.classList.remove("open"); openView = null; openKey = null; selBagItem = null; setSelected(null); }
function countdown(ms) { if (ms <= 0) return "any moment"; const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000); return d > 0 ? d + "d " + h + "h" : h > 0 ? h + "h " + m + "m" : m + "m"; }
export function showOffline(info) { if (!info || info.gained < 1) return; flash("While you were away (~" + Math.round(info.seconds / 60) + " min): +" + fmt(info.gained) + " credits"); }

// ---- Build Your Joey ------------------------------------------------------

function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function openCreator() {
  const sel = { specialty: null, look: defaultLook(), three: shuffle(ADJECTIVES).slice(0, 3), adjIndex: null };
  const preview = el("canvas", { class: "joey-preview", width: "160", height: "190" });
  const drawPreview = () => { const c = preview.getContext("2d"); c.clearRect(0, 0, 160, 190); drawJoey(c, 80, 150, { look: sel.look, worn: {}, scale: 3.2, t: performance.now() / 1000 }); };
  const previewTimer = setInterval(drawPreview, 60);
  const specRow = el("div", { class: "spec-row" }, Object.values(SPECIALTIES).map((sp) => el("button", { class: "spec-card", "data-id": sp.id, onclick: () => { sel.specialty = sp.id; markSpec(); } }, [el("div", { class: "spec-glyph", text: sp.glyph }), el("div", { class: "spec-name", text: sp.name }), el("div", { class: "spec-blurb muted small", text: sp.blurb }), el("div", { class: "spec-start small", text: "Start: 🧠 " + sp.start.brain + "  🔧 " + sp.start.build })])));
  const markSpec = () => { specRow.querySelectorAll(".spec-card").forEach((n) => n.classList.toggle("on", n.getAttribute("data-id") === sel.specialty)); updateStart(); };
  const lookRows = el("div", {}, Object.entries(BASE_LOOK).map(([slot, cfg]) => el("div", { class: "ward-slot" }, [el("div", { class: "ward-sub", text: cfg.label }), el("div", { class: "look-row" }, cfg.options.map((o) => el("button", { class: "swatch" + (sel.look[slot] === o.id ? " on" : ""), style: `background:${o.color}`, title: o.name, "data-slot": slot, "data-id": o.id, onclick: () => { sel.look[slot] = o.id; markLook(slot); drawPreview(); } })))])));
  const markLook = (slot) => lookRows.querySelectorAll(`.swatch[data-slot="${slot}"]`).forEach((n) => n.classList.toggle("on", n.getAttribute("data-id") === sel.look[slot]));
  const adjWrap = el("div", { class: "adj-wrap" });
  const renderAdj = () => { adjWrap.replaceChildren(...sel.three.map((a, i) => el("button", { class: "adj-card" + (sel.adjIndex === i ? " on" : ""), onclick: () => { sel.adjIndex = i; renderAdj(); updateStart(); } }, [el("div", { class: "adj-word", text: "JOEY " + a.word }), el("div", { class: "adj-buff small", text: adjSummary(a) })]))); };
  const reroll = el("button", { class: "btn ghost small", onclick: () => { sel.three = shuffle(ADJECTIVES).slice(0, 3); sel.adjIndex = null; renderAdj(); updateStart(); } }, ["🎲 reroll"]);
  const startInfo = el("div", { class: "start-info muted small" });
  const updateStart = () => { const ready = sel.specialty && sel.adjIndex != null; startBtn.disabled = !ready; startBtn.classList.toggle("poor", !ready); startInfo.textContent = ready ? ("You'll be JOEY " + sel.three[sel.adjIndex].word + " — " + SPECIALTIES[sel.specialty].name + ", " + adjSummary(sel.three[sel.adjIndex]) + ".") : "Pick a specialty and a name to start."; };
  const startBtn = el("button", { class: "btn primary big poor", disabled: "true", onclick: () => { if (!sel.specialty || sel.adjIndex == null) return; clearInterval(previewTimer); createJoey({ specialty: sel.specialty, adjectiveWord: sel.three[sel.adjIndex].word, look: sel.look }); back.remove(); flash("Welcome, " + state.me.name + "! Stand next to furniture to earn more."); } }, ["Start as this Joey"]);
  const back = el("div", { class: "modal-back" }, [el("div", { class: "creator" }, [
    el("h2", { text: "BUILD YOUR JOEY" }),
    el("div", { class: "creator-body" }, [
      el("div", { class: "creator-left" }, [preview, el("div", { class: "prev-cap muted small", text: "big nose, proud 'stache" })]),
      el("div", { class: "creator-right" }, [el("div", { class: "sect-label", text: "1 · Specialty" }), specRow, el("div", { class: "sect-label", text: "2 · Your name & buff" }), el("div", { class: "adj-head" }, [el("span", { class: "muted small", text: "Pick one. It's permanent." }), reroll]), adjWrap, el("div", { class: "sect-label", text: "3 · Look" }), lookRows]),
    ]),
    startInfo, startBtn,
  ])]);
  document.body.appendChild(back); renderAdj(); updateStart(); drawPreview();
}
