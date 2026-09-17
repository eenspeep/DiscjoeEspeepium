// Every character is a Joey: big nose, proud mustache. Free "base look" options
// plus equipped gear, painted from vector shapes onto the isometric canvas.
// `worn` is a resolved map { slot: {art, color} } (see economy.wornArt).

import { hash } from "./util.js";

// Every Joey has paper-white skin. The only free-look choices are the mustache
// and shirt colors, picked from an open color picker (any hex). Backgrounds are
// transparent — the Joey is painted with no white box behind it.
export const PAPER_WHITE = "#f6f3ea";
export const LOOK_DEFAULTS = { stache: "#4a3527", shirt: "#2f9c95" };
export const LOOK_PICKERS = [{ slot: "stache", label: "'Stache" }, { slot: "shirt", label: "Shirt" }];
const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function lookColor(look, slot) {
  if (slot === "skin") return PAPER_WHITE;                // skin is always paper-white
  const v = look && look[slot];
  return HEX6.test(v || "") ? v : LOOK_DEFAULTS[slot];
}
export function normalizeLook(look) { return { stache: lookColor(look, "stache"), shirt: lookColor(look, "shirt") }; }
export function defaultLook() { return { ...LOOK_DEFAULTS }; }
export function lookFromSeed(seed) {
  const h = hash(seed);
  const S = ["#4a3527", "#211d1b", "#c9a24a", "#a4471f", "#9b968f", "#e9e6e0"];
  const C = ["#2f9c95", "#3a3f4b", "#f2b134", "#ec6a5c", "#4b56b8", "#3c7a4a", "#b8459b"];
  return { stache: S[(h >> 5) % S.length], shirt: C[(h >> 8) % C.length] };
}

export function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
}
export function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = pct / 100, adj = (c) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f);
  return "#" + ((1 << 24) + (adj(r) << 16) + (adj(g) << 8) + adj(b)).toString(16).slice(1);
}

export function drawJoey(ctx, cx, cy, { look, worn = {}, scale = 1, walking = false, t = 0, name = "", using = false } = {}) {
  const lk = look || defaultLook();
  const skin = PAPER_WHITE, stache = lookColor(lk, "stache"), shirt = lookColor(lk, "shirt");
  const S = scale;
  const bob = walking ? Math.abs(Math.sin(t * 9)) * 2.2 * S : Math.sin(t * 2) * 1.0 * S;
  ctx.save(); ctx.translate(cx, cy - bob);

  if (using) { ctx.save(); ctx.scale(1, 0.5); ctx.beginPath(); ctx.arc(0, (12 + bob) / 0.5 * S, 15 * S, 0, 7); ctx.fillStyle = "rgba(70,190,120,0.28)"; ctx.fill(); ctx.restore(); }
  ctx.save(); ctx.scale(1, 0.5); ctx.beginPath(); ctx.arc(0, (10 + bob) / 0.5 * S, 9 * S, 0, 7); ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fill(); ctx.restore();

  // legs + feet
  ctx.fillStyle = "#3a3f4b";
  rrect(ctx, -6 * S, 0, 4.5 * S, 10 * S, 2 * S); rrect(ctx, 1.5 * S, 0, 4.5 * S, 10 * S, 2 * S);
  if (worn.feet) { ctx.fillStyle = worn.feet.color || "#5b4326"; rrect(ctx, -6.5 * S, 8 * S, 5.5 * S, 4 * S, 1.5 * S); rrect(ctx, 1 * S, 8 * S, 5.5 * S, 4 * S, 1.5 * S); }

  // torso
  ctx.fillStyle = shirt; rrect(ctx, -8 * S, -14 * S, 16 * S, 18 * S, 5 * S);
  ctx.fillStyle = shade(shirt, -14); rrect(ctx, -10.5 * S, -12 * S, 4 * S, 13 * S, 2 * S); rrect(ctx, 6.5 * S, -12 * S, 4 * S, 13 * S, 2 * S);
  paintTorsoGear(ctx, worn, S, shirt);

  // head (paper-white, with a faint outline so it reads on light/transparent bg)
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -21 * S, 8.4 * S, 0, 7); ctx.fill();
  ctx.strokeStyle = "rgba(120,124,136,0.4)"; ctx.lineWidth = 1 * S; ctx.stroke();
  if (lk.stache !== "m5") { ctx.fillStyle = stache; ctx.beginPath(); ctx.arc(0, -23.5 * S, 8.6 * S, Math.PI * 1.03, Math.PI * 1.97); ctx.fill(); ctx.fillRect(-8.6 * S, -24 * S, 2.6 * S, 4 * S); ctx.fillRect(6 * S, -24 * S, 2.6 * S, 4 * S); }

  ctx.strokeStyle = stache; ctx.lineWidth = 1.8 * S; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-5.5 * S, -23.5 * S); ctx.lineTo(-1.5 * S, -24 * S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1.5 * S, -24 * S); ctx.lineTo(5.5 * S, -23.5 * S); ctx.stroke();
  ctx.fillStyle = "#22252b";
  ctx.beginPath(); ctx.arc(-3.2 * S, -21.5 * S, 1.1 * S, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(3.2 * S, -21.5 * S, 1.1 * S, 0, 7); ctx.fill();

  // big nose
  ctx.fillStyle = shade(skin, -12); ctx.beginPath(); ctx.ellipse(0, -17.5 * S, 3.4 * S, 4.6 * S, 0, 0, 7); ctx.fill();
  ctx.fillStyle = shade(skin, 12); ctx.beginPath(); ctx.ellipse(-1 * S, -18.8 * S, 1.1 * S, 1.4 * S, 0, 0, 7); ctx.fill();
  if (worn.nose) drawNose(ctx, worn.nose, S);

  // mustache
  ctx.fillStyle = stache; ctx.beginPath(); ctx.moveTo(0, -13.2 * S);
  ctx.quadraticCurveTo(-4 * S, -15 * S, -7 * S, -12.5 * S); ctx.quadraticCurveTo(-4.5 * S, -11 * S, 0, -12 * S);
  ctx.quadraticCurveTo(4.5 * S, -11 * S, 7 * S, -12.5 * S); ctx.quadraticCurveTo(4 * S, -15 * S, 0, -13.2 * S); ctx.fill();

  if (worn.eyes) drawEyes(ctx, worn.eyes, S);
  if (worn.head) drawHead(ctx, worn.head, S);

  ctx.restore();

  if (name) {
    ctx.save(); ctx.font = `${11 * S}px "Fredoka", system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const w = ctx.measureText(name).width + 12 * S, ny = cy - bob - 38 * S;
    ctx.fillStyle = "rgba(20,22,28,0.72)"; rrect(ctx, cx - w / 2, ny - 8 * S, w, 16 * S, 8 * S);
    ctx.fillStyle = "#eef1f5"; ctx.fillText(name, cx, ny); ctx.restore();
  }
}

// Body-region equipped gear (torso plate, hand item, shield on arm, weapon in
// hand). Shared by the vector Joey and the sprite overlay, drawn in the same
// local frame (origin at body center, feet ≈ +10·S, head ≈ −21·S).
function paintTorsoGear(ctx, worn, S, shirt) {
  if (worn.torso) { ctx.fillStyle = worn.torso.color || "#888"; rrect(ctx, -7 * S, -13 * S, 14 * S, 15 * S, 4 * S); ctx.fillStyle = shade(shirt || "#2f9c95", -6); ctx.fillRect(-1 * S, -13 * S, 2 * S, 15 * S); }
  if (worn.hands) drawHands(ctx, worn.hands, S);
  const shieldSlot = ["torso", "head", "legs", "feet", "hands", "eyes", "nose"].map((s) => worn[s]).find((wsl) => wsl && wsl.art === "shield");
  if (shieldSlot) {
    ctx.fillStyle = shieldSlot.color || "#54648a";
    ctx.beginPath();
    ctx.moveTo(-11.5 * S, -8 * S); ctx.lineTo(-6 * S, -10 * S); ctx.lineTo(-6 * S, 1 * S);
    ctx.quadraticCurveTo(-8.5 * S, 4 * S, -11.5 * S, 1 * S); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(shieldSlot.color || "#54648a", -30); ctx.lineWidth = 1.2 * S; ctx.stroke();
    ctx.strokeStyle = shade(shieldSlot.color || "#54648a", 40); ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.moveTo(-8.7 * S, -8 * S); ctx.lineTo(-8.7 * S, 1.5 * S); ctx.stroke();
  }
  if (worn.weapon) {
    ctx.strokeStyle = "#5a3b22"; ctx.lineWidth = 2.4 * S; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(8 * S, 1 * S); ctx.lineTo(9.5 * S, -2 * S); ctx.stroke();
    ctx.strokeStyle = worn.weapon.color || "#b6bcc6"; ctx.lineWidth = 2.6 * S;
    ctx.beginPath(); ctx.moveTo(9.5 * S, -2 * S); ctx.lineTo(13 * S, -10 * S); ctx.stroke();
  }
}
function paintFaceGear(ctx, worn, S) {
  if (worn.nose) drawNose(ctx, worn.nose, S);
  if (worn.eyes) drawEyes(ctx, worn.eyes, S);
  if (worn.head) drawHead(ctx, worn.head, S);
}

// ---- optional pixel sprites -----------------------------------------------
// If tycoon/sprites/joey.png exists, Joeys render from it (with a palette swap
// for the mustache + shirt) and squash as they walk. If it's missing, we fall
// back to the procedural Joey above. enzo.png works the same way for the statue.
// Node/tests have no Image/document, so guard and no-op there.
const HAS_CANVAS = typeof Image !== "undefined" && typeof document !== "undefined";
function loadSprite(src, fallback) {
  if (!HAS_CANVAS) return { img: null, ready: () => false };
  const img = new Image();
  let tried = false;
  img.onerror = () => { if (fallback && !tried) { tried = true; img.src = fallback; } };
  img.src = src;
  return { img, ready: () => !!img.naturalWidth };
}
const JOEY_SPR = loadSprite("sprites/joey.png", "sprites/joey");
const ENZO_SPR = loadSprite("sprites/enzo.png", "sprites/enzo");
export function joeySpriteReady() { return JOEY_SPR.ready(); }
export function enzoImage() { return ENZO_SPR.ready() ? ENZO_SPR.img : null; }

// palette-swap markers baked into joey.png (author the sprite with these flats)
const STACHE_MARK = [0xcc, 0x42, 0x0d];   // #CC420D → chosen mustache color
const SHIRT_MARK = [0x29, 0x92, 0x12];    // #299212 → chosen shirt color
const swapCache = new Map();
function hexRGB(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function near(d, i, m, tol) { return Math.abs(d[i] - m[0]) <= tol && Math.abs(d[i + 1] - m[1]) <= tol && Math.abs(d[i + 2] - m[2]) <= tol; }
function recoloredJoey(stache, shirt) {
  if (!JOEY_SPR.ready()) return null;
  const key = stache + "|" + shirt;
  if (swapCache.has(key)) return swapCache.get(key);
  const w = JOEY_SPR.img.naturalWidth, h = JOEY_SPR.img.naturalHeight;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const cx = cv.getContext("2d"); cx.imageSmoothingEnabled = false; cx.drawImage(JOEY_SPR.img, 0, 0);
  const id = cx.getImageData(0, 0, w, h), d = id.data;
  const S = hexRGB(stache), C = hexRGB(shirt), tol = 40;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    if (near(d, i, STACHE_MARK, tol)) { d[i] = S[0]; d[i + 1] = S[1]; d[i + 2] = S[2]; }
    else if (near(d, i, SHIRT_MARK, tol)) { d[i] = C[0]; d[i + 1] = C[1]; d[i + 2] = C[2]; }
  }
  cx.putImageData(id, 0, 0);
  swapCache.set(key, cv);
  if (swapCache.size > 48) swapCache.delete(swapCache.keys().next().value);
  return cv;
}
function nameTag(ctx, cx, topY, name, S) {
  ctx.save(); ctx.font = `${11 * S}px "Fredoka", system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const w = ctx.measureText(name).width + 12 * S, ny = topY - 10 * S;
  ctx.fillStyle = "rgba(20,22,28,0.72)"; rrect(ctx, cx - w / 2, ny - 8 * S, w, 16 * S, 8 * S);
  ctx.fillStyle = "#eef1f5"; ctx.fillText(name, cx, ny); ctx.restore();
}
// Returns true if it painted a sprite; false means "fall back to procedural".
// Gear frame over the sprite. The sprite is 46·scale tall with feet at footY;
// these map the procedural gear coords (feet +10·S, head −21·S) onto it. Tunable.
const GEAR_SCALE = 1.16, GEAR_FEET = 11;
export function drawJoeySprite(ctx, cx, cy, { look, worn = {}, scale = 1, walking = false, t = 0, name = "", using = false } = {}) {
  const cv = recoloredJoey(lookColor(look, "stache"), lookColor(look, "shirt"));
  if (!cv) return false;
  const aspect = cv.width / cv.height, H = 46 * scale, W = H * aspect;
  // squash-and-stretch: alternate wider/shorter and taller/narrower on the walk
  const cyc = walking ? Math.sin(t * 11) : Math.sin(t * 2.2) * 0.35;
  const squash = (walking ? 0.15 : 0.04) * cyc;
  const dw = W * (1 + squash), dh = H * (1 - squash);
  const footY = cy + 12 * scale;   // feet sit on the tile, aligned with the shadow
  ctx.save(); ctx.scale(1, 0.5);
  if (using) { ctx.beginPath(); ctx.arc(cx, (footY - 2 * scale) / 0.5, 15 * scale, 0, 7); ctx.fillStyle = "rgba(70,190,120,0.28)"; ctx.fill(); }
  ctx.beginPath(); ctx.arc(cx, footY / 0.5, 9 * scale, 0, 7); ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fill();
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, cx - dw / 2, footY - dh, dw, dh);
  // layer equipped gear on top of the sprite body
  const Sg = scale * GEAR_SCALE, oy = footY - GEAR_FEET * Sg;
  ctx.save(); ctx.translate(cx, oy);
  paintTorsoGear(ctx, worn, Sg, lookColor(look, "shirt"));
  paintFaceGear(ctx, worn, Sg);
  ctx.restore();
  if (name) nameTag(ctx, cx, footY - dh, name, scale);
  return true;
}

function drawHead(ctx, g, S) {
  const c = g.color || "#333"; ctx.fillStyle = c;
  switch (g.art) {
    case "ballcap": ctx.beginPath(); ctx.arc(0, -27 * S, 8.4 * S, Math.PI, 0); ctx.fill(); ctx.fillStyle = shade(c, -14); ctx.fillRect(-15 * S, -27.5 * S, 8 * S, 2.4 * S); break;
    case "thinkcap": ctx.fillStyle = shade(c, -18); ctx.beginPath(); ctx.arc(0, -28 * S, 6 * S, Math.PI, 0); ctx.fill(); ctx.fillStyle = c; ctx.fillRect(-10 * S, -30 * S, 20 * S, 3 * S); ctx.fillStyle = "#f2b134"; ctx.beginPath(); ctx.arc(6 * S, -29 * S, 1.4 * S, 0, 7); ctx.fill(); break;
    case "hardhat": ctx.beginPath(); ctx.arc(0, -27 * S, 8.6 * S, Math.PI, 0); ctx.fill(); ctx.fillRect(-10 * S, -27.4 * S, 20 * S, 2.6 * S); ctx.fillStyle = shade(c, -14); ctx.fillRect(-2 * S, -34 * S, 4 * S, 7 * S); break;
    case "partyhat": ctx.beginPath(); ctx.moveTo(0, -40 * S); ctx.lineTo(-6 * S, -27 * S); ctx.lineTo(6 * S, -27 * S); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, -40 * S, 2 * S, 0, 7); ctx.fill(); break;
  }
}
function drawEyes(ctx, g, S) {
  const c = g.color || "#222";
  if (g.art === "shades" || g.art === "smart") {
    ctx.fillStyle = g.art === "shades" ? c : "rgba(180,220,255,0.55)";
    rrect(ctx, -6 * S, -23 * S, 4.6 * S, 3.4 * S, 1 * S); rrect(ctx, 1.4 * S, -23 * S, 4.6 * S, 3.4 * S, 1 * S);
    ctx.strokeStyle = g.art === "smart" ? c : shade(c, 20); ctx.lineWidth = 1 * S; ctx.beginPath(); ctx.moveTo(-1.4 * S, -21.4 * S); ctx.lineTo(1.4 * S, -21.4 * S); ctx.stroke();
  } else if (g.art === "goggles") {
    ctx.strokeStyle = c; ctx.lineWidth = 1.6 * S;
    ctx.beginPath(); ctx.arc(-3.4 * S, -21.4 * S, 2.4 * S, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(3.4 * S, -21.4 * S, 2.4 * S, 0, 7); ctx.stroke();
  }
}
function drawNose(ctx, g, S) {
  if (g.art === "clownnose") { ctx.fillStyle = g.color || "#e5433b"; ctx.beginPath(); ctx.arc(0, -16 * S, 3 * S, 0, 7); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.arc(-1 * S, -17 * S, 0.9 * S, 0, 7); ctx.fill(); }
  else if (g.art === "nosering") { ctx.strokeStyle = g.color || "#d8b24a"; ctx.lineWidth = 1.1 * S; ctx.beginPath(); ctx.arc(0, -13.5 * S, 1.6 * S, 0, Math.PI); ctx.stroke(); }
}
function drawHands(ctx, g, S) {
  const c = g.color || "#888"; ctx.fillStyle = c; const hx = 9.5 * S, hy = -2 * S;
  switch (g.art) {
    case "mug": rrect(ctx, hx - 2 * S, hy - 3 * S, 4.5 * S, 5 * S, 1 * S); ctx.strokeStyle = c; ctx.lineWidth = 1.2 * S; ctx.beginPath(); ctx.arc(hx + 3 * S, hy - 0.5 * S, 1.8 * S, -1.2, 1.2); ctx.stroke(); break;
    case "wrench": ctx.save(); ctx.translate(hx, hy); ctx.rotate(0.5); ctx.fillRect(-1.2 * S, -6 * S, 2.4 * S, 10 * S); ctx.beginPath(); ctx.arc(0, -6 * S, 2.6 * S, 0, 7); ctx.fill(); ctx.fillStyle = "#e9edf3"; ctx.beginPath(); ctx.arc(0, -6 * S, 1.1 * S, 0, 7); ctx.fill(); ctx.restore(); break;
    case "calc": rrect(ctx, hx - 2.5 * S, hy - 4 * S, 5 * S, 7 * S, 1 * S); ctx.fillStyle = "#9fe6c9"; ctx.fillRect(hx - 1.6 * S, hy - 3.2 * S, 3.2 * S, 1.6 * S); break;
    case "clipboard": rrect(ctx, hx - 2.6 * S, hy - 4 * S, 5.2 * S, 7 * S, 0.6 * S); ctx.fillStyle = "#fff"; ctx.fillRect(hx - 1.8 * S, hy - 3 * S, 3.6 * S, 5 * S); break;
  }
}
