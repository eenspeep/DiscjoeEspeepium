// ---------------------------------------------------------------------------
// Deskovania — configuration
//
// This is the ONE file you edit to turn on real, cross-device multiplayer.
// Leave the keys blank and the game runs in LOCAL mode: it still works, saves
// to your browser, and is even multiplayer across browser tabs on this machine
// (open the page twice and you will see each other move). To make the shared
// workplace real across people and devices, create a free Supabase project and
// paste its URL and anon (public) key below. See tycoon/README.md and
// tycoon/supabase/schema.sql for the two-minute setup.
// ---------------------------------------------------------------------------

export const SUPABASE = {
  // e.g. "https://abcdefgh.supabase.co"
  url: "",
  // The "anon" / public key. Safe to ship in a static page: it is guarded by
  // Row Level Security (see schema.sql). Do NOT paste the service_role key.
  anonKey: "",
};

// Which shared workplace to join. Everyone using the same room string shares
// the same office, credits, and build. Change it to run a private one.
export const ROOM = "office-01";

// Economy + world tunables. Safe to tweak; they are pure numbers.
export const TUNING = {
  // Starting shared floor size (tiles). The floor grows as you buy expansions.
  startFloor: { w: 8, h: 8 },
  maxFloor: 24,
  floorExpandCost: 500,        // cost to push the floor out by one ring
  floorExpandGrowth: 2.4,      // each expansion costs this much more

  startCredits: 50,
  offlineCapHours: 8,          // idle income keeps accruing while away, up to this

  // How fast avatars walk, in tiles per second.
  walkSpeed: 3.2,

  // Presence heartbeat (ms) for local cross-tab multiplayer.
  heartbeatMs: 1000,
  peerTimeoutMs: 4000,
};

// Cosmetic tick: the render loop targets 60fps but the economy only needs to
// be recomputed a few times a second.
export const ECON_TICK_MS = 250;
