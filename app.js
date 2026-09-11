/* ============================================================
   Skill Builder - state, rendering, and the portrait pipeline
   ============================================================ */

(() => {
  "use strict";

  const STORAGE_KEY = "skillbuilder.skills.v1";
  const PORTRAIT_W = 150;
  const PORTRAIT_H = 200;
  const ATTRS = ["intellect", "psyche", "physique", "motorics"];

  /* ---------- state ---------- */
  let skills = load();
  let editingId = null;      // null while creating a new skill
  let draftPortrait = null;  // data URL held by the open editor

  /* ---------- element refs ---------- */
  const $ = (sel) => document.querySelector(sel);
  const grid = $("#grid");
  const emptyState = $("#emptyState");
  const filters = $("#filters");

  const editor = $("#editor");
  const editorTitle = $("#editorTitle");
  const form = $("#skillForm");
  const nameInput = $("#skillName");
  const attrSelect = $("#skillAttr");
  const levelInput = $("#skillLevel");
  const levelValue = $("#levelValue");
  const descInput = $("#skillDesc");

  const portraitFrame = $("#portraitFrame");
  const portraitInput = $("#portraitInput");
  const portraitPreview = $("#portraitPreview");
  const portraitPlaceholder = $("#portraitPlaceholder");
  const clearPortrait = $("#clearPortrait");

  const importFile = $("#importFile");

  let activeFilter = "all";

  /* ---------- persistence ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isValidSkill) : [];
    } catch (err) {
      console.warn("Could not read saved skills:", err);
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
    } catch (err) {
      // Most likely the quota was blown by too many portraits.
      alert("Could not save. Browser storage is full or blocked. Export your skills to keep them.");
      console.warn(err);
    }
  }

  function isValidSkill(s) {
    return s && typeof s.id === "string" && typeof s.name === "string";
  }

  function uid() {
    return "sk_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- rendering ---------- */
  function render() {
    const list = activeFilter === "all"
      ? skills
      : skills.filter((s) => s.attr === activeFilter);

    grid.innerHTML = "";
    emptyState.hidden = skills.length !== 0;

    for (const skill of list) {
      grid.appendChild(cardEl(skill));
    }
  }

  function cardEl(skill) {
    const attr = ATTRS.includes(skill.attr) ? skill.attr : "intellect";
    const card = document.createElement("article");
    card.className = `card attr-${attr}`;
    card.dataset.id = skill.id;

    const frame = document.createElement("div");
    frame.className = "card-portrait-frame";
    if (skill.portrait) {
      const img = document.createElement("img");
      img.src = skill.portrait;
      img.alt = skill.name;
      frame.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "portrait-placeholder";
      ph.innerHTML = `<span>${initials(skill.name)}</span>`;
      frame.appendChild(ph);
    }

    const level = document.createElement("div");
    level.className = "card-level";
    level.textContent = skill.level;
    level.title = "Skill level";

    const name = document.createElement("h3");
    name.className = "card-name";
    name.textContent = skill.name;

    const attrLabel = document.createElement("p");
    attrLabel.className = "card-attr";
    attrLabel.textContent = attr;

    const desc = document.createElement("p");
    desc.className = "card-desc";
    desc.textContent = skill.desc || "—";

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openEditor(skill.id));
    const delBtn = document.createElement("button");
    delBtn.className = "btn";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => removeSkill(skill.id));
    actions.append(editBtn, delBtn);

    card.append(frame, level, name, attrLabel, desc, actions);
    return card;
  }

  function initials(name) {
    return (name || "?")
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
  }

  /* ---------- editor ---------- */
  function openEditor(id) {
    editingId = id || null;
    const skill = id ? skills.find((s) => s.id === id) : null;

    editorTitle.textContent = skill ? "Edit Skill" : "New Skill";
    nameInput.value = skill ? skill.name : "";
    attrSelect.value = skill ? skill.attr : "intellect";
    levelInput.value = skill ? skill.level : 3;
    levelValue.textContent = levelInput.value;
    descInput.value = skill ? skill.desc : "";
    setDraftPortrait(skill ? skill.portrait : null);
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
    portraitFrame.parentElement.className = "editor-preview";
    portraitFrame.className = "card-portrait-frame";
    // reuse the attribute accent variables on the preview frame
    portraitFrame.classList.add(`attr-${attrSelect.value}`);
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

          // cover-fit: fill the frame, crop the overflow, keep it centred
          const scale = Math.max(PORTRAIT_W / img.width, PORTRAIT_H / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const dx = (PORTRAIT_W - w) / 2;
          const dy = (PORTRAIT_H - h) / 2;
          ctx.drawImage(img, dx, dy, w, h);

          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(file) {
    try {
      const dataUrl = await processImage(file);
      setDraftPortrait(dataUrl);
    } catch (err) {
      alert("That file could not be used as a portrait: " + err.message);
    }
  }

  /* ---------- CRUD ---------- */
  function submit(e) {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }

    const data = {
      name,
      attr: attrSelect.value,
      level: Number(levelInput.value),
      desc: descInput.value.trim(),
      portrait: draftPortrait,
    };

    if (editingId) {
      const skill = skills.find((s) => s.id === editingId);
      if (skill) Object.assign(skill, data);
    } else {
      skills.push({ id: uid(), ...data });
    }

    save();
    render();
    closeEditor();
  }

  function removeSkill(id) {
    const skill = skills.find((s) => s.id === id);
    if (!skill) return;
    if (!confirm(`Delete "${skill.name}"? This cannot be undone.`)) return;
    skills = skills.filter((s) => s.id !== id);
    save();
    render();
  }

  /* ---------- import / export ---------- */
  function exportSkills() {
    if (skills.length === 0) {
      alert("Nothing to export yet.");
      return;
    }
    const blob = new Blob([JSON.stringify(skills, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skills.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importSkills(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error("Expected a list of skills.");
        const cleaned = parsed.filter(isValidSkill).map((s) => ({
          id: uid(),
          name: String(s.name).slice(0, 40),
          attr: ATTRS.includes(s.attr) ? s.attr : "intellect",
          level: Math.min(12, Math.max(1, Number(s.level) || 1)),
          desc: typeof s.desc === "string" ? s.desc.slice(0, 400) : "",
          portrait: typeof s.portrait === "string" ? s.portrait : null,
        }));
        if (cleaned.length === 0) throw new Error("No valid skills found.");
        const replace = skills.length > 0 &&
          confirm(`Import ${cleaned.length} skill(s)?\n\nOK = replace current set\nCancel = merge into it`);
        skills = replace ? cleaned : skills.concat(cleaned);
        save();
        render();
      } catch (err) {
        alert("Could not import this file: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  /* ---------- events ---------- */
  $("#newSkillBtn").addEventListener("click", () => openEditor(null));
  $("#closeEditor").addEventListener("click", closeEditor);
  $("#cancelEditor").addEventListener("click", closeEditor);
  form.addEventListener("submit", submit);

  document.addEventListener("click", (e) => {
    if (e.target.matches("[data-open-new]")) openEditor(null);
  });

  editor.addEventListener("click", (e) => {
    if (e.target === editor) closeEditor();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !editor.hidden) closeEditor();
  });

  levelInput.addEventListener("input", () => {
    levelValue.textContent = levelInput.value;
  });
  attrSelect.addEventListener("change", applyEditorAccent);

  portraitInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
    portraitInput.value = "";
  });
  clearPortrait.addEventListener("click", () => setDraftPortrait(null));

  // drag & drop onto the portrait frame
  ["dragenter", "dragover"].forEach((evt) =>
    portraitFrame.addEventListener(evt, (e) => {
      e.preventDefault();
      portraitFrame.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    portraitFrame.addEventListener(evt, (e) => {
      e.preventDefault();
      portraitFrame.classList.remove("dragover");
    })
  );
  portraitFrame.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  filters.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    activeFilter = chip.dataset.attr;
    filters.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip-active"));
    chip.classList.add("chip-active");
    render();
  });

  $("#exportBtn").addEventListener("click", exportSkills);
  $("#importBtn").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", (e) => {
    if (e.target.files[0]) importSkills(e.target.files[0]);
    importFile.value = "";
  });

  /* ---------- first paint ---------- */
  if (skills.length === 0) seedExamples();
  render();

  /* A couple of example voices so the board is never a blank stare. */
  function seedExamples() {
    skills = [
      {
        id: uid(),
        name: "Inland Empire",
        attr: "psyche",
        level: 4,
        desc: "Hunches and gut feelings. Dreams. The dread that follows you.",
        portrait: null,
      },
      {
        id: uid(),
        name: "Electrochemistry",
        attr: "physique",
        level: 5,
        desc: "Go on. One more. It will feel so good.",
        portrait: null,
      },
      {
        id: uid(),
        name: "Encyclopedia",
        attr: "intellect",
        level: 3,
        desc: "A head full of trivia, some of it even useful.",
        portrait: null,
      },
    ];
    save();
  }
})();
