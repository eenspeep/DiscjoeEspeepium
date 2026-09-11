/* ============================================================
   SKILL DATA  —  DEV-SIDE CONTENT
   ------------------------------------------------------------
   This is the ONE place you edit content. The running app does
   not let anyone change any of this; it only lets a player
   assign attribute values and skill points.

   Edit here:
     - attribute .name        (row heading)
     - skill .name            (card title)
     - skill .desc            (shown on hover)
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
      name: "Intellect",
      value: 3, // default assignment; the player can change this at runtime
      skills: [
        { name: "Logic",             desc: "Cross-examine reality and win.",                 portrait: "portraits/intellect-1.png" },
        { name: "Encyclopedia",      desc: "A head full of trivia, some of it even useful.",  portrait: "portraits/intellect-2.png" },
        { name: "Rhetoric",          desc: "Argue, provoke, win the debate and lose the room.", portrait: "portraits/intellect-3.png" },
        { name: "Drama",             desc: "Lie, and spot a liar. All the world's a stage.",  portrait: "portraits/intellect-4.png" },
        { name: "Conceptualization", desc: "See the art in everything, and everything as art.", portrait: "portraits/intellect-5.png" },
        { name: "Visual Calculus",   desc: "Reconstruct the scene from dust and angles.",     portrait: "portraits/intellect-6.png" },
      ],
    },
    {
      slot: "psyche",
      name: "Psyche",
      value: 3,
      skills: [
        { name: "Volition",       desc: "Hold the line. Keep yourself together.",       portrait: "portraits/psyche-1.png" },
        { name: "Inland Empire",  desc: "Hunches, dreams, and the dread that follows you.", portrait: "portraits/psyche-2.png" },
        { name: "Empathy",        desc: "Feel what they feel. It hurts.",               portrait: "portraits/psyche-3.png" },
        { name: "Authority",      desc: "Command respect, or demand it.",               portrait: "portraits/psyche-4.png" },
        { name: "Esprit de Corps", desc: "The invisible bond between cops.",             portrait: "portraits/psyche-5.png" },
        { name: "Suggestion",     desc: "Charm, manipulate, and grease the wheels.",    portrait: "portraits/psyche-6.png" },
      ],
    },
    {
      slot: "physique",
      name: "Physique",
      value: 3,
      skills: [
        { name: "Endurance",           desc: "Take the hit. Stay standing.",              portrait: "portraits/physique-1.png" },
        { name: "Pain Threshold",      desc: "It only hurts if you let it.",              portrait: "portraits/physique-2.png" },
        { name: "Physical Instrument", desc: "Your body is a weapon. Use it.",            portrait: "portraits/physique-3.png" },
        { name: "Electrochemistry",    desc: "Go on. One more. It will feel so good.",    portrait: "portraits/physique-4.png" },
        { name: "Shivers",             desc: "The city speaks. Listen.",                  portrait: "portraits/physique-5.png" },
        { name: "Half Light",          desc: "Fear, fury, the fight-or-flight scream.",   portrait: "portraits/physique-6.png" },
      ],
    },
    {
      slot: "motorics",
      name: "Motorics",
      value: 3,
      skills: [
        { name: "Hand/Eye Coordination", desc: "Line up the shot. Do not miss.",            portrait: "portraits/motorics-1.png" },
        { name: "Perception",            desc: "Notice what others walk past.",             portrait: "portraits/motorics-2.png" },
        { name: "Reaction Speed",        desc: "Move before you think.",                    portrait: "portraits/motorics-3.png" },
        { name: "Savoir Faire",          desc: "Slip in, slip out. Be the smoothest thing in the room.", portrait: "portraits/motorics-4.png" },
        { name: "Interfacing",           desc: "Machines and hands. Make them obey.",       portrait: "portraits/motorics-5.png" },
        { name: "Composure",             desc: "Keep your face still and your posture perfect.", portrait: "portraits/motorics-6.png" },
      ],
    },
  ],
};
