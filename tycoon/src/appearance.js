// Character look: the catalog of cosmetics, the "default outfit" everyone starts
// in, and the routine that paints an avatar onto the isometric canvas from pure
// vector shapes (no art assets, so customizing = swapping colors/parts).

import { hash } from "./util.js";

// Each cosmetic slot lists options. index 0 of every slot is the DEFAULT OUTFIT
// and is always owned/free. Later options cost credits from the shared pool.
export const CATALOG = {
  skin: {
    label: "Skin",
    free: true, // skin tone is a free choice, not a purchase
    options: [
      { id: "s0", name: "Warm",    color: "#e8b48c" },
      { id: "s1", name: "Fair",    color: "#f2d0b3" },
      { id: "s2", name: "Olive",   color: "#c99866" },
      { id: "s3", name: "Brown",   color: "#9c6b43" },
      { id: "s4", name: "Deep",    color: "#6d4327" },
      { id: "s5", name: "Rosy",    color: "#f0c0a8" },
    ],
  },
  hair: {
    label: "Hair",
    free: true,
    options: [
      { id: "h0", name: "Brown",   color: "#4a3527" },
      { id: "h1", name: "Black",   color: "#211d1b" },
      { id: "h2", name: "Blonde",  color: "#d8b24a" },
      { id: "h3", name: "Auburn",  color: "#7a3b22" },
      { id: "h4", name: "Grey",    color: "#b7b3ad" },
      { id: "h5", name: "Bald",    color: null },
    ],
  },
  shirt: {
    label: "Shirt",
    options: [
      { id: "sh0", name: "Company Teal", color: "#2f9c95", price: 0 },   // default outfit
      { id: "sh1", name: "Charcoal",     color: "#3a3f4b", price: 120 },
      { id: "sh2", name: "Sunflower",    color: "#f2b134", price: 180 },
      { id: "sh3", name: "Coral",        color: "#ec6a5c", price: 180 },
      { id: "sh4", name: "Indigo",       color: "#4b56b8", price: 260 },
      { id: "sh5", name: "Forest",       color: "#3c7a4a", price: 260 },
      { id: "sh6", name: "Magenta",      color: "#b8459b", price: 400 },
    ],
  },
  hat: {
    label: "Hat",
    options: [
      { id: "ht0", name: "None",       price: 0 },   // default: bare-headed
      { id: "ht1", name: "Beanie",     color: "#c0533b", price: 150 },
      { id: "ht2", name: "Cap",        color: "#2f5fbf", price: 220 },
      { id: "ht3", name: "Headphones", color: "#222831", price: 500 },
      { id: "ht4", name: "Party Hat",  color: "#e84f9c", price: 900 },
    ],
  },
  badge: {
    label: "Badge",
    options: [
      { id: "bd0", name: "None",     price: 0 },
      { id: "bd1", name: "Coffee",   glyph: "☕", price: 300 },
      { id: "bd2", name: "Star",     glyph: "★", price: 650 },
      { id: "bd3", name: "Rocket",   glyph: "🚀", price: 1200 },
    ],
  },
};

// The look everyone spawns with. All indices point at the free/default option.
export function defaultAppearance() {
  return { skin: "s0", hair: "h0", shirt: "sh0", hat: "ht0", badge: "bd0" };
}

// What a fresh player owns: every free/price-0 option.
export function defaultOwned() {
  const owned = {};
  for (const [slot, cfg] of Object.entries(CATALOG)) {
    owned[slot] = cfg.options.filter((o) => cfg.free || (o.price || 0) === 0).map((o) => o.id);
  }
  return owned;
}

export function optionOf(slot, id) {
  return CATALOG[slot]?.options.find((o) => o.id === id) || CATALOG[slot]?.options[0];
}

// Give NPCs / peers-without-appearance a stable pseudo-random look from a seed.
export function appearanceFromSeed(seed) {
  const h = hash(seed);
  const pick = (slot, n) => CATALOG[slot].options[(h >> n) % CATALOG[slot].options.length].id;
  return { skin: pick("skin", 2), hair: pick("hair", 5), shirt: pick("shirt", 8), hat: "ht0", badge: "bd0" };
}

// Draw an avatar centered on the tile at canvas point (cx, cy). `scale` follows
// camera zoom. `t` is a wall-clock seconds value used for a gentle idle bob.
export function drawAvatar(ctx, cx, cy, appearance, { scale = 1, walking = false, t = 0, name = "" } = {}) {
  const a = appearance || defaultAppearance();
  const skin = optionOf("skin", a.skin).color;
  const hairOpt = optionOf("hair", a.hair);
  const shirt = optionOf("shirt", a.shirt).color;
  const hatOpt = optionOf("hat", a.hat);
  const badgeOpt = optionOf("badge", a.badge);

  const bob = walking ? Math.abs(Math.sin(t * 9)) * 2.2 * scale : Math.sin(t * 2) * 1.0 * scale;
  const S = scale;
  ctx.save();
  ctx.translate(cx, cy - bob);

  // ground shadow
  ctx.save();
  ctx.scale(1, 0.5);
  ctx.beginPath();
  ctx.arc(0, (10 + bob) / 0.5 * S, 9 * S, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fill();
  ctx.restore();

  // legs
  ctx.fillStyle = "#3a3f4b";
  rrect(ctx, -6 * S, 0, 4.5 * S, 10 * S, 2 * S);
  rrect(ctx, 1.5 * S, 0, 4.5 * S, 10 * S, 2 * S);

  // torso (shirt)
  ctx.fillStyle = shirt;
  rrect(ctx, -8 * S, -14 * S, 16 * S, 18 * S, 5 * S);
  // arms
  ctx.fillStyle = shade(shirt, -14);
  rrect(ctx, -10.5 * S, -12 * S, 4 * S, 13 * S, 2 * S);
  rrect(ctx, 6.5 * S, -12 * S, 4 * S, 13 * S, 2 * S);

  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, -21 * S, 8 * S, 0, Math.PI * 2);
  ctx.fill();

  // hair
  if (hairOpt.color) {
    ctx.fillStyle = hairOpt.color;
    ctx.beginPath();
    ctx.arc(0, -22.5 * S, 8.2 * S, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineTo(7 * S, -22 * S);
    ctx.arc(0, -22.5 * S, 8.2 * S, -0.1, Math.PI + 0.1, true);
    ctx.fill();
    ctx.fillRect(-8.2 * S, -24 * S, 3 * S, 5 * S);
    ctx.fillRect(5.2 * S, -24 * S, 3 * S, 5 * S);
  }

  // eyes
  ctx.fillStyle = "#22252b";
  ctx.beginPath(); ctx.arc(-3 * S, -21 * S, 1.1 * S, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(3 * S, -21 * S, 1.1 * S, 0, 7); ctx.fill();

  // hat
  drawHat(ctx, hatOpt, S);

  // badge (floating glyph by the shoulder)
  if (badgeOpt.glyph) {
    ctx.font = `${9 * S}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(badgeOpt.glyph, 12 * S, -10 * S);
  }

  ctx.restore();

  // name tag
  if (name) {
    ctx.save();
    ctx.font = `${11 * S}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(name).width + 10 * S;
    const ny = cy - bob - 36 * S;
    ctx.fillStyle = "rgba(20,22,28,0.72)";
    rrect(ctx, cx - w / 2, ny - 8 * S, w, 15 * S, 7 * S);
    ctx.fillStyle = "#eef1f5";
    ctx.fillText(name, cx, ny - 0.5 * S);
    ctx.restore();
  }
}

function drawHat(ctx, hatOpt, S) {
  if (!hatOpt || hatOpt.id === "ht0") return;
  const c = hatOpt.color || "#333";
  ctx.fillStyle = c;
  switch (hatOpt.id) {
    case "ht1": // beanie
      ctx.beginPath();
      ctx.arc(0, -25 * S, 8.4 * S, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = shade(c, -18);
      ctx.fillRect(-8.4 * S, -25.5 * S, 16.8 * S, 3 * S);
      break;
    case "ht2": // cap
      ctx.beginPath();
      ctx.arc(0, -25 * S, 8.2 * S, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-9 * S, -25.5 * S, 15 * S, 2.5 * S);
      ctx.fillStyle = shade(c, -12);
      ctx.fillRect(-14 * S, -25.5 * S, 7 * S, 2.5 * S); // brim
      break;
    case "ht3": // headphones
      ctx.strokeStyle = c; ctx.lineWidth = 2.4 * S;
      ctx.beginPath(); ctx.arc(0, -22 * S, 9 * S, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.fillStyle = c;
      rrect(ctx, -11 * S, -23 * S, 4 * S, 7 * S, 2 * S);
      rrect(ctx, 7 * S, -23 * S, 4 * S, 7 * S, 2 * S);
      break;
    case "ht4": // party hat
      ctx.beginPath();
      ctx.moveTo(0, -37 * S); ctx.lineTo(-6 * S, -25 * S); ctx.lineTo(6 * S, -25 * S);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(0, -37 * S, 2 * S, 0, 7); ctx.fill();
      break;
  }
}

// rounded rect path + fill
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

// Lighten/darken a hex color by pct (-100..100).
export function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = pct / 100;
  const adj = (c) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f);
  r = adj(r); g = adj(g); b = adj(b);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
