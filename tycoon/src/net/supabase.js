// Cloud adapter: a genuinely shared workplace across people and devices, on
// Supabase Realtime (presence for avatars) + a `rooms` table (the shared build
// and credits). Turns on automatically when config.js has url + anonKey.
//
// NOTE: this path needs a live Supabase project to exercise. The SQL to create
// the table and its Row Level Security policy is in tycoon/supabase/schema.sql,
// and the setup steps are in tycoon/README.md. The client library is loaded
// from a CDN at runtime so the game keeps its no-build, static-hosting nature.

import { getSupabase } from "./supaClient.js";
import { now } from "../util.js";

export function makeSupabaseNet(myId, room) {
  let client = null;
  let channel = null;
  let sharedCb = () => {};
  let peersCb = () => {};
  let msgCb = () => {};
  let myPresence = null;
  let lastPresenceSent = 0;
  const hbPeers = new Map();   // id -> { meta, t } from broadcast heartbeats
  const PEER_TTL = 6000;

  const DBG = typeof location !== "undefined" && /joenet|debug/i.test(location.search + location.hash);
  function log(...a) { if (DBG) console.info("[joenet]", ...a); }

  // Peers come from two sources unioned: Supabase presence (when it works) and
  // our own broadcast heartbeats (which work whenever plain messages do). Either
  // one alone is enough to see other players.
  function emitPeers() {
    const map = new Map();
    if (channel) {
      const st = channel.presenceState();
      for (const metas of Object.values(st)) for (const m of metas) if (m.id && m.id !== myId) map.set(m.id, m);
    }
    const cutoff = now() - PEER_TTL;
    for (const [id, e] of hbPeers) { if (e.t < cutoff) hbPeers.delete(id); else if (id !== myId) map.set(id, e.meta); }
    const arr = [...map.values()];
    log("peers:", arr.length, "(presence keys:", channel ? Object.keys(channel.presenceState()).length : 0, "hb:", hbPeers.size, ")");
    peersCb(arr);
  }
  function sendHeartbeat() {
    if (channel && myPresence) channel.send({ type: "broadcast", event: "msg", payload: { type: "__hb", id: myId, meta: myPresence } });
  }

  return {
    mode: "cloud",
    myId,
    room,

    async connect() {
      client = await getSupabase();
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
        )
        .on("broadcast", { event: "msg" }, (p) => {
          const m = p && p.payload; if (!m) return;
          if (m.type === "__hb") {   // peer heartbeat, not a game message
            if (m.id && m.id !== myId) { hbPeers.set(m.id, { meta: m.meta || { id: m.id }, t: now() }); emitPeers(); }
            return;
          }
          msgCb(m);
        });

      await new Promise((resolve, reject) => {
        channel.subscribe((status, err) => {
          log("subscribe status:", status, err ? ("err: " + (err.message || err)) : "");
          if (status === "SUBSCRIBED") {
            if (myPresence) { channel.track(myPresence); sendHeartbeat(); }
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            reject(err || new Error(status));
          }
        });
      });
      setInterval(emitPeers, 2000);   // prune stale heartbeat peers
      if (typeof window !== "undefined") window.__joenet = { channel: () => channel, presence: () => channel && channel.presenceState(), hb: () => [...hbPeers.keys()], myId };
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
      // throttle: track presence AND broadcast a heartbeat (either path lets
      // peers find us; broadcast works even when presence sync doesn't)
      if (channel && t - lastPresenceSent > 500) {
        if (lastPresenceSent === 0) log("first presence.track + heartbeat for", myId.slice(0, 6));
        lastPresenceSent = t;
        channel.track(myPresence);
        sendHeartbeat();
      }
    },

    onPeers(cb) { peersCb = cb; },

    send(payload) { if (channel) channel.send({ type: "broadcast", event: "msg", payload }); },
    onMessage(cb) { msgCb = cb; },
  };
}
