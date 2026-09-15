// The isometric room: draws the shared floor and furniture, every Joey (you,
// real peers, ambient bot-Joeys), and handles movement + build input. Furniture
// you're standing next to glows to show you're "using" it.

import { TILE_W, TILE_H, camera, project, screenToGrid } from "./iso.js";
import { drawJoey, lookFromSeed, shade } from "./appearance.js";
import { FURNITURE, usingKeys } from "./economy.js";
import { TUNING } from "./config.js";
import { clamp, lerp, now } from "./util.js";
import { state, inBounds, tryPlaceFurniture } from "./state.js";

let canvas, ctx, dpr = 1;
let buildType = null;
let onFurnitureClick = () => {};
let onTileMessage = () => {};
const keys = new Set();
let mouse = { sx: 0, sy: 0, gx: 0, gy: 0, over: false };
let target = null;
let selectedKey = null;
const renderPeers = new Map();
const NPC_NAMES = ["JOEY BOT", "JOE-9000", "JOEBOT", "AUTO-JOE", "PROXY JOE"];
const npcs = makeNPCs(3);
let lastFrame = now();

export function initWorld(canvasEl, hooks = {}) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");
  onFurnitureClick = hooks.onFurnitureClick || onFurnitureClick;
  onTileMessage = hooks.onTileMessage || onTileMessage;

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (e) => { if (e.target.tagName === "INPUT") return; keys.add(e.key.toLowerCase()); });
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
    camera.zoom = clamp(camera.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.55, 1.9);
  }, { passive: false });

  requestAnimationFrame(loop);
}

export function setBuild(type) { buildType = type; }
export function getBuild() { return buildType; }
export function setSelected(key) { selectedKey = key; }

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
}

function onClick() {
  if (!mouse.over || !state.me.created) return;
  const gx = mouse.gx, gy = mouse.gy, key = `${gx},${gy}`;
  const f = state.shared.furniture[key];
  if (buildType) {
    if (!inBounds(gx, gy)) return onTileMessage("Outside the floor.");
    if (f) return onTileMessage("That tile is occupied.");
    const r = tryPlaceFurniture(buildType, gx, gy);
    if (!r.ok) onTileMessage(r.why || "Can't build there.");
    return;
  }
  if (f) { onFurnitureClick(key, f); return; }
  if (inBounds(gx, gy)) target = { x: gx, y: gy };
}

// ---- movement -------------------------------------------------------------

function updateMe(dt) {
  const me = state.me;
  if (!me.created) { me.moving = false; return; }
  const speed = TUNING.walkSpeed * ((me.buffs && me.buffs.speedMult) || 1);
  let dx = 0, dy = 0;
  if (keys.has("w") || keys.has("arrowup")) { dx -= 1; dy -= 1; }
  if (keys.has("s") || keys.has("arrowdown")) { dx += 1; dy += 1; }
  if (keys.has("a") || keys.has("arrowleft")) { dx -= 1; dy += 1; }
  if (keys.has("d") || keys.has("arrowright")) { dx += 1; dy -= 1; }

  let moving = false;
  if (dx || dy) {
    target = null;
    const len = Math.hypot(dx, dy) || 1;
    me.pos.x += (dx / len) * speed * dt;
    me.pos.y += (dy / len) * speed * dt;
    moving = true;
  } else if (target) {
    const ddx = target.x - me.pos.x, ddy = target.y - me.pos.y, dist = Math.hypot(ddx, ddy);
    if (dist < 0.06) target = null;
    else { const step = Math.min(dist, speed * dt); me.pos.x += (ddx / dist) * step; me.pos.y += (ddy / dist) * step; moving = true; }
  }
  const f = state.shared.floor;
  me.pos.x = clamp(me.pos.x, 0, f.w - 1);
  me.pos.y = clamp(me.pos.y, 0, f.h - 1);
  me.moving = moving;
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
    r.name = p.name; r.look = p.look; r.equipped = p.equipped;
  }
  for (const id of renderPeers.keys()) if (!live.has(id)) renderPeers.delete(id);
}

function updateNPCs(dt) {
  const f = state.shared.floor;
  for (const n of npcs) {
    n.pause -= dt;
    if (!n.target && n.pause <= 0) n.target = { x: Math.random() * (f.w - 1), y: Math.random() * (f.h - 1) };
    if (n.target && n.pause <= 0) {
      const ddx = n.target.x - n.x, ddy = n.target.y - n.y, dist = Math.hypot(ddx, ddy);
      if (dist < 0.1) { n.target = null; n.pause = 1 + Math.random() * 4; n.moving = false; }
      else { const step = Math.min(dist, TUNING.walkSpeed * 0.7 * dt); n.x += (ddx / dist) * step; n.y += (ddy / dist) * step; n.moving = true; }
    }
    n.x = clamp(n.x, 0, f.w - 1); n.y = clamp(n.y, 0, f.h - 1);
  }
}

function makeNPCs(count) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const seed = "npc-" + i;
    arr.push({ id: seed, x: 1 + i, y: 1 + i, target: null, pause: Math.random() * 3, moving: false, look: lookFromSeed(seed), name: NPC_NAMES[i % NPC_NAMES.length] });
  }
  return arr;
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

  for (let gy = 0; gy < s.floor.h; gy++)
    for (let gx = 0; gx < s.floor.w; gx++)
      drawTile(gx, gy, (gx + gy) % 2 === 0 ? "#e9edf3" : "#dfe4ec");

  if (mouse.over && inBounds(mouse.gx, mouse.gy) && state.me.created) {
    const occ = !!s.furniture[`${mouse.gx},${mouse.gy}`];
    if (buildType) drawTile(mouse.gx, mouse.gy, occ ? "rgba(230,80,70,0.5)" : "rgba(70,190,120,0.55)");
    else drawTile(mouse.gx, mouse.gy, "rgba(90,120,220,0.35)");
  }

  const inUse = state.me.created ? new Set(usingKeys(state.me.pos, s)) : new Set();

  const items = [];
  for (const [key, f] of Object.entries(s.furniture)) {
    const [gx, gy] = key.split(",").map(Number);
    items.push({ depth: gx + gy - 0.1, kind: "furn", gx, gy, f, key });
  }
  items.push({ depth: state.me.pos.x + state.me.pos.y, kind: "me" });
  for (const [, r] of renderPeers) items.push({ depth: r.x + r.y, kind: "peer", r });
  for (const n of npcs) items.push({ depth: n.x + n.y, kind: "npc", n });
  items.sort((a, b) => a.depth - b.depth);

  for (const it of items) {
    if (it.kind === "furn") drawFurniture(it.gx, it.gy, it.f, it.key === selectedKey, inUse.has(it.key));
    else if (it.kind === "me") drawMe(t);
    else if (it.kind === "peer") drawPeer(it.r, t);
    else if (it.kind === "npc") drawPeer(it.n, t, true);
  }
}

function tileCorners(gx, gy) {
  const p = project(gx, gy, canvas);
  const hw = (TILE_W / 2) * camera.zoom, hh = (TILE_H / 2) * camera.zoom;
  return { p, T: { x: p.x, y: p.y - hh }, R: { x: p.x + hw, y: p.y }, B: { x: p.x, y: p.y + hh }, L: { x: p.x - hw, y: p.y } };
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

function drawFurniture(gx, gy, f, selected, using) {
  const def = FURNITURE[f.type];
  const tint = TAG_TINT[def.tag] || "#9aa3af";
  const c = tileCorners(gx, gy);
  const z = def.h * camera.zoom * (1 + (f.level - 1) * 0.12);

  if (using) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c.T.x, c.T.y - z); ctx.lineTo(c.R.x, c.R.y - z); ctx.lineTo(c.B.x, c.B.y - z); ctx.lineTo(c.L.x, c.L.y - z);
    ctx.closePath();
    ctx.strokeStyle = "rgba(70,200,130,0.95)"; ctx.lineWidth = 3 * camera.zoom; ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = shade(tint, -30);
  ctx.beginPath();
  ctx.moveTo(c.L.x, c.L.y); ctx.lineTo(c.B.x, c.B.y); ctx.lineTo(c.B.x, c.B.y - z); ctx.lineTo(c.L.x, c.L.y - z);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(tint, -16);
  ctx.beginPath();
  ctx.moveTo(c.R.x, c.R.y); ctx.lineTo(c.B.x, c.B.y); ctx.lineTo(c.B.x, c.B.y - z); ctx.lineTo(c.R.x, c.R.y - z);
  ctx.closePath(); ctx.fill();

  ctx.beginPath();
  ctx.moveTo(c.T.x, c.T.y - z); ctx.lineTo(c.R.x, c.R.y - z); ctx.lineTo(c.B.x, c.B.y - z); ctx.lineTo(c.L.x, c.L.y - z);
  ctx.closePath();
  ctx.fillStyle = selected ? shade(tint, 18) : tint;
  ctx.fill();
  if (selected) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); }

  ctx.font = `${15 * camera.zoom}px system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(def.glyph, c.p.x, c.p.y - z - 1 * camera.zoom);
  if (f.level > 1) {
    ctx.font = `${9 * camera.zoom}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText("L" + f.level, c.p.x, c.p.y - z + 11 * camera.zoom);
  }
}

function drawMe(t) {
  const p = project(state.me.pos.x, state.me.pos.y, canvas);
  const using = state.me.created && usingKeys(state.me.pos, state.shared).length > 0;
  drawJoey(ctx, p.x, p.y, {
    look: state.me.look, equipped: state.me.gear.equipped,
    scale: camera.zoom, walking: state.me.moving, t, using,
    name: state.me.created ? state.me.name : "new Joey",
  });
}

function drawPeer(r, t, isNpc = false) {
  const p = project(r.x, r.y, canvas);
  if (isNpc) ctx.globalAlpha = 0.9;
  drawJoey(ctx, p.x, p.y, { look: r.look, equipped: r.equipped || {}, scale: camera.zoom, walking: r.moving, t, name: r.name || "JOEY" });
  ctx.globalAlpha = 1;
}

// FYI to whoever is standing where — presence payload.
export function myPresence() {
  return {
    name: state.me.created ? state.me.name : "new Joey",
    look: state.me.look, equipped: state.me.gear.equipped,
    x: state.me.pos.x, y: state.me.pos.y, moving: !!state.me.moving,
    specialty: state.me.specialty,
  };
}
