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
  tryBuyRatEgg, tryRepairFurniture, trySellWall,
} from "./state.js";
import {
  FURNITURE, FURNITURE_ORDER, furnitureBuyCost, upgradeCost, furnitureValue,
  roomCost, canAddRoom, tileCost, canBuyTiles, isProtected, roleOf, ROLE_META, goldPctOf, buildAddOf, researchAddOf, specRole, SPECIALTIES, ADJECTIVES, adjSummary, rollAdjectives, RARITY, STATS,
  PROPOSALS, proposalById, voteWeight,
  ITEMS, ITEM_SLOTS, SLOT_LABEL, shopByTier, itemPrice, itemCells, bagGrid, bagFreeCells,
  furnitureTier, itemTier, furnitureWork, itemWork, tierUnlocked,
  currentTier, nextTier, researchTotal, siteProgress, tierPower, TIER_COUNT, TIER_NAME,
  rpRate, soulRate, tierProgress, esoProgress,
  esoOfItem, esoOfFurniture, currentEso, nextEso, ESO_MAX, ESO_NAME,
  MODS, MOD_ORDER, modPrice, isModUnlocked,
  WALL_DECOR, WALL_ORDER, wallPrice, isWallUnlocked,
  blackMarkCells, blackMarkSlots, TRAITS, repairCost,
  petActive,
} from "./economy.js";
import { LOOK_PICKERS, lookColor, drawJoey, drawJoeySprite, defaultLook } from "./appearance.js";
import { setBuild, getBuild, setBuildMod, getBuildMod, setBuildDoor, getBuildDoor, setBuildWall, getBuildWall, setBuildExpand, getBuildExpand, setSelected, unlockDoorLocal } from "./world.js";

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
  setInterval(() => { renderHud(); renderBuildbar(); }, 500);   // keep hand bar synced with world build state
  setInterval(() => {
    if (openView === "pot") renderPot();
    else if (openView === "site") renderSite();
    else if (openView === "shop") renderShop();
    else if (openView === "locker" && state.me.buildQueue.length) renderLocker();
  }, 1000);
  setInterval(() => {
    if (state.justBuilt) { flash("Built: " + state.justBuilt + "!"); state.justBuilt = null; }
    if (state.justCrafted) { flash("Crafted: " + state.justCrafted + " — in your bag."); state.justCrafted = null; }
    if (state.justBlocked) { flash("🛡️ Blocked " + state.justBlocked.by + " — your " + state.justBlocked.shield + " shattered!"); state.justBlocked = null; }
    if (state.justFirstKill) { flash("⚠️ First kill — a warning. Kill again and black marks eat your bag."); state.justFirstKill = null; }
    if (state.justBlackMark) { flash("🖤 A black mark stains your soul — a bag slot is lost."); state.justBlackMark = null; }
    if (state.justRefund) { flash("💸 +" + fmt(state.justRefund) + " refunded to you (someone sold furniture you paid for)."); state.justRefund = null; }
    if (state.justRatKing) { flash("👑🐀 The rats formed a RAT KING! 5 armor, and it smashes 2 of your shields per hit."); state.justRatKing = null; }
    if (state.justMonsterBlock) { flash("🛡️ " + state.justMonsterBlock.by + " broke " + state.justMonsterBlock.n + " of your shields!"); state.justMonsterBlock = null; }
    if (state.justPetGot) { flash("🐀 You leashed a rat buddy! x1.2 soul, and it eats one hit for you."); state.justPetGot = null; }
    if (state.justPetHit) { flash("🐀💥 Your rat buddy took a hit from " + state.justPetHit.by + " and scurried off."); state.justPetHit = null; }
    if (state.justDodged) { flash("✨ Mid-jump! You dodged " + state.justDodged + "'s hit."); state.justDodged = null; }
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

function progTrack(cls, icon, prog, rate, title) {
  const pct = Math.round((prog.frac || 0) * 100);
  const active = rate > 0.001;
  const num = prog.max ? "MAX" : Math.floor(prog.have - prog.from) + "/" + Math.round(prog.to - prog.from) + (active ? "  +" + rate.toFixed(2) + "/s" : "");
  return el("div", { class: "track " + cls + (active ? " active" : ""), title }, [
    el("span", { class: "track-ic", text: icon }),
    el("div", { class: "track-bar" }, [el("div", { class: "track-fill", style: `width:${pct}%` })]),
    el("span", { class: "track-num", text: num }),
  ]);
}

// One toast per distinct message. A repeat (e.g. spam-clicking Enzo) shakes the
// existing bubble and resets its timer instead of stacking new ones up the screen.
const activeToasts = new Map();   // msg -> { el, timer }
function dismissToast(msg) {
  const entry = activeToasts.get(msg); if (!entry) return;
  activeToasts.delete(msg);
  entry.el.classList.remove("show");
  setTimeout(() => entry.el.remove(), 300);
}
export function flash(msg) {
  const existing = activeToasts.get(msg);
  if (existing) {
    clearTimeout(existing.timer);
    const e = existing.el;
    e.classList.remove("shake"); void e.offsetWidth; e.classList.add("shake");   // retrigger the shake
    existing.timer = setTimeout(() => dismissToast(msg), 2400);
    return;
  }
  const t = el("div", { class: "toast-item", text: msg });
  toast.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  const entry = { el: t, timer: setTimeout(() => dismissToast(msg), 2400) };
  activeToasts.set(msg, entry);
}

function refresh() {
  renderHud(); renderBuildbar();
  if (openView === "furn") renderFurniture();
  else if (openView === "locker") renderLocker();
  else if (openView === "pot") renderPot();
  else if (openView === "site") renderSite();
  else if (openView === "door") renderDoor();
  else if (openView === "wall") renderWall();
  else if (openView === "shop") renderShop();
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
        petActive(me) ? el("span", { class: "schip pet", title: "Rat buddy: x1.2 soul + eats one hit (stays while the leash is in hand)", text: "🐀 buddy" }) : null,
      ]) : null,
      me.created ? el("div", { class: "hud-tracks" }, [
        progTrack("research", "🔬", tierProgress(state.shared), rpRate(me, state.shared), researchTitle()),
        progTrack("soul", "🔮", esoProgress(me), soulRate(me, state.shared), soulTitle()),
      ]) : null,
    ]),
    el("div", { class: "hud-right" }, [
      el("span", { class: "badge", text: mode + host }),
      el("span", { class: "badge muted", text: "👥 " + (state.peers.length + 1) }),
      el("button", { class: "btn" + (openView === "shop" ? " alert" : ""), onclick: toggleShop }, ["🛒 Shop"]),
      el("button", { class: "btn", onclick: toggleLocker }, ["Locker"]),
      el("button", { class: "btn" + (voting ? " alert" : ""), onclick: togglePot }, [voting ? "Vote!" : "Team Pot"]),
      el("button", { class: "btn ghost", onclick: () => flash("WASD/click to walk · Space jump · Q attack (need a weapon in hand) · U unstick (warp to center) · walk into someone to shove them · click a 📦 to grab loot · stand by furniture to use it"), title: "Help" }, ["?"]),
    ])
  );
}

// ---- "in hand" bar (what you're about to place) ---------------------------
// The old furniture hotbar is gone. You buy from the Shop panel, which puts the
// item in your hands; this bar just shows what you're holding + a Cancel.
export function clearHands() { setBuild(null); renderBuildbar(); }
function heldLabel() {
  if (getBuild()) { const d = FURNITURE[getBuild()]; return d.glyph + " " + d.name; }
  if (getBuildMod()) { const m = MODS[getBuildMod()]; return m.glyph + " " + m.name; }
  if (getBuildWall()) { const d = WALL_DECOR[getBuildWall()]; return d.glyph + " " + d.name; }
  if (getBuildDoor()) return "🚪 Door";
  if (getBuildExpand()) return "🧭 Expand floor";
  return null;
}
function renderBuildbar() {
  if (!buildbar) return;
  const label = state.me.created ? heldLabel() : null;
  if (!label) { buildbar.replaceChildren(); buildbar.classList.remove("show"); return; }
  buildbar.classList.add("show");
  buildbar.replaceChildren(
    el("span", { class: "hand-label", text: "Holding: " + label }),
    el("span", { class: "hand-hint", text: (getBuildExpand() ? "click glowing fog at your edge" : getBuildWall() ? "aim at a wall within reach" : "click within reach") + (getBuild() ? " · R to rotate" : "") }),
    el("button", { class: "btn small", onclick: clearHands }, ["Put away"]),
  );
}

// ---- Shop panel -----------------------------------------------------------

function toggleShop() { if (openView === "shop") return closePanel(); openView = "shop"; setSelected(null); renderShop(); showPanel(); }
function shopRow(glyph, name, meta, price, afford, onclick, extraClass = "") {
  return el("button", { class: "shop-row" + (afford ? "" : " poor") + (extraClass ? " " + extraClass : ""), onclick }, [
    el("span", { class: "shop-glyph", text: glyph }),
    el("span", { class: "shop-body" }, [el("span", { class: "shop-name", text: name }), el("span", { class: "shop-meta muted small", text: meta })]),
    el("span", { class: "shop-price", text: fmt(price) }),
  ]);
}
function takeFurniture(type) { setBuild(type); flash("Holding " + FURNITURE[type].name + " — click a tile within reach. R rotates, Put Away to drop."); closePanel(); renderBuildbar(); }
function takeMod(type) { setBuildMod(type); flash("Holding " + MODS[type].name + " — click a desk/table surface within reach."); closePanel(); renderBuildbar(); }
function takeDoor() { setBuildDoor(true); flash("Holding a door — click any floor tile within reach."); closePanel(); renderBuildbar(); }
function takeWall(type) { setBuildWall(type); flash("Holding " + WALL_DECOR[type].name + " — aim at a wall within reach and click."); closePanel(); renderBuildbar(); }
function takeExpand() { setBuildExpand(true); flash("Expand mode — walk to your office edge and click the glowing fog to claim floor."); closePanel(); renderBuildbar(); }

// One-line effect string for a furniture piece, in its role's terms. Pass a
// real `me` for "your" numbers (specialty x2 + stats), or {} for base preview.
function furnEffect(ty, f, me) {
  const d = FURNITURE[ty], role = roleOf(ty);
  if (d.ratSpawner) return "🐀 spawns rats";
  if (role === "gold") return "💰 +" + Math.round(goldPctOf(f, me) * 100) + "% gold";
  if (role === "build") return "🔧 +" + (Math.round(buildAddOf(f, me) * 100) / 100) + " build";
  return "🔬 +" + (Math.round(researchAddOf(f, me) * 100) / 100) + " rp/s";
}

function renderShop() {
  const s = state.shared, me = state.me, kids = [panelHeader("🛒 Shop")];
  kids.push(el("p", { class: "muted small", text: "Pick something to hold, then click a tile within reach to place it. You keep holding it, so you can drop several." }));

  // Expansion: claim floor tile-by-tile out of the fog + Door (held)
  kids.push(el("div", { class: "ward-label", text: "Expansion · claim floor out of the fog" }));
  kids.push(canBuyTiles(s)
    ? shopRow("🧭", "Expand Floor", "hold it, then click glowing fog at your edge", tileCost(s), me.credits >= tileCost(s), takeExpand)
    : el("div", { class: "shop-row locked", text: "🏢 Office is at max size" }));
  kids.push(currentTier(s) >= TUNING.doorTier
    ? shopRow("🚪", "Door", "install on any floor tile, lock it later", TUNING.doorCost, me.credits >= TUNING.doorCost, takeDoor)
    : el("div", { class: "shop-row locked", text: "🔒 Door — unlocks at research Tier " + TUNING.doorTier }));

  // Node mods
  const modTypes = MOD_ORDER.filter((t) => isModUnlocked(t, s));
  if (modTypes.length) {
    kids.push(el("div", { class: "ward-label", text: "Node Mods · mount on a desk/table surface" }));
    for (const t of modTypes) { const m = MODS[t], price = modPrice(t); kids.push(shopRow(m.glyph, m.name, "+" + fmt(m.unit * tierPower(m.tier)) + " flat " + m.kind, price, me.credits >= price, () => takeMod(t))); }
  }

  // Wall decor
  const wallTypes = WALL_ORDER.filter((t) => isWallUnlocked(t, s));
  if (wallTypes.length) {
    kids.push(el("div", { class: "ward-label", text: "Wall Decor · hang on a wall within reach" }));
    for (const t of wallTypes) { const d = WALL_DECOR[t], price = wallPrice(t); kids.push(shopRow(d.glyph, d.name, "decorative", price, me.credits >= price, () => takeWall(t))); }
  }

  // Monsters
  kids.push(el("div", { class: "ward-label", text: "Monsters · unleash rats (they maul furniture + Joeys)" }));
  kids.push(shopRow("🥚", "Rat Egg", "hatches one rat next to you, right now", TUNING.ratEggCost, me.credits >= TUNING.ratEggCost, () => { const r = tryBuyRatEgg(); flash(r.ok ? "🐀 A rat scurries out!" : (r.why || "Can't buy.")); if (r.ok) renderShop(); }));

  // Furniture by research tier
  kids.push(el("div", { class: "ward-label", text: "Furniture · research unlocks tiers" }));
  for (let t = 1; t <= TIER_COUNT; t++) {
    const types = FURNITURE_ORDER.filter((ty) => furnitureTier(ty) === t);
    if (!types.length) continue;
    if (tierUnlocked(t, s)) {
      kids.push(el("div", { class: "tier-head", text: "Tier " + t + " · " + TIER_NAME[t] }));
      for (const ty of types) {
        const def = FURNITURE[ty], esoReq = esoOfFurniture(ty), cost = furnitureBuyCost(s, ty);
        const meta = def.ratSpawner ? "spawns rats every 10 min (upgrade = more)" : (def.soul ? "channel SOUL · " : "") + furnEffect(ty, { type: ty, level: 1 }, {}) + " · " + furnitureWork(ty) + "w";
        if (esoReq > currentEso(me)) {
          kids.push(shopRow("🔮", def.name, "🔮 " + ESO_NAME[esoReq] + " soul needed", cost, false, () => flash(def.name + " needs " + ESO_NAME[esoReq] + " soul. Channel at an esoteric altar."), "eso-locked"));
        } else {
          kids.push(shopRow(def.glyph, def.name, meta, cost, me.credits >= cost, () => takeFurniture(ty)));
        }
      }
    } else {
      const nt = nextTier(s), isNext = nt && nt.tier === t;
      kids.push(el("div", { class: "tier-head locked", text: "🔒 Tier " + t + " · " + TIER_NAME[t] + (isNext ? " — " + fmt(nt.have) + "/" + fmt(nt.need) + " research" : "") }));
    }
  }
  panel.replaceChildren(...kids);
}

// ---- furniture inspector --------------------------------------------------

export function openFurniture(key, f) { openKey = key; openView = "furn"; setSelected(key); setBuild(null); renderBuildbar(); renderFurniture(); showPanel(); }
function renderFurniture() {
  const f = state.shared.furniture[openKey]; if (!f) return closePanel();
  const def = FURNITURE[f.type], role = roleOf(f.type);
  const up = upgradeCost(f);
  const [gx, gy] = openKey.split(",").map(Number);
  const prot = isProtected(state.shared, gx, gy);
  const iPaid = !f.paidBy || f.paidBy === state.me.id;
  const actions = [];
  if (f.broken) {
    const rc = repairCost(f);
    actions.push(el("button", { class: "btn primary" + (state.me.credits >= rc ? "" : " poor"), onclick: () => { const r = tryRepairFurniture(openKey); flash(r.ok ? def.name + " repaired." : (r.why || "Can't repair.")); } }, ["Repair — " + fmt(rc)]));
  } else {
    actions.push(el("button", { class: "btn primary" + (state.me.credits >= up ? "" : " poor"), onclick: () => { const r = tryUpgradeFurniture(openKey); flash(r.ok ? def.name + " upgraded." : (r.why || "Can't upgrade.")); } }, [(def.ratSpawner ? "More rats — " : "Upgrade — ") + fmt(up)]));
  }
  actions.push(el("button", { class: "btn", onclick: () => { const r = trySellFurniture(openKey); flash(!r.ok ? (r.why || "Can't sell.") : r.toOther ? "Sold — " + fmt(r.refund) + " returned to its buyer." : "Sold for " + fmt(r.refund) + "."); if (r.ok) closePanel(); } }, ["Sell"]));

  panel.replaceChildren(
    panelHeader(def.glyph + " " + def.name),
    el("p", { class: "muted small", text: def.ratSpawner ? "Spawns " + f.level + " rat" + (f.level > 1 ? "s" : "") + " every 10 min. Upgrade for more." : (ROLE_META[role].label + " furniture — " + (role === "gold" ? "multiplies the gold of anyone standing next to it." : role === "build" ? "speeds up building for anyone next to it." : "speeds up research for anyone next to it.")) }),
    f.broken ? el("p", { class: "broken-note small", text: "🐀 In disrepair after a rat attack — earns nothing until repaired." }) : null,
    prot ? el("p", { class: "muted small", text: iPaid ? "🛡️ Protected room — anyone can sell this, and the refund comes back to you (you paid for it)." : "🛡️ Protected room — anyone can sell this, and the refund goes back to whoever paid for it." }) : null,
    stat("Level", String(f.level)), stat("Base", furnEffect(f.type, { type: f.type, level: f.level }, {})), stat("For you", furnEffect(f.type, f, state.me)),
    el("div", { class: "panel-actions" }, actions)
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

// ---- wall decor inspector -------------------------------------------------
export function openWall(key, w) { openKey = key; openView = "wall"; setSelected(null); setBuild(null); setBuildMod(null); setBuildDoor(false); setBuildWall(null); renderBuildbar(); renderWall(); showPanel(); }
function renderWall() {
  const w = state.shared.walls[openKey]; if (!w) return closePanel();
  const def = WALL_DECOR[w.type]; if (!def) return closePanel();
  const kids = [panelHeader(def.glyph + " " + def.name)];
  kids.push(el("p", { class: "muted small", text: "Wall decoration. Purely cosmetic for now." }));
  kids.push(el("div", { class: "panel-actions" }, [
    el("button", { class: "btn", onclick: () => { const r = trySellWall(openKey); flash(!r.ok ? (r.why || "Can't take it down.") : r.toOther ? "Taken down — " + fmt(r.refund) + " returned to its buyer." : "Taken down for " + fmt(r.refund) + "."); if (r.ok) closePanel(); } }, ["Take down"]),
  ]));
  panel.replaceChildren(...kids);
}

// ---- Locker: account + equipment + bag + shop -----------------------------

function toggleLocker() { if (openView === "locker") return closePanel(); openView = "locker"; setSelected(null); renderLocker(); showPanel(); }

function itemBuffText(def) {
  if (def.weapon) return "🔪 instant kill · " + def.uses + " use" + (def.uses > 1 ? "s" : "");
  if (def.leash) return "🪢 leash a tired rat · x1.2 soul · +1 armor";
  if (def.shield) return "🛡️ blocks 1 hit";
  if (def.value) return "💰 +" + fmt(Math.round(def.value * tierPower(def.tier) * 100) / 100) + "/s";
  if (def.mult) return "+" + Math.round(def.mult * 100) + "%";
  if (def.speedMult) return "+" + Math.round(def.speedMult * 100) + "% spd";
  if (def.buildBonus) return "+" + def.buildBonus + " build";
  if (def.researchBonus) return "+" + def.researchBonus + " rsch";
  if (def.soulBonus) return "+" + Math.round(def.soulBonus * 100) + "% soul";
  if (def.grid) return def.grid.w + "×" + def.grid.h + " bag";
  return "";
}

function renderLocker() {
  const me = state.me, spec = SPECIALTIES[me.specialty] || SPECIALTIES[specRole(me)] || SPECIALTIES.gold;
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

  // base look — paper-white skin, pick mustache + shirt colors
  kids.push(el("div", { class: "ward-label", text: "Look · paper-white skin" }));
  kids.push(el("div", { class: "pick-rows" }, LOOK_PICKERS.map(({ slot, label }) => el("label", { class: "pick-row" }, [
    el("span", { class: "ward-sub", text: label }),
    el("input", { type: "color", class: "color-pick", value: lookColor(me.look, slot), oninput: (e) => setLook(slot, e.target.value) }),
  ]))));

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
  const drawPreview = () => {
    const c = preview.getContext("2d"); c.clearRect(0, 0, 160, 190);
    const o = { look: sel.look, scale: 3.2, walking: false, t: performance.now() / 1000 };
    if (!drawJoeySprite(c, 80, 150, o)) drawJoey(c, 80, 150, { ...o, worn: {} });
  };
  const previewTimer = setInterval(drawPreview, 60);

  // step 1 — account gate
  const acctRow = el("div", { class: "creator-acct" });
  const renderAcct = () => {
    acctRow.replaceChildren();
    if (!auth.enabled) { acctRow.appendChild(el("span", { class: "muted small", text: "Local build — no account needed here." })); return; }
    if (state.account) acctRow.appendChild(el("span", { class: "small", text: "☁️ Signed in as " + state.account.username + " — you're good to go." }));
    else {
      acctRow.appendChild(el("span", { class: "small", text: "An account is required to build a Joey." }));
      acctRow.appendChild(el("button", { class: "btn small primary", onclick: () => openLogin(() => {
        if (state.me.created) { clearInterval(previewTimer); back.remove(); flash("Welcome back, " + state.me.name + "!"); }
        else { renderAcct(); updateStart(); }
      }, true) }, ["Log in / Sign up"]));
    }
  };

  const specRow = el("div", { class: "spec-row" }, Object.values(SPECIALTIES).map((sp) => el("button", { class: "spec-card", "data-id": sp.id, onclick: () => { sel.specialty = sp.id; markSpec(); } }, [el("div", { class: "spec-glyph", text: sp.glyph }), el("div", { class: "spec-name", text: sp.name }), el("div", { class: "spec-blurb muted small", text: sp.blurb }), el("div", { class: "spec-start small", text: "Start: 🧠 " + sp.start.brain + "  🔧 " + sp.start.build })])));
  const markSpec = () => { specRow.querySelectorAll(".spec-card").forEach((n) => n.classList.toggle("on", n.getAttribute("data-id") === sel.specialty)); updateStart(); };
  const lookRows = el("div", { class: "pick-rows" }, LOOK_PICKERS.map(({ slot, label }) => el("label", { class: "pick-row" }, [
    el("span", { class: "ward-sub", text: label }),
    el("input", { type: "color", class: "color-pick", value: lookColor(sel.look, slot), oninput: (e) => { sel.look[slot] = e.target.value; drawPreview(); } }),
  ])));

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
      el("div", { class: "creator-left" }, [preview, el("div", { class: "prev-cap muted small", text: "paper-white skin, proud 'stache" })]),
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
