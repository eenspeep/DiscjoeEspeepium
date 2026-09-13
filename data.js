/* ============================================================
   SKILL DATA  —  DEV-SIDE CONTENT
   ------------------------------------------------------------
   This is the ONE place you edit content. The running app does
   not let anyone change any of this; it only lets a player
   assign attribute values and skill points.

   Edit here:
     - attribute .name        (row heading)
     - skill .name            (card title)
     - skill .desc            (shown on hover; blank = no tooltip)
     - skill .portrait        (image path, 150x200)

   Do NOT rename the four .slot values (intellect / psyche /
   physique / motorics) — the colours and layout key off them.
   Each attribute must keep exactly six skills to match the
   6-per-row portrait sheet.

   Portraits live in  portraits/<slot>-<n>.png  (n = 1..6),
   matching the row/column of the source sheet. A missing file
   just shows the tinted frame, so the app never breaks.
   ============================================================ */

window.SKILL_DATA = {
  // ── Character-creation limits (Disco Elysium style) ──
  // attrMax / attrBudget are the canonical DE caps. skillPointBudget is a
  // finite pool for filling skill pips; DE ties this to level-up XP rather
  // than a fixed number, so set it to whatever feels right for your game.
  limits: {
    attrMin: 1,             // an attribute can never drop below this
    attrMax: 6,             // DE caps every attribute at 6
    attrBudget: 12,         // total points shared across the four attributes
    skillPointBudget: 20,   // total points available to fill skill pips
  },

  attributes: [
    {
      slot: "intellect",
      name: "Thought",
      value: 3, // default assignment; the player can change this at runtime
      skills: [
        { name: "Reason",         desc: "", portrait: "portraits/intellect-1.png" },
        { name: "Raw Memory",     desc: "", portrait: "portraits/intellect-2.png" },
        { name: "Rhetoric",       desc: "", portrait: "portraits/intellect-3.png" },
        { name: "Tomfoolery",     desc: "", portrait: "portraits/intellect-4.png" },
        { name: "Interpretation", desc: "", portrait: "portraits/intellect-5.png" },
        { name: "Mind's Eye",     desc: "", portrait: "portraits/intellect-6.png" },
      ],
    },
    {
      slot: "psyche",
      name: "Soul",
      value: 3,
      skills: [
        { name: "Will",                desc: "", portrait: "portraits/psyche-1.png" },
        { name: "Degeneracy",          desc: "", portrait: "portraits/psyche-2.png" },
        { name: "Empathy",             desc: "", portrait: "portraits/psyche-3.png" },
        { name: "Group Leader",        desc: "", portrait: "portraits/psyche-4.png" },
        { name: "Jaaime Consciousness", desc: "", portrait: "portraits/psyche-5.png" },
        { name: "Appeal",              desc: "", portrait: "portraits/psyche-6.png" },
      ],
    },
    {
      slot: "physique",
      name: "Build",
      value: 3,
      skills: [
        { name: "Relentlessness",      desc: "", portrait: "portraits/physique-1.png" },
        { name: "Pinata",              desc: "", portrait: "portraits/physique-2.png" },
        { name: "Impact",              desc: "", portrait: "portraits/physique-3.png" },
        { name: "Substance Tolerance", desc: "", portrait: "portraits/physique-4.png" },
        { name: "Local",               desc: "", portrait: "portraits/physique-5.png" },
        { name: "Psychopathy",         desc: "", portrait: "portraits/physique-6.png" },
      ],
    },
    {
      slot: "motorics",
      name: "Reflex",
      value: 3,
      skills: [
        { name: "Gamer",     desc: "", portrait: "portraits/motorics-1.png" },
        { name: "Sharp",     desc: "", portrait: "portraits/motorics-2.png" },
        { name: "Bit-Ready", desc: "", portrait: "portraits/motorics-3.png" },
        { name: "Zag",       desc: "", portrait: "portraits/motorics-4.png" },
        { name: "Architect", desc: "", portrait: "portraits/motorics-5.png" },
        { name: "Aura",      desc: "", portrait: "portraits/motorics-6.png" },
      ],
    },
  ],
};
