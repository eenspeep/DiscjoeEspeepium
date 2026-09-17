# Joe Time — design notes / requested changes

Owner-requested directions to implement in future sessions. Newest first.
These are the source of truth for planned work; read this before picking up
"next feature" tasks.

## 2026-09-17 — Fingerless Gloves (tier-1 gear) — SHIPPED
New tier-1 hands item (`fingerless`, glyph 🧤, costUnit 1.15 → price 1035, the
priciest tier-1 buyable). Equipped, petting Enzo pays +5 instead of +1, via a
new `enzoPet` item field and `enzoPetValue(me)` (max over equipped defs, base 1);
`tryClickEnzo` uses it and the toast shows the real gain. Verified it's the most
expensive tier-1 item and that a pet pays +5 when worn.

## 2026-09-17 — Admin debug "Boost" button — SHIPPED
A HUD button gated to the account username `ianabercrombie` (case-insensitive,
substring). `cheatBoost()` grants 1s of invincibility (reuses `invulnUntil`) +
1s noclip (`noclipUntil`, makes `solid()` pass everything in the collision
check) and +1000¢. Personal-only, so no shared exploit. Hidden for everyone
else. Verified the boost grants gold + invuln + noclip.

## 2026-09-17 — Tired rats can wake when hit (50%) — SHIPPED
Hitting a worn-down (tired/docile) rat now has a 50% chance to startle it awake
— it drops back into hunting mode (attacks reset) instead of taking the blow,
and your weapon still breaks, so finishing a tired rat is a gamble. Active rats
are unaffected. Wired as a `monsterWake` op (syncs through host-authority);
`TUNING.ratWakeChance = 0.5`. World shows a "😾 woke up" toast. Verified ~48%
over 400 hits, woken rats un-tire, active rats never trigger it.

## 2026-09-17 — Joe Levels, multi-adjective names, JAAIME superpowers — SHIPPED
Big content drop.
- **Rat gold** now rolls 600–2500 (was 1–1000). Shielded rats pay 2× (tracked
  with a persistent `armored` flag since the armor drops on the guard hit).
- **Joe Levels from SOUL.** Your total SOUL is your level (`joeLevel`,
  `soulForLevel` — 40 soul for L2, ×1.6 each level, cap 30). Each level past 1
  opens one name-adjective slot.
- **Names are now a growing list.** `me.adjectives` is an array; stats, traits,
  powers and the display name are re-derived from all of them via
  `aggregateAdjs`/`recomputeIdentity` (idempotent). Old single-adjective saves
  migrate (`me.adjectiveWord` → `[word]`). `addAdjective` appends when you have
  an open slot; the HUD **name bar** shows JOEY + each adjective colored by its
  rarity in a scroll strip (truncates, hover/drag to see the rest), plus a Joe
  Level chip that pulses when you can add one. Clicking it opens a LEVEL UP roll
  (3 weighted adjectives, 2 rerolls) — perks stack.
- **JAAIME rarity + superpowers.** New top rarity `jaaime` (weight 1). Powers
  (on/off, wired via `hasPower`): blink (right-click within 10 to teleport),
  aegis (free hourly-recharging shield), ratfear (rats flee you), golden (+50%
  gold), goldrats (rats always drop max), vampiric (+50 soul per kill), magnetic
  (auto-vacuum nearby loot), phase (walk through furniture), shameless (no black
  marks), possessed (2× soul), nimble (jump has no cooldown). JAAIME adjectives:
  BLINKING, BULWARKED, DREADED, GILDED, PROSPEROUS, VAMPIRIC, MAGNETIC, SPECTRAL,
  SHAMELESS, POSSESSED, WEIGHTLESS, and JAAIME (golden+blink). Powers ride in
  presence so peers' ratfear works host-side. Verified headless: levels,
  add-adjective, every power flag, rat gold range + armored 2x + goldrats max,
  golden +50%, aegis block; name bar + level-up render clean.

## 2026-09-17 — Spawn/unstick spread around center (no more stacking) — SHIPPED
Getting wedged at spawn was everyone resolving to the SAME tile: `centerMe` used
a deterministic `freeTileNear(center)`, and the center tile is an Enzo cell, so
every spawn and every unstick landed on the one free tile next to the statue and
players piled up. New `spawnSpot()` picks a free tile in a ring AROUND the center
(never the center itself), randomized, and prefers tiles no other Joey is on, so
people scatter to the ~5 open tiles around Enzo instead of stacking. Verified:
40 spawns all within Chebyshev-1 of center, never on center/Enzo, always
walkable, spread across the free ring.

## 2026-09-17 — Furniture roles: Gold / Build / Research — SHIPPED
Replaced the brain/build/neutral tags (which just scaled income off stats) with
three functional roles, each doing a distinct job:
- **Gold** (was neutral): multiplies your income. Its node-mod surfaces still
  take flat-income nodes, and those flat nodes get multiplied too ("room for
  nodes"). Income is now `(base + gear value + income nodes) × (1 + Σ gold
  furniture % + gear %)`. A gold piece's percentage is its old flat value, so
  numbers stay close (a lone snacktable is still ~+7%). Build/research furniture
  no longer pay any gold.
- **Build** (unchanged tag): adds build power to anyone next to it
  (`buildFurnScale × tier`), so sites and gear finish faster.
- **Research** (was brain): adds RP/s to anyone next to it (`researchScale ×
  tier`).

Specialty is now a clean **2× modifier** on its matching role (not the old +
bonuses), and there are three of them: JOE GOLD, JOE BUILD, JOE BRAIN
(research). Brain/Build stat points keep a small per-point bump on their role
(build stat → build furniture, brain stat → research furniture) so stat
adjectives still matter; gold has no stat, only the 2× from the Gold specialty.
Old saves with `specialty:"brain"` map to research (`specRole`), so nothing
crashes. Shop rows, the furniture inspector, gear tooltips, and furniture tints
(gold = amber) all show the role. Verified: income multiplies and the Gold
specialty doubles it, build/research furniture raise build/research and their
specialties double them, roles resolve, creator shows three cards, no page
errors. Tuning note: high-tier gold reads as a huge % (Espresso Bar = +1300%)
because the old power curve is factorial — accurate, just loud.

## 2026-09-17 — Build completion works off-host + L-desk renders L — SHIPPED
- **Sites never finishing (e.g. the altar "goes over the max and never builds").**
  Completion was gated on `state.isHost`, so a site's progress accrued past its
  work total but never converted to furniture unless you were the authoritative
  host. Now completion is an idempotent `furnDone` op: whoever is standing at a
  site whose progress passed its work emits it, it applies locally at once and
  relays to the host, and `applyOp` no-ops if the furniture already exists (so no
  double-build). Verified a site completes with `isHost=false`.
- **L-desk drew as a 2x2 square.** Its footprint was already L-shaped for
  collision, but the renderer built a filled bounding box. Added `mLDesk`, which
  draws the two arms as separate desk boxes off the corner cell (found as the
  cell orthogonally adjacent to both ends), so it reads as an L at any rotation.
  `drawFurniture` now passes the real occupied `cells` to the art function.

## 2026-09-17 — Stable connection id (duplicate Joeys + selling) — SHIPPED
Two symptoms, one cause. The connection id (`net.myId`) was a fresh `uid()` every
page load. On refresh your old id lingered as a ghost peer (you appeared twice)
AND host election churned: a dead ghost or a second live client could hold/claim
host, so with the new host-ignore guard the two clients split-brained and shared
edits like selling furniture never crossed over. Duplicates appearing at all
confirmed broadcasts now route (the presence removal worked); the bug was
identity, not transport.

Fix: `myId` is now stored in `sessionStorage` (`joetime:netid`), which survives a
refresh in the same tab and is separate per tab. A refresh reuses the id, so the
peer entry is updated in place (no ghost, no duplicate) and election stays put
(one stable host). A second tab or device still gets its own id. Verified with a
two-tab test: refresh keeps the same id and the other client keeps seeing exactly
one peer. With one stable host, the host-authority path (sell = op to host, host
rebroadcasts removal, host ignores inbound full-state) actually converges.

## 2026-09-17 — Host ignores inbound full-state ("sold furniture reappears") — SHIPPED
Selling furniture, then watching it reappear a moment later, is the host
overwriting its own authoritative state from an inbound full-state broadcast.
`onShared` replaced `state.shared` for everyone, host included. So a stale peer
broadcast (or a second client that also thinks it's host, which is the state the
owner reported) resurrects whatever the host just changed. Fix: `onShared` now
early-returns when `state.isHost` — the authority never adopts someone else's
full state. Guests still adopt it. Verified with a two-tab test where both are
forced host: the host ignores the peer's furniture-bearing broadcast, and once
demoted to guest it adopts it. Note this stops resurrection on the *host* side.
A guest whose delete op never reaches the host is still a transport problem, and
the underlying cloud broadcast delivery is the thing that has to be confirmed
(via `?joenet` hbIn, or by swapping the publishable key for the anon JWT).

## 2026-09-17 — Doors anywhere, knife-kill fix, unstick key — SHIPPED
Three requested fixes.

- **Doors work without hallways.** Expansion is free-form tiles now, so hallways
  barely exist. `tryPlaceDoor` dropped the `inHall` gate and now allows any
  walkable floor tile (still blocks void, occupied tiles, and duplicates). The
  build highlight and shop/hint copy updated to match ("any floor tile").

- **Knives now kill players.** The attack round-trip is routed by connection id
  (net.myId), but the outgoing attack stamped `from: me.id` (the profile id). The
  victim replied `attackResult to: from`, which the attacker's inbound filter
  (keyed on connection id) never matched, so the kill confirmation and bounty
  never arrived — the strike looked like it did nothing. Now it stamps
  `from: state.netId`. Also, `receiveAttack` returns the victim's name (captured
  before `killMe` blanks `state.me`) so the kill toast names who died.

- **Unstick key (U).** New `unstick()` warps you to a free tile at the office
  center (always open), for when you wedge yourself against furniture/walls.
  Bound to `U`, added to the `?` help line. Personal-only, no shared change.

## 2026-09-17 — Drop Supabase presence, broadcast-only peers — SHIPPED
After the election fix, the remaining symptom was: on join you see the other
player for a second, nobody moves, then they vanish and you become host. That's
ongoing broadcasts not routing between clients. Presence with the newer
publishable key (`sb_publishable_…`) can throw right after `SUBSCRIBED` and put
the channel in a state where broadcast fan-out stops, so the one initial appear
came from the join event and nothing after it landed (no movement), then the
heartbeat-peer aged out and disappeared.

Fix: cut presence entirely. The channel is now broadcast-only
(`config.broadcast.self=false`), no `presence` key, no `channel.track`, no
presence event handlers, no `presenceState()`. Peers come purely from broadcast
`__hb` heartbeats (each carries position + look), which is all we ever needed.
Every outbound send goes through one `sendMsg` that try/catches and counts
failures into `stats.sendErr`, now shown in the `?joenet` readout, so we can
tell "sends failing" from "sends not arriving." PEER_TTL bumped 6s → 8s.

If this still doesn't route between two machines, the remaining suspect is the
key itself: swap `SUPABASE.anonKey` in config.js for the project's legacy anon
JWT (`eyJ…`, Supabase dashboard → Project Settings → API → Project API keys →
`anon` `public`). The publishable key may not authenticate the Realtime socket
the same way.

## 2026-09-17 — Host election id-space bug ("we're both host") — SHIPPED
The reason two players were both host (and the office desynced / peers flickered
out on refresh): host election compared each **peer's connection id** against
the **local profile id** (`me.id`). Those are two different id spaces. Peers
advertise `net.myId` (a fresh `uid()` per page load), but the election ranked
them against `me.id` (a persistent, unrelated `uid()` from localStorage). So
client A asked "is B's *net* id < A's *profile* id?" while B asked "is A's *net*
id < B's *profile* id?" — four unrelated random strings, which land on both-host
or both-guest about half the time. In `?local=1` it was always broken: two tabs
share one localStorage profile, so `me.id` was identical on both and
`peer.id < me.id` was never true → both host, always.

Fix: elect in one id space. `state.netId = net.myId` is captured in `initState`,
and `electHost` now ranks `peer.id < state.netId` (falling back to `me.id` only
when there's no net id). Lowest connection id wins, computed identically on every
client, so exactly one host. Verified with a two-tab integration test: same
shared profile id, distinct net ids, each sees the other, exactly one host, and
it's the lowest net id. No change to messaging or the `me.id`-keyed shared ops
(contributions, owed, paidBy) — those still use the profile id, correctly.

## 2026-09-17 — Free-form floor expansion (buy one tile at a time) — SHIPPED
Replaced buying a whole room in bulk with claiming floor one square at a time
out of the fog of war, so the office grows into any isometric shape the owner
draws. `shared.tiles` is a `{"gx,gy":1}` map of individually bought tiles,
threaded through `walkableSet`/`isWalkable`/`isProtected`/`floorBounds` so a
bought tile is real floor everywhere (walking, building, camera bounds). A tile
is buyable only if it's **void**, **orthogonally adjacent to existing floor**
(the frontier), and **within your interact range** (`withinReach`) — you stand
at the edge and push the border outward. Price escalates per tile owned
(`tileCost` = `ceil(60 × 1.012^count)`), capped at `maxTiles` (600). Buying is a
shared op (`tile+`/`tile-`) so it syncs through the host-authoritative netcode
and recomputes `shared.floor`. Hold **🧭 Expand Floor** from the Shop's
Expansion section: the fog frontier draws as a faint ring always, lights green
where you can reach, and the hovered tile shows a live cost pill (green =
affordable/in reach, orange = too far). The old bulk "Add Room" shop entry is
gone.

## 2026-09-17 — Host-authoritative netcode (fixes clobbering) — SHIPPED
Root cause of "really fucky": every client wrote the shared office and
broadcast the whole state, so concurrent edits (and per-tick build/research
writes from everyone) clobbered each other constantly.

Now the shared office has **one writer, the host**. Personal state (credits,
inventory, look, kills, pet) stays local. Shared mutations are expressed as
small data **ops** (`applyOp` reduces `{t, ...}` onto a shared object): `site±`,
`furn±/Lvl/Broken`, `mod±`, `wall±`, `door±/Lock`, `rooms`, `owed±`, `contrib`,
`progBy`, `loot+`, `monster-/Guard`, `spawnRat`, `pot*`. `sharedOp` applies the
op locally (optimistic) and, if I'm not the host, relays it as `__op` to the
host; the host applies relayed ops onto the authoritative state and rebroadcasts
(`hostApplyOp`, wired through `main.js` onMessage). `flushShared` is now
host-only. Build-site completion and all sims (monsters, Charlie, pot) run on the
host only; non-hosts just send their contributions/actions and render the host's
broadcast. Every shared mutation function was converted to emit ops instead of
writing `state.shared` directly. On the host and in single-player the behavior is
identical (an op just applies locally), which the parity + regression tests
confirm.

## 2026-09-17 — Fluid shoving (walk into people) — SHIPPED
Removed the E/`doPush` shove action and its help text. Now walking toward
someone in the next tile over shoves them: `updateMe` checks the tile one step
in your movement direction, and if a peer or bot is there, `tryCollidePush`
moves them one tile that way, throttled to once per second per target
(`pushCd`). Bots move locally; peers get the existing `push` net message and
resolve it on their own client. A shove is refused if the destination is a wall,
void, furniture/Enzo, another person, or a locked door — so you can't shove
people into solids. Their tile stays solid to you (no overlap), so you
bump-and-follow.

## 2026-09-17 — Multiplayer perf + look persistence — SHIPPED
Fixes for "super laggy" and "forgets our colors on refresh":
- **Peers by broadcast, cheaply.** Position heartbeats broadcast ~7/s (smooth
  peer movement), full presence.track only ~1/s, room-state upserts coalesced
  to ~2/s. `onPeers` now only calls `notify()` when the peer *roster* changes,
  not on every position tick — the render loop reads positions from `state.peers`
  each frame without a DOM rebuild. `notify()` itself is coalesced to one UI
  refresh per animation frame.
- **Look persistence.** `saveMe` stamps `savedAt`. On login `adoptProfile` keeps
  the local Joey when it's the same created id and not older than the cloud copy,
  so a quick refresh no longer reverts colors to a stale (debounced) cloud save.
  A genuinely newer cloud copy, or a different account, still adopts the cloud.

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
