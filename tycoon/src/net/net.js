// Networking abstraction. The game talks to ONE interface; the adapter behind
// it is either Supabase Realtime (cloud) or BroadcastChannel (local).
//
// connectNet() picks cloud when keys are present, but falls back to local mode
// if the cloud connection can't be established (offline, Supabase down, or the
// ?local=1 override), so the game always opens.

import { SUPABASE, ROOM } from "../config.js";
import { makeLocalNet } from "./local.js";
import { makeSupabaseNet } from "./supabase.js";

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export async function connectNet(myId) {
  const forceLocal = typeof location !== "undefined" && new URLSearchParams(location.search).has("local");
  const useCloud = !forceLocal && !!(SUPABASE.url && SUPABASE.anonKey);

  if (useCloud) {
    try {
      const cloud = makeSupabaseNet(myId, ROOM);
      await withTimeout(cloud.connect(), 8000);
      return cloud;
    } catch (e) {
      console.warn("[joetime] cloud connect failed, using local mode:", e?.message || e);
    }
  }
  const local = makeLocalNet(myId, ROOM);
  await local.connect();
  return local;
}
