// Isometric projection + a shared camera. Grid coordinates (gx, gy) are floats;
// modules sit on integer cells, avatars move continuously across them.

export const TILE_W = 64;   // full diamond width in px
export const TILE_H = 32;   // full diamond height in px

// The camera pans (in screen px) and centers on a focus point.
export const camera = { x: 0, y: 0, zoom: 1 };

// Grid -> screen (pre-camera, pre-zoom "world" space).
export function gridToWorld(gx, gy) {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

// Screen (canvas px) -> grid coords. Inverse of the above, accounting for camera.
export function screenToGrid(sx, sy, canvas) {
  const wx = (sx - canvas.width / 2) / camera.zoom + camera.x;
  const wy = (sy - canvas.height / 2) / camera.zoom + camera.y;
  const gx = (wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2;
  const gy = (wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2;
  return { gx, gy };
}

// Grid -> canvas px, applying the camera. Use this for all drawing.
export function project(gx, gy, canvas) {
  const w = gridToWorld(gx, gy);
  return {
    x: (w.x - camera.x) * camera.zoom + canvas.width / 2,
    y: (w.y - camera.y) * camera.zoom + canvas.height / 2,
  };
}

// Point the camera at a grid position.
export function focusOn(gx, gy) {
  const w = gridToWorld(gx, gy);
  camera.x = w.x;
  camera.y = w.y;
}
