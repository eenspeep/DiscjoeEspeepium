// Bootstrap: wire net + store + world + UI + optional accounts, then start the
// heartbeats.

import { ECON_TICK_MS, TUNING } from "./config.js";
import { uid } from "./util.js";
import { connectNet } from "./net/net.js";
import { state, initState, tickEconomy, flushShared, saveMe, setAccount, adoptProfile, setProfileSaver } from "./state.js";
import { hasSupabase, currentUser, signIn, signUp, signOut, loadProfile, saveProfile } from "./account.js";
import { initWorld, myPresence } from "./world.js";
import { initUI, openFurniture, flash, showOffline } from "./ui.js";

async function applyAuthed(acc) {
  setAccount(acc);
  setProfileSaver((me) => saveProfile(acc.userId, me));
  let prof = null;
  try { prof = await loadProfile(acc.userId); } catch (e) { console.warn(e); }
  if (prof) adoptProfile(prof); else saveMe(); // seed the cloud with the current local Joey
}
async function doLogout() {
  try { await signOut(); } catch (e) { /* ignore */ }
  setAccount(null); setProfileSaver(null);
}

async function boot() {
  const myId = uid();
  const net = await connectNet(myId);
  await initState(net);

  // resume an existing login, if any
  if (hasSupabase()) {
    try { const acc = await currentUser(); if (acc) await applyAuthed(acc); } catch (e) { console.warn("[joetime] session resume:", e); }
  }

  initWorld(document.getElementById("stage"), { onFurnitureClick: openFurniture, onTileMessage: flash });
  initUI({ enabled: hasSupabase(), signIn, signUp, applyAuthed, doLogout });

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
