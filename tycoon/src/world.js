// The isometric room: draws the shared floor and furniture, every Joey (you,
// real peers, ambient bot-Joeys), and handles movement + build input. Furniture
// you're standing next to glows to show you're "using" it.

import { TILE_W, TILE_H, camera, project, screenToGrid } from "./iso.js";
import { drawJoey, lookFromSeed, shade } from "./appearance.js";
import {
  FURNITURE, MODS, usingKeys, wornArt, effectiveSpeedMult, siteProgress, isNearFootprint,
  footprintCells, blockedTiles, furnitureAnchorAt, siteAnchorAt, hasSurface,
} from "./economy.js";
import { TUNING } from "./config.js";
import { clamp, lerp, now } from "./util.js";
import { state, inBounds, tryPlaceFurniture, tryPlaceMod, tryRemoveMod } from "./state.js";

let canvas, ctx, dpr = 1;
let buildType = null;   // furniture type being placed
let buildMod = null;    // node-mod type being placed
let buildRot = 0;       // rotation (0..3) for furniture placement
let onFurnitureClick = () => {};
let onSiteClick = () => {};
let onTileMessage = () => {};
let sendMsg = null;
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
  onSiteClick = hooks.onSiteClick || onSiteClick;
  onTileMessage = hooks.onTileMessage || onTileMessage;
  sendMsg = hooks.send || null;

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k === "e") { doPush(); return; }
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
    camera.zoom = clamp(camera.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.55, 1.9);
  }, { passive: false });

  requestAnimationFrame(loop);
}

export function setBuild(type) { buildType = type; buildMod = null; }
export function getBuild() { return buildType; }
export function setBuildMod(type) { buildMod = type; buildType = null; }
export function getBuildMod() { return buildMod; }
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
  if (fKey) { onFurnitureClick(fKey, state.shared.furniture[fKey]); return; }
  if (sKey) { onSiteClick(sKey, state.shared.sites[sKey]); return; }
  if (inBounds(gx, gy)) target = { x: gx, y: gy };
}

// Shove the nearest adjacent person one tile away. Works locally on bots; sends
// a push message to real peers so their own client moves them.
function doPush() {
  if (!state.me.created) return;
  const cands = [];
  for (const [id, r] of renderPeers) cands.push({ kind: "peer", id, x: r.x, y: r.y, name: r.name });
  for (const n of npcs) cands.push({ kind: "npc", ref: n, x: n.x, y: n.y, name: n.name });
  let best = null, bd = 1.6;
  for (const c of cands) { const d = Math.hypot(c.x - state.me.pos.x, c.y - state.me.pos.y); if (d < bd) { bd = d; best = c; } }
  if (!best) return onTileMessage("No one close enough to shove.");
  const dx = best.x - state.me.pos.x, dy = best.y - state.me.pos.y;
  const sx = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) || 1 : 0;
  const sy = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
  const tx = Math.round(best.x) + sx, ty = Math.round(best.y) + sy;
  const f = state.shared.floor;
  if (tx < 0 || ty < 0 || tx >= f.w || ty >= f.h) return onTileMessage("Nowhere to shove them.");
  if (blockedTiles(state.shared).has(tx + "," + ty)) return onTileMessage("Something's in the way.");
  if (best.kind === "npc") { best.ref.x = tx; best.ref.y = ty; best.ref.target = null; best.ref.pause = 0.6; }
  else if (sendMsg) sendMsg({ type: "push", to: best.id, x: tx, y: ty });
  onTileMessage("Shoved " + (best.name || "them") + "!");
}

// Received a push (from another player) — move me.
export function applyPush(x, y) {
  if (!state.me || !state.me.created) return;
  const f = state.shared.floor;
  state.me.pos.x = clamp(x, 0, f.w - 1);
  state.me.pos.y = clamp(y, 0, f.h - 1);
  target = null;
}

// ---- movement -------------------------------------------------------------

function entityTileSet(excludeMe = true) {
  const s = new Set();
  for (const [, r] of renderPeers) s.add(Math.round(r.x) + "," + Math.round(r.y));
  for (const n of npcs) s.add(Math.round(n.x) + "," + Math.round(n.y));
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

  const f = state.shared.floor, blocked = blockedTiles(state.shared), ents = entityTileSet();
  const solid = (gx, gy) => gx < 0 || gy < 0 || gx >= f.w || gy >= f.h || blocked.has(gx + "," + gy) || ents.has(gx + "," + gy);
  let nx = me.pos.x + vx, ny = me.pos.y + vy, movedX = vx !== 0, movedY = vy !== 0;
  if (vx !== 0 && solid(Math.round(nx), Math.round(me.pos.y))) { nx = me.pos.x; movedX = false; }
  if (vy !== 0 && solid(Math.round(nx), Math.round(ny))) { ny = me.pos.y; movedY = false; }
  me.pos.x = clamp(nx, 0, f.w - 1);
  me.pos.y = clamp(ny, 0, f.h - 1);
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
    r.name = p.name; r.look = p.look; r.worn = p.worn;
  }
  for (const id of renderPeers.keys()) if (!live.has(id)) renderPeers.delete(id);
}

function updateNPCs(dt) {
  const f = state.shared.floor, blocked = blockedTiles(state.shared);
  const solid = (gx, gy) => gx < 0 || gy < 0 || gx >= f.w || gy >= f.h || blocked.has(gx + "," + gy);
  for (const n of npcs) {
    n.pause -= dt;
    if (!n.target && n.pause <= 0) n.target = { x: Math.round(Math.random() * (f.w - 1)), y: Math.round(Math.random() * (f.h - 1)) };
    if (n.target && n.pause <= 0) {
      const ddx = n.target.x - n.x, ddy = n.target.y - n.y, dist = Math.hypot(ddx, ddy);
      if (dist < 0.1) { n.target = null; n.pause = 1 + Math.random() * 4; n.moving = false; }
      else {
        const step = Math.min(dist, TUNING.walkSpeed * 0.7 * dt);
        let nx = n.x + (ddx / dist) * step, ny = n.y + (ddy / dist) * step, stuck = false;
        if (solid(Math.round(nx), Math.round(n.y))) { nx = n.x; stuck = true; }
        if (solid(Math.round(nx), Math.round(ny))) { ny = n.y; stuck = true; }
        n.x = nx; n.y = ny; n.moving = true;
        if (stuck) { n.target = null; n.pause = 0.5 + Math.random() * 2; }
      }
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

  if (mouse.over && state.me.created) {
    if (buildType) {
      const blocked = blockedTiles(s);
      for (const [cx, cy] of footprintCells(buildType, mouse.gx, mouse.gy, buildRot)) {
        const ok = inBounds(cx, cy) && !blocked.has(cx + "," + cy);
        drawTile(cx, cy, ok ? "rgba(70,190,120,0.55)" : "rgba(230,80,70,0.5)");
      }
    } else if (buildMod) {
      const fKey = furnitureAnchorAt(s, mouse.gx, mouse.gy);
      const f = fKey && s.furniture[fKey];
      const ok = f && hasSurface(f.type) && !(f.mods && f.mods[mouse.gx + "," + mouse.gy]);
      if (inBounds(mouse.gx, mouse.gy)) drawTile(mouse.gx, mouse.gy, ok ? "rgba(150,90,220,0.6)" : "rgba(230,80,70,0.45)");
    } else if (inBounds(mouse.gx, mouse.gy)) {
      drawTile(mouse.gx, mouse.gy, "rgba(90,120,220,0.35)");
    }
  }

  const inUse = state.me.created ? new Set(usingKeys(state.me.pos, s)) : new Set();

  const items = [];
  for (const [key, f] of Object.entries(s.furniture)) {
    const [ax, ay] = key.split(",").map(Number);
    items.push({ depth: cellsDepth(footprintCells(f.type, ax, ay, f.rot || 0)), kind: "furn", ax, ay, f, key });
  }
  for (const [key, site] of Object.entries(s.sites || {})) {
    const [ax, ay] = key.split(",").map(Number);
    items.push({ depth: cellsDepth(footprintCells(site.type, ax, ay, site.rot || 0)), kind: "site", ax, ay, site, key });
  }
  items.push({ depth: state.me.pos.x + state.me.pos.y, kind: "me" });
  for (const [, r] of renderPeers) items.push({ depth: r.x + r.y, kind: "peer", r });
  for (const n of npcs) items.push({ depth: n.x + n.y, kind: "npc", n });
  items.sort((a, b) => a.depth - b.depth);

  for (const it of items) {
    if (it.kind === "furn") drawFurniture(it.ax, it.ay, it.f, it.key === selectedKey, inUse.has(it.key));
    else if (it.kind === "site") drawSite(it.ax, it.ay, it.site);
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
  const building = state.me.created && isNearFootprint(state.me.pos, site.type, ax, ay, TUNING.adjacencyRange, site.rot || 0);
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
  const using = state.me.created && usingKeys(state.me.pos, state.shared).length > 0;
  drawJoey(ctx, p.x, p.y, {
    look: state.me.look, worn: wornArt(state.me),
    scale: camera.zoom, walking: state.me.moving, t, using,
    name: state.me.created ? state.me.name : "new Joey",
  });
}

function drawPeer(r, t, isNpc = false) {
  const p = project(r.x, r.y, canvas);
  if (isNpc) ctx.globalAlpha = 0.9;
  drawJoey(ctx, p.x, p.y, { look: r.look, worn: r.worn || {}, scale: camera.zoom, walking: r.moving, t, name: r.name || "JOEY" });
  ctx.globalAlpha = 1;
}

// FYI to whoever is standing where — presence payload.
export function myPresence() {
  return {
    name: state.me.created ? state.me.name : "new Joey",
    look: state.me.look, worn: wornArt(state.me),
    x: state.me.pos.x, y: state.me.pos.y, moving: !!state.me.moving,
    specialty: state.me.specialty,
  };
}
