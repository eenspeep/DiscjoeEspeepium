// Every character is a Joey: big nose, proud mustache. This module holds the
// free "base look" options and paints a Joey (plus equipped gear) from vector
// shapes onto the isometric canvas. No art assets.

import { hash } from "./util.js";
import { gearOption } from "./economy.js";

// Base look is cosmetic only (no buffs). index 0 of each is the default.
export const BASE_LOOK = {
  skin: {
    label: "Skin",
    options: [
      { id: "s0", name: "Warm",  color: "#e8b48c" },
      { id: "s1", name: "Fair",  color: "#f2d0b3" },
      { id: "s2", name: "Olive", color: "#c99866" },
      { id: "s3", name: "Brown", color: "#9c6b43" },
      { id: "s4", name: "Deep",  color: "#6d4327" },
      { id: "s5", name: "Rosy",  color: "#f0c0a8" },
    ],
  },
  stache: {
    label: "'Stache",
    options: [
      { id: "m0", name: "Brown",  color: "#4a3527" },
      { id: "m1", name: "Black",  color: "#211d1b" },
      { id: "m2", name: "Blonde", color: "#c9a24a" },
      { id: "m3", name: "Ginger", color: "#a4471f" },
      { id: "m4", name: "Grey",   color: "#9b968f" },
      { id: "m5", name: "White",  color: "#e9e6e0" },
    ],
  },
  shirt: {
    label: "Shirt",
    options: [
      { id: "c0", name: "Joe Teal",  color: "#2f9c95" },
      { id: "c1", name: "Charcoal",  color: "#3a3f4b" },
      { id: "c2", name: "Sunflower", color: "#f2b134" },
      { id: "c3", name: "Coral",     color: "#ec6a5c" },
      { id: "c4", name: "Indigo",    color: "#4b56b8" },
      { id: "c5", name: "Forest",    color: "#3c7a4a" },
      { id: "c6", name: "Magenta",   color: "#b8459b" },
    ],
  },
};

export function defaultLook() {
  return { skin: "s0", stache: "m0", shirt: "c0" };
}
export function lookOption(slot, id) {
  return BASE_LOOK[slot]?.options.find((o) => o.id === id) || BASE_LOOK[slot]?.options[0];
}

// Stable pseudo-random look for NPCs / peers missing a look.
export function lookFromSeed(seed) {
  const h = hash(seed);
  const pick = (slot, n) => BASE_LOOK[slot].options[(h >> n) % BASE_LOOK[slot].options.length].id;
  return { skin: pick("skin", 2), stache: pick("stache", 5), shirt: pick("shirt", 8) };
}

export function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
export function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = pct / 100;
  const adj = (c) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f);
  return "#" + ((1 << 24) + (adj(r) << 16) + (adj(g) << 8) + adj(b)).toString(16).slice(1);
}

// Draw a Joey centered at canvas point (cx, cy).
// equipped = { hat, face, hand } gear option ids.
export function drawJoey(ctx, cx, cy, { look, equipped = {}, scale = 1, walking = false, t = 0, name = "", using = false } = {}) {
  const lk = look || defaultLook();
  const skin = lookOption("skin", lk.skin).color;
  const stache = lookOption("stache", lk.stache).color;
  const shirt = lookOption("shirt", lk.shirt).color;
  const S = scale;

  const bob = walking ? Math.abs(Math.sin(t * 9)) * 2.2 * S : Math.sin(t * 2) * 1.0 * S;
  ctx.save();
  ctx.translate(cx, cy - bob);

  // "using furniture" halo
  if (using) {
    ctx.save();
    ctx.scale(1, 0.5);
    ctx.beginPath();
    ctx.arc(0, (12 + bob) / 0.5 * S, 15 * S, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(70,190,120,0.28)";
    ctx.fill();
    ctx.restore();
  }

  // shadow
  ctx.save();
  ctx.scale(1, 0.5);
  ctx.beginPath();
  ctx.arc(0, (10 + bob) / 0.5 * S, 9 * S, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fill();
  ctx.restore();

  // legs
  ctx.fillStyle = "#3a3f4b";
  rrect(ctx, -6 * S, 0, 4.5 * S, 10 * S, 2 * S);
  rrect(ctx, 1.5 * S, 0, 4.5 * S, 10 * S, 2 * S);

  // torso
  ctx.fillStyle = shirt;
  rrect(ctx, -8 * S, -14 * S, 16 * S, 18 * S, 5 * S);
  // arms
  ctx.fillStyle = shade(shirt, -14);
  rrect(ctx, -10.5 * S, -12 * S, 4 * S, 13 * S, 2 * S);
  rrect(ctx, 6.5 * S, -12 * S, 4 * S, 13 * S, 2 * S);

  // hand gear sits in the right hand
  drawHandGear(ctx, equipped.hand, S);

  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, -21 * S, 8.4 * S, 0, Math.PI * 2);
  ctx.fill();

  // hair (matches 'stache) — a modest side-swept dome
  if (lk.stache !== "m5") {
    ctx.fillStyle = stache;
    ctx.beginPath();
    ctx.arc(0, -23.5 * S, 8.6 * S, Math.PI * 1.03, Math.PI * 1.97);
    ctx.fill();
    ctx.fillRect(-8.6 * S, -24 * S, 2.6 * S, 4 * S);
    ctx.fillRect(6 * S, -24 * S, 2.6 * S, 4 * S);
  }

  // eyebrows (thick, characterful)
  ctx.strokeStyle = stache;
  ctx.lineWidth = 1.8 * S;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-5.5 * S, -23.5 * S); ctx.lineTo(-1.5 * S, -24 * S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1.5 * S, -24 * S); ctx.lineTo(5.5 * S, -23.5 * S); ctx.stroke();

  // eyes
  ctx.fillStyle = "#22252b";
  ctx.beginPath(); ctx.arc(-3.2 * S, -21.5 * S, 1.1 * S, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(3.2 * S, -21.5 * S, 1.1 * S, 0, 7); ctx.fill();

  // THE BIG NOSE — bulbous, protruding, unmistakably Joey
  const nose = shade(skin, -12);
  ctx.fillStyle = nose;
  ctx.beginPath();
  ctx.ellipse(0, -17.5 * S, 3.4 * S, 4.6 * S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(skin, 12);
  ctx.beginPath();
  ctx.ellipse(-1 * S, -18.8 * S, 1.1 * S, 1.4 * S, 0, 0, Math.PI * 2); // highlight
  ctx.fill();

  // THE MUSTACHE — two proud humps under the nose
  ctx.fillStyle = stache;
  ctx.beginPath();
  ctx.moveTo(0, -13.2 * S);
  ctx.quadraticCurveTo(-4 * S, -15 * S, -7 * S, -12.5 * S);
  ctx.quadraticCurveTo(-4.5 * S, -11 * S, 0, -12 * S);
  ctx.quadraticCurveTo(4.5 * S, -11 * S, 7 * S, -12.5 * S);
  ctx.quadraticCurveTo(4 * S, -15 * S, 0, -13.2 * S);
  ctx.fill();

  // face + hat gear
  drawFaceGear(ctx, equipped.face, S);
  drawHatGear(ctx, equipped.hat, S, lk.stache !== "m5");

  ctx.restore();

  // name tag
  if (name) {
    ctx.save();
    ctx.font = `${11 * S}px "Fredoka", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(name).width + 12 * S;
    const ny = cy - bob - 38 * S;
    ctx.fillStyle = "rgba(20,22,28,0.72)";
    rrect(ctx, cx - w / 2, ny - 8 * S, w, 16 * S, 8 * S);
    ctx.fillStyle = "#eef1f5";
    ctx.fillText(name, cx, ny);
    ctx.restore();
  }
}

function drawHatGear(ctx, id, S) {
  const opt = gearOption("hat", id || "none");
  if (!opt || opt.art === "none") return;
  const c = opt.color || "#333";
  ctx.fillStyle = c;
  switch (opt.art) {
    case "ballcap":
      ctx.beginPath(); ctx.arc(0, -27 * S, 8.4 * S, Math.PI, 0); ctx.fill();
      ctx.fillStyle = shade(c, -14); ctx.fillRect(-15 * S, -27.5 * S, 8 * S, 2.4 * S);
      break;
    case "thinkcap": // mortarboard-ish
      ctx.fillStyle = shade(c, -18); ctx.beginPath(); ctx.arc(0, -28 * S, 6 * S, Math.PI, 0); ctx.fill();
      ctx.fillStyle = c; ctx.fillRect(-10 * S, -30 * S, 20 * S, 3 * S);
      ctx.fillStyle = "#f2b134"; ctx.beginPath(); ctx.arc(6 * S, -29 * S, 1.4 * S, 0, 7); ctx.fill();
      break;
    case "hardhat":
      ctx.beginPath(); ctx.arc(0, -27 * S, 8.6 * S, Math.PI, 0); ctx.fill();
      ctx.fillRect(-10 * S, -27.4 * S, 20 * S, 2.6 * S);
      ctx.fillStyle = shade(c, -14); ctx.fillRect(-2 * S, -34 * S, 4 * S, 7 * S);
      break;
    case "partyhat":
      ctx.beginPath(); ctx.moveTo(0, -40 * S); ctx.lineTo(-6 * S, -27 * S); ctx.lineTo(6 * S, -27 * S); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, -40 * S, 2 * S, 0, 7); ctx.fill();
      break;
  }
}

function drawFaceGear(ctx, id, S) {
  const opt = gearOption("face", id || "none");
  if (!opt || opt.art === "none") return;
  const c = opt.color || "#222";
  if (opt.art === "shades" || opt.art === "smart") {
    ctx.fillStyle = opt.art === "shades" ? c : "rgba(180,220,255,0.55)";
    rrect(ctx, -6 * S, -23 * S, 4.6 * S, 3.4 * S, 1 * S);
    rrect(ctx, 1.4 * S, -23 * S, 4.6 * S, 3.4 * S, 1 * S);
    ctx.strokeStyle = opt.art === "smart" ? c : shade(c, 20);
    ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.moveTo(-1.4 * S, -21.4 * S); ctx.lineTo(1.4 * S, -21.4 * S); ctx.stroke();
  } else if (opt.art === "goggles") {
    ctx.strokeStyle = c; ctx.lineWidth = 1.6 * S;
    ctx.beginPath(); ctx.arc(-3.4 * S, -21.4 * S, 2.4 * S, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(3.4 * S, -21.4 * S, 2.4 * S, 0, 7); ctx.stroke();
  }
}

function drawHandGear(ctx, id, S) {
  const opt = gearOption("hand", id || "none");
  if (!opt || opt.art === "none") return;
  const c = opt.color || "#888";
  ctx.fillStyle = c;
  const hx = 9.5 * S, hy = -2 * S; // near the right hand
  switch (opt.art) {
    case "mug":
      rrect(ctx, hx - 2 * S, hy - 3 * S, 4.5 * S, 5 * S, 1 * S);
      ctx.strokeStyle = c; ctx.lineWidth = 1.2 * S;
      ctx.beginPath(); ctx.arc(hx + 3 * S, hy - 0.5 * S, 1.8 * S, -1.2, 1.2); ctx.stroke();
      break;
    case "wrench":
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(0.5);
      ctx.fillRect(-1.2 * S, -6 * S, 2.4 * S, 10 * S);
      ctx.beginPath(); ctx.arc(0, -6 * S, 2.6 * S, 0, 7); ctx.fill();
      ctx.fillStyle = "#e9edf3"; ctx.beginPath(); ctx.arc(0, -6 * S, 1.1 * S, 0, 7); ctx.fill();
      ctx.restore();
      break;
    case "calc":
      rrect(ctx, hx - 2.5 * S, hy - 4 * S, 5 * S, 7 * S, 1 * S);
      ctx.fillStyle = "#9fe6c9"; ctx.fillRect(hx - 1.6 * S, hy - 3.2 * S, 3.2 * S, 1.6 * S);
      break;
    case "clipboard":
      rrect(ctx, hx - 2.6 * S, hy - 4 * S, 5.2 * S, 7 * S, 0.6 * S);
      ctx.fillStyle = "#fff"; ctx.fillRect(hx - 1.8 * S, hy - 3 * S, 3.6 * S, 5 * S);
      break;
  }
}
