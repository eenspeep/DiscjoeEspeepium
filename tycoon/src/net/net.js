// Networking abstraction. The rest of the game talks to ONE interface and does
// not care whether state travels over BroadcastChannel (local mode) or Supabase
// Realtime (cloud mode). Swapping backends = swapping the adapter here.
//
// Adapter contract:
//   mode            "local" | "cloud"
//   myId            stable id for this client/session
//   connect()       -> Promise, resolves when ready
//   getInitialShared() -> Promise<shared|null>   the current shared state, if any
//   pushShared(shared)                          publish authoritative shared state
//   onShared(cb)    cb(shared) whenever a remote shared update arrives
//   setPresence(p)  publish my {name, appearance, x, y, tx, ty, facing}
//   onPeers(cb)     cb(peers[]) whenever the set/positions of OTHER players change

import { SUPABASE, ROOM } from "../config.js";
import { makeLocalNet } from "./local.js";
import { makeSupabaseNet } from "./supabase.js";

export function createNet(myId) {
  const useCloud = !!(SUPABASE.url && SUPABASE.anonKey);
  return useCloud ? makeSupabaseNet(myId, ROOM) : makeLocalNet(myId, ROOM);
}
