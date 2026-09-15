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
export const ROOM = "joetime-01";

// Per-browser save key. Bump the suffix to force a clean slate on a breaking
// change to the personal save shape.
export const ME_KEY = "joetime:me:v1";

// Economy + world tunables. Pure numbers, safe to tweak.
export const TUNING = {
  baseIncome: 1.0,            // c/s every Joey earns before any buffs
  statItemScale: 0.12,        // each BRAIN/BUILD point multiplies matching item value
  statFlat: 0.05,             // each stat point also adds this many c/s directly
  specialtyItemBonus: 0.20,   // your specialty makes matching-tag items +20% effective
  adjacencyRange: 1,          // Chebyshev tiles: you "use" furniture within this range

  startCredits: 25,
  offlineCapHours: 8,         // idle income (base + gear only) accrues while away

  startFloor: { w: 9, h: 9 },
  maxFloor: 26,
  floorExpandCost: 400,
  floorExpandGrowth: 2.3,

  walkSpeed: 3.2,             // tiles/sec, before any speed buff

  // Team pot
  potInterestPerHour: 0.02,  // compounding while the week is "growing" (~28x/week)
  weekMs: 7 * 24 * 3600 * 1000,
  voteGraceMs: 48 * 3600 * 1000, // after week end, resolve even if not everyone voted

  heartbeatMs: 1000,
  peerTimeoutMs: 4000,
};

export const ECON_TICK_MS = 250;
