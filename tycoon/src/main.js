// Bootstrap: wire net + store + world + UI + optional accounts, then start the
// heartbeats.

import { ECON_TICK_MS, TUNING } from "./config.js";
import { uid } from "./util.js";
import { connectNet } from "./net/net.js";
import { state, initState, tickEconomy, flushShared, saveMe, setAccount, adoptProfile, setProfileSaver, receiveAttack, applyKillReward, setMonsterSender, receiveMonsterHit } from "./state.js";
import { hasSupabase, currentUser, signIn, signUp, signOut, loadProfile, saveProfile, onProfileError } from "./account.js";
import { initWorld, myPresence, applyPush } from "./world.js";
import { initUI, openFurniture, openSite, openDoor, openWall, flash, showOffline } from "./ui.js";

async function applyAuthed(acc) {
  setAccount(acc);
  setProfileSaver((me) => saveProfile(acc.userId, me));
  let prof = null;
  try { prof = await loadProfile(acc.userId); } catch (e) { console.warn(e); }
  if (prof) { adoptProfile(prof); if (prof.created) flash("Loaded your saved Joey from the cloud."); }
  else saveMe(); // seed the cloud with the current local Joey
}
async function doLogout() {
  try { await signOut(); } catch (e) { /* ignore */ }
  setAccount(null); setProfileSaver(null);
}

async function boot() {
  const myId = uid();
  onProfileError((kind, msg) => flash((kind === "save" ? "☁️ Cloud save failed: " : "☁️ Cloud load failed: ") + msg));
  const net = await connectNet(myId);
  await initState(net);

  // resume an existing login, if any
  if (hasSupabase()) {
    try { const acc = await currentUser(); if (acc) await applyAuthed(acc); } catch (e) { console.warn("[joetime] session resume:", e); }
  }

  initWorld(document.getElementById("stage"), {
    onFurnitureClick: openFurniture, onSiteClick: openSite, onDoorClick: openDoor, onWallClick: openWall, onTileMessage: flash,
    send: (msg) => net.send && net.send(msg),
  });
  initUI({ enabled: hasSupabase(), signIn, signUp, applyAuthed, doLogout });

  setMonsterSender((msg) => net.send && net.send(msg));
  if (net.onMessage) net.onMessage((m) => {
    if (!m || m.to !== myId) return;
    if (m.type === "push") applyPush(m.x, m.y);
    else if (m.type === "monsterHit") receiveMonsterHit(m.king);
    else if (m.type === "attack") {
      const res = receiveAttack(m.name);
      if (res && !res.ignore && net.send) net.send({ type: "attackResult", to: m.from, blocked: res.blocked, killed: res.killed, coins: res.coins, name: state.me.created ? state.me.name : "someone" });
    } else if (m.type === "attackResult") {
      if (m.blocked) flash("They blocked it — your weapon still broke.");
      else if (m.killed) { applyKillReward(m.coins, m.name); flash("You killed " + (m.name || "them") + "! Took " + (m.coins || 0) + "¢."); }
    }
  });

  flushShared(true);
  if (state.lastOffline) showOffline(state.lastOffline);

  setInterval(() => tickEconomy(), ECON_TICK_MS);
  setInterval(() => flushShared(false), 2500);
  setInterval(() => { if (state.meDirty) saveMe(); }, 3000);
  setInterval(() => net.setPresence(myPresence()), TUNING.heartbeatMs);
  net.setPresence(myPresence());
  window.addEventListener("beforeunload", () => saveMe());
}

boot().catch((err) => {
  console.error(err);
  const b = document.createElement("div");
  b.className = "boot-error";
  b.textContent = "Joe Time failed to open: " + (err?.message || err);
  document.body.appendChild(b);
});
