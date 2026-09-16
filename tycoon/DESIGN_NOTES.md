# Joe Time — design notes / requested changes

Owner-requested directions to implement in future sessions. Newest first.
These are the source of truth for planned work; read this before picking up
"next feature" tasks.

## 2026-09-16 — Protected rooms + refund-to-buyer — SHIPPED
Every office room (main + each added room) carries a `protected: true` flag, and
hallways count as protected too. In a protected tile, ANYONE can sell a piece of
furniture (not just its builders), and the refund goes back to whoever **paid**
for it, not the seller. Non-protected tiles (future private rooms behind locked
doors) keep the old builder-only sell rule with the refund going to the seller.

Mechanics: furniture now records `paidBy` (the player who spent the credits to
start its build site). On a cross-owner sale the refund is parked in a shared
`owed` ledger keyed by player id, and that player's own client claims it on its
next tick (so it survives them being offline). Refund for someone else uses the
base 40% rate, a self-sale still uses the seller's refund trait. Refunds owed to
Garlic Charlie or to unknown payers fall back to the seller so no gold is lost.
`cancelSite` follows the same routing. Verified headless (19 assertions).

## 2026-09-16 — Account gate + trait-rich adjectives — SHIPPED
Building a Joey now requires an account (when Supabase auth is configured — the
creator's step 1 gates "Start" on login; local builds without Supabase bypass
it). Name rerolls are capped at 3.

Adjectives became a full **trait** system (`TRAITS` in economy.js). Each adjective
grants one or more traits at an integer level (build 1/2/3 = stronger), and
adjectives carry a **rarity** (common/uncommon/rare/legendary) that weights how
often they roll and how strong they are. 20 trait dimensions, wired to real
mechanics:
- build speed, research speed, praying speed, income, offline earning
- melee range, interact range, build aura (build reach), move speed, size (rare, ±)
- starting money, shop discount, refunds, bag size (extra columns), weapon durability
- esoteric affinity (lower soul thresholds), research weight (contribution ×),
  forgiveness (extra guilt-free kills), kill bounty, scavenging (loot duplication)

~40 adjectives span these (e.g. JOEY HERCULEAN = build 3; JOEY MONASTIC = pray 2
+ eso 2; JOEY OVERLORD legendary = income 3 + build 2 + speed 1; JOEY GIGANTIC =
size 2 + melee 1). Active traits show as chips in the Locker; the creator shows
each name's rarity + full trait list. Old `me.buffs` (incomeMult/speedMult) is
replaced by `me.traits`; the ME_KEY reset already clears stale saves.

## 2026-09-16 — Combat + Garlic Charlie — SHIPPED
Attacks are instant kills at melee range, so fleeing works. **Q** swings your
equipped **weapon** (you can only attack with one in the hand slot); the tier-1
**Knife** breaks after one swing, kill or miss. Higher tiers (Machete, Katana)
last more swings. **Shields** are gear that occupy a normal slot (tier 1 = torso,
each higher tier opens a shield for another slot). A shield eats one lethal hit
and the **lowest-value** one shatters, so stacking shields = more hits absorbed.

On death an entity **drops all its gear** as a ground pile (📦, click to grab
what fits); **coins go straight to the killer**. **Players don't respawn** — you
remake your Joey (gear stays on the floor for others). Every kill adds a **black
mark**: the first is a free warning, each one after eats a bag slot, and marks
can exceed your bag size (a bigger bag just reveals more) so you can't bag your
way out. Kills also nudge `soulMult`. A buyable **Church of the Cat God Enzo**
for forgiveness is still TODO — for now marks are permanent.

All ambient bots are gone except **Garlic Charlie**: one wanderer (🧄) who
donates a trickle to the team pot (his "10%"), votes arbitrarily, buys the odd
cheap piece of furniture at far-apart intervals, and **respawns once an hour**
after someone guts him for a coin bounty + loot. His pot donation, voting,
buying, and respawn are host-driven so they happen once.

Multiplayer combat is trust-based like the rest: attacks and kills are relayed
peer-to-peer (`attack`/`attackResult` messages), the victim's own client
resolves shield-vs-death and reports coins back. Not griefing-hardened yet (no
cooldown, cost floor, or safe zone beyond the weapon-breaks-per-hit economy).

## 2026-09-16 — Rooms + lockable doors — SHIPPED
The office is no longer a grow-a-rectangle. It's a set of rectangular rooms
joined by 1-wide hallways. **Add Room** (build bar) spends a factorially-growing
fee (`roomCost` × `roomGrowth`ⁿ, capped at `maxRooms`) and drops the next side
room + connecting corridor along one of four arms (E/S/W/N), so every hallway is
a straight run. Walkable = union of room + hall cells; everything else is void,
and rooms render enclosed with low back walls. Movement, spawn, NPC wander,
furniture placement, and shove-target all respect walkability now.

**Doors** unlock at research **Tier `doorTier` (3)**. Buy one (`doorCost`) and
click a hallway tile to install it. The owner can **password-lock** it for an
expensive `lockCost`; passwords are stored only as a non-crypto hash (trust
model, same as the rest of multiplayer). A locked door blocks everyone except
the owner and anyone who has entered the password this session (client-side
`unlockDoorLocal`). Owners can unlock (free) or remove (partial refund). Locked
doors render colored + 🔒; unlocked/open render gray + 🚪/🔓.

## 2026-09-16 — Shapes, rotation, node mods — SHIPPED
Arbitrary (cell-list) furniture footprints incl. an L-Desk, rendered as a real
extruded shape; **R** rotates a piece through 4 orientations while placing.
**Node mods** mount on surface furniture tiles (one per tile): plant → flat
income, lamp → flat research, tool → flat build, in basic/advanced/exotic tiers.
Mods are FLAT only (magnitude scales with the mod's own tier) and apply while
you're adjacent to the host furniture.

OPEN / owner to confirm: furniture should provide the **multipliers** (tier +
upgrade) while mods stay flat. Furniture currently gives flat income that scales
factorially by tier+upgrade (additive, not a true ×multiplier). Converting to
literal multiplicative furniture is a separate rebalance that would redo the
15-min/5-min calibration — pending the owner's go-ahead.

## 2026-09-15 — Owner directives (deferred, implement when we return)

### 1. Shop = 10 tiers, factorial scaling (MOST IMPORTANT) — SHIPPED 2026-09-16
Implemented: 10 research tiers (named Supply Closet … Post-Work Reality), whole
tiers unlock via research, no per-item locks (locked tiers show as roadmap
headers, next tier shows RP progress), price + usefulness scale factorially
(t!), items get more esoteric each tier. Calibration: base furniture = 900¢ =
~15 min at 1¢/s; four tier-3 items adjacent ≈ 3× = ~5 min. Note the
constant-payoff property (cost and value both scale by t!, so raw payback time
per item is roughly constant across tiers; acceleration comes from stacking
items, gear multipliers, the pot buff, and research). Original request kept
below for reference.

**Esotericism / SOUL axis — SHIPPED 2026-09-16.** Added a second, horizontal
unlock axis. Vertical = research tier (shared). Horizontal = esotericism level
(Mundane → Curious → Uncanny → Eldritch), gated by personal SOUL. SOUL is
channeled by standing at Esoteric Altars (basic altar is slow by design; an
Obsidian Obelisk is stronger), boosted by soul gear (Candle Hat, Ouija Pendant,
Ritual Robes) and a `me.soulMult` hook the combat patch will raise via kills.
Grounded items stay Eso 0 (research-gated only); the weird ones (Third Eye,
Time-Dilation Watch, Neural Lace, Sentient Necktie, Infinity Briefcase, etc.)
sit at Eso 1–3 and show a per-item soul lock inside their unlocked tier.


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

### 3. Furniture footprints + collision — SHIPPED 2026-09-16
Rectangular per-type footprints (1×1 up to 3×2); furniture + construction sites
are solid, movement uses axis-separated wall-sliding, spawn avoids furniture,
and income/research/soul/build adjacency all use footprint edges. (L-shaped
furniture footprints skipped for now to keep rendering a single iso box.)

### 4. Player collision + push-to-shove — SHIPPED 2026-09-16
Entities can't share a tile (collision blocks it). Press **E** to shove the
nearest adjacent person one tile away: bots move locally, real peers get a
networked "push" message (added `send`/`onMessage` to both net adapters) that
their own client applies. Peer push is only lightly tested (needs two live
clients).

### 5. Still queued from the earlier feature batch
- **Rooms + lockable doors** — SHIPPED 2026-09-16 (see top of file).
- **Combat + Garlic Charlie** — SHIPPED 2026-09-16 (see top of file). Deferred
  bits from the original ask: a forgiveness mechanic (church of the Cat God Enzo
  / benadryl) to clear black marks, more bots as the office scales, and real
  griefing guardrails (cooldown, cost floor, safe zone, opt-in PvP).
