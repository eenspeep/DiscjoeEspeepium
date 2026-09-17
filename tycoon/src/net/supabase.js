// Cloud adapter: a genuinely shared workplace across people and devices, on
// Supabase Realtime broadcast (heartbeats carry avatars; ops + full-state carry
// the office) + a `rooms` table (persistence for fresh joins/reloads). Turns on
// automatically when config.js has url + anonKey. Presence is deliberately not
// used — see emitPeers for why.
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
  let lastHb = 0;
  let pushTimer = null, pendingShared = null, lastPush = 0;
  const hbPeers = new Map();   // id -> { meta, t } from broadcast heartbeats
  const PEER_TTL = 8000;
  const stats = { sub: "-", out: 0, sendErr: 0, hbIn: 0, opIn: 0, sharedIn: 0, lastSharedT: 0, peers: 0 };

  const DBG = typeof location !== "undefined" && /joenet|debug/i.test(location.search + location.hash);
  function log(...a) { if (DBG) console.info("[joenet]", ...a); }

  // One place every outbound broadcast goes through, so a throwing/failed send is
  // counted (visible in ?joenet) instead of silently killing the channel.
  function sendMsg(payload) {
    if (!channel) return;
    try {
      const r = channel.send({ type: "broadcast", event: "msg", payload });
      if (r && typeof r.then === "function") r.then((res) => { if (res && res !== "ok") stats.sendErr++; }).catch(() => { stats.sendErr++; });
      stats.out++;
    } catch (e) { stats.sendErr++; log("send failed:", e && e.message); }
  }

  // Peers come purely from our own broadcast heartbeats. We deliberately DO NOT
  // use Supabase presence: with the newer publishable key it can throw after join
  // and poison the channel so broadcasts stop routing (movement freezes, peers
  // vanish). Broadcast heartbeats work whenever any message does, which is all we
  // need — each carries the sender's position + look.
  function emitPeers() {
    const map = new Map();
    const cutoff = now() - PEER_TTL;
    for (const [id, e] of hbPeers) { if (e.t < cutoff) hbPeers.delete(id); else if (id !== myId) map.set(id, e.meta); }
    const arr = [...map.values()];
    stats.peers = arr.length;
    peersCb(arr);
  }
  function sendHeartbeat() {
    if (myPresence) sendMsg({ type: "__hb", id: myId, meta: myPresence });
  }
  function flushPush() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    lastPush = now();
    const s = pendingShared; pendingShared = null; if (!s || !client) return;
    // live sync over broadcast (works without the rooms Postgres-changes feed)
    sendMsg({ type: "__shared", from: myId, state: s });
    // and persist to the table so a fresh join / reload can load the latest
    client.from("rooms").upsert({ id: room, state: s, updated_at: new Date().toISOString() })
      .then(({ error }) => { if (error) console.warn("[deskovania] room save:", error.message); });
  }

  return {
    mode: "cloud",
    myId,
    room,

    async connect() {
      client = await getSupabase();
      // No presence: broadcast-only channel. self:false so we don't echo our own.
      channel = client.channel(`room:${room}`, {
        config: { broadcast: { self: false, ack: false } },
      });

      channel
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
            if (m.id && m.id !== myId) { stats.hbIn++; hbPeers.set(m.id, { meta: m.meta || { id: m.id }, t: now() }); emitPeers(); }
            return;
          }
          if (m.type === "__shared") {   // shared office state, over broadcast (no DB feed needed)
            if (m.from !== myId && m.state) { stats.sharedIn++; stats.lastSharedT = now(); sharedCb(m.state); }
            return;
          }
          if (m.type === "__op" && m.from !== myId) stats.opIn++;
          msgCb(m);
        });

      await new Promise((resolve, reject) => {
        channel.subscribe((status, err) => {
          stats.sub = status;
          log("subscribe status:", status, err ? ("err: " + (err.message || err)) : "");
          if (status === "SUBSCRIBED") {
            if (myPresence) sendHeartbeat();
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            reject(err || new Error(status));
          }
        });
      });
      setInterval(emitPeers, 2000);   // prune stale heartbeat peers
      if (typeof window !== "undefined") window.__joenet = { channel: () => channel, hb: () => [...hbPeers.keys()], stats, myId };
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
      // coalesce bursts of upserts to ~2/s (each is a full-state REST write)
      pendingShared = shared;
      const t = now(), since = t - lastPush;
      if (since >= 450) flushPush();
      else if (!pushTimer) pushTimer = setTimeout(flushPush, 450 - since);
    },

    onShared(cb) { sharedCb = cb; },

    setPresence(p) {
      myPresence = { id: myId, ...p };
      const t = now();
      // broadcast a position heartbeat a few times a second so peers move smoothly
      if (channel && t - lastHb > 250) {
        if (lastHb === 0) log("first heartbeat for", myId.slice(0, 6));
        lastHb = t; sendHeartbeat();
      }
    },

    onPeers(cb) { peersCb = cb; },

    send(payload) { if (channel) { channel.send({ type: "broadcast", event: "msg", payload }); stats.out++; } },
    onMessage(cb) { msgCb = cb; },
    stats() { return stats; },
  };
}
