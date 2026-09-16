# Sprites

Drop pixel-art PNGs here and the game uses them automatically. If a file is
missing, the game falls back (procedural Joey, placeholder Enzo statue), so it
never breaks.

## joey.png — the player/peer/Charlie sprite
- Front-facing Joey. Transparent background (no white box).
- Recoloring is a **palette swap**: paint the two recolorable areas as flat
  marker colors, and the game replaces them at runtime with the player's picks:
  - **Mustache** area = `#CC420D`
  - **Shirt** area = `#299212`
- Everything else (skin, outline, eyes, nose) is drawn as-is.
- Any size works; it's scaled to about 46px tall and squashes as the Joey walks.

## enzo.png — the Enzo the Cat statue
- The indestructible statue in the middle of the main room. Click it for +1¢.
- Transparent background. Any size; it's scaled to about 78px tall and stands
  on a 2x2 footprint at the room centre.
