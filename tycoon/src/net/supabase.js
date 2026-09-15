// Cloud adapter: a genuinely shared workplace across people and devices, on
// Supabase Realtime (presence for avatars) + a `rooms` table (the shared build
// and credits). Turns on automatically when config.js has url + anonKey.
//
// NOTE: this path needs a live Supabase project to exercise. The SQL to create
// the table and its Row Level Security policy is in tycoon/supabase/schema.sql,
// and the setup steps are in tycoon/README.md. The client library is loaded
// from a CDN at runtime so the game keeps its no-build, static-hosting nature.

import { SUPABASE } from "../config.js";
import { now } from "../util.js";

const CDN = "https://esm.sh/@supabase/supabase-js@2";

export function makeSupabaseNet(myId, room) {
  let client = null;
  let channel = null;
  let sharedCb = () => {};
  let peersCb = () => {};
  let myPresence = null;
  let lastPresenceSent = 0;

  function emitPeers() {
    if (!channel) return;
    const state = channel.presenceState(); // { key: [meta, ...] }
    const arr = [];
    for (const metas of Object.values(state)) {
      for (const m of metas) {
        if (m.id && m.id !== myId) arr.push(m);
      }
    }
    peersCb(arr);
  }

  return {
    mode: "cloud",
    myId,
    room,

    async connect() {
      const { createClient } = await import(/* @vite-ignore */ CDN);
      client = createClient(SUPABASE.url, SUPABASE.anonKey, {
        realtime: { params: { eventsPerSecond: 10 } },
      });

      channel = client.channel(`room:${room}`, {
        config: { presence: { key: myId } },
      });

      channel
        .on("presence", { event: "sync" }, emitPeers)
        .on("presence", { event: "join" }, emitPeers)
        .on("presence", { event: "leave" }, emitPeers)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room}` },
          (payload) => {
            const st = payload.new && payload.new.state;
            if (st) sharedCb(st);
          }
        );

      await new Promise((resolve) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (myPresence) channel.track(myPresence);
            resolve();
          }
        });
      });
    },

    async getInitialShared() {
      try {
        const { data, error } = await client
          .from("rooms").select("state").eq("id", room).maybeSingle();
        if (error) { console.warn("[deskovania] room fetch:", error.message); return null; }
        return data ? data.state : null;
      } catch (e) {
        console.warn("[deskovania] room fetch failed:", e);
        return null;
      }
    },

    pushShared(shared) {
      if (!client) return;
      client.from("rooms")
        .upsert({ id: room, state: shared, updated_at: new Date().toISOString() })
        .then(({ error }) => { if (error) console.warn("[deskovania] room save:", error.message); });
    },

    onShared(cb) { sharedCb = cb; },

    setPresence(p) {
      myPresence = { id: myId, ...p };
      const t = now();
      // throttle: presence.track is cheap but no need to spam every frame
      if (channel && t - lastPresenceSent > 120) {
        lastPresenceSent = t;
        channel.track(myPresence);
      }
    },

    onPeers(cb) { peersCb = cb; },
  };
}
