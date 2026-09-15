// The DOM overlay: heads-up display, the build bar, the module inspector, and
// the wardrobe (which doubles as the cosmetics shop). Re-renders off state
// changes; the canvas world is drawn separately in world.js.

import { el, fmt } from "./util.js";
import {
  state, onChange, income$, setName,
  tryUpgrade, trySellModule, tryExpandFloor, tryBuyCosmetic, equipCosmetic,
  MODULES, buyCost, upgradeCost, expandCost, canExpand, CATALOG,
} from "./state.js";
import { MODULE_ORDER } from "./economy.js";
import { optionOf } from "./appearance.js";
import { setBuild, getBuild, setSelected } from "./world.js";

let hud, buildbar, panel, toast;
let openKey = null;   // module inspector target
let openView = null;  // "wardrobe" | "module" | null

export function initUI() {
  hud = document.getElementById("hud");
  buildbar = document.getElementById("buildbar");
  panel = document.getElementById("panel");
  toast = document.getElementById("toast");

  onChange(refresh);
  refresh();
  maybeWelcome();
}

export function flash(msg) {
  const t = el("div", { class: "toast-item", text: msg });
  toast.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2200);
}

// ---- HUD ------------------------------------------------------------------

function refresh() {
  renderHud();
  renderBuildbar();
  if (openView === "module") renderModulePanel();
  else if (openView === "wardrobe") renderWardrobe();
}

function renderHud() {
  const s = state.shared;
  const modeBadge = state.net?.mode === "cloud" ? "CLOUD" : "LOCAL";
  const host = state.isHost ? " ★" : "";
  const peerN = state.peers.length;
  hud.replaceChildren(
    el("div", { class: "hud-left" }, [
      el("div", { class: "coin" }, [
        el("span", { class: "coin-amt", text: fmt(s.credits) }),
        el("span", { class: "coin-rate", text: "+" + fmt(income$()) + "/s" }),
      ]),
    ]),
    el("div", { class: "hud-right" }, [
      el("span", { class: "badge", title: state.isHost ? "You are the host: passive income runs on your client" : "A peer is hosting passive income", text: modeBadge + host }),
      el("span", { class: "badge muted", title: "Coworkers connected", text: "👥 " + (peerN + 1) }),
      el("button", { class: "btn", onclick: () => toggleWardrobe() }, ["Wardrobe"]),
      el("button", { class: "btn ghost", onclick: showHelp, title: "How to play" }, ["?"]),
    ])
  );
}

// ---- build bar ------------------------------------------------------------

function renderBuildbar() {
  const s = state.shared;
  const active = getBuild();
  const btns = MODULE_ORDER.map((type) => {
    const def = MODULES[type];
    const cost = buyCost(s, type);
    const afford = s.credits >= cost;
    return el("button", {
      class: "build-btn" + (active === type ? " active" : "") + (afford ? "" : " poor"),
      title: def.blurb,
      onclick: () => selectBuild(type),
    }, [
      el("span", { class: "b-glyph", text: def.glyph }),
      el("span", { class: "b-name", text: def.name }),
      el("span", { class: "b-cost", text: fmt(cost) }),
    ]);
  });

  const expand = canExpand(s)
    ? el("button", {
        class: "build-btn expand" + (s.credits >= expandCost(s) ? "" : " poor"),
        title: "Grow the office floor outward",
        onclick: () => {
          const r = tryExpandFloor();
          flash(r.ok ? "The office grew." : (r.why || "Can't expand."));
        },
      }, [
        el("span", { class: "b-glyph", text: "➕" }),
        el("span", { class: "b-name", text: "Expand" }),
        el("span", { class: "b-cost", text: fmt(expandCost(s)) }),
      ])
    : el("button", { class: "build-btn expand disabled" }, [
        el("span", { class: "b-glyph", text: "🏢" }),
        el("span", { class: "b-name", text: "Max size" }),
      ]);

  const cursor = el("button", {
    class: "build-btn cursor" + (active ? "" : " active"),
    title: "Stop building / walk mode",
    onclick: () => selectBuild(null),
  }, [el("span", { class: "b-glyph", text: "👆" }), el("span", { class: "b-name", text: "Walk" })]);

  buildbar.replaceChildren(cursor, ...btns, expand);
}

function selectBuild(type) {
  setBuild(getBuild() === type ? null : type);
  if (getBuild()) flash("Click a floor tile to place your " + MODULES[getBuild()].name + ".");
  renderBuildbar();
}

// ---- module inspector -----------------------------------------------------

export function openModule(key, mod) {
  openKey = key; openView = "module";
  setSelected(key);
  setBuild(null);
  renderBuildbar();
  renderModulePanel();
}

function renderModulePanel() {
  const s = state.shared;
  const mod = s.modules[openKey];
  if (!mod) return closePanel();
  const def = MODULES[mod.type];
  const upCost = upgradeCost(mod);

  panel.replaceChildren(
    panelHeader(def.glyph + " " + def.name),
    el("p", { class: "muted small", text: def.blurb }),
    stat("Level", String(mod.level)),
    stat("Earns", "+" + fmt(rateOf(mod)) + "/s"),
    el("div", { class: "panel-actions" }, [
      el("button", {
        class: "btn primary" + (s.credits >= upCost ? "" : " poor"),
        onclick: () => {
          const r = tryUpgrade(openKey);
          flash(r.ok ? def.name + " upgraded." : (r.why || "Can't upgrade."));
        },
      }, ["Upgrade — " + fmt(upCost)]),
      el("button", {
        class: "btn",
        onclick: () => {
          const r = trySellModule(openKey);
          flash(r.ok ? "Sold for " + fmt(r.refund) + "." : "Can't sell.");
          closePanel();
        },
      }, ["Sell"]),
    ])
  );
  showPanel();
}

function rateOf(mod) {
  const def = MODULES[mod.type];
  return Math.round(def.rate * (1 + 0.6 * (mod.level - 1)) * 100) / 100;
}

// ---- wardrobe / shop ------------------------------------------------------

function toggleWardrobe() {
  if (openView === "wardrobe") return closePanel();
  openView = "wardrobe";
  setSelected(null);
  renderWardrobe();
}

function renderWardrobe() {
  const kids = [panelHeader("👕 Wardrobe")];
  kids.push(el("p", { class: "muted small", text: "Skin and hair are free. Everything else is bought from the shared credits pool, then equipped." }));

  // editable name
  kids.push(el("label", { class: "field" }, [
    el("span", { class: "field-label", text: "Display name" }),
    el("input", {
      class: "name-input", value: state.me.name, maxlength: "16",
      onchange: (e) => { setName(e.target.value); flash("Name updated."); },
    }),
  ]));

  for (const [slot, cfg] of Object.entries(CATALOG)) {
    kids.push(el("div", { class: "ward-slot" }, [
      el("div", { class: "ward-label", text: cfg.label }),
      el("div", { class: "ward-grid" }, cfg.options.map((o) => optionChip(slot, cfg, o))),
    ]));
  }
  panel.replaceChildren(...kids);
  showPanel();
}

function optionChip(slot, cfg, o) {
  const owned = state.me.owned[slot].includes(o.id);
  const equipped = state.me.appearance[slot] === o.id;
  const price = o.price || 0;
  const swatch = o.color
    ? el("span", { class: "sw", style: `background:${o.color}` })
    : el("span", { class: "sw", text: o.glyph || (o.id.startsWith("h") && slot === "hair" ? "∅" : "∅") });

  const meta = equipped
    ? el("span", { class: "chip-tag on", text: "Worn" })
    : owned
    ? el("span", { class: "chip-tag", text: "Wear" })
    : el("span", { class: "chip-tag buy", text: fmt(price) });

  return el("button", {
    class: "chip" + (equipped ? " equipped" : "") + (!owned ? " locked" : ""),
    title: o.name,
    onclick: () => {
      if (equipped) return;
      if (owned) { equipCosmetic(slot, o.id); flash("Equipped " + o.name + "."); return; }
      const r = tryBuyCosmetic(slot, o.id);
      if (!r.ok) return flash(r.why || "Can't buy that.");
      equipCosmetic(slot, o.id);
      flash("Bought & equipped " + o.name + ".");
    },
  }, [swatch, el("span", { class: "chip-name", text: o.name }), meta]);
}

// ---- panel plumbing -------------------------------------------------------

function panelHeader(title) {
  return el("div", { class: "panel-head" }, [
    el("h2", { text: title }),
    el("button", { class: "x", onclick: closePanel, title: "Close" }, ["✕"]),
  ]);
}
function stat(label, val) {
  return el("div", { class: "stat" }, [
    el("span", { class: "stat-l", text: label }),
    el("span", { class: "stat-v", text: val }),
  ]);
}
function showPanel() { panel.classList.add("open"); }
function closePanel() {
  panel.classList.remove("open");
  openView = null; openKey = null; setSelected(null);
}

// ---- one-time bits --------------------------------------------------------

function maybeWelcome() {
  if (localStorage.getItem("deskovania:welcomed")) return;
  const modal = el("div", { class: "modal-back" }, [
    el("div", { class: "modal" }, [
      el("h2", { text: "Welcome to the office" }),
      el("p", { class: "muted", text: "A shared, idle workplace tycoon. Build workstations, grow the floor, and dress up your character with the credits everyone earns together. It keeps earning while you're away, so leave it open on your second screen." }),
      el("ul", { class: "help-list" }, [
        el("li", { html: "<b>Walk</b> with WASD / arrow keys, or click a tile." }),
        el("li", { html: "<b>Build</b> from the bar at the bottom, then click a floor tile." }),
        el("li", { html: "<b>Tap a module</b> to upgrade or sell it." }),
        el("li", { html: "<b>Wardrobe</b> spends credits on outfits for your avatar." }),
      ]),
      el("label", { class: "field" }, [
        el("span", { class: "field-label", text: "Pick a name" }),
        el("input", { class: "name-input", id: "welcome-name", value: state.me.name, maxlength: "16" }),
      ]),
      el("button", { class: "btn primary big", onclick: () => {
        const v = document.getElementById("welcome-name").value;
        if (v) setName(v);
        localStorage.setItem("deskovania:welcomed", "1");
        modal.remove();
      } }, ["Start working"]),
    ]),
  ]);
  document.body.appendChild(modal);
}

function showHelp() {
  flash("WASD / click to walk · Build bar below · Tap modules to upgrade · Wardrobe for outfits");
}

export function showOffline(info) {
  if (!info || info.gained < 1) return;
  const mins = Math.round(info.seconds / 60);
  flash("While you were away (~" + mins + " min): +" + fmt(info.gained) + " credits");
}
