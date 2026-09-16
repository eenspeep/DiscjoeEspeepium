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
// Bumped to -02 to abandon the test-scarred shared room and start fresh.
export const ROOM = "joetime-02";

// Per-browser save key. Bump the suffix to force a clean slate on a breaking
// change to the personal save shape (or to wipe test junk). v3 = post-combat reset.
export const ME_KEY = "joetime:me:v3";

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
  charlieBuyMinMs: 6 * 60 * 1000,       // random, far-apart furniture buys
  charlieBuyMaxMs: 18 * 60 * 1000,
  charlieMaxFurniture: 40,              // stop Charlie buying once the office is this full
  charlieBountyMult: 60,                // coins the killer takes = this × current tier
  killSoulMult: 0.1,                    // each kill nudges your soul channeling (sin fuels it)
};

export const CHARLIE_ID = "garlic-charlie";

export const ECON_TICK_MS = 250;
