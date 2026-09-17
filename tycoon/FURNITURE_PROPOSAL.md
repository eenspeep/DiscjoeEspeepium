# Joe Time — Furniture Expansion Proposal (100 pieces)

**Status: DRAFT / ideas only.** Ten new pieces for each of the ten research
tiers. Within every tier the list runs left-to-right from **generic** (a plain
table anyone gets) to **esoteric** (reality-bending gear gated behind SOUL), so
each tier spans the whole Mundane → Eldritch spectrum.

## How to read this

Each piece has a **role**, an **eso gate**, and a **node capacity**:

- **Role** (one resource each, per the single-role rule):
  - 💰 **Gold** — multiplies your income.
  - 🔧 **Build** — build speed for anyone adjacent.
  - 🔬 **Research** — research speed for anyone adjacent.
  - 🔮 **Soul** — channels SOUL (altar-type).
  - 🛠 **Utility** — no resource of its own; a special effect, a spawner, or a
    pure **node bed** (see below).
  - ⚗️ **Hybrid** — half of two roles, costs ~1.6× more (existing `hybrid` flag).
- **Eso** — personal esotericism gate: **0** Mundane · **1** Curious · **2**
  Uncanny · **3** Eldritch. Higher-eso pieces need channelled SOUL to place, so
  an eso-3 piece even at tier 1 is a "come back once you're deep in soul" item.
- **Nodes** — how many mod/node slots the piece hosts (0–6). Roughly follows
  footprint. Some pieces are deliberately **node beds**: low intrinsic output,
  lots of slots, meant to *carry mods* rather than do much themselves. Marked
  **(bed)**.

**Balance target across all 100:** ~⅓ gold, ~⅓ production (build+research),
~¼ utility, plus a scattering of soul/hybrid. Node counts vary widely on
purpose — a few pieces are giant output with 0 slots, a few are all slots and
almost no output.

Mapping to code: role → the `tag`/`soul`/`hybrid`/`ratSpawner` fields; eso →
`ESO_FURN`; nodes → surface tiles in the `SURFACE` set (a bed just gets a big
footprint of mod-able tiles). Footprint suggestions in parentheses.

---

## Tier 1 — Supply Closet

| # | Piece | Role | Eso | Nodes | Note |
|---|-------|------|-----|-------|------|
| 1 | Folding Table | 💰 Gold | 0 | 3 **(bed)** | A bare table. Barely earns; it's really a surface for plants. (2×1) |
| 2 | Water Cooler | 💰 Gold | 0 | 0 | Small talk = morale = money. |
| 3 | Supply Shelf | 🛠 Utility | 0 | 4 **(bed)** | Pure storage: no output, four node slots. (2×2) |
| 4 | Cork Bulletin Board | 🔬 Research | 0 | 2 | Pin ideas, connect strings. |
| 5 | Beat-up Toolbox | 🔧 Build | 0 | 2 | Wrenches within reach. |
| 6 | Mop & Bucket | 🛠 Utility | 0 | 0 | Slowly repairs nearby rat-mauled furniture. |
| 7 | Vending Machine | 💰 Gold | 1 | 1 | Sells snacks to invisible coworkers. |
| 8 | Lost & Found Bin | 🛠 Utility | 1 | 1 | Occasionally coughs up a random tier-1 loot item. |
| 9 | Planchette Coaster | 🔮 Soul | 2 | 0 | A coaster that spells rude words. A trickle of SOUL. |
| 10 | The Closet That's Bigger Inside | ⚗️ Gold+Research | 3 | 2 | Open the supply closet, find a hallway that shouldn't exist. |

## Tier 2 — Break Room

| # | Piece | Role | Eso | Nodes | Note |
|---|-------|------|-----|-------|------|
| 1 | Break Table | 💰 Gold | 0 | 4 **(bed)** | The classic. Mostly a big flat node surface. (2×2) |
| 2 | Drip Coffee Maker | 🔧 Build | 0 | 1 | Caffeine, faster hands. |
| 3 | Microwave | 💰 Gold | 0 | 0 | Beeps. Smells. Pays. |
| 4 | Magazine Rack | 🔬 Research | 0 | 2 | Idle reading, real ideas. |
| 5 | Snack Pantry | 🛠 Utility | 0 | 3 **(bed)** | Node bed disguised as shelving. (2×1) |
| 6 | Recycling Station | 🛠 Utility | 1 | 1 | Turns nearby dropped loot into a few coins over time. |
| 7 | Foosball Table | 💰 Gold | 1 | 0 | Morale spike, income spike. (2×1) |
| 8 | Fortune Teller Machine | 🔬 Research | 2 | 1 | "Zoltar sees a patent in your future." |
| 9 | Cursed Communal Fridge | 🔮 Soul | 2 | 1 | Something in there is older than the company. |
| 10 | Perpetual Stew Cauldron | ⚗️ Gold+Soul | 3 | 2 | Never emptied since 1987. Feeds the whole floor, and something else. |

## Tier 3 — Cubicle Farm

| # | Piece | Role | Eso | Nodes | Note |
|---|-------|------|-----|-------|------|
| 1 | Cubicle Desk | 💰 Gold | 0 | 2 | The unit of corporate life. |
| 2 | Ergonomic Chair | 🔧 Build | 0 | 0 | Lumbar support, faster building. |
| 3 | Filing Cabinet | 🛠 Utility | 0 | 5 **(bed)** | Five drawers, five nodes, zero personality. (2×2) |
| 4 | Desktop Terminal | 🔬 Research | 0 | 1 | Beige. Loud fan. Smart. |
| 5 | Standing Desk Riser | 🔧 Build | 0 | 2 | Up/down, up/down. |
| 6 | Motivational Poster Wall | 💰 Gold | 1 | 3 **(bed)** | "HANG IN THERE." A node wall. (2×1) |
| 7 | Paper Shredder | 🛠 Utility | 1 | 0 | Destroys evidence; grants a black-mark forgiveness charge over time. |
| 8 | Executive Aquarium | 💰 Gold | 2 | 1 | Status fish. The koi judge you. (2×1) |
| 9 | Whispering Cubicle | 🔮 Soul | 2 | 1 | The walls talk back after hours. |
| 10 | Nap Pod (Non-Euclidean) | ⚗️ Build+Soul | 3 | 1 | Sleep an hour, wake in five minutes. Or five years. |

## Tier 4 — Server Room

| # | Piece | Role | Eso | Nodes | Note |
|---|-------|------|-----|-------|------|
| 1 | Patch-Panel Desk | 🔬 Research | 0 | 3 **(bed)** | Cables everywhere; great node surface. (2×1) |
| 2 | Rack-Mount Server | 🔬 Research | 0 | 1 | Hums with knowledge. (2×1) |
| 3 | UPS Battery Bank | 🔧 Build | 0 | 2 | Keeps the tools humming. |
| 4 | Cable Spool Table | 💰 Gold | 0 | 4 **(bed)** | A giant spool as a table. Node bed. (2×2) |
| 5 | Cooling Fan Wall | 🛠 Utility | 0 | 0 | Halves the chance nearby furniture "breaks" from heat/rats. |
| 6 | Crypto Miner Rig | 💰 Gold | 1 | 1 | Loud, hot, lucrative, faintly embarrassing. (2×2) |
| 7 | Backup Tape Vault | 🛠 Utility | 1 | 3 **(bed)** | A vault of nodes. (2×2) |
| 8 | Rogue AI Sandbox | 🔬 Research | 2 | 1 | It's fine. It's contained. It's asking questions. (2×2) |
| 9 | Haunted Mainframe | 🔮 Soul | 2 | 1 | COBOL never dies. Neither did its author. (2×2) |
| 10 | Quantum Blade Server | ⚗️ Research+Gold | 3 | 2 | Computes in every timeline and bills you in this one. (2×2) |

## Tier 5 — R&D Lab

| # | Piece | Role | Eso | Nodes | Note |
|---|-------|------|-----|-------|------|
| 1 | Lab Bench | 🔬 Research | 0 | 4 **(bed)** | The workhorse surface. (2×2) |
| 2 | Fume Hood | 🔬 Research | 0 | 1 | Dangerous ideas, safely vented. (2×1) |
| 3 | Machine Lathe | 🔧 Build | 0 | 2 | Makes parts for making parts. (2×1) |
| 4 | Espresso Lab Rig | 💰 Gold | 0 | 1 | Coffee as a science. Money as a byproduct. |
| 5 | Sample Freezer | 🛠 Utility | 0 | 3 **(bed)** | Cold storage node bed. (2×1) |
| 6 | Prototype Assembler | 🔧 Build | 1 | 1 | Prints jigs on demand. (2×2) |
| 7 | Grant Money Printer | 💰 Gold | 1 | 0 | Technically legal. Mostly. |
| 8 | Cryo-Sleep Chamber | 🛠 Utility | 2 | 1 | Bank offline time faster while you stand in it. (2×2) |
| 9 | Alchemist's Still | 🔮 Soul | 2 | 2 | Distills base metals into base impulses. (2×1) |
| 10 | Schrödinger's Incubator | ⚗️ Research+Soul | 3 | 1 | The experiment both succeeded and doomed us. |

## Tier 6 — Innovation Wing

| # | Piece | Role | Eso | Nodes | Note |
|---|-------|------|-----|-------|------|
| 1 | Brainstorm Pod | 🔬 Research | 0 | 3 **(bed)** | Beanbags and a whiteboard wall. (2×2) |
| 2 | Modular Maker Bench | 🔧 Build | 0 | 4 **(bed)** | Pegboard heaven; a builder's node bed. (2×2) |
| 3 | Investor Pitch Stage | 💰 Gold | 0 | 1 | Where hot air becomes cold cash. (2×2) |
| 4 | 3D Resin Printer | 🔧 Build | 0 | 1 | Smells like the future. (2×1) |
| 5 | Idea Whiteboard Cube | 🔬 Research | 0 | 2 | Four walls, infinite arrows. |
| 6 | Kombucha Tap Wall | 💰 Gold | 1 | 2 **(bed)** | Wellness as revenue. Node wall. (2×1) |
| 7 | Drone Charging Nest | 🛠 Utility | 1 | 1 | Deploys a tiny drone that auto-grabs nearby loot. (2×2) |
| 8 | Biofeedback Meditation Egg | 🔮 Soul | 2 | 0 | You, but calmer, and slightly luminous. |
| 9 | Idea Siphon | 🔬 Research | 2 | 1 | Reads the room's dreams. Reads yours too. (2×2) |
| 10 | Möbius Conveyor | ⚗️ Build+Gold | 3 | 2 | Parts go in one side and come out the same side, improved. (3×2) |

## Tier 7 — Skunkworks

| # | Piece | Role | Eso | Nodes | Note |
|---|-------|------|-----|-------|------|
| 1 | Classified Workbench | 🔧 Build | 0 | 4 **(bed)** | Redacted, but a great surface. (2×2) |
| 2 | Wind Tunnel | 🔬 Research | 0 | 1 | Very fast air, very fast learning. (3×2) |
| 3 | Black-Budget Safe | 💰 Gold | 0 | 2 | Money you're not supposed to know about. |
| 4 | Robotic Arm Cell | 🔧 Build | 0 | 1 | Welds, rivets, occasionally waves. (2×2) |
| 5 | Signals Intercept Rack | 🔬 Research | 0 | 3 **(bed)** | Antennas as a node bed. (2×1) |
| 6 | Stealth Coating Vat | 🛠 Utility | 1 | 1 | Nearby furniture is "off the books" — Charlie ignores it. (2×2) |
| 7 | Prototype Jetpack Dock | 💰 Gold | 1 | 0 | Sells rides to daredevils. Waiver required. |
| 8 | Psi-Ops Isolation Tank | 🔮 Soul | 2 | 1 | Float. Dissolve. Channel. (2×2) |
| 9 | Reverse-Engineering Bay | 🔬 Research | 2 | 2 | Take apart the impossible, learn the possible. (2×2) |
| 10 | Antigravity Test Rig | ⚗️ Research+Build | 3 | 1 | The prototype hovers. So, sometimes, do you. (2×2) |

## Tier 8 — Moonshot Floor

| # | Piece | Role | Eso | Nodes | Note |
|---|-------|------|-----|-------|------|
| 1 | Mission Control Desk | 🔬 Research | 0 | 4 **(bed)** | Wall of screens, wall of nodes. (3×2) |
| 2 | Clean-Room Assembler | 🔧 Build | 0 | 2 | Bunny-suit precision. (2×2) |
| 3 | Venture Fund Vault | 💰 Gold | 0 | 1 | Other people's billions. (2×2) |
| 4 | Fusion Prototype | 🔧 Build | 0 | 1 | Always ten years away; powers the shop anyway. (2×2) |
| 5 | Orbital Comms Array | 🔬 Research | 0 | 3 **(bed)** | Dishes as node beds. (3×2) |
| 6 | Hydroponic Money Tree | 💰 Gold | 1 | 3 **(bed)** | Literally grows cash. Needs a lot of plant nodes. (2×2) |
| 7 | Cryonics Ward | 🛠 Utility | 1 | 1 | Grants a bankable "second wind": bank a lethal-hit save over an hour. (2×2) |
| 8 | Astral Projection Rig | 🔮 Soul | 2 | 0 | Leave your body at your desk; keep earning soul. (2×2) |
| 9 | Dyson Swarm Model | 🔬 Research | 2 | 1 | A working miniature. It is getting warmer in here. (2×2) |
| 10 | Wormhole Prototype | ⚗️ Gold+Research | 3 | 2 | A shortcut to a market that pays in this and the next timeline. (3×2) |

## Tier 9 — The Singularity Lab

| # | Piece | Role | Eso | Nodes | Note |
|---|-------|------|-----|-------|------|
| 1 | Neural-Net Terminal | 🔬 Research | 0 | 3 **(bed)** | It finishes your thoughts. And your nodes. (2×2) |
| 2 | Nanofab Cradle | 🔧 Build | 0 | 2 | Builds molecule by molecule. (2×2) |
| 3 | Autonomous Trading Desk | 💰 Gold | 0 | 1 | Earns while you sleep, wake, and sleep again. (2×2) |
| 4 | Self-Assembling Scaffold | 🔧 Build | 0 | 4 **(bed)** | It builds itself; you just add nodes. (3×2) |
| 5 | Digital Twin Rack | 🔬 Research | 0 | 2 | Simulates the whole office, including you. (2×2) |
| 6 | Attention Economy Engine | 💰 Gold | 1 | 1 | Monetizes the act of looking at it. (2×2) |
| 7 | Uploaded-Intern Server | 🛠 Utility | 1 | 2 **(bed)** | A dead-eyed helper that auto-repairs and auto-collects. (2×2) |
| 8 | Egregore Vat | 🔮 Soul | 2 | 1 | A belief given a body. It believes in overtime. (2×2) |
| 9 | Recursive Idea Foundry | 🔬 Research | 2 | 2 | Research that researches research. (3×2) |
| 10 | Basilisk Shrine | ⚗️ Soul+Gold | 3 | 1 | Pay tribute now; it remembers who helped. (2×2) |

## Tier 10 — Post-Work Reality

| # | Piece | Role | Eso | Nodes | Note |
|---|-------|------|-----|-------|------|
| 1 | Infinite Desk | 💰 Gold | 0 | 5 **(bed)** | It goes on forever. So does the node space. (3×2) |
| 2 | Matter Compiler | 🔧 Build | 0 | 2 | Type an object, receive an object. (2×2) |
| 3 | Post-Scarcity Vault | 💰 Gold | 0 | 1 | Money is a formality now. It still likes you. (2×2) |
| 4 | Labor Abolition Engine | 🔧 Build | 0 | 1 | Builds everything so no one has to. (3×2) |
| 5 | Omniscient Oracle Core | 🔬 Research | 0 | 3 **(bed)** | Knows the answer; makes you host the nodes anyway. (2×2) |
| 6 | Reality Rendering Farm | 🔬 Research | 1 | 2 | Renders next week for early review. (3×2) |
| 7 | Philanthropy Fountain | 💰 Gold | 1 | 4 **(bed)** | Gives money away so hard it comes back. Node fountain. (2×2) |
| 8 | Godhead Terminal | 🔮 Soul | 2 | 1 | Admin access to the soul of the building. (2×2) |
| 9 | Time Machine | ⚗️ Build+Research | 3 | 1 | The generic-to-esoteric journey ends here: undo a mistake, once in a while. (2×2) |
| 10 | The Last Cubicle | ⚗️ Gold+Soul | 3 | 6 **(bed)** | Reality's final workstation — max node bed, half gold + half soul, and a view of the end. (3×2) |

---

## Node-bed distribution (so mods have homes)

Every tier ships **2–3 dedicated node beds** (marked **(bed)**): high slot count,
low intrinsic output, big footprint. They're the pieces you buy *to hold* Desk
Plants / Lamps / Tool Caddies / Bonsai / etc., and they scale the mod economy
without being strong on their own. The 0-node "monoliths" (Vending Machine,
Grant Money Printer, Jetpack Dock, Astral Rig, …) are the opposite: strong flat
output, nothing to mount. Everything else sits in between (1–2 nodes).

## Role tally (rough, across all 100)

- 💰 Gold: ~28
- 🔧 Build: ~22
- 🔬 Research: ~24  → production (build+research) ≈ 46
- 🛠 Utility: ~14
- 🔮 Soul: ~10
- ⚗️ Hybrid: ~10

Utility + soul + hybrid ≈ 34, i.e. gold ≈ production ≈ (utility & special),
which matches the "vaguely equal gold / production / utility" brief with a
deliberate esoteric tail.

## Open questions before implementation

1. **Utility effects need engine hooks.** Several utility pieces imply new
   systems: auto-repair (Mop, Cooling Fan), loot auto-collect (Drone Nest,
   Uploaded Intern), Charlie-ignore aura (Stealth Vat), bankable second-wind
   (Cryonics), faster offline banking (Cryo-Sleep). Each is a small feature —
   worth confirming which you actually want vs. cutting to a plain stat piece.
2. **Node count vs. footprint.** Right now mods mount on a furniture's own
   tiles, so "5 nodes" implies a 2×2/3×2 surface. If you want beds to hold more
   nodes than they have tiles, we'd add an explicit `nodes: N` capacity.
3. **Hybrids** already exist in code (half-and-half, 1.6× cost) but nothing uses
   them yet — this proposal would be their debut.
4. **Volume.** 100 new pieces is a big shop. We could ship tier-by-tier, or
   start with ~3 per tier (one gold, one production, one utility/esoteric) and
   grow.
