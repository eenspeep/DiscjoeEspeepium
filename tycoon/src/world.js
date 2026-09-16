// The isometric room: draws the shared floor and furniture, every Joey (you,
// real peers, ambient bot-Joeys), and handles movement + build input. Furniture
// you're standing next to glows to show you're "using" it.

import { TILE_W, TILE_H, camera, project, screenToGrid } from "./iso.js";
import { drawJoey, drawJoeySprite, enzoImage, lookFromSeed, shade } from "./appearance.js";
import {
  FURNITURE, MODS, usingKeys, wornArt, effectiveSpeedMult, siteProgress, isNearFootprint,
  footprintCells, blockedTiles, furnitureAnchorAt, siteAnchorAt, hasSurface,
  walkableSet, isWalkable, inHall, doorPassable, equippedWeapon,
  attackRangeFor, interactRange, buildRange, sizeMult,
  enzoCells, isEnzoTile, enzoAnchor,
} from "./economy.js";
import { TUNING, CHARLIE_ID } from "./config.js";
import { clamp, lerp, now, hash } from "./util.js";
import { state, inBounds, tryPlaceFurniture, tryPlaceMod, tryRemoveMod, tryPlaceDoor, useWeapon, killCharlie, tryPickup, isCharlieAlive, tryClickEnzo } from "./state.js";

let canvas, ctx, dpr = 1;
let buildType = null;   // furniture type being placed
let buildMod = null;    // node-mod type being placed
let buildDoor = false;  // placing a door
let buildRot = 0;       // rotation (0..3) for furniture placement
let enzoClickT = -9;    // last Enzo-click time, for the click pulse
const ZMIN = 0.5, ZMAX = 2.6;   // in-game zoom range (pinch / wheel / buttons)
let onFurnitureClick = () => {};
let onSiteClick = () => {};
let onDoorClick = () => {};
let onTileMessage = () => {};
let sendMsg = null;
const unlockedDoors = new Set();   // doors I've unlocked this session
export function unlockDoorLocal(key) { unlockedDoors.add(key); }
const keys = new Set();
let mouse = { sx: 0, sy: 0, gx: 0, gy: 0, over: false };
let target = null;
let selectedKey = null;
const renderPeers = new Map();
const charlie = makeCharlie();
function activeBots() { return isCharlieAlive() ? [charlie] : []; }
let lastFrame = now();

export function initWorld(canvasEl, hooks = {}) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");
  onFurnitureClick = hooks.onFurnitureClick || onFurnitureClick;
  onSiteClick = hooks.onSiteClick || onSiteClick;
  onDoorClick = hooks.onDoorClick || onDoorClick;
  onTileMessage = hooks.onTileMessage || onTileMessage;
  sendMsg = hooks.send || null;

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k === "e") { doPush(); return; }
    if (k === "q") { doAttack(); return; }
    if (k === "r" && buildType) { buildRot = (buildRot + 1) % 4; return; }
    keys.add(k);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  canvas.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.sx = (e.clientX - r.left) * dpr;
    mouse.sy = (e.clientY - r.top) * dpr;
    mouse.over = true;
    const g = screenToGrid(mouse.sx, mouse.sy, canvas);
    mouse.gx = Math.round(g.gx); mouse.gy = Math.round(g.gy);
  });
  canvas.addEventListener("mouseleave", () => (mouse.over = false));
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    camera.zoom = clamp(camera.zoom * (e.deltaY > 0 ? 0.92 : 1.08), ZMIN, ZMAX);
  }, { passive: false });

  // touch: pinch to zoom, one-finger tap to act (walk / click furniture / Enzo)
  let pinchBase = 0, pinchZoom = 0, tap = null;
  const dist2 = (ts) => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) { pinchBase = dist2(e.touches); pinchZoom = camera.zoom; tap = null; }
    else if (e.touches.length === 1) { const t = e.touches[0]; tap = { x: t.clientX, y: t.clientY, moved: false }; }
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && pinchBase > 0) { e.preventDefault(); camera.zoom = clamp(pinchZoom * (dist2(e.touches) / pinchBase), ZMIN, ZMAX); }
    else if (e.touches.length === 1 && tap) { const t = e.touches[0]; if (Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > 12) tap.moved = true; }
  }, { passive: false });
  canvas.addEventListener("touchend", (e) => {
    if (tap && !tap.moved && e.changedTouches.length) {
      const t = e.changedTouches[0], r = canvas.getBoundingClientRect();
      mouse.sx = (t.clientX - r.left) * dpr; mouse.sy = (t.clientY - r.top) * dpr; mouse.over = true;
      const g = screenToGrid(mouse.sx, mouse.sy, canvas); mouse.gx = Math.round(g.gx); mouse.gy = Math.round(g.gy);
      onClick();
    }
    tap = null; pinchBase = 0;
  }, { passive: false });

  // on-screen zoom buttons (also handy on desktop)
  const zc = document.createElement("div"); zc.className = "zoom-ctrl";
  const zbtn = (txt, mult) => { const b = document.createElement("button"); b.className = "zoom-btn"; b.textContent = txt; b.addEventListener("click", () => { camera.zoom = clamp(camera.zoom * mult, ZMIN, ZMAX); }); return b; };
  zc.appendChild(zbtn("+", 1.2)); zc.appendChild(zbtn("−", 1 / 1.2));
  document.body.appendChild(zc);

  requestAnimationFrame(loop);
}

export function setBuild(type) { buildType = type; buildMod = null; buildDoor = false; }
export function getBuild() { return buildType; }
export function setBuildMod(type) { buildMod = type; buildType = null; buildDoor = false; }
export function getBuildMod() { return buildMod; }
export function setBuildDoor(on) { buildDoor = on; buildType = null; buildMod = null; }
export function getBuildDoor() { return buildDoor; }
export function setSelected(key) { selectedKey = key; }

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
}

function onClick() {
  if (!mouse.over || !state.me.created) return;
  const gx = mouse.gx, gy = mouse.gy;
  const fKey = furnitureAnchorAt(state.shared, gx, gy);
  const sKey = siteAnchorAt(state.shared, gx, gy);
  const doorKey = gx + "," + gy;
  if (isEnzoTile(state.shared, gx, gy)) {
    const r = tryClickEnzo();
    if (r.ok) { enzoClickT = now() / 1000; onTileMessage("🐱 Enzo blesses you (+1¢)"); }
    return;
  }
  if (buildDoor) {
    const r = tryPlaceDoor(gx, gy);
    onTileMessage(r.ok ? "Door installed. Click it to lock it." : (r.why || "Can't place a door there."));
    return;
  }
  if (state.shared.doors[doorKey]) { onDoorClick(doorKey, state.shared.doors[doorKey]); return; }
  if (buildMod) {
    const f = fKey && state.shared.furniture[fKey];
    if (!f) return onTileMessage("Put mods on a furniture surface.");
    if (f.mods && f.mods[gx + "," + gy]) { const r = tryRemoveMod(gx, gy); if (r.ok) onTileMessage("Removed mod (+" + Math.round(r.refund) + ")."); return; }
    const r = tryPlaceMod(buildMod, gx, gy);
    if (!r.ok) onTileMessage(r.why || "Can't place that mod.");
    else onTileMessage("Mod mounted.");
    return;
  }
  if (buildType) {
    if (!inBounds(gx, gy)) return onTileMessage("Outside the floor.");
    const r = tryPlaceFurniture(buildType, gx, gy, buildRot);
    if (!r.ok) onTileMessage(r.why || "Can't build there.");
    else onTileMessage("Build started — stand next to it to build it.");
    return;
  }
  const pile = state.shared.loot && state.shared.loot[doorKey];
  if (pile && pile.items && pile.items.length) {
    const r = tryPickup(gx, gy);
    onTileMessage(r.ok ? ("Grabbed " + r.taken + " item" + (r.taken > 1 ? "s" : "") + (r.left ? " (" + r.left + " left, bag full)" : "") + ".") : "Your bag's too full.");
    return;
  }
  if (fKey) { onFurnitureClick(fKey, state.shared.furniture[fKey]); return; }
  if (sKey) { onSiteClick(sKey, state.shared.sites[sKey]); return; }
  if (isWalkable(state.shared, gx, gy)) target = { x: gx, y: gy };
}

// Shove the nearest adjacent person one tile away. Works locally on bots; sends
// a push message to real peers so their own client moves them.
function doPush() {
  if (!state.me.created) return;
  const cands = [];
  for (const [id, r] of renderPeers) cands.push({ kind: "peer", id, x: r.x, y: r.y, name: r.name });
  for (const n of activeBots()) cands.push({ kind: "npc", ref: n, x: n.x, y: n.y, name: n.name });
  let best = null, bd = 1.6;
  for (const c of cands) { const d = Math.hypot(c.x - state.me.pos.x, c.y - state.me.pos.y); if (d < bd) { bd = d; best = c; } }
  if (!best) return onTileMessage("No one close enough to shove.");
  const dx = best.x - state.me.pos.x, dy = best.y - state.me.pos.y;
  const sx = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) || 1 : 0;
  const sy = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
  const tx = Math.round(best.x) + sx, ty = Math.round(best.y) + sy;
  if (!isWalkable(state.shared, tx, ty)) return onTileMessage("Nowhere to shove them.");
  if (blockedTiles(state.shared).has(tx + "," + ty)) return onTileMessage("Something's in the way.");
  const door = state.shared.doors[tx + "," + ty];
  if (door && door.locked && !doorPassable(door, tx + "," + ty, state.me.id, unlockedDoors)) return onTileMessage("A locked door's in the way.");
  if (best.kind === "npc") { best.ref.x = tx; best.ref.y = ty; best.ref.target = null; best.ref.pause = 0.6; }
  else if (sendMsg) sendMsg({ type: "push", to: best.id, x: tx, y: ty });
  onTileMessage("Shoved " + (best.name || "them") + "!");
}

// Swing your equipped weapon at the nearest adjacent entity. Instant kill if
// they have no shield; the weapon breaks either way (a knife after one swing).
function doAttack() {
  if (!state.me.created) return;
  if (!equippedWeapon(state.me)) return onTileMessage("You need a weapon in hand. Buy a knife and equip it.");
  const cands = [];
  for (const [id, r] of renderPeers) cands.push({ kind: "peer", id, x: r.x, y: r.y, name: r.name });
  for (const n of activeBots()) cands.push({ kind: "bot", ref: n, x: n.x, y: n.y, name: n.name });
  let best = null, bd = attackRangeFor(state.me);   // "Melee range" trait
  for (const c of cands) { const d = Math.hypot(c.x - state.me.pos.x, c.y - state.me.pos.y); if (d <= bd) { bd = d; best = c; } }
  if (!best) return onTileMessage("Nothing in knife reach.");
  const def = useWeapon();   // breaks whether or not it kills
  const wname = def ? def.name : "weapon";
  if (best.kind === "bot") {
    const r = killCharlie(best.ref.x, best.ref.y);
    onTileMessage(r.ok ? ("You gutted Garlic Charlie! +" + r.bounty + "¢ — your " + wname + " broke.") : "He slipped away.");
  } else {
    if (sendMsg) sendMsg({ type: "attack", to: best.id, from: state.me.id, name: state.me.created ? state.me.name : "someone" });
    onTileMessage("You lunged at " + (best.name || "them") + " — your " + wname + " broke.");
  }
}

// Received a push (from another player) — move me.
export function applyPush(x, y) {
  if (!state.me || !state.me.created) return;
  const f = state.shared.floor;
  state.me.pos.x = clamp(x, f.x, f.x + f.w - 1);
  state.me.pos.y = clamp(y, f.y, f.y + f.h - 1);
  target = null;
}

// ---- movement -------------------------------------------------------------

function entityTileSet(excludeMe = true) {
  const s = new Set();
  for (const [, r] of renderPeers) s.add(Math.round(r.x) + "," + Math.round(r.y));
  for (const n of activeBots()) s.add(Math.round(n.x) + "," + Math.round(n.y));
  return s;
}

function updateMe(dt) {
  const me = state.me;
  if (!me.created) { me.moving = false; return; }
  const speed = TUNING.walkSpeed * effectiveSpeedMult(me);
  let dx = 0, dy = 0;
  if (keys.has("w") || keys.has("arrowup")) { dx -= 1; dy -= 1; }
  if (keys.has("s") || keys.has("arrowdown")) { dx += 1; dy += 1; }
  if (keys.has("a") || keys.has("arrowleft")) { dx -= 1; dy += 1; }
  if (keys.has("d") || keys.has("arrowright")) { dx += 1; dy -= 1; }

  let vx = 0, vy = 0, want = false;
  if (dx || dy) { target = null; const len = Math.hypot(dx, dy) || 1; vx = (dx / len) * speed * dt; vy = (dy / len) * speed * dt; want = true; }
  else if (target) {
    const ddx = target.x - me.pos.x, ddy = target.y - me.pos.y, dist = Math.hypot(ddx, ddy);
    if (dist < 0.06) target = null;
    else { const step = Math.min(dist, speed * dt); vx = (ddx / dist) * step; vy = (ddy / dist) * step; want = true; }
  }

  const f = state.shared.floor, walk = walkableSet(state.shared), blocked = blockedTiles(state.shared), ents = entityTileSet();
  const doors = state.shared.doors || {};
  const solid = (gx, gy) => {
    const k = gx + "," + gy;
    if (!walk.has(k) || blocked.has(k) || ents.has(k)) return true;
    const d = doors[k];
    return !!(d && !doorPassable(d, k, state.me.id, unlockedDoors));
  };
  let nx = me.pos.x + vx, ny = me.pos.y + vy, movedX = vx !== 0, movedY = vy !== 0;
  if (vx !== 0 && solid(Math.round(nx), Math.round(me.pos.y))) { nx = me.pos.x; movedX = false; }
  if (vy !== 0 && solid(Math.round(nx), Math.round(ny))) { ny = me.pos.y; movedY = false; }
  me.pos.x = clamp(nx, f.x, f.x + f.w - 1);
  me.pos.y = clamp(ny, f.y, f.y + f.h - 1);
  if (target && !movedX && !movedY) target = null; // stuck against something
  me.moving = want && (movedX || movedY);
}

function updatePeers(dt) {
  const live = new Set();
  for (const p of state.peers) {
    live.add(p.id);
    let r = renderPeers.get(p.id);
    if (!r) { r = { x: p.x ?? 0, y: p.y ?? 0 }; renderPeers.set(p.id, r); }
    r.x = lerp(r.x, p.x ?? r.x, clamp(dt * 8, 0, 1));
    r.y = lerp(r.y, p.y ?? r.y, clamp(dt * 8, 0, 1));
    r.moving = Math.hypot((p.x ?? 0) - r.x, (p.y ?? 0) - r.y) > 0.02;
    r.name = p.name; r.look = p.look; r.worn = p.worn; r.size = p.size;
  }
  for (const id of renderPeers.keys()) if (!live.has(id)) renderPeers.delete(id);
}

function updateNPCs(dt) {
  const s = state.shared, walk = walkableSet(s), blocked = blockedTiles(s), doors = s.doors || {};
  const alive = isCharlieAlive();
  if (alive && !charlie._alive) { const r0 = s.rooms[0]; charlie.x = r0.x + 1; charlie.y = r0.y + 1; charlie.target = null; charlie.pause = 1; }
  charlie._alive = alive;
  if (!alive) return;
  const solid = (gx, gy) => { const k = gx + "," + gy; if (!walk.has(k) || blocked.has(k)) return true; const d = doors[k]; return !!(d && d.locked); };
  let walkList = null;
  const pick = () => { if (!walkList) walkList = [...walk].map((k) => k.split(",").map(Number)).filter(([x, y]) => !solid(x, y)); return walkList.length ? walkList[Math.floor(Math.random() * walkList.length)] : null; };
  for (const n of activeBots()) {
    n.pause -= dt;
    if (!n.target && n.pause <= 0) { const t = pick(); if (t) n.target = { x: t[0], y: t[1] }; }
    if (n.target && n.pause <= 0) {
      const ddx = n.target.x - n.x, ddy = n.target.y - n.y, dist = Math.hypot(ddx, ddy);
      if (dist < 0.15) { n.target = null; n.pause = 1 + Math.random() * 4; n.moving = false; }
      else {
        const step = Math.min(dist, TUNING.walkSpeed * 0.7 * dt);
        let nx = n.x + (ddx / dist) * step, ny = n.y + (ddy / dist) * step, stuck = false;
        if (solid(Math.round(nx), Math.round(n.y))) { nx = n.x; stuck = true; }
        if (solid(Math.round(nx), Math.round(ny))) { ny = n.y; stuck = true; }
        n.x = nx; n.y = ny; n.moving = true;
        if (stuck) { n.target = null; n.pause = 0.5 + Math.random() * 2; }
      }
    }
  }
}

function makeCharlie() {
  return { id: CHARLIE_ID, x: 2, y: 2, target: null, pause: Math.random() * 3, moving: false, _alive: true, look: lookFromSeed("garlic-charlie-vii"), name: "GARLIC CHARLIE" };
}

// ---- loop + render --------------------------------------------------------

function loop() {
  const t = now();
  const dt = clamp((t - lastFrame) / 1000, 0, 0.1);
  lastFrame = t;
  updateMe(dt); updatePeers(dt); updateNPCs(dt);

  const tw = gridWorld(state.me.pos.x, state.me.pos.y);
  camera.x = lerp(camera.x, tw.x, clamp(dt * 4, 0, 1));
  camera.y = lerp(camera.y, tw.y, clamp(dt * 4, 0, 1));

  draw(t / 1000);
  requestAnimationFrame(loop);
}
function gridWorld(gx, gy) { return { x: (gx - gy) * (TILE_W / 2), y: (gx + gy) * (TILE_H / 2) }; }

function draw(t) {
  const s = state.shared;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // floor = only walkable tiles (rooms + hallways), sorted back-to-front so the
  // low back walls we extrude never cover a tile in front of them.
  const walk = walkableSet(s);
  const floorCells = [...walk].map((k) => k.split(",").map(Number)).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  for (const [gx, gy] of floorCells) {
    const even = (gx + gy) % 2 === 0;
    const fill = inHall(s, gx, gy) ? (even ? "#d8dce6" : "#ced3df") : (even ? "#e9edf3" : "#dfe4ec");
    drawTile(gx, gy, fill);
  }
  for (const [gx, gy] of floorCells) drawBackWalls(s, gx, gy, walk);

  if (mouse.over && state.me.created) {
    if (buildType) {
      const blocked = blockedTiles(s);
      for (const [cx, cy] of footprintCells(buildType, mouse.gx, mouse.gy, buildRot)) {
        const ok = isWalkable(s, cx, cy) && !blocked.has(cx + "," + cy) && !s.doors[cx + "," + cy];
        drawTile(cx, cy, ok ? "rgba(70,190,120,0.55)" : "rgba(230,80,70,0.5)");
      }
    } else if (buildMod) {
      const fKey = furnitureAnchorAt(s, mouse.gx, mouse.gy);
      const f = fKey && s.furniture[fKey];
      const ok = f && hasSurface(f.type) && !(f.mods && f.mods[mouse.gx + "," + mouse.gy]);
      if (inBounds(mouse.gx, mouse.gy)) drawTile(mouse.gx, mouse.gy, ok ? "rgba(150,90,220,0.6)" : "rgba(230,80,70,0.45)");
    } else if (buildDoor) {
      const ok = inHall(s, mouse.gx, mouse.gy) && !s.doors[mouse.gx + "," + mouse.gy] && !s.furniture[mouse.gx + "," + mouse.gy] && !s.sites[mouse.gx + "," + mouse.gy];
      if (isWalkable(s, mouse.gx, mouse.gy)) drawTile(mouse.gx, mouse.gy, ok ? "rgba(90,160,240,0.55)" : "rgba(230,80,70,0.45)");
    } else if (isWalkable(s, mouse.gx, mouse.gy)) {
      drawTile(mouse.gx, mouse.gy, "rgba(90,120,220,0.35)");
    }
  }

  const inUse = state.me.created ? new Set(usingKeys(state.me.pos, s, interactRange(state.me))) : new Set();

  const items = [];
  for (const [key, f] of Object.entries(s.furniture)) {
    const [ax, ay] = key.split(",").map(Number);
    items.push({ depth: cellsDepth(footprintCells(f.type, ax, ay, f.rot || 0)), kind: "furn", ax, ay, f, key });
  }
  for (const [key, site] of Object.entries(s.sites || {})) {
    const [ax, ay] = key.split(",").map(Number);
    items.push({ depth: cellsDepth(footprintCells(site.type, ax, ay, site.rot || 0)), kind: "site", ax, ay, site, key });
  }
  for (const [key, d] of Object.entries(s.doors || {})) {
    const [dx, dy] = key.split(",").map(Number);
    items.push({ depth: dx + dy - 0.05, kind: "door", dx, dy, d, key });
  }
  for (const [key, pile] of Object.entries(s.loot || {})) {
    if (!pile.items || !pile.items.length) continue;
    const [lx, ly] = key.split(",").map(Number);
    items.push({ depth: lx + ly - 0.03, kind: "loot", lx, ly, pile });
  }
  const eCells = enzoCells(s);
  items.push({ depth: cellsDepth(eCells) + 0.2, kind: "enzo", cells: eCells });
  items.push({ depth: state.me.pos.x + state.me.pos.y, kind: "me" });
  for (const [, r] of renderPeers) items.push({ depth: r.x + r.y, kind: "peer", r });
  for (const n of activeBots()) items.push({ depth: n.x + n.y, kind: "npc", n });
  items.sort((a, b) => a.depth - b.depth);

  for (const it of items) {
    if (it.kind === "furn") drawFurniture(it.ax, it.ay, it.f, it.key === selectedKey, inUse.has(it.key));
    else if (it.kind === "site") drawSite(it.ax, it.ay, it.site);
    else if (it.kind === "door") drawDoor(it.dx, it.dy, it.d);
    else if (it.kind === "loot") drawLoot(it.lx, it.ly, it.pile);
    else if (it.kind === "enzo") drawEnzo(it.cells, t);
    else if (it.kind === "me") drawMe(t);
    else if (it.kind === "peer") drawPeer(it.r, t);
    else if (it.kind === "npc") drawPeer(it.n, t, true);
  }
}

function drawEnzo(cells, t) {
  const cen = centroid(cells), p = project(cen.x, cen.y, canvas), zoom = camera.zoom;
  const pulse = Math.max(0, 1 - (t - enzoClickT) / 0.18);   // brief bump right after a click
  const H = 78 * zoom * (1 + 0.09 * pulse);
  const baseY = p.y + 8 * zoom;
  ctx.save(); ctx.scale(1, 0.5); ctx.beginPath(); ctx.arc(p.x, (baseY + 2 * zoom) / 0.5, 22 * zoom, 0, 7); ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fill(); ctx.restore();
  const img = enzoImage();
  if (img && img.naturalWidth) {
    const W = H * (img.naturalWidth / img.naturalHeight);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, p.x - W / 2, baseY - H, W, H);
  } else {
    const w = 34 * zoom;
    ctx.fillStyle = "#8b8f98"; ctx.fillRect(p.x - w / 2, baseY - H * 0.34, w, H * 0.34);
    ctx.fillStyle = "#a7abb4"; ctx.fillRect(p.x - w / 2 + 3 * zoom, baseY - H, w - 6 * zoom, H * 0.7);
    ctx.font = `${36 * zoom}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🐱", p.x, baseY - H * 0.72);
    ctx.font = `${10 * zoom}px "Fredoka", system-ui, sans-serif`; ctx.fillStyle = "#3a3f4b";
    ctx.fillText("ENZO", p.x, baseY - H * 0.30);
  }
  if (pulse > 0) {
    ctx.globalAlpha = pulse; ctx.font = `${16 * zoom}px "Fredoka", system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#f2b134";
    ctx.fillText("+1¢", p.x, baseY - H - 8 * zoom); ctx.globalAlpha = 1;
  }
}

function drawLoot(gx, gy, pile) {
  const p = project(gx, gy, canvas);
  ctx.font = `${17 * camera.zoom}px system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const bob = Math.sin((now() / 400) + gx + gy) * 1.5 * camera.zoom;
  ctx.fillText("📦", p.x, p.y - 5 * camera.zoom + bob);
  if (pile.items.length > 1) {
    ctx.font = `${10 * camera.zoom}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(20,22,28,0.85)";
    ctx.fillText("×" + pile.items.length, p.x + 11 * camera.zoom, p.y + 4 * camera.zoom);
  }
}

// Low back walls: extrude the two "up-screen" edges of a walkable tile wherever
// the neighbor across that edge is void, so rooms read as enclosed.
function drawBackWalls(s, gx, gy, walk) {
  const WZ = 15 * camera.zoom;
  const c = tileCorners(gx, gy);
  const up = (x, y) => ({ x: x, y: y - WZ });
  ctx.strokeStyle = "rgba(120,130,150,0.3)"; ctx.lineWidth = 1;
  if (!walk.has((gx - 1) + "," + gy)) { ctx.fillStyle = "#c3c9d6"; quad(c.L, c.T, up(c.T.x, c.T.y), up(c.L.x, c.L.y)); ctx.stroke(); }
  if (!walk.has(gx + "," + (gy - 1))) { ctx.fillStyle = "#cdd3df"; quad(c.T, c.R, up(c.R.x, c.R.y), up(c.T.x, c.T.y)); ctx.stroke(); }
}

function drawDoor(gx, gy, d) {
  const s = state.shared, key = gx + "," + gy, c = tileCorners(gx, gy);
  const open = doorPassable(d, key, state.me.id, unlockedDoors);
  const z = 24 * camera.zoom;
  const horiz = isWalkable(s, gx - 1, gy) && isWalkable(s, gx + 1, gy);
  const a = horiz ? c.T : c.L, b = horiz ? c.B : c.R;   // slab spans the corridor
  const frame = d.locked ? (open ? "#5b86c9" : "#b04a4a") : "#7c8698";
  const pw = 3.5 * camera.zoom;
  ctx.fillStyle = shade(frame, -22);
  ctx.fillRect(a.x - pw / 2, a.y - z, pw, z);
  ctx.fillRect(b.x - pw / 2, b.y - z, pw, z);
  ctx.fillStyle = frame;   // lintel
  quad({ x: a.x, y: a.y - z }, { x: b.x, y: b.y - z }, { x: b.x, y: b.y - z + 4 * camera.zoom }, { x: a.x, y: a.y - z + 4 * camera.zoom });
  ctx.globalAlpha = (d.locked && !open) ? 0.85 : (d.locked ? 0.22 : 0.4);   // slab
  ctx.fillStyle = frame;
  quad(a, b, { x: b.x, y: b.y - z }, { x: a.x, y: a.y - z });
  ctx.globalAlpha = 1;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - z * 0.62 };
  ctx.font = `${13 * camera.zoom}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(d.locked ? (open ? "🔓" : "🔒") : "🚪", mid.x, mid.y);
}

function tileCorners(gx, gy) {
  const p = project(gx, gy, canvas);
  const hw = (TILE_W / 2) * camera.zoom, hh = (TILE_H / 2) * camera.zoom;
  return { p, T: { x: p.x, y: p.y - hh }, R: { x: p.x + hw, y: p.y }, B: { x: p.x, y: p.y + hh }, L: { x: p.x - hw, y: p.y } };
}

function cellsDepth(cells) { let m = -Infinity; for (const [x, y] of cells) m = Math.max(m, x + y); return m - 0.1; }
function centroid(cells) { let sx = 0, sy = 0; for (const [x, y] of cells) { sx += x; sy += y; } return { x: sx / cells.length, y: sy / cells.length }; }

// Draw a set of footprint cells as one extruded shape (any shape, incl. L).
function quad(a, b, c, d) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); }
function drawCellsPrism(cells, tint, z, { selected = false, using = false, alpha = 1 } = {}) {
  const set = new Set(cells.map((c) => c[0] + "," + c[1]));
  const sorted = cells.slice().sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  ctx.globalAlpha = alpha;
  for (const [cx, cy] of sorted) {
    const c = tileCorners(cx, cy);
    if (!set.has(cx + "," + (cy + 1))) { ctx.fillStyle = shade(tint, -30); quad(c.L, c.B, { x: c.B.x, y: c.B.y - z }, { x: c.L.x, y: c.L.y - z }); }
    if (!set.has((cx + 1) + "," + cy)) { ctx.fillStyle = shade(tint, -16); quad(c.R, c.B, { x: c.B.x, y: c.B.y - z }, { x: c.R.x, y: c.R.y - z }); }
    ctx.beginPath();
    ctx.moveTo(c.T.x, c.T.y - z); ctx.lineTo(c.R.x, c.R.y - z); ctx.lineTo(c.B.x, c.B.y - z); ctx.lineTo(c.L.x, c.L.y - z); ctx.closePath();
    ctx.fillStyle = selected ? shade(tint, 18) : tint; ctx.fill();
    if (using) { ctx.strokeStyle = "rgba(70,200,130,0.9)"; ctx.lineWidth = 2 * camera.zoom; ctx.stroke(); }
    else if (selected) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}

function drawTile(gx, gy, fill) {
  const c = tileCorners(gx, gy);
  ctx.beginPath();
  ctx.moveTo(c.T.x, c.T.y); ctx.lineTo(c.R.x, c.R.y); ctx.lineTo(c.B.x, c.B.y); ctx.lineTo(c.L.x, c.L.y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = "rgba(120,130,150,0.25)"; ctx.lineWidth = 1; ctx.stroke();
}

const TAG_TINT = { brain: "#4b56b8", build: "#c9772f", neutral: "#7f8794" };

function drawFurniture(ax, ay, f, selected, using) {
  const def = FURNITURE[f.type];
  const tint = TAG_TINT[def.tag] || "#9aa3af";
  const cells = footprintCells(f.type, ax, ay, f.rot || 0);
  const z = def.h * camera.zoom * (1 + (f.level - 1) * 0.12);
  drawCellsPrism(cells, tint, z, { selected, using });

  const cen = centroid(cells), p = project(cen.x, cen.y, canvas);
  ctx.font = `${15 * camera.zoom}px system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(def.glyph, p.x, p.y - z - 1 * camera.zoom);
  if (f.level > 1) {
    ctx.font = `${9 * camera.zoom}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText("L" + f.level, p.x, p.y - z + 11 * camera.zoom);
  }
  if (f.mods) {
    ctx.font = `${12 * camera.zoom}px system-ui, sans-serif`;
    for (const [mk, mtype] of Object.entries(f.mods)) {
      const [mx, my] = mk.split(",").map(Number), mp = project(mx, my, canvas);
      ctx.fillText((MODS[mtype] && MODS[mtype].glyph) || "?", mp.x, mp.y - z - 6 * camera.zoom);
    }
  }
}

function drawSite(ax, ay, site) {
  const def = FURNITURE[site.type], tint = TAG_TINT[def.tag] || "#9aa3af";
  const cells = footprintCells(site.type, ax, ay, site.rot || 0), z = def.h * 0.5 * camera.zoom;
  const prog = Math.min(1, siteProgress(site) / site.work);
  const building = state.me.created && isNearFootprint(state.me.pos, site.type, ax, ay, buildRange(state.me), site.rot || 0);
  drawCellsPrism(cells, tint, z, { alpha: 0.5 });
  ctx.strokeStyle = building ? "rgba(70,200,130,0.95)" : "rgba(90,100,120,0.7)";
  ctx.setLineDash([4, 3]); ctx.lineWidth = 2 * camera.zoom;
  for (const [cx, cy] of cells) { const c = tileCorners(cx, cy); ctx.beginPath(); ctx.moveTo(c.T.x, c.T.y - z); ctx.lineTo(c.R.x, c.R.y - z); ctx.lineTo(c.B.x, c.B.y - z); ctx.lineTo(c.L.x, c.L.y - z); ctx.closePath(); ctx.stroke(); }
  ctx.setLineDash([]);
  const cen = centroid(cells), p = project(cen.x, cen.y, canvas);
  ctx.font = `${13 * camera.zoom}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.7; ctx.fillText("🔨", p.x, p.y - z - 2 * camera.zoom); ctx.globalAlpha = 1;
  const bw = 30 * camera.zoom, bh = 5 * camera.zoom, bx = p.x - bw / 2, by = p.y - z - 16 * camera.zoom;
  ctx.fillStyle = "rgba(20,22,28,0.55)"; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = "#46c882"; ctx.fillRect(bx, by, bw * prog, bh);
}

function drawMe(t) {
  const p = project(state.me.pos.x, state.me.pos.y, canvas);
  const using = state.me.created && usingKeys(state.me.pos, state.shared, interactRange(state.me)).length > 0;
  const opts = {
    look: state.me.look, scale: camera.zoom * (state.me.created ? sizeMult(state.me) : 1),
    walking: state.me.moving, t, using, name: state.me.created ? state.me.name : "new Joey",
  };
  if (!drawJoeySprite(ctx, p.x, p.y, opts)) drawJoey(ctx, p.x, p.y, { ...opts, worn: wornArt(state.me) });
}

function drawPeer(r, t, isNpc = false) {
  const p = project(r.x, r.y, canvas);
  if (isNpc) ctx.globalAlpha = 0.95;
  const opts = { look: r.look, scale: camera.zoom * (r.size || 1), walking: r.moving, t, name: r.name || "JOEY" };
  if (!drawJoeySprite(ctx, p.x, p.y, opts)) drawJoey(ctx, p.x, p.y, { ...opts, worn: r.worn || {} });
  ctx.globalAlpha = 1;
  if (r.id === CHARLIE_ID) {
    ctx.font = `${15 * camera.zoom}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🧄", p.x, p.y - 52 * camera.zoom);
  }
}

// FYI to whoever is standing where — presence payload.
export function myPresence() {
  return {
    name: state.me.created ? state.me.name : "new Joey",
    look: state.me.look, worn: wornArt(state.me),
    x: state.me.pos.x, y: state.me.pos.y, moving: !!state.me.moving,
    specialty: state.me.specialty, size: state.me.created ? sizeMult(state.me) : 1,
  };
}
