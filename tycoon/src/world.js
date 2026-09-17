// The isometric room: draws the shared floor and furniture, every Joey (you,
// real peers, ambient bot-Joeys), and handles movement + build input. Furniture
// you're standing next to glows to show you're "using" it.

import { TILE_W, TILE_H, camera, project, screenToGrid } from "./iso.js";
import { drawJoey, drawJoeySprite, enzoImage, lookFromSeed, shade, rrect } from "./appearance.js";
import {
  FURNITURE, MODS, usingKeys, wornArt, effectiveSpeedMult, siteProgress, isNearFootprint,
  footprintCells, blockedTiles, furnitureAnchorAt, siteAnchorAt, hasSurface,
  walkableSet, isWalkable, inHall, doorPassable, equippedWeapon,
  attackRangeFor, interactRange, buildRange, sizeMult, withinReach,
  enzoCells, isEnzoTile, enzoAnchor, hasLeash, petActive,
  WALL_DECOR, wallIsReal, gearWorn, hasPower, powerList, isProtected,
  isBuyableTile, tileFrontier, tileCost, canBuyTiles,
} from "./economy.js";
import { TUNING, CHARLIE_ID } from "./config.js";
import { clamp, lerp, now, hash } from "./util.js";
import { state, inBounds, tryPlaceFurniture, tryPlaceMod, tryRemoveMod, tryPlaceDoor, tryPlaceWall, tryBuyTile, useWeapon, killCharlie, tryPickup, isCharlieAlive, tryClickEnzo, hitMonster, recruitRat, tryJump, isInvulnerable, unstick, tryTeleport, charlieEatRat } from "./state.js";

let canvas, ctx, dpr = 1;
let buildType = null;   // furniture type being placed
let buildMod = null;    // node-mod type being placed
let buildDoor = false;  // placing a door
let buildWall = null;   // wall-decor type being hung
let buildExpand = false; // buying floor tiles out of the fog
let buildRot = 0;       // rotation (0..3) for furniture placement
let enzoClickT = -9;    // last Enzo-click time, for the click pulse
const ZMIN = 0.5, ZMAX = 2.6;   // in-game zoom range (pinch / wheel / buttons)
let onFurnitureClick = () => {};
let onSiteClick = () => {};
let onDoorClick = () => {};
let onWallClick = () => {};
let onTileMessage = () => {};
let sendMsg = null;
const unlockedDoors = new Set();   // doors I've unlocked this session
export function unlockDoorLocal(key) { unlockedDoors.add(key); }
const keys = new Set();
let mouse = { sx: 0, sy: 0, gx: 0, gy: 0, over: false };
let target = null;
let selectedKey = null;
const renderPeers = new Map();
const renderMons = new Map();
const charlie = makeCharlie();
function activeBots() { return isCharlieAlive() ? [charlie] : []; }
let lastFrame = now();

export function initWorld(canvasEl, hooks = {}) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");
  onFurnitureClick = hooks.onFurnitureClick || onFurnitureClick;
  onSiteClick = hooks.onSiteClick || onSiteClick;
  onDoorClick = hooks.onDoorClick || onDoorClick;
  onWallClick = hooks.onWallClick || onWallClick;
  onTileMessage = hooks.onTileMessage || onTileMessage;
  sendMsg = hooks.send || null;

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k === "q") { doAttack(); return; }
    if (k === "u") { doUnstick(); return; }
    if (k === " " || k === "spacebar") { e.preventDefault(); doJump(); return; }
    if (k === "escape") { setBuild(null); return; }   // drop what's in hand
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
  // right-click: Blink power teleports to the clicked tile (within range)
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!hasPower(state.me, "blink")) return;
    const r = canvas.getBoundingClientRect();
    const g = screenToGrid((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr, canvas);
    const res = tryTeleport(Math.round(g.gx), Math.round(g.gy));
    if (res.ok) onTileMessage("✨ Blink!"); else if (res.why) onTileMessage(res.why);
  });
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

  // jump button (also handy on touch, which has no keyboard)
  const jb = document.createElement("button");
  jb.className = "jump-btn"; jb.textContent = "⤒ Jump";
  jb.title = "Jump (Space). 1s invincibility, 60s cooldown.";
  jb.addEventListener("click", doJump);
  document.body.appendChild(jb);

  requestAnimationFrame(loop);
}

export function setBuild(type) { buildType = type; buildMod = null; buildDoor = false; buildWall = null; buildExpand = false; }
export function getBuild() { return buildType; }
export function setBuildMod(type) { buildMod = type; buildType = null; buildDoor = false; buildWall = null; buildExpand = false; }
export function getBuildMod() { return buildMod; }
export function setBuildDoor(on) { buildDoor = on; buildType = null; buildMod = null; buildWall = null; buildExpand = false; }
export function getBuildDoor() { return buildDoor; }
export function setBuildWall(type) { buildWall = type; buildType = null; buildMod = null; buildDoor = false; buildExpand = false; }
export function getBuildWall() { return buildWall; }
export function setBuildExpand(on) { buildExpand = on; buildType = null; buildMod = null; buildDoor = false; buildWall = null; }
export function getBuildExpand() { return buildExpand; }
export function setSelected(key) { selectedKey = key; }

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
}

function onClick() {
  if (!mouse.over || !state.me.created) return;
  const gx = mouse.gx, gy = mouse.gy;
  if (buildExpand) {   // buying floor out of the fog
    const r = tryBuyTile(gx, gy);
    onTileMessage(r.ok ? ("Floor claimed for " + r.cost + "¢.") : (r.why || "Can't expand there."));
    return;
  }
  const fKey = furnitureAnchorAt(state.shared, gx, gy);
  const sKey = siteAnchorAt(state.shared, gx, gy);
  const doorKey = gx + "," + gy;
  if (isEnzoTile(state.shared, gx, gy)) {
    if (adjacentToEnzo(state.me.pos)) {
      const r = tryClickEnzo();
      if (r.ok) { enzoClickT = now() / 1000; onTileMessage("🐱 Enzo blesses you (+" + r.gain + "¢)"); }
    } else {
      const spot = nearestEnzoApproach();   // too far — walk up to it instead of coining
      if (spot) target = spot;
    }
    return;
  }
  if (buildWall) {
    const edge = nearestWallEdge();
    if (!edge) return onTileMessage("Aim at a wall within reach to hang it.");
    const r = tryPlaceWall(buildWall, edge.gx, edge.gy, edge.side);
    onTileMessage(r.ok ? "Hung on the wall." : (r.why || "Can't hang it there."));
    return;
  }
  if (buildDoor) {
    const r = tryPlaceDoor(gx, gy);
    onTileMessage(r.ok ? "Door installed. Click it to lock it." : (r.why || "Can't place a door there."));
    return;
  }
  if (state.shared.doors[doorKey]) { onDoorClick(doorKey, state.shared.doors[doorKey]); return; }
  const wallHit = pickWallDecor();   // click a hung piece to take it down
  if (wallHit) { onWallClick(wallHit.key, state.shared.walls[wallHit.key]); return; }
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

// Walking into someone shoves them: once per second per target, they slide one
// tile in the direction you're pushing. Bots move locally; real peers get a push
// message so their own client moves them. Their tile stays solid to you (no
// overlap), so you bump-and-follow.
const pushCd = new Map();   // entity id -> last shove time
function tryCollidePush(ent, dx, dy, blocked, ents) {
  const t = now();
  if (t - (pushCd.get(ent.id) || 0) < 1000) return;
  const s = state.shared, tx = Math.round(ent.x) + dx, ty = Math.round(ent.y) + dy, k = tx + "," + ty;
  if (!isWalkable(s, tx, ty) || blocked.has(k) || ents.has(k)) return;   // nowhere to shove them
  const door = s.doors && s.doors[k];
  if (door && door.locked && !doorPassable(door, k, state.me.id, unlockedDoors)) return;
  pushCd.set(ent.id, t);
  if (ent.kind === "bot") { ent.ref.x = tx; ent.ref.y = ty; ent.ref.target = null; ent.ref.pause = 0.6; }
  else if (sendMsg) sendMsg({ type: "push", to: ent.id, x: tx, y: ty });
}

// Swing your equipped weapon at the nearest adjacent entity. Instant kill if
// they have no shield; the weapon breaks either way (a knife after one swing).
function doRecruit() {
  const cands = [];
  for (const [id, r] of renderMons) if (r.kind === "rat" && r.tired) cands.push({ id, x: r.x, y: r.y });
  if (!cands.length) return onTileMessage("No tired rat nearby to leash. Wear a rat down first.");
  let best = null, bd = interactRange(state.me) + 0.5;
  for (const c of cands) { const d = Math.hypot(c.x - state.me.pos.x, c.y - state.me.pos.y); if (d <= bd) { bd = d; best = c; } }
  if (!best) return onTileMessage("Get closer to a tired rat to leash it.");
  const r = recruitRat(best.id);
  onTileMessage(r.ok ? "You leashed a rat! It's your buddy for an hour." : r.why);
}

function doUnstick() {
  if (!state.me.created) return;
  const r = unstick();
  if (r.ok) onTileMessage("🧯 Unstuck — warped back to the center.");
}

function doJump() {
  if (!state.me.created) return;
  const r = tryJump();
  if (!r.ok) return;
  if (r.invuln) onTileMessage("🤸 Jump! Invincible for 1s");
  else onTileMessage("🤸 Jump! (guard recharging)");
}

function doAttack() {
  if (!state.me.created) return;
  if (hasLeash(state.me)) return doRecruit();
  if (!equippedWeapon(state.me)) return onTileMessage("You need a weapon in hand. Buy a knife and equip it.");
  const cands = [];
  for (const [id, r] of renderPeers) cands.push({ kind: "peer", id, x: r.x, y: r.y, name: r.name });
  for (const n of activeBots()) cands.push({ kind: "bot", ref: n, x: n.x, y: n.y, name: n.name });
  for (const [id, r] of renderMons) cands.push({ kind: "mon", id, x: r.x, y: r.y, name: r.kind === "king" ? "the Rat King" : "a rat" });
  let best = null, bd = attackRangeFor(state.me);   // "Melee range" trait
  for (const c of cands) { const d = Math.hypot(c.x - state.me.pos.x, c.y - state.me.pos.y); if (d <= bd) { bd = d; best = c; } }
  if (!best) return onTileMessage("Nothing in knife reach.");
  const def = useWeapon();   // breaks whether or not it kills
  const wname = def ? def.name : "weapon";
  if (best.kind === "mon") {
    const r = hitMonster(best.id);
    if (r.killed) onTileMessage("Killed " + best.name + "! +" + r.coins + "¢ — your " + wname + " broke.");
    else if (r.woke) onTileMessage("😾 The rat woke up and is hunting again! Your " + wname + " broke.");
    else if (r.blocked) onTileMessage("Struck " + best.name + " — its armor held" + (r.king ? " (♥" + r.guard + " left)" : "") + ". " + wname + " broke.");
  } else if (best.kind === "bot") {
    const r = killCharlie(best.ref.x, best.ref.y);
    onTileMessage(r.ok ? ("You gutted Garlic Charlie! +" + r.bounty + "¢ — your " + wname + " broke.") : "He slipped away.");
  } else {
    // from MUST be our connection id (state.netId), not me.id: the victim replies
    // attackResult `to: from`, and inbound messages are filtered by connection id.
    // Using me.id meant the kill confirmation never reached us, so knives "didn't kill".
    if (sendMsg) sendMsg({ type: "attack", to: best.id, from: state.netId, name: state.me.created ? state.me.name : "someone" });
    onTileMessage("You lunged at " + (best.name || "them") + " — your " + wname + " broke.");
  }
}

function adjacentToEnzo(pos) {
  const px = Math.round(pos.x), py = Math.round(pos.y);
  for (const [ex, ey] of enzoCells(state.shared)) if (Math.max(Math.abs(px - ex), Math.abs(py - ey)) <= 1) return true;
  return false;
}
function nearestEnzoApproach() {
  const s = state.shared, cells = enzoCells(s), cellSet = new Set(cells.map((c) => c[0] + "," + c[1]));
  const blocked = blockedTiles(s), doors = s.doors || {}, ents = entityTileSet();
  let best = null, bd = Infinity;
  for (const [ex, ey] of cells) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const x = ex + dx, y = ey + dy, k = x + "," + y;
    if (cellSet.has(k) || !isWalkable(s, x, y) || blocked.has(k) || doors[k] || ents.has(k)) continue;
    const d = Math.hypot(x - state.me.pos.x, y - state.me.pos.y);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
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
  const entAt = new Map();   // tile -> who's standing there, so a collision can shove them
  for (const [id, r] of renderPeers) entAt.set(Math.round(r.x) + "," + Math.round(r.y), { kind: "peer", id, x: r.x, y: r.y });
  for (const n of activeBots()) entAt.set(Math.round(n.x) + "," + Math.round(n.y), { kind: "bot", id: n.id, ref: n, x: n.x, y: n.y });
  const jumping = now() < (state.jumpPassUntil || 0);
  const phasing = hasPower(state.me, "phase");   // Phasewalk: pass all furniture
  const noclip = now() < (state.noclipUntil || 0);   // admin boost: pass everything briefly
  const solid = (gx, gy) => {
    if (noclip) return false;
    const k = gx + "," + gy;
    if (!walk.has(k) || ents.has(k)) return true;   // void/wall and people always stop you
    const d = doors[k];
    if (d && !doorPassable(d, k, state.me.id, unlockedDoors)) return true;
    if (blocked.has(k)) {
      // glide through furniture/site (never Enzo): phase = always, jump = one piece
      if ((jumping || phasing) && !isEnzoTile(state.shared, gx, gy)) {
        const fk = furnitureAnchorAt(state.shared, gx, gy) || siteAnchorAt(state.shared, gx, gy);
        if (fk && (phasing || !state.jumpPassedKey || state.jumpPassedKey === fk)) return false;
      }
      return true;
    }
    return false;
  };
  // walk toward someone in the next tile over → shove them that way (throttled)
  if (want) {
    const pdx = vx > 1e-4 ? 1 : vx < -1e-4 ? -1 : 0, pdy = vy > 1e-4 ? 1 : vy < -1e-4 ? -1 : 0;
    if (pdx || pdy) {
      const ent = entAt.get((Math.round(me.pos.x) + pdx) + "," + (Math.round(me.pos.y) + pdy));
      if (ent) tryCollidePush(ent, pdx, pdy, blocked, ents);
    }
  }
  let nx = me.pos.x + vx, ny = me.pos.y + vy, movedX = vx !== 0, movedY = vy !== 0;
  if (vx !== 0 && solid(Math.round(nx), Math.round(me.pos.y))) { nx = me.pos.x; movedX = false; }
  if (vy !== 0 && solid(Math.round(nx), Math.round(ny))) { ny = me.pos.y; movedY = false; }
  me.pos.x = clamp(nx, f.x, f.x + f.w - 1);
  me.pos.y = clamp(ny, f.y, f.y + f.h - 1);
  // the first furniture/site tile you land on becomes your one allowed pass-through
  if (jumping) {
    const rx = Math.round(me.pos.x), ry = Math.round(me.pos.y);
    if (!isEnzoTile(state.shared, rx, ry)) {
      const fk = furnitureAnchorAt(state.shared, rx, ry) || siteAnchorAt(state.shared, rx, ry);
      if (fk) state.jumpPassedKey = fk;
    }
  }
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
    r.name = p.name; r.look = p.look; r.worn = p.worn; r.size = p.size; r.pet = p.pet;
  }
  for (const id of renderPeers.keys()) if (!live.has(id)) renderPeers.delete(id);
}

function updateNPCs(dt) {
  const s = state.shared, walk = walkableSet(s), blocked = blockedTiles(s), doors = s.doors || {};
  const alive = isCharlieAlive();
  if (alive && !charlie._alive) { const r0 = s.rooms[0]; charlie.x = r0.x + 1; charlie.y = r0.y + 1; charlie.target = null; charlie.pause = 1; }
  charlie._alive = alive;
  if (!alive) return;
  charlie.worn = gearWorn((s.charlie && s.charlie.gear) || {});   // show whatever gear he's bought
  const solid = (gx, gy) => { const k = gx + "," + gy; if (!walk.has(k) || blocked.has(k)) return true; const d = doors[k]; return !!(d && d.locked); };
  let walkList = null;
  const pick = () => { if (!walkList) walkList = [...walk].map((k) => k.split(",").map(Number)).filter(([x, y]) => !solid(x, y)); return walkList.length ? walkList[Math.floor(Math.random() * walkList.length)] : null; };
  // Charlie hunts only TIRED rats that are in a protected (communal) room —
  // he cleans up strays, he doesn't steal fresh kills.
  const protRats = Object.entries(s.monsters || {}).filter(([id, m]) => m.kind === "rat" && m.tired && isProtected(s, Math.round(m.x), Math.round(m.y)));
  for (const n of activeBots()) {
    let hunt = null, hd = Infinity;
    for (const [id, m] of protRats) { const d = Math.hypot(m.x - n.x, m.y - n.y); if (d < hd) { hd = d; hunt = { id, x: m.x, y: m.y }; } }
    if (hunt) {                                  // chase the nearest protected-room rat
      n.target = { x: hunt.x, y: hunt.y }; n.pause = 0;
      if (hd < 1.35 && state.isHost) charlieEatRat(hunt.id);   // caught it — host removes it
    }
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

function updateMonsters(dt) {
  const mons = (state.shared && state.shared.monsters) || {}, live = new Set();
  for (const [id, m] of Object.entries(mons)) {
    live.add(id);
    let r = renderMons.get(id);
    if (!r) { r = { x: m.x, y: m.y }; renderMons.set(id, r); }
    r.x = lerp(r.x, m.x, clamp(dt * 8, 0, 1));
    r.y = lerp(r.y, m.y, clamp(dt * 8, 0, 1));
    r.kind = m.kind; r.armor = m.armor; r.guard = m.guard; r.tired = m.tired;
  }
  for (const id of renderMons.keys()) if (!live.has(id)) renderMons.delete(id);
}

function makeCharlie() {
  return { id: CHARLIE_ID, x: 2, y: 2, target: null, pause: Math.random() * 3, moving: false, _alive: true, look: lookFromSeed("garlic-charlie-vii"), name: "GARLIC CHARLIE" };
}

// ---- loop + render --------------------------------------------------------

function loop() {
  const t = now();
  const dt = clamp((t - lastFrame) / 1000, 0, 0.1);
  lastFrame = t;
  updateMe(dt); updatePeers(dt); updateNPCs(dt); updateMonsters(dt);

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

  // the fog frontier: the ring of buyable void hugging the office. Always a faint
  // hint; in Expand mode it lights up, brighter where you can reach to claim it.
  {
    const frontier = tileFrontier(s);
    const R = interactRange(state.me), px = Math.round(state.me.pos.x), py = Math.round(state.me.pos.y);
    for (const k of frontier) {
      const [gx, gy] = k.split(",").map(Number);
      if (buildExpand) {
        const near = Math.max(Math.abs(gx - px), Math.abs(gy - py)) <= R;
        drawTile(gx, gy, near ? "rgba(120,205,155,0.30)" : "rgba(95,115,155,0.16)");
      } else {
        drawTile(gx, gy, "rgba(80,95,130,0.07)");
      }
    }
  }

  // when holding something, shade every tile you can reach so the placement
  // range is obvious (you can only build within interact range)
  if (state.me.created && (buildType || buildMod || buildDoor)) {
    const R = interactRange(state.me), px = Math.round(state.me.pos.x), py = Math.round(state.me.pos.y);
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
      const x = px + dx, y = py + dy;
      if (isWalkable(s, x, y)) drawTile(x, y, "rgba(90,160,240,0.13)");
    }
  }

  if (mouse.over && state.me.created) {
    const reach = withinReach(state.me, mouse.gx, mouse.gy);
    if (buildType) {
      const blocked = blockedTiles(s);
      for (const [cx, cy] of footprintCells(buildType, mouse.gx, mouse.gy, buildRot)) {
        const ok = reach && isWalkable(s, cx, cy) && !blocked.has(cx + "," + cy) && !s.doors[cx + "," + cy];
        drawTile(cx, cy, ok ? "rgba(70,190,120,0.55)" : "rgba(230,80,70,0.5)");
      }
    } else if (buildMod) {
      const fKey = furnitureAnchorAt(s, mouse.gx, mouse.gy);
      const f = fKey && s.furniture[fKey];
      const ok = reach && f && hasSurface(f.type) && !(f.mods && f.mods[mouse.gx + "," + mouse.gy]);
      if (inBounds(mouse.gx, mouse.gy)) drawTile(mouse.gx, mouse.gy, ok ? "rgba(150,90,220,0.6)" : "rgba(230,80,70,0.45)");
    } else if (buildDoor) {
      const ok = reach && isWalkable(s, mouse.gx, mouse.gy) && !s.doors[mouse.gx + "," + mouse.gy] && !s.furniture[mouse.gx + "," + mouse.gy] && !s.sites[mouse.gx + "," + mouse.gy];
      if (isWalkable(s, mouse.gx, mouse.gy)) drawTile(mouse.gx, mouse.gy, ok ? "rgba(90,160,240,0.55)" : "rgba(230,80,70,0.45)");
    } else if (buildExpand) {
      const buyable = isBuyableTile(s, mouse.gx, mouse.gy) && canBuyTiles(s), ok = reach && buyable;
      if (buyable) {
        drawTile(mouse.gx, mouse.gy, ok ? "rgba(70,200,130,0.6)" : "rgba(230,150,70,0.45)");
        const p = project(mouse.gx, mouse.gy, canvas), Z = camera.zoom, label = tileCost(s) + "¢";
        ctx.font = `${11 * Z}px "Fredoka", system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const wpx = ctx.measureText(label).width + 10 * Z;
        ctx.fillStyle = "rgba(20,22,28,0.82)"; rrect(ctx, p.x - wpx / 2, p.y - 10 * Z, wpx, 15 * Z, 7 * Z);
        ctx.fillStyle = ok ? "#8ff0ac" : "#f2c14e"; ctx.fillText(label, p.x, p.y - 2.5 * Z);
      }
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
  for (const [key, w] of Object.entries(s.walls || {})) {
    const [wx, wy, side] = key.split(","); const gx = wx | 0, gy = wy | 0;
    items.push({ depth: gx + gy - 0.4, kind: "wall", gx, gy, side, w });   // sits behind the tile's occupants
  }
  const eCells = enzoCells(s);
  items.push({ depth: cellsDepth(eCells) + 0.2, kind: "enzo", cells: eCells });
  items.push({ depth: state.me.pos.x + state.me.pos.y, kind: "me" });
  for (const [, r] of renderPeers) items.push({ depth: r.x + r.y, kind: "peer", r });
  for (const n of activeBots()) items.push({ depth: n.x + n.y, kind: "npc", n });
  for (const [, r] of renderMons) items.push({ depth: r.x + r.y + 0.02, kind: "mon", r });
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
    else if (it.kind === "mon") drawMonster(it.r);
    else if (it.kind === "wall") drawWall(it.gx, it.gy, it.side, it.w);
  }

  // holding a wall piece: highlight the wall edge the cursor is nearest
  if (state.me.created && buildWall && mouse.over) {
    const edge = nearestWallEdge();
    if (edge) {
      const c = wallFaceCenter(edge.gx, edge.gy, edge.side), Z = camera.zoom, s = 9 * Z;
      ctx.strokeStyle = "rgba(70,200,130,0.95)"; ctx.lineWidth = 2 * Z;
      ctx.strokeRect(c.x - s, c.y - s, s * 2, s * 2);
      const def = WALL_DECOR[buildWall];
      if (def) { ctx.globalAlpha = 0.7; ctx.font = `${12 * Z}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(def.glyph, c.x, c.y); ctx.globalAlpha = 1; }
    }
  }
}

function drawMonster(r) {
  const p = project(r.x, r.y, canvas), zoom = camera.zoom, king = r.kind === "king";
  ctx.save(); ctx.scale(1, 0.5); ctx.beginPath(); ctx.arc(p.x, (p.y + 4 * zoom) / 0.5, (king ? 12 : 7) * zoom, 0, 7); ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fill(); ctx.restore();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.globalAlpha = r.tired ? 0.7 : 1;
  ctx.font = `${(king ? 30 : 17) * zoom}px system-ui, sans-serif`;
  ctx.fillText("🐀", p.x, p.y - (king ? 8 : 5) * zoom);
  ctx.globalAlpha = 1;
  if (r.tired) {   // spinning "tired" spiral above the head
    const spin = (now() / 500) % (Math.PI * 2);
    ctx.save(); ctx.translate(p.x, p.y - 18 * zoom); ctx.rotate(spin);
    ctx.font = `${12 * zoom}px system-ui, sans-serif`; ctx.fillText("💫", 0, 0); ctx.restore();
  }
  if (king) {
    ctx.font = `${16 * zoom}px system-ui, sans-serif`; ctx.fillText("👑", p.x, p.y - 26 * zoom);
    ctx.font = `${10 * zoom}px "Fredoka", system-ui, sans-serif`; ctx.fillStyle = "#b04a4a"; ctx.fillText("♥ " + r.guard, p.x, p.y + 6 * zoom);
  } else if (r.armor) {
    ctx.font = `${11 * zoom}px system-ui, sans-serif`; ctx.fillText("🛡️", p.x + 8 * zoom, p.y - 11 * zoom);
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

// ---- wall decor -----------------------------------------------------------
const WALL_Z = 15;   // wall height in design px (matches drawBackWalls)
// Screen center of a tile's wall face on the given side ("W" up-left, "N" up-right).
function wallFaceCenter(gx, gy, side) {
  const c = tileCorners(gx, gy), WZ = WALL_Z * camera.zoom;
  const a = side === "W" ? c.L : c.T, b = side === "W" ? c.T : c.R;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - WZ * 0.55 };
}
// The empty wall edge nearest the cursor, among walls the player can reach.
function nearestWallEdge() {
  const me = state.me, s = state.shared, R = interactRange(me);
  const px = Math.round(me.pos.x), py = Math.round(me.pos.y);
  let best = null, bd = Infinity;
  for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
    const gx = px + dx, gy = py + dy;
    for (const side of ["W", "N"]) {
      if (!wallIsReal(s, gx, gy, side) || (s.walls && s.walls[gx + "," + gy + "," + side])) continue;
      const c = wallFaceCenter(gx, gy, side), d = Math.hypot(c.x - mouse.sx, c.y - mouse.sy);
      if (d < bd) { bd = d; best = { gx, gy, side }; }
    }
  }
  return best;
}
// A hung piece near the cursor and within reach (for selecting/taking down).
function pickWallDecor() {
  const s = state.shared; if (!s.walls) return null;
  let best = null, bd = 22 * camera.zoom;
  for (const key of Object.keys(s.walls)) {
    const [gx, gy, side] = [key.split(",")[0] | 0, key.split(",")[1] | 0, key.split(",")[2]];
    if (!withinReach(state.me, gx, gy)) continue;
    const c = wallFaceCenter(gx, gy, side), d = Math.hypot(c.x - mouse.sx, c.y - mouse.sy);
    if (d < bd) { bd = d; best = { key, gx, gy, side }; }
  }
  return best;
}
function drawWall(gx, gy, side, w) {
  const def = WALL_DECOR[w.type]; if (!def) return;
  const c = wallFaceCenter(gx, gy, side), Z = camera.zoom, s = 8 * Z;
  ctx.fillStyle = shade(def.color, -28); rrect(ctx, c.x - s - 1 * Z, c.y - s - 1 * Z, (s + 1 * Z) * 2, (s + 1 * Z) * 2, 2 * Z);   // frame
  ctx.fillStyle = shade(def.color, 30); rrect(ctx, c.x - s, c.y - s, s * 2, s * 2, 1.5 * Z);   // mat
  ctx.font = `${12 * Z}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(def.glyph, c.x, c.y + 0.5 * Z);
}

// tint by role (tag is the legacy key): research blue, build orange, gold gold.
const TAG_TINT = { brain: "#4b56b8", build: "#c9772f", neutral: "#d4a72c" };

// ---- furniture models -----------------------------------------------------
// Each piece is drawn as shaped isometric volumes (a body of boxes plus a few
// accent marks) so it reads as the actual object, not a colored cube with an
// emoji. Heights are in design px, scaled by camera zoom inside the helpers.

// Screen point of a grid position raised by h design-px.
function fp(gx, gy, h = 0) { const p = project(gx, gy, canvas); return { x: p.x, y: p.y - h * camera.zoom }; }

// An axis-aligned iso box over a grid rect, from height zb..zt (design px).
// Returns the four ground corners + top height so callers can add detail.
function box(g0x, g0y, g1x, g1y, zb, zt, tint) {
  const Z = camera.zoom, hb = zb * Z, ht = zt * Z;
  const nw = fp(g0x, g0y), ne = fp(g1x, g0y), se = fp(g1x, g1y), sw = fp(g0x, g1y);
  if (zt > zb) {
    ctx.fillStyle = shade(tint, -32);   // left face (sw–se)
    quad({ x: sw.x, y: sw.y - hb }, { x: se.x, y: se.y - hb }, { x: se.x, y: se.y - ht }, { x: sw.x, y: sw.y - ht });
    ctx.fillStyle = shade(tint, -16);   // right face (ne–se)
    quad({ x: ne.x, y: ne.y - hb }, { x: se.x, y: se.y - hb }, { x: se.x, y: se.y - ht }, { x: ne.x, y: ne.y - ht });
  }
  ctx.fillStyle = tint;                 // top face
  ctx.beginPath(); ctx.moveTo(nw.x, nw.y - ht); ctx.lineTo(ne.x, ne.y - ht); ctx.lineTo(se.x, se.y - ht); ctx.lineTo(sw.x, sw.y - ht); ctx.closePath(); ctx.fill();
  return { nw, ne, se, sw, ht, hb, cxTop: (nw.x + se.x) / 2, cyTop: (nw.y + se.y) / 2 - ht };
}
// Four corner posts (legs/table stand) inside a rect.
function posts(g, top, tint, d = 0.09) {
  const c = [[g.g0x + d, g.g0y + d], [g.g1x - d, g.g0y + d], [g.g1x - d, g.g1y - d], [g.g0x + d, g.g1y - d]];
  for (const [x, y] of c) box(x - d, y - d, x + d, y + d, 0, top, shade(tint, -22));
}
// An upright billboard panel centered on the footprint (for boards/screens).
function panel(g, groundH, w, h, fill, stroke) {
  const c = fp(g.cx, g.cy, groundH), Z = camera.zoom, W = w * Z, H = h * Z;
  ctx.fillStyle = fill; rrect(ctx, c.x - W / 2, c.y - H, W, H, 3 * Z);
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.4 * Z; ctx.strokeRect(c.x - W / 2, c.y - H, W, H); }
  return { x: c.x, y: c.y, W, H, Z };
}

function mTable(g) {
  const Z = camera.zoom, topH = g.def.h * 0.62 * g.lvl;
  posts(g, topH, g.tint);
  const top = box(g.g0x, g.g0y, g.g1x, g.g1y, topH, topH + 3, shade(g.tint, 12));
  const c = { x: top.cxTop, y: top.cyTop };
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (g.type === "snacktable") { ctx.fillStyle = "#e7c15a"; ctx.beginPath(); ctx.arc(c.x, c.y, 6 * Z, 0, 7); ctx.fill(); ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, 6 * Z, -0.5, 0.6); ctx.closePath(); ctx.fill(); }
  else if (g.type === "pingpong") { ctx.strokeStyle = "#e9edf3"; ctx.lineWidth = 1.4 * Z; ctx.beginPath(); ctx.moveTo(c.x - 10 * Z, c.y - 2 * Z); ctx.lineTo(c.x + 10 * Z, c.y - 2 * Z); ctx.stroke(); ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.arc(c.x - 12 * Z, c.y + 2 * Z, 2.4 * Z, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(c.x + 12 * Z, c.y + 2 * Z, 2.4 * Z, 0, 7); ctx.fill(); }
  else if (g.type === "espresso") { ctx.fillStyle = "#3a3f4b"; rrect(ctx, c.x - 4 * Z, c.y - 12 * Z, 8 * Z, 12 * Z, 2 * Z); ctx.fillStyle = "#e9edf3"; ctx.fillRect(c.x - 2 * Z, c.y - 4 * Z, 4 * Z, 3 * Z); ctx.globalAlpha *= 0.6; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(c.x, c.y - 15 * Z, 2 * Z, 0, 7); ctx.fill(); ctx.globalAlpha /= 0.6; }
}
function mChair(g) {
  const seatH = g.def.h * 0.5 * g.lvl;
  posts({ g0x: g.g0x + 0.06, g0y: g.g0y + 0.06, g1x: g.g1x - 0.06, g1y: g.g1y - 0.06 }, seatH, g.tint, 0.07);
  box(g.g0x + 0.04, g.g0y + 0.04, g.g1x - 0.04, g.g1y - 0.04, seatH, seatH + 2.5, shade(g.tint, 8));
  box(g.g0x + 0.04, g.g0y + 0.04, g.g1x - 0.04, g.g0y + 0.2, seatH + 2.5, seatH + 13 * g.lvl, g.tint);   // backrest at the back edge
}
function mDesk(g) {
  const bodyH = g.def.h * 0.7 * g.lvl;
  const b = box(g.g0x, g.g0y, g.g1x, g.g1y, 0, bodyH, g.tint);
  // drawer seams on the right (front) face
  ctx.strokeStyle = shade(g.tint, -34); ctx.lineWidth = 1 * camera.zoom;
  ctx.beginPath(); ctx.moveTo(b.ne.x, b.ne.y - b.ht * 0.62); ctx.lineTo(b.se.x, b.se.y - b.ht * 0.62); ctx.stroke();
  const c = { x: b.cxTop, y: b.cyTop }, Z = camera.zoom;
  if (g.type === "workbench") { ctx.strokeStyle = "#c9772f"; ctx.lineWidth = 2 * Z; ctx.beginPath(); ctx.moveTo(c.x - 6 * Z, c.y); ctx.lineTo(c.x + 2 * Z, c.y - 5 * Z); ctx.stroke(); ctx.fillStyle = "#8a939f"; ctx.beginPath(); ctx.arc(c.x + 5 * Z, c.y - 1 * Z, 2.2 * Z, 0, 7); ctx.fill(); }
  else { ctx.fillStyle = "#f4f6fa"; ctx.fillRect(c.x - 4 * Z, c.y - 3 * Z, 8 * Z, 5 * Z); ctx.strokeStyle = "#9aa3af"; ctx.lineWidth = 0.8 * Z; ctx.strokeRect(c.x - 4 * Z, c.y - 3 * Z, 8 * Z, 5 * Z); }
}
// L-shaped desk: draw the two arms as separate desk boxes so it reads as an L,
// not a filled 2x2 square. Works for any rotation because it uses the actual
// occupied cells: the corner cell is the one orthogonally adjacent to both ends.
function mLDesk(g) {
  const bodyH = g.def.h * 0.7 * g.lvl, cells = g.cells || [];
  if (cells.length < 3) return mDesk(g);   // safety: fall back to the box
  const adj = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
  let corner = cells[0], ends = cells.slice(1);
  for (const c of cells) { const rest = cells.filter((o) => o !== c); if (rest.length === 2 && rest.every((o) => adj(c, o))) { corner = c; ends = rest; } }
  const arm = (a, b) => {
    const g0x = Math.min(a[0], b[0]) - 0.5 + 0.04, g0y = Math.min(a[1], b[1]) - 0.5 + 0.04;
    const g1x = Math.max(a[0], b[0]) + 0.5 - 0.04, g1y = Math.max(a[1], b[1]) + 0.5 - 0.04;
    return box(g0x, g0y, g1x, g1y, 0, bodyH, g.tint);
  };
  // draw the arm that's further back first so the front arm sits on top
  const pair = [ends[0], ends[1]].sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
  arm(corner, pair[0]); const front = arm(corner, pair[1]);
  const Z = camera.zoom, c = { x: front.cxTop, y: front.cyTop };   // a notepad on the near arm
  ctx.fillStyle = "#f4f6fa"; ctx.fillRect(c.x - 4 * Z, c.y - 3 * Z, 8 * Z, 5 * Z);
  ctx.strokeStyle = "#9aa3af"; ctx.lineWidth = 0.8 * Z; ctx.strokeRect(c.x - 4 * Z, c.y - 3 * Z, 8 * Z, 5 * Z);
}
function mDeskMon(g) {
  const bodyH = g.def.h * 0.55 * g.lvl;
  box(g.g0x, g.g0y, g.g1x, g.g1y, 0, bodyH, g.tint);
  const scr = panel({ cx: g.cx - 0.12, cy: g.cy - 0.12 }, bodyH, 15, 11, "#20242e", shade(g.tint, 20));
  ctx.fillStyle = g.type === "researchterm" ? "#7fe6c9" : "#8fb7ff";
  ctx.fillRect(scr.x - scr.W / 2 + 2 * scr.Z, scr.y - scr.H + 2 * scr.Z, scr.W - 4 * scr.Z, scr.H - 4 * scr.Z);
  ctx.fillStyle = "#20242e";
  if (g.type === "researchterm") { ctx.beginPath(); ctx.arc(scr.x, scr.y - scr.H / 2, 2.4 * scr.Z, 0, 7); ctx.fill(); }
  else { for (let i = 0; i < 3; i++) ctx.fillRect(scr.x - scr.W / 2 + 3 * scr.Z, scr.y - scr.H + (3 + i * 2.5) * scr.Z, (4 + i * 2) * scr.Z, 1.2 * scr.Z); }
}
function mChest(g) {
  const bodyH = g.def.h * 0.6 * g.lvl;
  const b = box(g.g0x + 0.04, g.g0y + 0.04, g.g1x - 0.04, g.g1y - 0.04, 0, bodyH, g.tint);
  ctx.strokeStyle = shade(g.tint, -34); ctx.lineWidth = 1.2 * camera.zoom;
  ctx.beginPath(); ctx.moveTo(b.ne.x, b.ne.y - b.ht * 0.5); ctx.lineTo(b.se.x, b.se.y - b.ht * 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(b.sw.x, b.sw.y - b.ht * 0.5); ctx.lineTo(b.se.x, b.se.y - b.ht * 0.5); ctx.stroke();
  ctx.fillStyle = "#e9c65a"; ctx.fillRect(b.cxTop - 1.5 * camera.zoom, b.cyTop + b.ht * 0.4, 3 * camera.zoom, 3 * camera.zoom);   // latch
}
function mBoard(g) {
  const Z = camera.zoom, standH = g.def.h * 0.42 * g.lvl;
  box(g.cx - 0.32, g.g1y - 0.16, g.cx - 0.22, g.g1y - 0.06, 0, standH, shade(g.tint, -20));
  box(g.cx + 0.22, g.g1y - 0.16, g.cx + 0.32, g.g1y - 0.06, 0, standH, shade(g.tint, -20));
  const face = g.type === "quantumboard" ? "#1c2330" : "#f4f6fa";
  const pn = panel(g, standH, 34, 20 * g.lvl / g.lvl, face, shade(g.tint, -10));
  ctx.strokeStyle = g.type === "quantumboard" ? "#8fb7ff" : "#4b56b8"; ctx.lineWidth = 1.3 * Z; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(pn.x - 10 * Z, pn.y - 13 * Z); ctx.lineTo(pn.x - 2 * Z, pn.y - 8 * Z); ctx.lineTo(pn.x + 4 * Z, pn.y - 14 * Z); ctx.lineTo(pn.x + 11 * Z, pn.y - 7 * Z); ctx.stroke();
  if (g.type === "quantumboard") { ctx.strokeStyle = "#f2b134"; ctx.beginPath(); ctx.ellipse(pn.x, pn.y - 10 * Z, 9 * Z, 4 * Z, 0.5, 0, 7); ctx.stroke(); }
}
function mCooler(g) {
  const Z = camera.zoom, standH = g.def.h * 0.5 * g.lvl;
  box(g.g0x + 0.14, g.g0y + 0.14, g.g1x - 0.14, g.g1y - 0.14, 0, standH, shade(g.tint, -6));
  const c = fp(g.cx, g.cy, standH);
  ctx.fillStyle = "rgba(120,190,240,0.85)"; rrect(ctx, c.x - 5 * Z, c.y - 14 * Z, 10 * Z, 14 * Z, 3 * Z);
  ctx.fillStyle = "rgba(200,230,255,0.6)"; rrect(ctx, c.x - 3 * Z, c.y - 12 * Z, 3 * Z, 8 * Z, 1.5 * Z);
}
function mRack(g) {
  const Z = camera.zoom, bodyH = g.def.h * g.tall * g.lvl;
  const b = box(g.g0x + 0.15, g.g0y + 0.15, g.g1x - 0.15, g.g1y - 0.15, 0, bodyH, shade(g.tint, -10));
  // dark front bezel with rack-unit slots + a column of blinking LEDs
  const fL = (t, hz) => ({ x: b.ne.x + (b.se.x - b.ne.x) * t, y: b.ne.y + (b.se.y - b.ne.y) * t - b.ht * hz });
  ctx.strokeStyle = shade(g.tint, -40); ctx.lineWidth = 1 * Z;
  for (let i = 1; i < 7; i++) { const a = fL(0.12, i / 7), c2 = fL(0.9, i / 7); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c2.x, c2.y); ctx.stroke(); }
  const on = (Math.floor(now() / 380) % 3);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 3 === on ? "#8ff0ac" : "#2f6b3f"; const p = fL(0.2, (i + 0.5) / 7); ctx.beginPath(); ctx.arc(p.x, p.y, 1.7 * Z, 0, 7); ctx.fill(); }
}
function mMachine(g) {
  const Z = camera.zoom, bodyH = g.def.h * g.tall * g.lvl;
  const b = box(g.g0x + 0.12, g.g0y + 0.12, g.g1x - 0.12, g.g1y - 0.12, 0, bodyH, g.tint);
  // control panel on the front (right) face
  const pL = (t, hz) => ({ x: b.ne.x + (b.se.x - b.ne.x) * t, y: b.ne.y + (b.se.y - b.ne.y) * t - b.ht * hz });
  const a = pL(0.3, 0.42), w = pL(0.7, 0.42);
  ctx.strokeStyle = shade(g.tint, -38); ctx.lineWidth = 1 * Z;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(w.x, w.y); ctx.stroke();
  ctx.fillStyle = "#f2b134"; ctx.beginPath(); ctx.arc(pL(0.4, 0.28).x, pL(0.4, 0.28).y, 1.4 * Z, 0, 7); ctx.fill();
  ctx.fillStyle = "#7fe6c9"; ctx.beginPath(); ctx.arc(pL(0.6, 0.28).x, pL(0.6, 0.28).y, 1.4 * Z, 0, 7); ctx.fill();
  const c = { x: b.cxTop, y: b.cyTop };
  if (g.type === "forge" || g.type === "fabricator") {   // gear wheel
    const spin = now() / 900; ctx.save(); ctx.translate(c.x, c.y - 3 * Z); ctx.rotate(spin);
    ctx.fillStyle = shade(g.tint, 22); for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-1.4 * Z, -8 * Z, 2.8 * Z, 4 * Z); }
    ctx.beginPath(); ctx.arc(0, 0, 5 * Z, 0, 7); ctx.fill(); ctx.fillStyle = shade(g.tint, -30); ctx.beginPath(); ctx.arc(0, 0, 2 * Z, 0, 7); ctx.fill(); ctx.restore();
  } else if (g.type === "robotarm") {   // articulated arm
    ctx.strokeStyle = shade(g.tint, 26); ctx.lineWidth = 2.6 * Z; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + 4 * Z, c.y - 9 * Z); ctx.lineTo(c.x + 12 * Z, c.y - 6 * Z); ctx.stroke();
    ctx.fillStyle = "#f2b134"; ctx.beginPath(); ctx.arc(c.x + 13 * Z, c.y - 6 * Z, 2 * Z, 0, 7); ctx.fill();
  } else {   // oracle / realitypress: glowing core
    ctx.globalAlpha *= 0.85; ctx.fillStyle = g.type === "oracle" ? "#b98cff" : "#ff8f6a";
    ctx.beginPath(); ctx.arc(c.x, c.y - 3 * Z, 5 * Z, 0, 7); ctx.fill();
    ctx.globalAlpha /= 0.85; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(c.x - 1 * Z, c.y - 4 * Z, 1.6 * Z, 0, 7); ctx.fill();
  }
}
function mAltar(g) {
  const Z = camera.zoom, tall = g.type === "obelisk";
  if (tall) {
    box(g.cx - 0.22, g.cy - 0.22, g.cx + 0.22, g.cy + 0.22, 0, g.def.h * g.lvl, "#2b2f3a");
    const c = fp(g.cx, g.cy, g.def.h * g.lvl);
    ctx.fillStyle = "rgba(150,120,255,0.5)"; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(c.x, c.y + (4 + i * 6) * Z, 2 * Z, 0, 7); ctx.fill(); }
  } else {
    box(g.g0x + 0.16, g.g0y + 0.16, g.g1x - 0.16, g.g1y - 0.16, 0, g.def.h * 0.5 * g.lvl, shade(g.tint, -6));
    box(g.g0x + 0.28, g.g0y + 0.28, g.g1x - 0.28, g.g1y - 0.28, g.def.h * 0.5 * g.lvl, g.def.h * 0.62 * g.lvl, shade(g.tint, 10));
  }
  const top = fp(g.cx, g.cy, (tall ? g.def.h : g.def.h * 0.62) * g.lvl);
  const pulse = 0.6 + 0.4 * Math.sin(now() / 500);
  ctx.save(); ctx.globalAlpha *= pulse; ctx.fillStyle = tall ? "#9a7dff" : "#c39bff";
  ctx.beginPath(); ctx.arc(top.x, top.y - 4 * Z, 4 * Z, 0, 7); ctx.fill(); ctx.restore();
}
function mMotel(g) {
  const Z = camera.zoom, wallH = g.def.h * 0.7 * g.lvl;
  const b = box(g.g0x + 0.08, g.g0y + 0.08, g.g1x - 0.08, g.g1y - 0.08, 0, wallH, "#8a7a5c");
  // little pitched roof
  const apexL = fp(g.g0x + 0.08, g.cy, wallH + 8), apexR = fp(g.g1x - 0.08, g.cy, wallH + 8);
  ctx.fillStyle = "#6b4f3a";
  ctx.beginPath(); ctx.moveTo(b.nw.x, b.nw.y - b.ht); ctx.lineTo(b.ne.x, b.ne.y - b.ht); ctx.lineTo(apexR.x, apexR.y); ctx.lineTo(apexL.x, apexL.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#2b2f3a"; ctx.fillRect(b.cxTop - 2 * Z, b.cyTop + b.ht * 0.3, 4 * Z, 5 * Z);   // dark doorway
}

const FURN_ART = {
  snacktable: mTable, pingpong: mTable, espresso: mTable,
  chair: mChair,
  workbench: mDesk, ldesk: mLDesk,
  standdesk: mDeskMon, researchterm: mDeskMon,
  toolchest: mChest,
  whiteboard: mBoard, quantumboard: mBoard,
  cooler: mCooler,
  server: mRack, aicluster: mRack, singularity: mRack, nanoforge: mRack,
  forge: mMachine, robotarm: mMachine, fabricator: mMachine, oracle: mMachine, realitypress: mMachine,
  altar: mAltar, obelisk: mAltar,
  ratmotel: mMotel,
};

function genericBox(g) {
  box(g.g0x, g.g0y, g.g1x, g.g1y, 0, g.def.h * g.lvl, g.tint);
  const c = fp(g.cx, g.cy, g.def.h * g.lvl);
  ctx.font = `${15 * camera.zoom}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(g.def.glyph, c.x, c.y - 2 * camera.zoom);
}

const TALL_ART = new Set(["server", "aicluster", "singularity", "nanoforge", "forge", "robotarm", "fabricator", "oracle", "realitypress"]);
// approximate top height (design px) of a modeled piece, for placing mods/labels
function furnTopH(g) {
  const h = g.def.h * g.lvl;
  if (TALL_ART.has(g.type)) return h * g.tall;
  if (g.type === "whiteboard" || g.type === "quantumboard") return g.def.h * 0.42 * g.lvl + 20;
  return h;
}

function drawFurniture(ax, ay, f, selected, using) {
  const def = FURNITURE[f.type];
  const broken = f.broken, Z = camera.zoom;
  const tint = broken ? "#7c7c80" : (TAG_TINT[def.tag] || "#9aa3af");
  const cells = footprintCells(f.type, ax, ay, f.rot || 0);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of cells) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }

  // ground cue: green ring when in use, white outline when selected
  if (using || selected) {
    for (const [cx, cy] of cells) { const c = tileCorners(cx, cy); ctx.beginPath(); ctx.moveTo(c.T.x, c.T.y); ctx.lineTo(c.R.x, c.R.y); ctx.lineTo(c.B.x, c.B.y); ctx.lineTo(c.L.x, c.L.y); ctx.closePath(); ctx.strokeStyle = using ? "rgba(70,200,130,0.9)" : "rgba(255,255,255,0.9)"; ctx.lineWidth = (using ? 2 : 1.4) * Z; ctx.stroke(); }
  }

  const ins = 0.16, area = (maxX - minX + 1) * (maxY - minY + 1);
  const g = {
    type: f.type, def, tint, broken, level: f.level || 1, lvl: 1 + ((f.level || 1) - 1) * 0.12,
    area, tall: 0.95 + 0.16 * area,   // taller bodies for bigger footprints (so 2×2 machines aren't slabs)
    g0x: minX - 0.5 + ins, g0y: minY - 0.5 + ins, g1x: maxX + 0.5 - ins, g1y: maxY + 0.5 - ins,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    cells,   // actual occupied cells, for pieces (like the L-desk) that aren't a filled rectangle
  };
  ctx.globalAlpha = broken ? 0.55 : 1;
  (FURN_ART[f.type] || genericBox)(g);
  ctx.globalAlpha = 1;

  const topH = furnTopH(g), c = fp(g.cx, g.cy, topH);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (broken) { ctx.font = `${14 * Z}px system-ui, sans-serif`; ctx.fillText("⚠️", c.x + 8 * Z, c.y - 6 * Z); }
  if (f.level > 1) { ctx.font = `${9 * Z}px "Fredoka", system-ui, sans-serif`; ctx.fillStyle = "rgba(20,22,28,0.7)"; rrectW(c.x - 8 * Z, c.y + 2 * Z, 16 * Z, 11 * Z, 3 * Z); ctx.fillStyle = "#eef1f5"; ctx.fillText("L" + f.level, c.x, c.y + 7.5 * Z); }
  if (f.mods) {
    ctx.font = `${12 * Z}px system-ui, sans-serif`;
    for (const [mk, mtype] of Object.entries(f.mods)) { const [mx, my] = mk.split(",").map(Number), mp = fp(mx, my, topH + 6); ctx.fillText((MODS[mtype] && MODS[mtype].glyph) || "?", mp.x, mp.y); }
  }
}
function rrectW(x, y, w, h, r) { rrect(ctx, x, y, w, h, r); }

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
  const since = now() - (state.jumpAt || -1e9);
  const lift = since >= 0 && since < TUNING.jumpArcMs ? Math.sin(Math.PI * (since / TUNING.jumpArcMs)) * TUNING.jumpArcPx * camera.zoom : 0;
  // golden guard ring while immune
  if (state.me.created && isInvulnerable()) {
    const pulse = 0.55 + 0.45 * Math.sin(now() / 110);
    ctx.save(); ctx.globalAlpha = pulse; ctx.strokeStyle = "#f2d24a"; ctx.lineWidth = 2.4 * camera.zoom;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 11 * camera.zoom, 17 * camera.zoom, 8.5 * camera.zoom, 0, 0, 7); ctx.stroke(); ctx.restore();
  }
  const opts = {
    look: state.me.look, scale: camera.zoom * (state.me.created ? sizeMult(state.me) : 1),
    walking: state.me.moving, t, using, name: state.me.created ? state.me.name : "new Joey",
    worn: state.me.created ? wornArt(state.me) : {}, lift,
  };
  if (!drawJoeySprite(ctx, p.x, p.y, opts)) drawJoey(ctx, p.x, p.y, opts);
  if (state.me.created && petActive(state.me)) drawPetRat(p);
}

// A leashed rat buddy trots beside its owner (a small bobbing 🐀 at the feet).
function drawPetRat(p) {
  const zoom = camera.zoom, bob = Math.sin(now() / 220) * 1.5 * zoom;
  ctx.font = `${13 * zoom}px system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("🐀", p.x + 13 * zoom, p.y + 2 * zoom + bob);
}

function drawPeer(r, t, isNpc = false) {
  const p = project(r.x, r.y, canvas);
  if (isNpc) ctx.globalAlpha = 0.95;
  const opts = { look: r.look, scale: camera.zoom * (r.size || 1), walking: r.moving, t, name: r.name || "JOEY", worn: r.worn || {} };
  if (!drawJoeySprite(ctx, p.x, p.y, opts)) drawJoey(ctx, p.x, p.y, opts);
  ctx.globalAlpha = 1;
  if (r.pet) drawPetRat(p);
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
    pet: state.me.created && petActive(state.me),
    powers: state.me.created ? powerList(state.me) : [],
  };
}
