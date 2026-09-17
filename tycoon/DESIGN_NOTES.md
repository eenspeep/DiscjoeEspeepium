# Joe Time — design notes / requested changes

Owner-requested directions to implement in future sessions. Newest first.
These are the source of truth for planned work; read this before picking up
"next feature" tasks.

## 2026-09-17 — Garlic Charlie buys gear (no more furniture) — SHIPPED
Charlie no longer drops furniture into the office (that cluttered the room and
annoyed the owner). Instead he periodically buys a random equippable gear item
into `shared.charlie.gear` (slot→type, host-driven). Capacity is
`charlieMaxGear` (4): if the slot is full or he's at capacity he either swaps it
in (the old piece is gone) or tosses the new one — discards just vanish, no
ground clutter. His loadout renders on his body via the sprite gear overlay
(`gearWorn(gear)` → worn art, set on the Charlie bot each frame). Killing him
now drops his actual worn gear as loot (padded with a couple of randoms if he
has fewer than two), and clears his gear; he respawns naked and re-shops. Buy
cadence sped up a little (3–10 min). Removed `charlieMaxFurniture`,
`charlieMaybeBuy`, `charlieFreeTile`.

## 2026-09-17 — Jump + wall decor — SHIPPED
**Jump.** Space (or the Jump button, also for touch) hops the Joey on a short
arc. If the guard is off cooldown the hop also grants `jumpInvulnMs` (1s) of
kill-immunity, then starts a `jumpCooldownMs` (60s) cooldown; hopping while on
cooldown still animates but grants nothing. `receiveAttack`/`receiveMonsterHit`
short-circuit to a harmless dodge while `isInvulnerable()`, checked on the
victim's own client. Jump state (`state.jumpAt`, `invulnUntil`, `jumpCdUntil`)
is ephemeral, not saved. A golden pulsing ring shows during immunity; the sprite
rises via a new `lift` draw option while its shadow stays grounded. A jump also
opens a `jumpPassMs` (700ms) window to glide through **one** furniture/site piece:
`updateMe`'s collision lets you enter a blocked furniture tile mid-jump, locks
`state.jumpPassedKey` to the first piece you land on, and blocks any other piece
(and always Enzo, walls, void, locked doors, people).

**Wall decor.** There is still no gameplay z-axis — height is faked in the
renderer. Wall decor rides on that: pieces hang on a wall edge `(gx,gy,side)`
where `side` is "W" (up-left) or "N" (up-right) and the neighbor across it is
void (same edges `drawBackWalls` draws). Stored in `shared.walls`, placed
instantly (no build site) via a `buildWall` hold-mode that highlights the wall
edge nearest the cursor within reach. `WALL_DECOR` catalog (poster, clock,
dartboard, sconce, painting, wall TV, neon), unlocked by research tier, bought
through a new Shop "Wall Decor" section, sold via a small inspector (`openWall`).
**Cosmetic only for now** — they don't feed income; wiring them into the
adjacency economy is a later step if wanted. Rendered as small framed pieces in
the depth-sorted pass (depth `gx+gy-0.4`, so they sit behind the tile's
occupants).

## 2026-09-17 — Toast de-dupe (no bubble spam) — SHIPPED
`flash()` now keeps one toast per distinct message. A repeat of a message that's
already showing (spam-clicking Enzo for "🐱 Enzo blesses you (+1¢)") shakes the
existing bubble and resets its dismiss timer instead of stacking a new one up
the screen. Different messages still stack as before. Shake is a 0.32s CSS
keyframe (`toast-shake`).

## 2026-09-16 — Cosmetic pass: gear on the body + shaped furniture — SHIPPED
Two visual upgrades.

**Gear shows on your Joey.** The equipped-gear vector art (hats, glasses,
nose gear, torso plate, hand item, a shield on the arm, a weapon in hand) was
extracted from the procedural Joey into shared `paintTorsoGear` / `paintFaceGear`
passes, and is now layered over the `joey.png` sprite too, not just the vector
fallback. `drawJoeySprite` takes `worn` and paints gear in a frame mapped onto
the sprite (`GEAR_SCALE` 1.16, feet anchor 11 — tune those two if a future
sprite has different proportions). Peers carry their gear through presence
(`worn`), so you see everyone's loadout.

**Furniture looks like the thing.** Replaced the "colored cube + emoji" with
shaped isometric models in `world.js` (`FURN_ART` maps each type to a drawer;
`box`/`posts`/`panel` primitives build them). Archetypes: tables with legs +
a topper (pizza / net+paddles / espresso machine), a chair with a backrest,
desks with drawer seams, monitor desks, a tool chest, whiteboards as upright
panels on posts with scribbles, a water cooler with a blue jug, server racks
with rack-unit slots + blinking LEDs, machines with a spinning gear / robot arm /
glowing core, a stepped altar and a tall obelisk with a pulsing gem, and a
run-down rat motel with a pitched roof. Body height scales with footprint area
(`tall`) so 2×2 machines aren't slabs. Glyph only remains as a fallback for
unmodeled types (`genericBox`). "In use" now shows a green ground ring and
selection a white one (decoupled from object height); level/⚠️/mod glyphs sit
above the modeled top (`furnTopH`). Construction sites keep the ghost prism.

## 2026-09-16 — Rat leash (recruit a tired rat as a buddy) — SHIPPED
Buy a **Rat Leash** (tier-2 gear, weapon slot) and equip it. Face a **tired**
rat (the spinning-💫 kind) within interact range and press **Q**: instead of
attacking, you leash it. The rat leaves `shared.monsters` and rides on your
personal save as `me.pet`. Because the leash fills the weapon slot, you can hold
**one rat at a time** and can't also hold a weapon.

The buddy stays **as long as the leash is in your hand** (no timer — the hand
slot is the whole cost). Put the leash away or swap to a weapon and the rat
wanders off (`petActive` = `me.pet && hasLeash`). While active it:
- multiplies your **soul channeling ×1.2** (`TUNING.petSoulMult`, applied in
  `soulRate`),
- acts as **one extra piece of armor**: it eats the next hit that lands on you
  (player attack *or* monster hit), before any shield, then scurries off.

HUD shows a 🐀 buddy chip; a small rat trots at your feet (and at peers' feet via
a `pet` flag in presence). Nothing about the leash needs the host — recruit
mutates shared like `hitMonster` does, and the armor is personal-state.

## 2026-09-16 — Rats + Rat King (monsters) — SHIPPED
Monsters live in `shared.monsters`, host-simulated (`monsterTick`). They walk to
the nearest player or furniture and attack once/sec. After 3 attacks a rat
**tires**: it stops attacking, shows a spinning 💫, and wanders slowly (it does
not despawn — you can still kill it). Furniture hit goes **broken** (grays out, earns nothing, ⚠️) until
repaired for `repairCost` = ½ base + ½ of every upgrade paid. A player hit loses
their lowest shield, or dies if unarmored (relayed to remote peers via a
`monsterHit` message, same trust model as PvP). Rats can't attack doors and are
blocked by locked doors.

Spawns: **Rat Egg** (instant shop buy → one rat by you) and **Rat Motel**
(tier-3 furniture, spawns `level` rats every 10 min; upgrade for more). Rats are
killable with a weapon (Q); they rarely spawn wearing a shield that absorbs a
hit and drops as loot. A rat drops 1–1000 coins to its killer.

Cap: only 10 rats alive — the 11th makes the swarm **coalesce into a Rat King**
(guard 5, so 6 weapon hits to kill; drops 800–6000 coins). The king breaks your
2 lowest shields per hit, or kills you with fewer than 2. Balance knobs are in
TUNING (`rat*`, `king*`). Non-host peers see monster movement synced ~2×/sec.

## 2026-09-16 — Shop menu + place-in-hand (hotbar removed) — SHIPPED
Replaced the long bottom build-hotbar with a **Shop panel** (🛒 button in the
HUD). Everything buyable lives there now: furniture grouped by research tier,
node mods, doors, and Add Room. Picking an item puts it "in your hands" and
closes the shop; the bottom bar becomes a slim "Holding: X · Put away" chip.
You then click a tile to place it, and placement is gated to **interact range**
(`withinReach`), with every reachable tile shaded blue while you hold something.
You stay in place mode after each drop (buy/place several in a row); Esc or
"Put away" clears your hands. Add Room is still instant; furniture/mods/doors are
place-in-hand. Reach is `interactRange(me)` (base 1, extended by the interact
trait), so you now have to walk to where you're building.

## 2026-09-16 — Visible progress bars + mobile + in-game zoom — SHIPPED
- **Research + soul progress bars** in the HUD (under the chips). `tierProgress`
  and `esoProgress` give fill within the current tier/level; the bar shows the
  live have/need and, when you're actually adjacent to BRAIN furniture / an
  altar, a pulsing fill and a "+x/s" rate so you can see it move.
- **Mobile layout**: the HUD wraps so the top-right buttons never get cut off,
  chips wrap, buttons/coin shrink, build bar still scrolls. Verified at 390px.
- **In-game zoom**: pinch-to-zoom + one-finger tap-to-act on touch (canvas
  `touch-action: none`), plus on-screen +/− buttons for desktop too. Zoom range
  widened to 0.5–2.6. Tap-to-act makes the game playable on a phone (no keyboard
  WASD); the E/Q/R actions are still keyboard-only for now.

## 2026-09-16 — Pixel Joey sprite + Enzo statue — SHIPPED (art pending)
Optional pixel sprites: if `tycoon/sprites/joey.png` exists, Joeys render from it
instead of the procedural drawing, with a **palette swap** (mustache `#CC420D` →
picked mustache color, shirt `#299212` → picked shirt color, cached per combo)
and a **squash-and-stretch** as they walk. Missing file → procedural fallback,
so nothing breaks. Node/tests are guarded (no Image/document). Tradeoff: the flat
sprite does not draw equipped gear overlays (weapons/shields/hats) that the
procedural Joey shows — revisit with gear sprites or glyphs if wanted.

**Enzo the Cat statue:** an indestructible 2x2 object locked to the main room's
centre (`enzoAnchor`/`enzoCells`). Its tiles are in `blockedTiles` so nobody can
build on it or walk through it, and it can't be sold. Click it for **+1¢**
(`tryClickEnzo`, personal wallet only, no shared write) with a little pulse and
"+1¢" floater. Renders from `sprites/enzo.png`, or a gray-pedestal placeholder
until that art lands. Starter furniture moved off-centre to clear it.

## 2026-09-16 — Paper-white skin + color-picker look — SHIPPED
Every Joey now has fixed paper-white skin (`PAPER_WHITE`), with a faint head
outline so it reads on light or transparent backgrounds. Skin is no longer
selectable. The only look choices are **mustache** and **shirt**, now driven by
open `<input type="color">` pickers (any hex) instead of fixed swatches, in both
the creator and the Locker. The `look` model changed from swatch ids to stored
hex colors; `normalizeLook` coerces old/invalid saves to defaults. The creator
preview sits on a checkerboard to show the transparent background (the Joey is
painted with no white box behind it). `lookFromSeed` (Charlie/ambient) returns
hex colors from a small palette.

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
