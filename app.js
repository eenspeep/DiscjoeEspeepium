/* ============================================================
   Skill Builder - runtime

   Content (names, portraits, descriptions) is fixed and comes
   from data.js. The running app is deliberately limited: the
   only things a player can change are

     - an attribute's value  (the number of pip slots for every
       skill in its row)
     - a skill's assigned points (fills that skill's slots,
       never adds beyond the attribute)

   Those assignments - and nothing else - are saved to
   localStorage. Editing content is a dev-side job in data.js.
   ============================================================ */

(() => {
  "use strict";

  const STORAGE_KEY = "skillbuilder.build.v2";

  const DATA = window.SKILL_DATA;
  if (!DATA || !Array.isArray(DATA.attributes)) {
    document.getElementById("board").textContent = "data.js failed to load.";
    return;
  }

  // character-creation limits (see data.js -> limits)
  const LIMITS = Object.assign(
    { attrMin: 1, attrMax: 6, attrBudget: 12, skillPointBudget: 20 },
    DATA.limits || {}
  );
  const ATTR_VALUE_MIN = LIMITS.attrMin;
  const ATTR_VALUE_MAX = LIMITS.attrMax;
  const BONUS_MIN = 0;
  const BONUS_MAX = LIMITS.attrMax; // a single skill can't be filled past the attribute cap

  const $ = (sel) => document.querySelector(sel);
  const board = $("#board");
  const tooltip = $("#tooltip");
  const importFile = $("#importFile");

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const skillKey = (slot, i) => `${slot}-${i}`;

  // attribute accent colours, mirroring styles.css (used for the image export)
  const PALETTE = {
    intellect: { accent: "#4c9fd6", deep: "#23506e" },
    psyche:    { accent: "#a970c4", deep: "#533264" },
    physique:  { accent: "#d1483f", deep: "#6e211c" },
    motorics:  { accent: "#e0b53c", deep: "#8a6a16" },
  };

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
  // filled pips can never exceed the attribute's slot count
  const filledPips = (slot, i) => Math.min(skillPoints(slot, i), attrValue(slot));

  // budgets: how many points are spent across the whole sheet
  const attrPointsUsed = () =>
    DATA.attributes.reduce((sum, a) => sum + attrValue(a.slot), 0);
  const skillPointsUsed = () =>
    DATA.attributes.reduce((sum, a) =>
      sum + a.skills.reduce((t, _, i) => t + filledPips(a.slot, i), 0), 0);
  const attrPointsLeft = () => LIMITS.attrBudget - attrPointsUsed();
  const skillPointsLeft = () => LIMITS.skillPointBudget - skillPointsUsed();

  /* ---------- rendering ---------- */
  function render() {
    renderBudgets();
    board.innerHTML = "";
    for (const attr of DATA.attributes) board.appendChild(rowEl(attr));
  }

  function renderBudgets() {
    const el = $("#budgets");
    el.innerHTML = "";
    el.appendChild(meterEl("Attribute points", attrPointsUsed(), LIMITS.attrBudget));
    el.appendChild(meterEl("Skill points", skillPointsUsed(), LIMITS.skillPointBudget));
  }

  function meterEl(label, used, total) {
    const full = used >= total;
    const wrap = document.createElement("div");
    wrap.className = "meter" + (full ? " full" : "");

    const name = document.createElement("span");
    name.className = "meter-label";
    name.textContent = label;

    const bar = document.createElement("div");
    bar.className = "meter-bar";
    const fill = document.createElement("div");
    fill.className = "meter-fill";
    fill.style.width = (total ? Math.min(100, (used / total) * 100) : 0) + "%";
    bar.appendChild(fill);

    const num = document.createElement("span");
    num.className = "meter-num";
    num.textContent = `${used} / ${total} spent`;

    wrap.append(name, bar, num);
    return wrap;
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
    plus.disabled = attrValue(attr.slot) >= ATTR_VALUE_MAX || attrPointsLeft() <= 0;
    stepper.append(minus, val, plus);

    const caption = document.createElement("span");
    caption.className = "caption";
    caption.textContent = "attribute → pip slots per skill";

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
    if (dir > 0 && attrPointsLeft() <= 0) return; // out of attribute points
    const slots = clamp(attrValue(slot) + dir, ATTR_VALUE_MIN, ATTR_VALUE_MAX);
    build.values[slot] = slots;
    // fewer slots means any skill filled past the new count is trimmed to fit
    const attr = DATA.attributes.find((a) => a.slot === slot);
    attr.skills.forEach((_, i) => {
      const k = skillKey(slot, i);
      if (build.points[k] === undefined) return;
      const capped = Math.min(build.points[k], slots);
      if (capped <= 0) delete build.points[k];
      else build.points[k] = capped;
    });
    save();
    render();
  }

  function bumpSkill(slot, i, dir) {
    if (dir > 0 && skillPointsLeft() <= 0) return; // out of skill points
    const k = skillKey(slot, i);
    // points fill existing slots, so they cap at the attribute value
    const next = clamp(filledPips(slot, i) + dir, BONUS_MIN, attrValue(slot));
    if (next === 0) delete build.points[k];
    else build.points[k] = next;
    save();
    render();
  }

  function cardEl(attr, skill, i) {
    const slots = attrValue(attr.slot);
    const filled = filledPips(attr.slot, i);

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

    meta.append(name, pipsEl(slots, filled));

    const assign = document.createElement("div");
    assign.className = "assign";
    const minus = stepEl("−", () => bumpSkill(attr.slot, i, -1));
    const label = document.createElement("span");
    label.className = "assign-label";
    label.textContent = `${filled}/${slots}`;
    const plus = stepEl("+", () => bumpSkill(attr.slot, i, +1));
    minus.disabled = filled <= BONUS_MIN;
    plus.disabled = filled >= slots || skillPointsLeft() <= 0;
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

  function pipsEl(slots, filled) {
    const wrap = document.createElement("div");
    wrap.className = "pips";
    wrap.title = `${filled} of ${slots} pips filled`;
    for (let i = 0; i < slots; i++) {
      const p = document.createElement("span");
      p.className = i < filled ? "pip" : "pip empty";
      wrap.appendChild(p);
    }
    const count = document.createElement("span");
    count.className = "pip-count";
    count.textContent = `${filled}/${slots}`;
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

  /* Render the whole board to a PNG and download it. */
  async function exportImage() {
    const PAD = 44, GAP = 28, CARD_W = 150, CARD_H = 200;
    const HEAD_H = 46, NAME_H = 40, PIP_H = 24, ROW_GAP = 30, TITLE_H = 64;
    const cols = 6;
    const width = PAD * 2 + cols * CARD_W + (cols - 1) * GAP;
    const rowH = HEAD_H + CARD_H + NAME_H + PIP_H;
    const rows = DATA.attributes.length;
    const height = PAD * 2 + TITLE_H + rows * rowH + (rows - 1) * ROW_GAP;

    const cv = document.createElement("canvas");
    cv.width = width;
    cv.height = height;
    const ctx = cv.getContext("2d");

    ctx.fillStyle = "#16191c";
    ctx.fillRect(0, 0, width, height);

    // give the display font a moment to load, but never block on it:
    // if the font is offline or blocked, fall back to a generic sans
    const withTimeout = (promise, ms) =>
      Promise.race([promise, new Promise((r) => setTimeout(r, ms))]);
    try {
      await withTimeout(Promise.all([
        document.fonts.load("600 40px Oswald"),
        document.fonts.load("500 16px Oswald"),
      ]), 1200);
    } catch (e) { /* ignore */ }

    const imgs = {};
    await Promise.all(
      DATA.attributes.flatMap((a) => a.skills.map((s) =>
        new Promise((res) => {
          if (!s.portrait) return res();
          const im = new Image();
          im.onload = () => { imgs[s.portrait] = im; res(); };
          im.onerror = () => res();
          im.src = s.portrait;
        })
      ))
    );

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#c8a45c";
    ctx.font = "600 40px Oswald, sans-serif";
    ctx.fillText("SKILL BUILDER", PAD, PAD + 40);
    ctx.textAlign = "right";
    ctx.fillStyle = "#a49b86";
    ctx.font = "500 18px Oswald, sans-serif";
    ctx.fillText(
      `Attributes ${attrPointsUsed()}/${LIMITS.attrBudget}   ·   ` +
      `Skills ${skillPointsUsed()}/${LIMITS.skillPointBudget}`,
      width - PAD, PAD + 36
    );

    let y = PAD + TITLE_H;
    for (const attr of DATA.attributes) {
      const pal = PALETTE[attr.slot] || { accent: "#c8a45c", deep: "#333" };
      const slots = attrValue(attr.slot);

      ctx.textAlign = "left";
      ctx.fillStyle = pal.accent;
      ctx.font = "600 26px Oswald, sans-serif";
      ctx.fillText(attr.name.toUpperCase(), PAD, y + 26);
      ctx.textAlign = "right";
      ctx.fillStyle = "#a49b86";
      ctx.font = "500 18px Oswald, sans-serif";
      ctx.fillText(`${slots} pip slots`, width - PAD, y + 25);

      const cy = y + HEAD_H;
      attr.skills.forEach((s, i) => {
        const cx = PAD + i * (CARD_W + GAP);
        if (imgs[s.portrait]) {
          ctx.drawImage(imgs[s.portrait], cx, cy, CARD_W, CARD_H);
        } else {
          ctx.fillStyle = pal.deep;
          ctx.fillRect(cx, cy, CARD_W, CARD_H);
        }
        ctx.lineWidth = 5;
        ctx.strokeStyle = "#000";
        ctx.strokeRect(cx + 2.5, cy + 2.5, CARD_W - 5, CARD_H - 5);

        ctx.fillStyle = pal.accent;
        ctx.font = "500 16px Oswald, sans-serif";
        ctx.textAlign = "center";
        wrapText(ctx, s.name.toUpperCase(), cx + CARD_W / 2, cy + CARD_H + 20, CARD_W, 18);

        drawPips(ctx, cx, cy + CARD_H + NAME_H + 6, CARD_W,
          slots, filledPips(attr.slot, i), pal.accent);
      });
      y += rowH + ROW_GAP;
    }

    try {
      cv.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "skill-board.png";
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (err) {
      // Opening index.html straight off disk (file://) taints the canvas with
      // the portraits and blocks export. Serving over http fixes it.
      alert(
        "Image export needs the page served over http, not opened directly from disk.\n\n" +
        "Run a local server (for example: python3 -m http.server) or use the deployed " +
        "GitHub Pages URL, then try again."
      );
      console.warn(err);
    }
  }

  function wrapText(ctx, text, cx, y, maxW, lh) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    lines.slice(0, 2).forEach((ln, idx) => ctx.fillText(ln, cx, y + idx * lh));
  }

  function drawPips(ctx, x, y, w, slots, filled, accent) {
    const r = 4, gap = 6;
    const total = slots * (r * 2) + (slots - 1) * gap;
    let sx = x + (w - total) / 2 + r;
    for (let i = 0; i < slots; i++) {
      ctx.beginPath();
      ctx.arc(sx, y, r, 0, Math.PI * 2);
      if (i < filled) { ctx.fillStyle = accent; ctx.fill(); }
      else { ctx.lineWidth = 1.5; ctx.strokeStyle = accent; ctx.stroke(); }
      sx += r * 2 + gap;
    }
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
  $("#exportImgBtn").addEventListener("click", exportImage);
  $("#importBtn").addEventListener("click", () => importFile.click());
  $("#resetBtn").addEventListener("click", resetBuild);
  importFile.addEventListener("change", (e) => {
    if (e.target.files[0]) importBuild(e.target.files[0]);
    importFile.value = "";
  });

  /* ---------- first paint ---------- */
  render();
})();
