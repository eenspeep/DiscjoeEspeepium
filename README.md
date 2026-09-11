# Skill Builder

A browser-based skill builder in the spirit of *Disco Elysium*. Create your own
skills with custom names, descriptions, and 150x200 portrait cards, sorted into
the four attributes: Intellect, Psyche, Physique, and Motorics.

## Model

Like *Disco Elysium*, the board has four attributes, each with an **editable name**
and a **value**. An attribute's value is the number of base **pips** available to
every skill in its row, so raising an attribute levels up the whole row at once. A
skill can also carry its own extra points (shown as white pips) on top of that base.

## Features

- **Four attribute rows** with editable names and a value stepper. Colour-coded:
  blue Intellect, purple Psyche, red Physique, gold Motorics.
- **Attribute value drives the pips** on every skill in its row; per-skill points
  add on top.
- **Create, edit, delete skills** with a name, attribute, skill points, and description.
- **Portrait cards, 150x200.** Upload or drag-and-drop any image. It is auto-cropped
  (cover-fit) and downscaled to exactly 150x200, framed in a thick black border.
- **Local persistence** in `localStorage`, plus **Export / Import** the whole board
  as JSON and a **Reset** to defaults.

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
| `app.js` | Attribute/skill state, rendering, the portrait pipeline, import/export |

## Notes

- Portraits are stored inline as JPEG data URLs inside `localStorage`, which has a
  size limit (usually 5-10 MB). If you build a large roster with big images, use
  **Export** to keep a backup.
- Everything runs client-side. Nothing is uploaded anywhere.
