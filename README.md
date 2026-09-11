# Skill Builder

A browser-based skill builder in the spirit of *Disco Elysium*. Create your own
skills with custom names, descriptions, and 150x200 portrait cards, sorted into
the four attributes: Intellect, Psyche, Physique, and Motorics.

## Features

- **Create, edit, delete skills** with a name, attribute, level (1-12), and description.
- **Portrait cards, 150x200.** Upload or drag-and-drop any image. It is auto-cropped
  (cover-fit) and downscaled to exactly 150x200 so every card lines up.
- **Attribute colour coding** on each card (blue Intellect, purple Psyche, red
  Physique, gold Motorics).
- **Filter** the board by attribute.
- **Local persistence.** Skills are saved to your browser's `localStorage`.
- **Export / Import** the whole set as JSON so you can back it up or share it.

## Running it

It is a static site with no build step and no dependencies. Open `index.html`
directly, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup and the editor modal |
| `styles.css` | Theme, layout, and card styling |
| `app.js` | State, rendering, the portrait pipeline, import/export |

## Notes

- Portraits are stored inline as JPEG data URLs inside `localStorage`, which has a
  size limit (usually 5-10 MB). If you build a large roster with big images, use
  **Export** to keep a backup.
- Everything runs client-side. Nothing is uploaded anywhere.
