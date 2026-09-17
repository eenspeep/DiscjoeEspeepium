// ---------------------------------------------------------------------------
// JOE TIME — configuration
//
// Edit THIS file to turn on real cross-device multiplayer. Leave the keys blank
// and the game runs in LOCAL mode (saves to your browser, multiplayer across
// tabs). Paste a Supabase URL + publishable key to make the shared room real.
// See tycoon/README.md and tycoon/supabase/schema.sql.
// ---------------------------------------------------------------------------

export const SUPABASE = {
  url: "https://cmtxhsevbkrdtirxwpir.supabase.co",
  // Client-safe "publishable" (anon/public) key, guarded by RLS. Never the
  // service_role / secret key.
  anonKey: "sb_publishable_Tfe07P7ls2NLk67gRpQB-g_98KuUwCE",
};

// Everyone using the same room shares one office, furniture, and team pot.
// Bumped to -03 for a full reset (fresh shared office).
export const ROOM = "joetime-03";

// Per-browser save key. Bump the suffix to force a clean slate on a breaking
// change to the personal save shape (or to wipe test junk). v4 = full reset.
export const ME_KEY = "joetime:me:v4";

// Economy + world tunables. Pure numbers, safe to tweak.
export const TUNING = {
  baseIncome: 1.0,            // c/s every Joey earns before any buffs (exact, for calibration)
  statItemScale: 0.12,        // each BRAIN/BUILD point multiplies matching item value
  statFlat: 0,                // base is exactly 1/s; stats help via item scaling, not flat
  specialtyItemBonus: 0.20,   // your specialty makes matching-tag items +20% effective
  adjacencyRange: 1,          // Chebyshev tiles: you "use" furniture within this range

  startCredits: 25,
  offlineCapHours: 8,         // idle income (base + gear only) accrues while away

  startFloor: { w: 9, h: 9 },   // the main room's size
  rooms: { size: 5, gap: 3 },   // side-room interior size + hallway length
  roomCost: 800,                // first side room
  roomGrowth: 1.55,             // each subsequent room costs this much more
  maxRooms: 16,

  // Free-form expansion: buy floor one tile at a time out of the fog.
  tileCost: 60,                 // price of your next floor tile
  tileGrowth: 1.012,            // each tile you own nudges the next one's price up
  maxTiles: 600,                // total bought tiles cap

  // Doors + password locks (gated behind research). Locks are expensive.
  doorTier: 3,
  doorCost: 500,
  lockCost: 6000,

  walkSpeed: 3.2,             // tiles/sec, before any speed buff

  // BUILD: how fast you do "work" on build jobs (furniture sites + gear queue).
  baseBuild: 1.0,            // work/sec floor for any Joey
  buildScale: 0.5,           // extra work/sec per BUILD point
  // BRAIN: research points earned per second per unit of adjacent BRAIN
  // furniture value, times (1 + brain * researchStatBonus).
  researchScale: 0.2,        // RP/sec per adjacent BRAIN-furniture tier
  researchStatBonus: 0.10,
  buildFurnScale: 0.15,      // build-power per adjacent BUILD-furniture (tier-weighted, x2 with the Build specialty)
  soulScale: 0.15,           // SOUL/sec per unit of adjacent altar "soul" (before gear/kill mult)
  // Cumulative room research needed to reach each tier (index = tier).
  researchTiers: [0, 150, 600, 2000, 6000],

  // Team pot
  potInterestPerHour: 0.02,  // compounding while the week is "growing" (~28x/week)
  weekMs: 7 * 24 * 3600 * 1000,
  voteGraceMs: 48 * 3600 * 1000, // after week end, resolve even if not everyone voted

  heartbeatMs: 1000,
  peerTimeoutMs: 4000,

  // Combat + Garlic Charlie
  attackRange: 1.55,                    // must be this close (diagonal-adjacent) to strike
  charlieDonatePerSec: 0.25,            // Charlie funnels this into the team pot (his "10%")
  charlieRespawnMs: 60 * 60 * 1000,     // he comes back once an hour
  charlieBuyMinMs: 3 * 60 * 1000,       // random, far-apart gear buys
  charlieBuyMaxMs: 10 * 60 * 1000,
  charlieMaxGear: 4,                     // he only wears this many pieces; extras get tossed/swapped
  charlieBountyMult: 60,                // coins the killer takes = this × current tier
  killSoulMult: 0.1,                    // each kill nudges your soul channeling (sin fuels it)

  // Rats + monsters
  ratEggCost: 350,                      // instant-use egg spawns one rat
  ratSpawnMs: 10 * 60 * 1000,           // Rat Motel spawns level-many rats this often
  ratMaxAlive: 10,                      // >10 rats coalesce into a Rat King
  ratAttacks: 3,                        // a rat tires (despawns) after this many attacks
  ratAttackMs: 1000,                    // one attack per second
  ratSpeed: 2.2,                        // tiles/sec
  ratArmorChance: 0.06,                 // rare chance a rat spawns wearing a shield
  ratCoinMin: 1, ratCoinMax: 1000,      // coins a rat drops to its killer
  kingGuard: 5,                         // hits to kill the Rat King
  kingCoinMin: 800, kingCoinMax: 6000,  // coins the Rat King drops
  petSoulMult: 1.2,                     // a rat buddy multiplies your soul channeling

  // Jump: cosmetic hop that grants a brief window of kill-immunity, then a cooldown
  jumpInvulnMs: 1000,                   // you can't be killed for this long after a jump
  jumpCooldownMs: 60 * 1000,           // the immunity only triggers once per this window
  jumpArcMs: 520,                      // how long the hop animation lasts
  jumpArcPx: 18,                       // peak hop height in design px
  jumpPassMs: 700,                     // window to glide through one furniture piece
};

export const CHARLIE_ID = "garlic-charlie";

export const ECON_TICK_MS = 250;
