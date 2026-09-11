/* ============================================================
   Skill Builder - state, rendering, and the portrait pipeline

   Model mirrors Disco Elysium: four attributes, each with an
   editable name and a value. An attribute's value is the number
   of base pips available to every skill in its row. A skill may
   carry its own extra points on top of that base.
   ============================================================ */

(() => {
  "use strict";

  const STORAGE_KEY = "skillbuilder.state.v2";
  const PORTRAIT_W = 150;
  const PORTRAIT_H = 200;
  const ATTR_VALUE_MIN = 1;
  const ATTR_VALUE_MAX = 8;
  const BONUS_MAX = 8;

  // Fixed attribute slots (colour + default name). Names are editable.
  const SLOTS = [
    { slot: "intellect", name: "Intellect" },
    { slot: "psyche", name: "Psyche" },
    { slot: "physique", name: "Physique" },
    { slot: "motorics", name: "Motorics" },
  ];

  /* ---------- state ---------- */
  let state = load();
  let editingId = null;       // null while creating a new skill
  let editingAttrId = null;   // which attribute a new skill lands in
  let draftPortrait = null;

  /* ---------- element refs ---------- */
  const $ = (sel) => document.querySelector(sel);
  const board = $("#board");

  const editor = $("#editor");
  const editorTitle = $("#editorTitle");
  const form = $("#skillForm");
  const nameInput = $("#skillName");
  const attrSelect = $("#skillAttr");
  const bonusInput = $("#skillBonus");
  const bonusValue = $("#bonusValue");
  const pipHint = $("#pipHint");
  const descInput = $("#skillDesc");

  const portraitFrame = $("#portraitFrame");
  const portraitInput = $("#portraitInput");
  const portraitPreview = $("#portraitPreview");
  const portraitPlaceholder = $("#portraitPlaceholder");
  const clearPortrait = $("#clearPortrait");

  const importFile = $("#importFile");

  /* ---------- persistence ---------- */
  function defaultState() {
    const attributes = SLOTS.map((s) => ({
      id: uid("at"),
      slot: s.slot,
      name: s.name,
      value: 3,
    }));
    const byName = (n) => attributes.find((a) => a.slot === n).id;
    const skills = [
      { id: uid(), attrId: byName("intellect"), name: "Encyclopedia", bonus: 0,
        desc: "A head full of trivia, some of it even useful.", portrait: null },
      { id: uid(), attrId: byName("psyche"), name: "Inland Empire", bonus: 1,
        desc: "Hunches and gut feelings. Dreams. The dread that follows you.", portrait: null },
      { id: uid(), attrId: byName("physique"), name: "Electrochemistry", bonus: 2,
        desc: "Go on. One more. It will feel so good.", portrait: null },
      { id: uid(), attrId: byName("motorics"), name: "Savoir Faire", bonus: 0,
        desc: "Slip in, slip out. Be the smoothest thing in the room.", portrait: null },
    ];
    return { attributes, skills };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.attributes) || !Array.isArray(parsed.skills)) {
        return defaultState();
      }
      return parsed;
    } catch (err) {
      console.warn("Could not read saved state:", err);
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      alert("Could not save. Browser storage is full or blocked. Export to keep your work.");
      console.warn(err);
    }
  }

  function uid(prefix) {
    return (prefix || "sk") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  const attrById = (id) => state.attributes.find((a) => a.id === id);
  const skillById = (id) => state.skills.find((s) => s.id === id);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const effectivePips = (skill) => {
    const attr = attrById(skill.attrId);
    return (attr ? attr.value : 0) + (skill.bonus || 0);
  };

  /* ---------- rendering ---------- */
  function render() {
    board.innerHTML = "";
    for (const attr of state.attributes) {
      board.appendChild(rowEl(attr));
    }
  }

  function rowEl(attr) {
    const row = document.createElement("section");
    row.className = `attr-row attr-${attr.slot}`;
    row.dataset.attrId = attr.id;

    /* header: editable name, value stepper, add button */
    const head = document.createElement("header");
    head.className = "attr-head";

    const nameField = document.createElement("input");
    nameField.className = "attr-name";
    nameField.value = attr.name;
    nameField.maxLength = 24;
    nameField.setAttribute("aria-label", "Attribute name");
    nameField.addEventListener("change", () => {
      attr.name = nameField.value.trim() || "Attribute";
      nameField.value = attr.name;
      save();
    });
    // autosize-ish: keep width tied to content. The uppercase Oswald face
    // with letter-spacing runs ~1.4ch per glyph, so estimate generously.
    const sizeName = (v) => {
      nameField.style.width = Math.ceil(Math.max(5, v.length) * 1.4 + 2) + "ch";
    };
    sizeName(attr.name);
    nameField.addEventListener("input", () => sizeName(nameField.value));

    const stepper = document.createElement("div");
    stepper.className = "stepper";
    const minus = stepEl("−", () => setAttrValue(attr, attr.value - 1));
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = attr.value;
    const plus = stepEl("+", () => setAttrValue(attr, attr.value + 1));
    minus.disabled = attr.value <= ATTR_VALUE_MIN;
    plus.disabled = attr.value >= ATTR_VALUE_MAX;
    stepper.append(minus, val, plus);

    const caption = document.createElement("span");
    caption.className = "caption";
    caption.textContent = "pips per skill";

    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-sm add-skill";
    addBtn.textContent = "+ Skill";
    addBtn.addEventListener("click", () => openEditor(null, attr.id));

    head.append(nameField, stepper, caption, addBtn);

    /* cards */
    const cards = document.createElement("div");
    cards.className = "row-cards";
    const rowSkills = state.skills.filter((s) => s.attrId === attr.id);

    for (const skill of rowSkills) cards.appendChild(cardEl(skill, attr));

    const addCard = document.createElement("button");
    addCard.className = "card-add";
    addCard.innerHTML = "<span>+ Add skill</span>";
    addCard.addEventListener("click", () => openEditor(null, attr.id));
    cards.appendChild(addCard);

    row.append(head, cards);
    return row;
  }

  function stepEl(label, onClick) {
    const b = document.createElement("button");
    b.className = "step";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function setAttrValue(attr, next) {
    attr.value = clamp(next, ATTR_VALUE_MIN, ATTR_VALUE_MAX);
    save();
    render();
  }

  function cardEl(skill, attr) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = skill.id;

    const frame = document.createElement("div");
    frame.className = "frame";
    if (skill.portrait) {
      const img = document.createElement("img");
      img.src = skill.portrait;
      img.alt = skill.name;
      frame.appendChild(img);
    }

    const meta = document.createElement("div");
    meta.className = "card-meta";

    const name = document.createElement("h3");
    name.className = "card-name";
    name.textContent = skill.name;

    meta.append(name, pipsEl(attr.value, skill.bonus || 0));

    const desc = document.createElement("p");
    desc.className = "card-desc";
    desc.textContent = skill.desc || "";

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-sm";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openEditor(skill.id));
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-sm";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => removeSkill(skill.id));
    actions.append(editBtn, delBtn);

    card.append(frame, meta, desc, actions);
    return card;
  }

  function pipsEl(base, bonus) {
    const wrap = document.createElement("div");
    wrap.className = "pips";
    const total = base + bonus;
    wrap.title = bonus
      ? `${total} pips (${base} from attribute, +${bonus})`
      : `${total} pips`;
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

  /* ---------- editor ---------- */
  function populateAttrSelect(selectedId) {
    attrSelect.innerHTML = "";
    for (const attr of state.attributes) {
      const opt = document.createElement("option");
      opt.value = attr.id;
      opt.textContent = attr.name;
      attrSelect.appendChild(opt);
    }
    attrSelect.value = selectedId || state.attributes[0].id;
  }

  function openEditor(id, attrId) {
    editingId = id || null;
    const skill = id ? skillById(id) : null;
    editingAttrId = skill ? skill.attrId : (attrId || state.attributes[0].id);

    editorTitle.textContent = skill ? "Edit Skill" : "New Skill";
    populateAttrSelect(editingAttrId);
    nameInput.value = skill ? skill.name : "";
    bonusInput.value = skill ? (skill.bonus || 0) : 0;
    descInput.value = skill ? skill.desc : "";
    setDraftPortrait(skill ? skill.portrait : null);
    updateBonusHint();
    applyEditorAccent();

    editor.hidden = false;
    document.body.style.overflow = "hidden";
    nameInput.focus();
  }

  function closeEditor() {
    editor.hidden = true;
    document.body.style.overflow = "";
    editingId = null;
    draftPortrait = null;
    form.reset();
  }

  function updateBonusHint() {
    const bonus = Number(bonusInput.value);
    bonusValue.textContent = "+" + bonus;
    const attr = attrById(attrSelect.value);
    const base = attr ? attr.value : 0;
    pipHint.textContent =
      `${base + bonus} pips total — ${base} from ${attr ? attr.name : "attribute"}` +
      (bonus ? `, +${bonus} for this skill.` : ".");
  }

  function setDraftPortrait(dataUrl) {
    draftPortrait = dataUrl || null;
    if (draftPortrait) {
      portraitPreview.src = draftPortrait;
      portraitPreview.hidden = false;
      portraitPlaceholder.hidden = true;
      clearPortrait.hidden = false;
    } else {
      portraitPreview.removeAttribute("src");
      portraitPreview.hidden = true;
      portraitPlaceholder.hidden = false;
      clearPortrait.hidden = true;
    }
  }

  function applyEditorAccent() {
    const attr = attrById(attrSelect.value);
    portraitFrame.className = "frame";
    if (attr) portraitFrame.classList.add(`attr-${attr.slot}`);
  }

  /* Resize any uploaded image into a fixed 150x200 (cover) portrait. */
  function processImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("Not an image file."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not decode image."));
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = PORTRAIT_W;
          canvas.height = PORTRAIT_H;
          const ctx = canvas.getContext("2d");
          const scale = Math.max(PORTRAIT_W / img.width, PORTRAIT_H / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (PORTRAIT_W - w) / 2, (PORTRAIT_H - h) / 2, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(file) {
    try {
      setDraftPortrait(await processImage(file));
    } catch (err) {
      alert("That file could not be used as a portrait: " + err.message);
    }
  }

  /* ---------- CRUD ---------- */
  function submit(e) {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    const data = {
      name,
      attrId: attrSelect.value,
      bonus: clamp(Number(bonusInput.value), 0, BONUS_MAX),
      desc: descInput.value.trim(),
      portrait: draftPortrait,
    };

    if (editingId) {
      const skill = skillById(editingId);
      if (skill) Object.assign(skill, data);
    } else {
      state.skills.push({ id: uid(), ...data });
    }
    save();
    render();
    closeEditor();
  }

  function removeSkill(id) {
    const skill = skillById(id);
    if (!skill) return;
    if (!confirm(`Delete "${skill.name}"? This cannot be undone.`)) return;
    state.skills = state.skills.filter((s) => s.id !== id);
    save();
    render();
  }

  /* ---------- import / export / reset ---------- */
  function exportState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skills.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importState(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.attributes) || !Array.isArray(parsed.skills)) {
          throw new Error("File is not a Skill Builder export.");
        }
        if (!confirm("Replace everything on the board with this file?")) return;
        state = {
          attributes: parsed.attributes.map((a, i) => ({
            id: a.id || uid("at"),
            slot: SLOTS[i] ? SLOTS[i].slot : "intellect",
            name: String(a.name || "Attribute").slice(0, 24),
            value: clamp(Number(a.value) || 1, ATTR_VALUE_MIN, ATTR_VALUE_MAX),
          })),
          skills: [],
        };
        const validAttrIds = new Set(state.attributes.map((a) => a.id));
        state.skills = parsed.skills
          .filter((s) => s && typeof s.name === "string")
          .map((s) => ({
            id: uid(),
            attrId: validAttrIds.has(s.attrId) ? s.attrId : state.attributes[0].id,
            name: String(s.name).slice(0, 40),
            bonus: clamp(Number(s.bonus) || 0, 0, BONUS_MAX),
            desc: typeof s.desc === "string" ? s.desc.slice(0, 400) : "",
            portrait: typeof s.portrait === "string" ? s.portrait : null,
          }));
        save();
        render();
      } catch (err) {
        alert("Could not import this file: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  function resetBoard() {
    if (!confirm("Reset the board to the default four attributes and clear your skills?")) return;
    state = defaultState();
    save();
    render();
  }

  /* ---------- events ---------- */
  $("#closeEditor").addEventListener("click", closeEditor);
  $("#cancelEditor").addEventListener("click", closeEditor);
  form.addEventListener("submit", submit);

  editor.addEventListener("click", (e) => { if (e.target === editor) closeEditor(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !editor.hidden) closeEditor();
  });

  bonusInput.addEventListener("input", updateBonusHint);
  attrSelect.addEventListener("change", () => { updateBonusHint(); applyEditorAccent(); });

  portraitInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
    portraitInput.value = "";
  });
  clearPortrait.addEventListener("click", () => setDraftPortrait(null));

  ["dragenter", "dragover"].forEach((evt) =>
    portraitFrame.addEventListener(evt, (e) => { e.preventDefault(); portraitFrame.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((evt) =>
    portraitFrame.addEventListener(evt, (e) => { e.preventDefault(); portraitFrame.classList.remove("dragover"); }));
  portraitFrame.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  $("#exportBtn").addEventListener("click", exportState);
  $("#importBtn").addEventListener("click", () => importFile.click());
  $("#resetBtn").addEventListener("click", resetBoard);
  importFile.addEventListener("change", (e) => {
    if (e.target.files[0]) importState(e.target.files[0]);
    importFile.value = "";
  });

  /* ---------- first paint ---------- */
  render();
})();
