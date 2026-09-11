/* ============================================================
   Skill Builder - runtime

   Content (names, portraits, descriptions) is fixed and comes
   from data.js. The running app is deliberately limited: the
   only things a player can change are

     - an attribute's value  (adds pips to every skill in its row)
     - a skill's assigned points

   Those assignments - and nothing else - are saved to
   localStorage. Editing content is a dev-side job in data.js.
   ============================================================ */

(() => {
  "use strict";

  const STORAGE_KEY = "skillbuilder.build.v1";
  const ATTR_VALUE_MIN = 1;
  const ATTR_VALUE_MAX = 8;
  const BONUS_MIN = 0;
  const BONUS_MAX = 8;

  const DATA = window.SKILL_DATA;
  if (!DATA || !Array.isArray(DATA.attributes)) {
    document.getElementById("board").textContent = "data.js failed to load.";
    return;
  }

  const $ = (sel) => document.querySelector(sel);
  const board = $("#board");
  const tooltip = $("#tooltip");
  const importFile = $("#importFile");

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const skillKey = (slot, i) => `${slot}-${i}`;

  /* ---------- the player's build (the only mutable state) ---------- */
  // { values: { intellect: 3, ... }, points: { "intellect-0": 1, ... } }
  let build = load();

  function defaultBuild() {
    const values = {};
    for (const attr of DATA.attributes) values[attr.slot] = attr.value || ATTR_VALUE_MIN;
    return { values, points: {} };
  }

  function load() {
    const base = defaultBuild();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      if (saved && saved.values) {
        for (const slot in base.values) {
          if (typeof saved.values[slot] === "number") {
            base.values[slot] = clamp(saved.values[slot], ATTR_VALUE_MIN, ATTR_VALUE_MAX);
          }
        }
      }
      if (saved && saved.points && typeof saved.points === "object") {
        base.points = {};
        for (const k in saved.points) {
          base.points[k] = clamp(Number(saved.points[k]) || 0, BONUS_MIN, BONUS_MAX);
        }
      }
    } catch (err) {
      console.warn("Could not read saved build:", err);
    }
    return base;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(build));
    } catch (err) {
      console.warn("Could not save build:", err);
    }
  }

  const attrValue = (slot) => build.values[slot] ?? ATTR_VALUE_MIN;
  const skillPoints = (slot, i) => build.points[skillKey(slot, i)] || 0;

  /* ---------- rendering ---------- */
  function render() {
    board.innerHTML = "";
    for (const attr of DATA.attributes) board.appendChild(rowEl(attr));
  }

  function rowEl(attr) {
    const row = document.createElement("section");
    row.className = `attr-row attr-${attr.slot}`;

    const head = document.createElement("header");
    head.className = "attr-head";

    const name = document.createElement("h2");
    name.className = "attr-name";
    name.textContent = attr.name;

    const stepper = document.createElement("div");
    stepper.className = "stepper";
    const minus = stepEl("−", () => bumpAttr(attr.slot, -1));
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = attrValue(attr.slot);
    const plus = stepEl("+", () => bumpAttr(attr.slot, +1));
    minus.disabled = attrValue(attr.slot) <= ATTR_VALUE_MIN;
    plus.disabled = attrValue(attr.slot) >= ATTR_VALUE_MAX;
    stepper.append(minus, val, plus);

    const caption = document.createElement("span");
    caption.className = "caption";
    caption.textContent = "attribute → pips per skill";

    head.append(name, stepper, caption);

    const cards = document.createElement("div");
    cards.className = "row-cards";
    attr.skills.forEach((skill, i) => cards.appendChild(cardEl(attr, skill, i)));

    row.append(head, cards);
    return row;
  }

  function stepEl(label, onClick) {
    const b = document.createElement("button");
    b.className = "step";
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function bumpAttr(slot, dir) {
    build.values[slot] = clamp(attrValue(slot) + dir, ATTR_VALUE_MIN, ATTR_VALUE_MAX);
    save();
    render();
  }

  function bumpSkill(slot, i, dir) {
    const k = skillKey(slot, i);
    build.points[k] = clamp(skillPoints(slot, i) + dir, BONUS_MIN, BONUS_MAX);
    if (build.points[k] === 0) delete build.points[k];
    save();
    render();
  }

  function cardEl(attr, skill, i) {
    const base = attrValue(attr.slot);
    const bonus = skillPoints(attr.slot, i);

    const card = document.createElement("article");
    card.className = "card";
    card.tabIndex = 0;

    const frame = document.createElement("div");
    frame.className = "frame";
    if (skill.portrait) {
      const img = document.createElement("img");
      img.src = skill.portrait;
      img.alt = skill.name;
      img.loading = "lazy";
      // if the file is not there yet, drop the img and keep the tinted frame
      img.addEventListener("error", () => img.remove());
      frame.appendChild(img);
    }

    const meta = document.createElement("div");
    meta.className = "card-meta";

    const name = document.createElement("h3");
    name.className = "card-name";
    name.textContent = skill.name;

    meta.append(name, pipsEl(base, bonus));

    const assign = document.createElement("div");
    assign.className = "assign";
    const minus = stepEl("−", () => bumpSkill(attr.slot, i, -1));
    const label = document.createElement("span");
    label.className = "assign-label";
    label.textContent = bonus ? `+${bonus}` : "points";
    const plus = stepEl("+", () => bumpSkill(attr.slot, i, +1));
    minus.disabled = bonus <= BONUS_MIN;
    plus.disabled = bonus >= BONUS_MAX;
    assign.append(minus, label, plus);

    card.append(frame, meta, assign);

    // hover / focus description
    const show = () => showTooltip(card, skill.desc);
    const hide = () => hideTooltip();
    card.addEventListener("mouseenter", show);
    card.addEventListener("mouseleave", hide);
    card.addEventListener("focus", show);
    card.addEventListener("blur", hide);

    return card;
  }

  function pipsEl(base, bonus) {
    const wrap = document.createElement("div");
    wrap.className = "pips";
    const total = base + bonus;
    wrap.title = bonus ? `${total} pips (${base} + ${bonus})` : `${total} pips`;
    for (let i = 0; i < total; i++) {
      const p = document.createElement("span");
      p.className = i >= base ? "pip bonus" : "pip";
      wrap.appendChild(p);
    }
    const count = document.createElement("span");
    count.className = "pip-count";
    count.textContent = total;
    wrap.appendChild(count);
    return wrap;
  }

  /* ---------- tooltip ---------- */
  function showTooltip(anchor, text) {
    if (!text) return;
    tooltip.textContent = text;
    tooltip.hidden = false;
    const r = anchor.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    let top = r.top - th - 10;              // prefer above
    if (top < 8) top = r.bottom + 10;       // otherwise below
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  function hideTooltip() {
    tooltip.hidden = true;
  }
  window.addEventListener("scroll", hideTooltip, true);

  /* ---------- export / import / reset (build only) ---------- */
  function exportBuild() {
    const blob = new Blob([JSON.stringify(build, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skill-build.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importBuild(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object") throw new Error("Not a build file.");
        build = defaultBuild();
        if (parsed.values) {
          for (const slot in build.values) {
            if (typeof parsed.values[slot] === "number") {
              build.values[slot] = clamp(parsed.values[slot], ATTR_VALUE_MIN, ATTR_VALUE_MAX);
            }
          }
        }
        if (parsed.points && typeof parsed.points === "object") {
          build.points = {};
          for (const k in parsed.points) {
            build.points[k] = clamp(Number(parsed.points[k]) || 0, BONUS_MIN, BONUS_MAX);
          }
        }
        save();
        render();
      } catch (err) {
        alert("Could not import this build: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  function resetBuild() {
    if (!confirm("Reset all attribute values and skill points to defaults?")) return;
    build = defaultBuild();
    save();
    render();
  }

  /* ---------- events ---------- */
  $("#exportBtn").addEventListener("click", exportBuild);
  $("#importBtn").addEventListener("click", () => importFile.click());
  $("#resetBtn").addEventListener("click", resetBuild);
  importFile.addEventListener("change", (e) => {
    if (e.target.files[0]) importBuild(e.target.files[0]);
    importFile.value = "";
  });

  /* ---------- first paint ---------- */
  render();
})();
