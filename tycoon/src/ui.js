// DOM overlay: Build-Your-Joey gate, HUD, build bar, furniture inspector, the
// Locker (stats + gear shop + base look), and the Team Pot.

import { el, fmt, clamp } from "./util.js";
import { TUNING } from "./config.js";
import {
  state, onChange, income$, createJoey,
  tryUpgradeFurniture, trySellFurniture, tryExpandFloor,
  tryBuyGear, equipGear, setLook, investPot, votePot,
} from "./state.js";
import {
  FURNITURE, FURNITURE_ORDER, furnitureBuyCost, upgradeCost, furnitureValue,
  expandCost, canExpand, statScales, SPECIALTIES, ADJECTIVES, adjSummary,
  GEAR, GEAR_SLOTS, gearOption, STATS, PROPOSALS, proposalById, voteWeight,
} from "./economy.js";
import { BASE_LOOK, lookOption, drawJoey, defaultLook } from "./appearance.js";
import { setBuild, getBuild, setSelected } from "./world.js";

let hud, buildbar, panel, toast;
let openKey = null, openView = null;
let investDraft = "";

export function initUI() {
  hud = document.getElementById("hud");
  buildbar = document.getElementById("buildbar");
  panel = document.getElementById("panel");
  toast = document.getElementById("toast");

  onChange(refresh);
  refresh();
  if (!state.me.created) openCreator();

  setInterval(renderHud, 500);          // live credits/income
  setInterval(() => { if (openView === "pot") renderPot(); }, 1000); // live countdown/interest
}

export function flash(msg) {
  const t = el("div", { class: "toast-item", text: msg });
  toast.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2400);
}

function refresh() {
  renderHud();
  renderBuildbar();
  if (openView === "furn") renderFurniture();
  else if (openView === "locker") renderLocker();
  else if (openView === "pot") renderPot();
}

// ---- HUD ------------------------------------------------------------------

function renderHud() {
  if (!hud) return;
  const me = state.me;
  const mode = state.net?.mode === "cloud" ? "CLOUD" : "LOCAL";
  const host = state.isHost ? " ★" : "";
  const pot = state.shared.pot;
  const voting = pot && pot.phase === "voting";

  hud.replaceChildren(
    el("div", { class: "hud-left" }, [
      el("div", { class: "coin" }, [
        el("span", { class: "coin-amt", text: fmt(me.credits || 0) }),
        el("span", { class: "coin-rate", text: "+" + fmt(income$()) + "/s" }),
      ]),
      me.created ? el("div", { class: "stat-chips" }, [
        el("span", { class: "schip brain", title: "BRAIN", text: STATS.brain.glyph + " " + me.stats.brain }),
        el("span", { class: "schip build", title: "BUILD", text: STATS.build.glyph + " " + me.stats.build }),
      ]) : null,
    ]),
    el("div", { class: "hud-right" }, [
      el("span", { class: "badge", text: mode + host, title: state.isHost ? "You host the shared pot's growth" : "A peer hosts the pot" }),
      el("span", { class: "badge muted", text: "👥 " + (state.peers.length + 1) }),
      el("button", { class: "btn", onclick: toggleLocker }, ["Locker"]),
      el("button", { class: "btn" + (voting ? " alert" : ""), onclick: togglePot }, [voting ? "Vote!" : "Team Pot"]),
      el("button", { class: "btn ghost", onclick: () => flash("WASD / click to walk · stand by furniture to use it · Locker for gear · Team Pot to invest"), title: "Help" }, ["?"]),
    ])
  );
}

// ---- build bar ------------------------------------------------------------

const TAG_CLASS = { brain: "t-brain", build: "t-build", neutral: "t-neutral" };

function renderBuildbar() {
  if (!buildbar || !state.me.created) { if (buildbar) buildbar.replaceChildren(); return; }
  const s = state.shared, active = getBuild();

  const cursor = el("button", { class: "build-btn cursor" + (active ? "" : " active"), title: "Walk mode", onclick: () => selectBuild(null) },
    [el("span", { class: "b-glyph", text: "👆" }), el("span", { class: "b-name", text: "Walk" })]);

  const btns = FURNITURE_ORDER.map((type) => {
    const def = FURNITURE[type], cost = furnitureBuyCost(s, type), afford = state.me.credits >= cost;
    return el("button", {
      class: "build-btn " + (TAG_CLASS[def.tag] || "") + (active === type ? " active" : "") + (afford ? "" : " poor"),
      title: def.name + " — " + def.tag.toUpperCase() + ", +" + def.value + "/s while adjacent",
      onclick: () => selectBuild(type),
    }, [
      el("span", { class: "b-glyph", text: def.glyph }),
      el("span", { class: "b-name", text: def.name }),
      el("span", { class: "b-cost", text: fmt(cost) }),
    ]);
  });

  const expand = canExpand(s)
    ? el("button", { class: "build-btn expand" + (state.me.credits >= expandCost(s) ? "" : " poor"), title: "Grow the floor", onclick: () => { const r = tryExpandFloor(); flash(r.ok ? "The office grew." : (r.why || "Can't expand.")); } },
        [el("span", { class: "b-glyph", text: "➕" }), el("span", { class: "b-name", text: "Expand" }), el("span", { class: "b-cost", text: fmt(expandCost(s)) })])
    : el("button", { class: "build-btn expand disabled" }, [el("span", { class: "b-glyph", text: "🏢" }), el("span", { class: "b-name", text: "Max" })]);

  buildbar.replaceChildren(cursor, ...btns, expand);
}

function selectBuild(type) {
  setBuild(getBuild() === type ? null : type);
  if (getBuild()) flash("Click a tile to place your " + FURNITURE[getBuild()].name + ".");
  renderBuildbar();
}

// ---- furniture inspector --------------------------------------------------

export function openFurniture(key, f) {
  openKey = key; openView = "furn";
  setSelected(key); setBuild(null); renderBuildbar();
  renderFurniture(); showPanel();
}

function renderFurniture() {
  const f = state.shared.furniture[openKey];
  if (!f) return closePanel();
  const def = FURNITURE[f.type];
  const sc = statScales(state.me);
  const raw = furnitureValue(f);
  const mine = def.tag === "brain" ? raw * sc.brain : def.tag === "build" ? raw * sc.build : raw;
  const up = upgradeCost(f);

  panel.replaceChildren(
    panelHeader(def.glyph + " " + def.name),
    el("p", { class: "muted small", text: def.tag.toUpperCase() + " furniture. Buffs anyone standing next to it." }),
    stat("Level", String(f.level)),
    stat("Base value", "+" + fmt(raw) + "/s"),
    stat("For you (stats)", "+" + fmt(Math.round(mine * 100) / 100) + "/s"),
    el("div", { class: "panel-actions" }, [
      el("button", { class: "btn primary" + (state.me.credits >= up ? "" : " poor"), onclick: () => { const r = tryUpgradeFurniture(openKey); flash(r.ok ? def.name + " upgraded." : (r.why || "Can't upgrade.")); } }, ["Upgrade — " + fmt(up)]),
      el("button", { class: "btn", onclick: () => { const r = trySellFurniture(openKey); flash(r.ok ? "Sold for " + fmt(r.refund) + "." : "Can't sell."); closePanel(); } }, ["Sell"]),
    ])
  );
}

// ---- locker (stats + gear + look) -----------------------------------------

function toggleLocker() { if (openView === "locker") return closePanel(); openView = "locker"; setSelected(null); renderLocker(); showPanel(); }

function renderLocker() {
  const me = state.me;
  const spec = SPECIALTIES[me.specialty];
  const kids = [panelHeader("🧳 " + me.name)];

  kids.push(el("div", { class: "spec-line" }, [
    el("span", { class: "badge big", text: (spec?.glyph || "") + " " + (spec?.name || "") }),
    el("span", { class: "schip brain", text: STATS.brain.glyph + " " + me.stats.brain }),
    el("span", { class: "schip build", text: STATS.build.glyph + " " + me.stats.build }),
  ]));
  kids.push(el("p", { class: "muted small", text: "Gear buffs you passively, wherever you stand. Buy from your own wallet, then equip." }));

  for (const slot of GEAR_SLOTS) {
    const cfg = GEAR[slot];
    kids.push(el("div", { class: "ward-slot" }, [
      el("div", { class: "ward-label", text: cfg.label }),
      el("div", { class: "ward-grid" }, cfg.options.map((o) => gearChip(slot, o))),
    ]));
  }

  kids.push(el("div", { class: "ward-label", text: "Look" }));
  for (const [slot, cfg] of Object.entries(BASE_LOOK)) {
    kids.push(el("div", { class: "ward-slot" }, [
      el("div", { class: "ward-sub", text: cfg.label }),
      el("div", { class: "look-row" }, cfg.options.map((o) => lookSwatch(slot, o))),
    ]));
  }

  panel.replaceChildren(...kids);
}

function gearChip(slot, o) {
  const owned = state.me.gear.owned[slot].includes(o.id);
  const equipped = state.me.gear.equipped[slot] === o.id;
  const price = o.price || 0;
  const buffText = o.value ? "+" + o.value + "/s" + (o.tag && o.tag !== "neutral" ? " " + o.tag[0].toUpperCase() : "") : o.mult ? "+" + Math.round(o.mult * 100) + "%" : "";
  const meta = equipped ? el("span", { class: "chip-tag on", text: "Worn" }) : owned ? el("span", { class: "chip-tag", text: "Wear" }) : el("span", { class: "chip-tag buy", text: fmt(price) });
  return el("button", {
    class: "chip" + (equipped ? " equipped" : "") + (owned ? "" : " locked"),
    title: o.name + (buffText ? " (" + buffText + ")" : ""),
    onclick: () => {
      if (equipped) return;
      if (owned) { equipGear(slot, o.id); flash("Equipped " + o.name + "."); return; }
      const r = tryBuyGear(slot, o.id);
      if (!r.ok) return flash(r.why || "Can't buy.");
      equipGear(slot, o.id); flash("Bought & equipped " + o.name + ".");
    },
  }, [
    el("span", { class: "chip-name", text: o.name }),
    buffText ? el("span", { class: "chip-buff", text: buffText }) : null,
    meta,
  ]);
}

function lookSwatch(slot, o) {
  const on = state.me.look[slot] === o.id;
  return el("button", { class: "swatch" + (on ? " on" : ""), title: o.name, style: `background:${o.color}`, onclick: () => { setLook(slot, o.id); } });
}

// ---- team pot -------------------------------------------------------------

function togglePot() { if (openView === "pot") return closePanel(); openView = "pot"; setSelected(null); renderPot(); showPanel(); }

function renderPot() {
  const pot = state.shared.pot;
  const me = state.me;
  const myContrib = pot.contributions[me.id] || 0;
  const share = voteWeight(pot, me.id);
  const weekEnd = pot.weekStart + TUNING.weekMs;
  const growing = pot.phase !== "voting";
  const kids = [panelHeader("🏦 Team Pot")];

  kids.push(el("div", { class: "pot-balance" }, [
    el("span", { class: "pot-amt", text: fmt(pot.balance) }),
    el("span", { class: "pot-sub", text: "shared, compounding at " + Math.round(TUNING.potInterestPerHour * 100) + "%/hr" }),
  ]));

  if (growing) {
    kids.push(el("div", { class: "pot-phase grow", text: "Growing · week ends in " + countdown(weekEnd - Date.now()) }));
  } else {
    kids.push(el("div", { class: "pot-phase vote", text: "🗳️ Voting open — pot is locked until it resolves" }));
  }

  kids.push(stat("Your stake", fmt(myContrib)));
  kids.push(stat("Your vote share", Math.round(share * 100) + "%"));

  if (pot.roomBuff && pot.roomBuff.incomeMult) {
    kids.push(el("p", { class: "muted small", text: "Active perk: +" + Math.round(pot.roomBuff.incomeMult * 100) + "% room income (last week's winner)." }));
  }

  if (growing) {
    const input = el("input", { class: "name-input", inputmode: "numeric", placeholder: "amount", value: investDraft, oninput: (e) => { investDraft = e.target.value.replace(/[^0-9]/g, ""); } });
    const doInvest = (amt) => { const r = investPot(amt); if (!r.ok) return flash(r.why || "Can't invest."); investDraft = ""; flash("Invested " + fmt(amt) + " into the pot."); };
    kids.push(el("div", { class: "invest-row" }, [input,
      el("button", { class: "btn primary", onclick: () => doInvest(parseInt(investDraft || "0", 10)) }, ["Invest"]),
    ]));
    kids.push(el("div", { class: "quick-row" }, [
      quick("25", () => doInvest(25)), quick("100", () => doInvest(100)),
      quick("Half", () => doInvest(Math.floor(me.credits / 2))), quick("Max", () => doInvest(Math.floor(me.credits))),
    ]));
    kids.push(el("p", { class: "muted small", text: "Invest more to grow the pot and earn a bigger say when the week ends." }));
  } else {
    kids.push(el("div", { class: "ward-label", text: "Vote how to spend it" }));
    const votes = pot.votes || {};
    const tally = {};
    for (const [pid, prop] of Object.entries(votes)) tally[prop] = (tally[prop] || 0) + voteWeight(pot, pid);
    for (const p of PROPOSALS) {
      const mine = votes[me.id] === p.id;
      const w = Math.round((tally[p.id] || 0) * 100);
      kids.push(el("button", { class: "prop" + (mine ? " mine" : ""), onclick: () => { const r = votePot(p.id); flash(r.ok ? "Voted for " + p.name + "." : (r.why || "Can't vote.")); } }, [
        el("span", { class: "prop-glyph", text: p.glyph }),
        el("span", { class: "prop-body" }, [el("span", { class: "prop-name", text: p.name }), el("span", { class: "prop-desc muted small", text: p.desc })]),
        el("span", { class: "prop-tally", text: w + "%" }),
      ]));
    }
  }

  if (pot.history && pot.history.length) {
    const last = pot.history[pot.history.length - 1];
    const prop = proposalById(last.proposal);
    kids.push(el("p", { class: "muted small", text: "Last week the team bought: " + (prop ? prop.name : last.proposal) + "." }));
  }

  panel.replaceChildren(...kids);
}

function quick(label, fn) { return el("button", { class: "qbtn", onclick: fn }, [label]); }

// ---- panel plumbing -------------------------------------------------------

function panelHeader(title) {
  return el("div", { class: "panel-head" }, [el("h2", { text: title }), el("button", { class: "x", onclick: closePanel, title: "Close" }, ["✕"])]);
}
function stat(l, v) { return el("div", { class: "stat" }, [el("span", { class: "stat-l", text: l }), el("span", { class: "stat-v", text: v })]); }
function showPanel() { panel.classList.add("open"); }
function closePanel() { panel.classList.remove("open"); openView = null; openKey = null; setSelected(null); }

function countdown(ms) {
  if (ms <= 0) return "any moment";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}

export function showOffline(info) {
  if (!info || info.gained < 1) return;
  flash("While you were away (~" + Math.round(info.seconds / 60) + " min): +" + fmt(info.gained) + " credits");
}

// ---- Build Your Joey ------------------------------------------------------

function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }

function openCreator() {
  const sel = { specialty: null, look: defaultLook(), three: shuffle(ADJECTIVES).slice(0, 3), adjIndex: null };

  const preview = el("canvas", { class: "joey-preview", width: "160", height: "190" });
  const drawPreview = () => {
    const c = preview.getContext("2d");
    c.clearRect(0, 0, 160, 190);
    drawJoey(c, 80, 150, { look: sel.look, equipped: {}, scale: 3.2, t: performance.now() / 1000 });
  };
  const previewTimer = setInterval(drawPreview, 60);

  const specRow = el("div", { class: "spec-row" }, Object.values(SPECIALTIES).map((sp) =>
    el("button", { class: "spec-card", "data-id": sp.id, onclick: () => { sel.specialty = sp.id; markSpec(); } }, [
      el("div", { class: "spec-glyph", text: sp.glyph }),
      el("div", { class: "spec-name", text: sp.name }),
      el("div", { class: "spec-blurb muted small", text: sp.blurb }),
      el("div", { class: "spec-start small", text: "Start: 🧠 " + sp.start.brain + "  🔧 " + sp.start.build }),
    ])));
  const markSpec = () => { specRow.querySelectorAll(".spec-card").forEach((n) => n.classList.toggle("on", n.getAttribute("data-id") === sel.specialty)); updateStart(); };

  const lookRows = el("div", {}, Object.entries(BASE_LOOK).map(([slot, cfg]) =>
    el("div", { class: "ward-slot" }, [
      el("div", { class: "ward-sub", text: cfg.label }),
      el("div", { class: "look-row" }, cfg.options.map((o) =>
        el("button", { class: "swatch" + (sel.look[slot] === o.id ? " on" : ""), style: `background:${o.color}`, title: o.name, "data-slot": slot, "data-id": o.id, onclick: () => { sel.look[slot] = o.id; markLook(slot); drawPreview(); } }))),
    ])));
  const markLook = (slot) => lookRows.querySelectorAll(`.swatch[data-slot="${slot}"]`).forEach((n) => n.classList.toggle("on", n.getAttribute("data-id") === sel.look[slot]));

  const adjWrap = el("div", { class: "adj-wrap" });
  const renderAdj = () => {
    adjWrap.replaceChildren(...sel.three.map((a, i) =>
      el("button", { class: "adj-card" + (sel.adjIndex === i ? " on" : ""), onclick: () => { sel.adjIndex = i; renderAdj(); updateStart(); } }, [
        el("div", { class: "adj-word", text: "JOEY " + a.word }),
        el("div", { class: "adj-buff small", text: adjSummary(a) }),
      ])));
  };
  const reroll = el("button", { class: "btn ghost small", onclick: () => { sel.three = shuffle(ADJECTIVES).slice(0, 3); sel.adjIndex = null; renderAdj(); updateStart(); } }, ["🎲 reroll"]);

  const startInfo = el("div", { class: "start-info muted small" });
  const updateStart = () => {
    const ready = sel.specialty && sel.adjIndex != null;
    startBtn.disabled = !ready;
    startBtn.classList.toggle("poor", !ready);
    if (ready) { const a = sel.three[sel.adjIndex]; startInfo.textContent = "You'll be JOEY " + a.word + " — " + SPECIALTIES[sel.specialty].name + ", " + adjSummary(a) + "."; }
    else startInfo.textContent = "Pick a specialty and a name to start.";
  };

  const startBtn = el("button", { class: "btn primary big poor", disabled: "true", onclick: () => {
    if (!sel.specialty || sel.adjIndex == null) return;
    clearInterval(previewTimer);
    createJoey({ specialty: sel.specialty, adjectiveWord: sel.three[sel.adjIndex].word, look: sel.look });
    back.remove();
    flash("Welcome, " + state.me.name + "! Stand next to furniture to earn more.");
  } }, ["Start as this Joey"]);

  const back = el("div", { class: "modal-back" }, [
    el("div", { class: "creator" }, [
      el("h2", { text: "BUILD YOUR JOEY" }),
      el("div", { class: "creator-body" }, [
        el("div", { class: "creator-left" }, [preview, el("div", { class: "prev-cap muted small", text: "big nose, proud 'stache" })]),
        el("div", { class: "creator-right" }, [
          el("div", { class: "sect-label", text: "1 · Specialty" }), specRow,
          el("div", { class: "sect-label", text: "2 · Your name & buff" }),
          el("div", { class: "adj-head" }, [el("span", { class: "muted small", text: "Pick one. It's permanent." }), reroll]),
          adjWrap,
          el("div", { class: "sect-label", text: "3 · Look" }), lookRows,
        ]),
      ]),
      startInfo, startBtn,
    ]),
  ]);
  document.body.appendChild(back);
  renderAdj(); updateStart(); drawPreview();
}
