// Bootstrap: wire the net adapter, the store, the isometric world, and the UI
// together, then start the three heartbeats (economy, presence, sync).

import { ECON_TICK_MS, TUNING } from "./config.js";
import { uid } from "./util.js";
import { createNet } from "./net/net.js";
import { state, initState, tickEconomy, flushShared } from "./state.js";
import { initWorld, myPresence } from "./world.js";
import { initUI, openModule, flash, showOffline } from "./ui.js";

async function boot() {
  const myId = uid();
  const net = createNet(myId);
  await net.connect();
  await initState(net);

  initWorld(document.getElementById("stage"), {
    onModuleClick: openModule,
    onTileMessage: flash,
  });
  initUI();

  // seed the shared state onto the network if we created it
  flushShared(true);

  if (state.lastOffline) showOffline(state.lastOffline);

  // economy: advance credits + recompute a few times a second
  setInterval(() => tickEconomy(), ECON_TICK_MS);

  // sync: push shared state on a gentle cadence (spends push immediately)
  setInterval(() => flushShared(false), 2500);

  // presence: tell the room where we are and what we look like
  setInterval(() => net.setPresence(myPresence()), TUNING.heartbeatMs);
  net.setPresence(myPresence());
}

boot().catch((err) => {
  console.error(err);
  const banner = document.createElement("div");
  banner.className = "boot-error";
  banner.textContent = "The office failed to open: " + (err?.message || err);
  document.body.appendChild(banner);
});
