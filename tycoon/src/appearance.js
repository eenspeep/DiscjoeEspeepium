// Every character is a Joey: big nose, proud mustache. Free "base look" options
// plus equipped gear, painted from vector shapes onto the isometric canvas.
// `worn` is a resolved map { slot: {art, color} } (see economy.wornArt).

import { hash } from "./util.js";

export const BASE_LOOK = {
  skin: {
    label: "Skin",
    options: [
      { id: "s0", name: "Warm", color: "#e8b48c" }, { id: "s1", name: "Fair", color: "#f2d0b3" },
      { id: "s2", name: "Olive", color: "#c99866" }, { id: "s3", name: "Brown", color: "#9c6b43" },
      { id: "s4", name: "Deep", color: "#6d4327" }, { id: "s5", name: "Rosy", color: "#f0c0a8" },
    ],
  },
  stache: {
    label: "'Stache",
    options: [
      { id: "m0", name: "Brown", color: "#4a3527" }, { id: "m1", name: "Black", color: "#211d1b" },
      { id: "m2", name: "Blonde", color: "#c9a24a" }, { id: "m3", name: "Ginger", color: "#a4471f" },
      { id: "m4", name: "Grey", color: "#9b968f" }, { id: "m5", name: "White", color: "#e9e6e0" },
    ],
  },
  shirt: {
    label: "Shirt",
    options: [
      { id: "c0", name: "Joe Teal", color: "#2f9c95" }, { id: "c1", name: "Charcoal", color: "#3a3f4b" },
      { id: "c2", name: "Sunflower", color: "#f2b134" }, { id: "c3", name: "Coral", color: "#ec6a5c" },
      { id: "c4", name: "Indigo", color: "#4b56b8" }, { id: "c5", name: "Forest", color: "#3c7a4a" },
      { id: "c6", name: "Magenta", color: "#b8459b" },
    ],
  },
};

export function defaultLook() { return { skin: "s0", stache: "m0", shirt: "c0" }; }
export function lookOption(slot, id) { return BASE_LOOK[slot]?.options.find((o) => o.id === id) || BASE_LOOK[slot]?.options[0]; }
export function lookFromSeed(seed) {
  const h = hash(seed);
  const pick = (slot, n) => BASE_LOOK[slot].options[(h >> n) % BASE_LOOK[slot].options.length].id;
  return { skin: pick("skin", 2), stache: pick("stache", 5), shirt: pick("shirt", 8) };
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
  const skin = lookOption("skin", lk.skin).color, stache = lookOption("stache", lk.stache).color, shirt = lookOption("shirt", lk.shirt).color;
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
  if (worn.torso) { ctx.fillStyle = worn.torso.color || "#888"; rrect(ctx, -7 * S, -13 * S, 14 * S, 15 * S, 4 * S); ctx.fillStyle = shade(shirt, -6); ctx.fillRect(-1 * S, -13 * S, 2 * S, 15 * S); }

  if (worn.hands) drawHands(ctx, worn.hands, S);

  // head
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -21 * S, 8.4 * S, 0, 7); ctx.fill();
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
