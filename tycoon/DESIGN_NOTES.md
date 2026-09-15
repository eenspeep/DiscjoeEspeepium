# Joe Time — design notes / requested changes

Owner-requested directions to implement in future sessions. Newest first.
These are the source of truth for planned work; read this before picking up
"next feature" tasks.

## 2026-09-15 — Owner directives (deferred, implement when we return)

### 1. Shop = 10 tiers, factorial scaling (MOST IMPORTANT)
Replace the current model of researching / locking **individual items**. The shop
should instead be organized into **10 tiers**.

- Research unlocks **whole tiers**, not individual items. Do **not** show
  scattered per-item locked rows — group the shop by tier and reveal a tier once
  it is unlocked (with the next locked tier teased).
- Each tier increases **factorially** in both **price and usefulness** (i.e. each
  tier is dramatically more expensive AND dramatically more powerful than the
  one before — think factorial/steep-geometric growth, not linear).
- Items should get **more esoteric and offer more interesting options** at each
  higher tier (not just bigger numbers — weirder, more distinctive effects).
- Ten tiers total. Needs a real content pass: ~a handful of items per tier,
  escalating in flavor and mechanics.

This supersedes the per-item `ITEM_TIER` / `FURNITURE_BUILD.tier` locking UI added
in the BRAIN/BUILD patch. Keep research as the unlock driver; change the
granularity to tiers and the presentation to grouped tiers.

### 2. Economy calibration targets (tune the numbers to hit these)
- **Base finances** (a fresh Joey, pure idle, no furniture adjacency) should
  afford **a piece of furniture after ~15 minutes** of idling.
- Standing **adjacent to 4 tier-3 items** should cut that to **~5 minutes**.
- "The math needs to work out." Derived constraints to satisfy:
  - entry furniture cost ≈ 15 min × base earn rate (≈ 900 × base ¢/s).
  - four adjacent tier-3 items ≈ **~3× effective earn rate** vs base (900s → 300s).
  - This implies a significant rebalance of base income, furniture costs, and
    tier-3 item values together. Do this pass **against the new 10-tier system**
    (tier-3 here means the new shop tiers), so schedule it after / with item #1.

### 3. Furniture footprints + collision
- Furniture should occupy **more than one tile** depending on the piece
  (per-type footprint, e.g. 1×1, 2×1, 2×2, L-shapes).
- **No walking through furniture** — its footprint tiles are solid; movement and
  pathing must collide with them.
- Update every adjacency-based system (furniture "using"/income, BRAIN research
  generation, BUILD construction sites) to work against the **footprint edges**,
  not a single tile.

### 4. Player collision + push-to-shove
- Two players (or a player and a bot) **cannot occupy the same tile**.
- You can **interact with an adjacent person to push them one tile** into an
  adjacent square (from you, away). Needs a networked "push" action in the
  trust-based model.

### 5. Still queued from the earlier feature batch
- **Rooms + lockable doors**: expansions become small side-rooms joined by
  hallways; buyable password-locked doors. (Superseded the plain 1-tile expand.)
- **Combat + Garlic Charlie**: single wandering bot (invests 10%, votes
  randomly); buyable knife that instakills a player/bot; you take their whole
  inventory, the rest drops to the floor to grab; killing adds an immovable
  **black mark** to your bag that overflows into gear slots (feet → up) when the
  bag is full; **benadryl** (expensive) removes one; more bots every 10
  expansions. Discuss **griefing guardrails** before building (cost/cooldown/
  safe zone / opt-in PvP).
