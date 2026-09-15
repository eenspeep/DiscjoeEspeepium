// Local adapter: real multiplayer across browser tabs on this machine, via
// BroadcastChannel, with the shared workplace persisted in localStorage. Open
// the page in two tabs and you are two players in the same office. No account,
// no network. This is also the graceful fallback when Supabase keys are absent.

import { TUNING } from "../config.js";
import { now } from "../util.js";

export function makeLocalNet(myId, room) {
  const SHARED_KEY = `deskovania:shared:${room}`;
  const chan = ("BroadcastChannel" in self) ? new BroadcastChannel(`deskovania:${room}`) : null;

  let sharedCb = () => {};
  let peersCb = () => {};
  const peers = new Map();     // id -> presence (+ ts)
  let myPresence = null;

  function readShared() {
    try {
      const raw = localStorage.getItem(SHARED_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function emitPeers() {
    const arr = [];
    const cutoff = now() - TUNING.peerTimeoutMs;
    for (const [id, p] of peers) {
      if (p.ts < cutoff) { peers.delete(id); continue; }
      if (id !== myId) arr.push(p);
    }
    peersCb(arr);
  }

  if (chan) {
    chan.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg.from === myId) return;
      if (msg.type === "shared") {
        sharedCb(msg.shared);
      } else if (msg.type === "presence") {
        peers.set(msg.peer.id, { ...msg.peer, ts: now() });
        emitPeers();
      } else if (msg.type === "bye") {
        peers.delete(msg.from);
        emitPeers();
      } else if (msg.type === "hello") {
        // someone joined: answer so they see us immediately
        if (myPresence) chan.postMessage({ type: "presence", from: myId, peer: myPresence });
      }
    };
  }

  // Cross-tab shared updates also arrive via the storage event (covers browsers
  // that throttle BroadcastChannel in background tabs).
  self.addEventListener("storage", (e) => {
    if (e.key === SHARED_KEY && e.newValue) {
      try { sharedCb(JSON.parse(e.newValue)); } catch {}
    }
  });

  window.addEventListener("beforeunload", () => {
    if (chan) chan.postMessage({ type: "bye", from: myId });
  });

  // prune stale peers periodically even if no messages arrive
  setInterval(emitPeers, TUNING.peerTimeoutMs);

  return {
    mode: "local",
    myId,
    room,

    async connect() {
      if (chan) chan.postMessage({ type: "hello", from: myId });
    },

    async getInitialShared() {
      return readShared();
    },

    pushShared(shared) {
      try { localStorage.setItem(SHARED_KEY, JSON.stringify(shared)); } catch {}
      if (chan) chan.postMessage({ type: "shared", from: myId, shared });
    },

    onShared(cb) { sharedCb = cb; },

    setPresence(p) {
      myPresence = { id: myId, ...p, ts: now() };
      if (chan) chan.postMessage({ type: "presence", from: myId, peer: myPresence });
    },

    onPeers(cb) { peersCb = cb; },
  };
}
