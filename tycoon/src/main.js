// Bootstrap: wire net + store + world + UI, then start the heartbeats.

import { ECON_TICK_MS, TUNING } from "./config.js";
import { uid } from "./util.js";
import { connectNet } from "./net/net.js";
import { state, initState, tickEconomy, flushShared, saveMe } from "./state.js";
import { initWorld, myPresence } from "./world.js";
import { initUI, openFurniture, flash, showOffline } from "./ui.js";

async function boot() {
  const myId = uid();
  const net = await connectNet(myId);
  await initState(net);

  initWorld(document.getElementById("stage"), {
    onFurnitureClick: openFurniture,
    onTileMessage: flash,
  });
  initUI();

  flushShared(true);
  if (state.lastOffline) showOffline(state.lastOffline);

  setInterval(() => tickEconomy(), ECON_TICK_MS);
  setInterval(() => flushShared(false), 2500);
  setInterval(() => { if (state.meDirty) saveMe(); }, 3000);
  setInterval(() => net.setPresence(myPresence()), TUNING.heartbeatMs);
  net.setPresence(myPresence());
  window.addEventListener("beforeunload", () => { saveMe(); });
}

boot().catch((err) => {
  console.error(err);
  const banner = document.createElement("div");
  banner.className = "boot-error";
  banner.textContent = "The office failed to open: " + (err?.message || err);
  document.body.appendChild(banner);
});
