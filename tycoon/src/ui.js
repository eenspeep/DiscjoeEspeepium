// DOM overlay: Build-Your-Joey gate, HUD, build bar, furniture inspector, the
// Locker (account + equipment slots + spatial bag + shop), and the Team Pot.

import { el, fmt, clamp } from "./util.js";
import { TUNING } from "./config.js";
import {
  state, onChange, income$, createJoey,
  tryUpgradeFurniture, trySellFurniture, tryAddRoom, investPot, votePot, setLook,
  tryBuyItem, equipItem, unequipItem, moveItem, rotateItem, trySellItem,
  cancelSite, cancelBuild,
  tryLockDoor, tryUnlockDoor, tryRemoveDoor, checkDoorPassword,
} from "./state.js";
import {
  FURNITURE, FURNITURE_ORDER, furnitureBuyCost, upgradeCost, furnitureValue,
  roomCost, canAddRoom, isProtected, statScales, SPECIALTIES, ADJECTIVES, adjSummary, rollAdjectives, RARITY, STATS,
  PROPOSALS, proposalById, voteWeight,
  ITEMS, ITEM_SLOTS, SLOT_LABEL, shopByTier, itemPrice, itemCells, bagGrid, bagFreeCells,
  furnitureTier, itemTier, furnitureWork, itemWork, tierUnlocked,
  currentTier, nextTier, researchTotal, siteProgress, tierPower, TIER_COUNT,
  esoOfItem, esoOfFurniture, currentEso, nextEso, ESO_MAX, ESO_NAME,
  MODS, MOD_ORDER, modPrice, isModUnlocked,
  blackMarkCells, blackMarkSlots, TRAITS,
} from "./economy.js";
import { BASE_LOOK, drawJoey, defaultLook } from "./appearance.js";
import { setBuild, getBuild, setBuildMod, getBuildMod, setBuildDoor, getBuildDoor, setSelected, unlockDoorLocal } from "./world.js";

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
    if (state.justBlocked) { flash("🛡️ Blocked " + state.justBlocked.by + " — your " + state.justBlocked.shield + " shattered!"); state.justBlocked = null; }
    if (state.justFirstKill) { flash("⚠️ First kill — a warning. Kill again and black marks eat your bag."); state.justFirstKill = null; }
    if (state.justBlackMark) { flash("🖤 A black mark stains your soul — a bag slot is lost."); state.justBlackMark = null; }
    if (state.justRefund) { flash("💸 +" + fmt(state.justRefund) + " refunded to you (someone sold furniture you paid for)."); state.justRefund = null; }
    if (state.justKilled) { flash("☠️ Killed by " + state.justKilled + ". Your gear dropped where you fell. Build a new Joey."); state.justKilled = null; closePanel(); ensureCreator(); }
  }, 400);
}
function ensureCreator() { if (!state.me.created && !document.querySelector(".modal-back")) openCreator(); }

function researchTitle() {
  const nt = nextTier(state.shared);
  if (!nt) return "Research maxed — all tiers unlocked";
  return "Research tier " + currentTier(state.shared) + " · " + Math.floor(researchTotal(state.shared)) + "/" + nt.need + " to Tier " + nt.tier + " (use BRAIN furniture)";
}
function soulTitle() {
  const ne = nextEso(state.me);
  if (!ne) return "Esotericism maxed — SOUL " + Math.floor(state.me.soul);
  return "SOUL " + Math.floor(state.me.soul) + " · " + ne.have + "/" + ne.need + " to " + ne.name + " (channel at an esoteric altar)";
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
  else if (openView === "door") renderDoor();
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
        el("span", { class: "schip research", title: researchTitle(), text: "🔬 T" + currentTier(state.shared) + "/" + TIER_COUNT }),
        el("span", { class: "schip soul", title: soulTitle(), text: "🔮 E" + currentEso(me) + "/" + ESO_MAX }),
      ]) : null,
    ]),
    el("div", { class: "hud-right" }, [
      el("span", { class: "badge", text: mode + host }),
      el("span", { class: "badge muted", text: "👥 " + (state.peers.length + 1) }),
      el("button", { class: "btn", onclick: toggleLocker }, ["Locker"]),
      el("button", { class: "btn" + (voting ? " alert" : ""), onclick: togglePot }, [voting ? "Vote!" : "Team Pot"]),
      el("button", { class: "btn ghost", onclick: () => flash("WASD/click to walk · E shove · Q attack (need a weapon in hand) · click a 📦 to grab loot · stand by furniture to use it"), title: "Help" }, ["?"]),
    ])
  );
}

// ---- build bar ------------------------------------------------------------

const TAG_CLASS = { brain: "t-brain", build: "t-build", neutral: "t-neutral" };
function renderBuildbar() {
  if (!buildbar) return;
  if (!state.me.created) { buildbar.replaceChildren(); return; }
  const s = state.shared, active = getBuild(), activeMod = getBuildMod(), me = state.me;
  const cursor = el("button", { class: "build-btn cursor" + (active || activeMod ? "" : " active"), title: "Walk mode", onclick: () => selectBuild(null) }, [el("span", { class: "b-glyph", text: "👆" }), el("span", { class: "b-name", text: "Walk" })]);
  const btns = FURNITURE_ORDER.filter((type) => furnitureTier(type) <= currentTier(s)).map((type) => {
    const def = FURNITURE[type];
    const esoReq = esoOfFurniture(type);
    if (esoReq > currentEso(me)) {
      return el("button", { class: "build-btn locked", title: def.name + " — needs " + ESO_NAME[esoReq] + " esotericism", onclick: () => flash(def.name + " needs " + ESO_NAME[esoReq] + " soul. Channel at an esoteric altar.") },
        [el("span", { class: "b-glyph", text: "🔮" }), el("span", { class: "b-name", text: def.name }), el("span", { class: "b-cost", text: "E" + esoReq })]);
    }
    const cost = furnitureBuyCost(s, type), afford = me.credits >= cost;
    const val = Math.round(furnitureValue({ type, level: 1 }) * 100) / 100;
    return el("button", { class: "build-btn " + (TAG_CLASS[def.tag] || "") + (active === type ? " active" : "") + (afford ? "" : " poor"), title: def.name + " (T" + def.tier + ") — " + (def.soul ? "channel SOUL here · " : "") + def.tag.toUpperCase() + ", +" + fmt(val) + "/s adjacent · " + furnitureWork(type) + " work", onclick: () => selectBuild(type) },
      [el("span", { class: "b-glyph", text: def.glyph }), el("span", { class: "b-name", text: def.name }), el("span", { class: "b-cost", text: fmt(cost) })]);
  });
  const addRoom = canAddRoom(s)
    ? el("button", { class: "build-btn expand" + (state.me.credits >= roomCost(s) ? "" : " poor"), title: "Add a side room joined by a hallway", onclick: () => { const r = tryAddRoom(); flash(r.ok ? "New room added down the hall." : (r.why || "Can't add a room.")); } }, [el("span", { class: "b-glyph", text: "➕" }), el("span", { class: "b-name", text: "Add Room" }), el("span", { class: "b-cost", text: fmt(roomCost(s)) })])
    : el("button", { class: "build-btn expand disabled" }, [el("span", { class: "b-glyph", text: "🏢" }), el("span", { class: "b-name", text: "Max" })]);
  const doorReady = currentTier(s) >= TUNING.doorTier;
  const activeDoor = getBuildDoor();
  const door = doorReady
    ? el("button", { class: "build-btn door" + (activeDoor ? " active" : "") + (me.credits >= TUNING.doorCost ? "" : " poor"), title: "Install a door in a hallway (password-lock it later)", onclick: () => selectDoor() }, [el("span", { class: "b-glyph", text: "🚪" }), el("span", { class: "b-name", text: "Door" }), el("span", { class: "b-cost", text: fmt(TUNING.doorCost) })])
    : el("button", { class: "build-btn door locked", title: "Doors unlock at research Tier " + TUNING.doorTier, onclick: () => flash("Doors unlock at research Tier " + TUNING.doorTier + ". Keep researching with BRAIN furniture.") }, [el("span", { class: "b-glyph", text: "🔒" }), el("span", { class: "b-name", text: "Door" }), el("span", { class: "b-cost", text: "T" + TUNING.doorTier })]);
  const nt = nextTier(s);
  const teaser = nt ? el("button", { class: "build-btn locked", title: "Research " + (nt.need - nt.have) + " more to unlock Tier " + nt.tier, onclick: () => flash("Next: Tier " + nt.tier + " " + nt.name + " — " + nt.have + "/" + nt.need + " research. Stand at BRAIN furniture.") },
    [el("span", { class: "b-glyph", text: "🔒" }), el("span", { class: "b-name", text: "Tier " + nt.tier }), el("span", { class: "b-cost", text: "🔬" })]) : null;
  const KIND_GLYPH = { income: "¢", research: "🔬", build: "🔧" };
  const modBtns = MOD_ORDER.filter((type) => isModUnlocked(type, s)).map((type) => {
    const m = MODS[type], price = modPrice(type), afford = me.credits >= price;
    return el("button", { class: "build-btn mod" + (activeMod === type ? " active" : "") + (afford ? "" : " poor"), title: m.name + " — node mod, +" + fmt(m.unit * tierPower(m.tier)) + " flat " + m.kind + " (mount on a surface)", onclick: () => selectMod(type) },
      [el("span", { class: "b-glyph", text: m.glyph }), el("span", { class: "b-name", text: m.name }), el("span", { class: "b-cost", text: fmt(price) })]);
  });
  const modSep = modBtns.length ? [el("span", { class: "build-sep", text: "Mods" })] : [];

  buildbar.replaceChildren(cursor, ...btns, ...modSep, ...modBtns, addRoom, door, ...(teaser ? [teaser] : []));
}
function selectBuild(type) { setBuild(getBuild() === type ? null : type); if (getBuild()) flash("Click a floor tile to place your " + FURNITURE[getBuild()].name + " · R to rotate."); renderBuildbar(); }
function selectMod(type) { setBuildMod(getBuildMod() === type ? null : type); if (getBuildMod()) flash("Click a surface tile of a desk/table to mount the " + MODS[getBuildMod()].name + "."); renderBuildbar(); }
function selectDoor() { setBuildDoor(!getBuildDoor()); if (getBuildDoor()) flash("Click a hallway tile to install a door."); renderBuildbar(); }

// ---- furniture inspector --------------------------------------------------

export function openFurniture(key, f) { openKey = key; openView = "furn"; setSelected(key); setBuild(null); renderBuildbar(); renderFurniture(); showPanel(); }
function renderFurniture() {
  const f = state.shared.furniture[openKey]; if (!f) return closePanel();
  const def = FURNITURE[f.type], sc = statScales(state.me), raw = furnitureValue(f);
  const mine = def.tag === "brain" ? raw * sc.brain : def.tag === "build" ? raw * sc.build : raw;
  const up = upgradeCost(f);
  const [gx, gy] = openKey.split(",").map(Number);
  const prot = isProtected(state.shared, gx, gy);
  const iPaid = !f.paidBy || f.paidBy === state.me.id;
  panel.replaceChildren(
    panelHeader(def.glyph + " " + def.name),
    el("p", { class: "muted small", text: def.tag.toUpperCase() + " furniture. Buffs anyone standing next to it." }),
    prot ? el("p", { class: "muted small", text: iPaid ? "🛡️ Protected room — anyone can sell this, and the refund comes back to you (you paid for it)." : "🛡️ Protected room — anyone can sell this, and the refund goes back to whoever paid for it." }) : null,
    stat("Level", String(f.level)), stat("Base value", "+" + fmt(raw) + "/s"), stat("For you (stats)", "+" + fmt(Math.round(mine * 100) / 100) + "/s"),
    el("div", { class: "panel-actions" }, [
      el("button", { class: "btn primary" + (state.me.credits >= up ? "" : " poor"), onclick: () => { const r = tryUpgradeFurniture(openKey); flash(r.ok ? def.name + " upgraded." : (r.why || "Can't upgrade.")); } }, ["Upgrade — " + fmt(up)]),
      el("button", { class: "btn", onclick: () => { const r = trySellFurniture(openKey); flash(!r.ok ? (r.why || "Can't sell.") : r.toOther ? "Sold — " + fmt(r.refund) + " returned to its buyer." : "Sold for " + fmt(r.refund) + "."); if (r.ok) closePanel(); } }, ["Sell"]),
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
    el("div", { class: "panel-actions" }, [el("button", { class: "btn", onclick: () => { const r = cancelSite(openKey); flash(!r.ok ? (r.why || "Can't cancel.") : r.toOther ? "Build cancelled — " + fmt(r.refund) + " returned to its buyer." : "Build cancelled, refunded " + fmt(r.refund) + "."); if (r.ok) closePanel(); } }, ["Cancel build"])])
  );
}

// ---- door inspector -------------------------------------------------------

let doorPwDraft = "";
export function openDoor(key, door) { openKey = key; openView = "door"; doorPwDraft = ""; setSelected(null); setBuild(null); setBuildMod(null); setBuildDoor(false); renderBuildbar(); renderDoor(); showPanel(); }
function renderDoor() {
  const d = state.shared.doors[openKey]; if (!d) return closePanel();
  const mine = d.by === state.me.id;
  const kids = [panelHeader((d.locked ? "🔒" : "🚪") + " Door")];
  const pw = el("input", { class: "name-input", type: "password", placeholder: "password", value: doorPwDraft, oninput: (e) => { doorPwDraft = e.target.value; } });

  if (mine) {
    kids.push(el("p", { class: "muted small", text: d.locked ? "Locked. Only you and anyone with the password can pass. Unlock it for free, or remove it." : "Yours. Set a password to lock it — a lock costs " + fmt(TUNING.lockCost) + "." }));
    kids.push(el("label", { class: "field" }, [el("span", { class: "field-label", text: d.locked ? "New password (re-lock)" : "Password" }), pw]));
    const acts = [];
    acts.push(el("button", { class: "btn primary" + (state.me.credits >= TUNING.lockCost ? "" : " poor"), onclick: () => { const r = tryLockDoor(openKey, doorPwDraft); flash(r.ok ? "Door locked." : (r.why || "Can't lock.")); if (r.ok) { doorPwDraft = ""; renderDoor(); } } }, [d.locked ? "Re-lock — " + fmt(TUNING.lockCost) : "Lock — " + fmt(TUNING.lockCost)]));
    if (d.locked) acts.push(el("button", { class: "btn", onclick: () => { const r = tryUnlockDoor(openKey); flash(r.ok ? "Door unlocked." : (r.why || "Can't unlock.")); renderDoor(); } }, ["Unlock"]));
    acts.push(el("button", { class: "btn", onclick: () => { const r = tryRemoveDoor(openKey); flash(r.ok ? "Door removed (+" + fmt(r.refund) + ")." : (r.why || "Can't remove.")); closePanel(); } }, ["Remove door"]));
    kids.push(el("div", { class: "panel-actions" }, acts));
  } else if (!d.locked) {
    kids.push(el("p", { class: "muted small", text: "This door is unlocked — walk right through it." }));
  } else {
    kids.push(el("p", { class: "muted small", text: "Locked by someone else. Enter the password to open it for this session." }));
    kids.push(el("label", { class: "field" }, [el("span", { class: "field-label", text: "Password" }), pw]));
    kids.push(el("div", { class: "panel-actions" }, [el("button", { class: "btn primary", onclick: () => { if (checkDoorPassword(openKey, doorPwDraft)) { unlockDoorLocal(openKey); flash("Unlocked! You can pass now."); closePanel(); } else flash("Wrong password."); } }, ["Open"])]));
  }
  panel.replaceChildren(...kids);
}

// ---- Locker: account + equipment + bag + shop -----------------------------

function toggleLocker() { if (openView === "locker") return closePanel(); openView = "locker"; setSelected(null); renderLocker(); showPanel(); }

function itemBuffText(def) {
  if (def.weapon) return "🔪 instant kill · " + def.uses + " use" + (def.uses > 1 ? "s" : "");
  if (def.shield) return "🛡️ blocks 1 hit";
  if (def.value) return "+" + fmt(Math.round(def.value * tierPower(def.tier) * 100) / 100) + "/s" + (def.tag && def.tag !== "neutral" ? " " + def.tag[0].toUpperCase() : "");
  if (def.mult) return "+" + Math.round(def.mult * 100) + "%";
  if (def.speedMult) return "+" + Math.round(def.speedMult * 100) + "% spd";
  if (def.buildBonus) return "+" + def.buildBonus + " build";
  if (def.researchBonus) return "+" + def.researchBonus + " rsch";
  if (def.soulBonus) return "+" + Math.round(def.soulBonus * 100) + "% soul";
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
  const traitKeys = Object.keys(me.traits || {}).filter((k) => TRAITS[k] && me.traits[k]);
  if (traitKeys.length) {
    kids.push(el("div", { class: "trait-line" }, traitKeys.map((k) => el("span", { class: "trait-chip", title: TRAITS[k].label + ": " + TRAITS[k].per(me.traits[k]) }, [TRAITS[k].glyph + " " + TRAITS[k].per(me.traits[k])]))));
  }

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
  const marks = blackMarkSlots(me);
  kids.push(el("div", { class: "ward-label", text: "Bag · " + grid.w + "×" + grid.h + " · " + bagFreeCells(me) + " free" + (marks ? " · 🖤 " + marks + " black mark" + (marks > 1 ? "s" : "") : "") }));
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

  // shop — grouped by research tier (whole tiers unlock; no per-item locks)
  kids.push(el("div", { class: "ward-label", text: "Shop · research unlocks tiers" }));
  for (const grp of shopByTier()) {
    if (!grp.items.length) continue;
    if (tierUnlocked(grp.tier, state.shared)) {
      kids.push(el("div", { class: "tier-head", text: "Tier " + grp.tier + " · " + grp.name }));
      for (const type of grp.items) {
        const def = ITEMS[type];
        const ext = itemCells(type).reduce((m, c) => ({ w: Math.max(m.w, c[0] + 1), h: Math.max(m.h, c[1] + 1) }), { w: 1, h: 1 });
        const esoReq = esoOfItem(type);
        if (esoReq > currentEso(me)) {
          kids.push(el("button", { class: "shop-row eso-locked", onclick: () => flash(def.name + " needs " + ESO_NAME[esoReq] + " soul. Channel at an esoteric altar.") }, [
            el("span", { class: "shop-glyph", text: "🔮" }),
            el("span", { class: "shop-body" }, [el("span", { class: "shop-name", text: def.name }), el("span", { class: "shop-meta muted small", text: "🔮 " + ESO_NAME[esoReq] + " · " + (itemBuffText(def) || SLOT_LABEL[def.slot] || "") })]),
            el("span", { class: "shop-price", text: fmt(itemPrice(type)) }),
          ]));
          continue;
        }
        kids.push(el("button", { class: "shop-row", onclick: () => { const r = tryBuyItem(type); flash(r.ok ? "Building " + def.name + " (" + itemWork(type) + " work)…" : (r.why || "Can't buy.")); } }, [
          el("span", { class: "shop-glyph", text: def.glyph }),
          el("span", { class: "shop-body" }, [el("span", { class: "shop-name", text: def.name }), el("span", { class: "shop-meta muted small", text: (itemBuffText(def) || SLOT_LABEL[def.slot] || "") + " · " + ext.w + "×" + ext.h + " · " + itemWork(type) + "w" })]),
          el("span", { class: "shop-price", text: fmt(itemPrice(type)) }),
        ]));
      }
    } else {
      const nt = nextTier(state.shared);
      const isNext = nt && nt.tier === grp.tier;
      kids.push(el("div", { class: "tier-head locked", text: "🔒 Tier " + grp.tier + " · " + grp.name + (isNext ? " — " + fmt(nt.have) + "/" + fmt(nt.need) + " research" : "") }));
    }
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
  const black = blackMarkCells(me);
  const wrap = el("div", { class: "bag-grid", style: `grid-template-columns:repeat(${grid.w},34px);grid-template-rows:repeat(${grid.h},34px)` });
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
    const key = x + "," + y, id = cellMap.get(key), inst = id && me.items[id], def = inst && ITEMS[inst.type];
    const isAnchor = id && anchor.get(id) === key;
    const isBlack = !id && black.has(key);
    const cell = el("button", {
      class: "bag-cell" + (id ? " occ" : "") + (isBlack ? " black" : "") + (id && id === selBagItem ? " sel" : "") + (def && def.immovable ? " immov" : ""),
      style: def ? `background:${def.color}` : "",
      onclick: () => { if (isBlack) return flash("A black mark — only the Cat God Enzo can clear it (church coming soon)."); onBagCell(x, y, id); },
    }, [isBlack ? el("span", { class: "bag-glyph", text: "✖" }) : (isAnchor ? el("span", { class: "bag-glyph", text: def.glyph }) : null)]);
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

function openLogin(onDone, required = false) {
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
      if (onDone) onDone(acc);
    } catch (e) { err.textContent = (e && e.message) || "Something went wrong."; }
  };
  const back = el("div", { class: "modal-back" }, [el("div", { class: "modal login-modal" }, [
    el("h2", { text: "Joe Account" }),
    el("p", { class: "muted small", text: required ? "You need an account before you can build a Joey — it saves your Joey to the cloud and follows you across devices." : "Optional. Saves your Joey to the cloud so it survives a cookie wipe or follows you to another device." }),
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

const REROLL_MAX = 3;
function openCreator() {
  const sel = { specialty: null, look: defaultLook(), three: rollAdjectives(3), adjIndex: null, rerolls: REROLL_MAX };
  const acctReady = () => !auth.enabled || !!state.account;
  const preview = el("canvas", { class: "joey-preview", width: "160", height: "190" });
  const drawPreview = () => { const c = preview.getContext("2d"); c.clearRect(0, 0, 160, 190); drawJoey(c, 80, 150, { look: sel.look, worn: {}, scale: 3.2, t: performance.now() / 1000 }); };
  const previewTimer = setInterval(drawPreview, 60);

  // step 1 — account gate
  const acctRow = el("div", { class: "creator-acct" });
  const renderAcct = () => {
    acctRow.replaceChildren();
    if (!auth.enabled) { acctRow.appendChild(el("span", { class: "muted small", text: "Local build — no account needed here." })); return; }
    if (state.account) acctRow.appendChild(el("span", { class: "small", text: "☁️ Signed in as " + state.account.username + " — you're good to go." }));
    else {
      acctRow.appendChild(el("span", { class: "small", text: "An account is required to build a Joey." }));
      acctRow.appendChild(el("button", { class: "btn small primary", onclick: () => openLogin(() => { renderAcct(); updateStart(); }, true) }, ["Log in / Sign up"]));
    }
  };

  const specRow = el("div", { class: "spec-row" }, Object.values(SPECIALTIES).map((sp) => el("button", { class: "spec-card", "data-id": sp.id, onclick: () => { sel.specialty = sp.id; markSpec(); } }, [el("div", { class: "spec-glyph", text: sp.glyph }), el("div", { class: "spec-name", text: sp.name }), el("div", { class: "spec-blurb muted small", text: sp.blurb }), el("div", { class: "spec-start small", text: "Start: 🧠 " + sp.start.brain + "  🔧 " + sp.start.build })])));
  const markSpec = () => { specRow.querySelectorAll(".spec-card").forEach((n) => n.classList.toggle("on", n.getAttribute("data-id") === sel.specialty)); updateStart(); };
  const lookRows = el("div", {}, Object.entries(BASE_LOOK).map(([slot, cfg]) => el("div", { class: "ward-slot" }, [el("div", { class: "ward-sub", text: cfg.label }), el("div", { class: "look-row" }, cfg.options.map((o) => el("button", { class: "swatch" + (sel.look[slot] === o.id ? " on" : ""), style: `background:${o.color}`, title: o.name, "data-slot": slot, "data-id": o.id, onclick: () => { sel.look[slot] = o.id; markLook(slot); drawPreview(); } })))])));
  const markLook = (slot) => lookRows.querySelectorAll(`.swatch[data-slot="${slot}"]`).forEach((n) => n.classList.toggle("on", n.getAttribute("data-id") === sel.look[slot]));

  const adjWrap = el("div", { class: "adj-wrap" });
  const renderAdj = () => {
    adjWrap.replaceChildren(...sel.three.map((a, i) => {
      const R = RARITY[a.rarity] || RARITY.common;
      return el("button", { class: "adj-card rar-" + a.rarity + (sel.adjIndex === i ? " on" : ""), style: `--rar:${R.tint}`, onclick: () => { sel.adjIndex = i; renderAdj(); updateStart(); } }, [
        el("div", { class: "adj-top" }, [el("div", { class: "adj-word", text: "JOEY " + a.word }), el("span", { class: "adj-rarity", style: `background:${R.tint}`, text: R.label })]),
        el("div", { class: "adj-buff small", text: adjSummary(a) }),
      ]);
    }));
  };
  const rerollText = () => sel.rerolls > 0 ? "🎲 reroll (" + sel.rerolls + " left)" : "no rerolls left";
  const reroll = el("button", { class: "btn ghost small", onclick: () => { if (sel.rerolls <= 0) return; sel.rerolls -= 1; sel.three = rollAdjectives(3); sel.adjIndex = null; reroll.textContent = rerollText(); if (sel.rerolls <= 0) { reroll.disabled = true; reroll.classList.add("poor"); } renderAdj(); updateStart(); } }, [rerollText()]);

  const startInfo = el("div", { class: "start-info muted small" });
  const updateStart = () => {
    const ready = sel.specialty && sel.adjIndex != null && acctReady();
    startBtn.disabled = !ready; startBtn.classList.toggle("poor", !ready);
    startInfo.textContent = !acctReady() ? "Make an account first (step 1)." : ready ? ("You'll be JOEY " + sel.three[sel.adjIndex].word + " — " + SPECIALTIES[sel.specialty].name + ", " + adjSummary(sel.three[sel.adjIndex]) + ".") : "Pick a specialty and a name to start.";
  };
  const startBtn = el("button", { class: "btn primary big poor", disabled: "true", onclick: () => { if (!sel.specialty || sel.adjIndex == null || !acctReady()) return; clearInterval(previewTimer); createJoey({ specialty: sel.specialty, adjectiveWord: sel.three[sel.adjIndex].word, look: sel.look }); back.remove(); flash("Welcome, " + state.me.name + "! Stand next to furniture to earn more."); } }, ["Start as this Joey"]);

  const back = el("div", { class: "modal-back" }, [el("div", { class: "creator" }, [
    el("h2", { text: "BUILD YOUR JOEY" }),
    el("div", { class: "creator-body" }, [
      el("div", { class: "creator-left" }, [preview, el("div", { class: "prev-cap muted small", text: "big nose, proud 'stache" })]),
      el("div", { class: "creator-right" }, [
        el("div", { class: "sect-label", text: "1 · Account" }), acctRow,
        el("div", { class: "sect-label", text: "2 · Specialty" }), specRow,
        el("div", { class: "sect-label", text: "3 · Your name & traits" }), el("div", { class: "adj-head" }, [el("span", { class: "muted small", text: "Pick one. It's permanent. Rarer names carry stronger traits." }), reroll]), adjWrap,
        el("div", { class: "sect-label", text: "4 · Look" }), lookRows,
      ]),
    ]),
    startInfo, startBtn,
  ])]);
  document.body.appendChild(back); renderAcct(); renderAdj(); updateStart(); drawPreview();
}
