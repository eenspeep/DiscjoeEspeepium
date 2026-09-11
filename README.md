# Skill Builder

A browser-based skill builder in the spirit of *Disco Elysium*. Four attributes,
six skills each, each skill a 150x200 portrait card.

## Two sides: dev-side content, runtime assignment

All **content is fixed and lives in `data.js`** — attribute names, skill names,
skill descriptions (shown on hover), and portrait image paths. The running app has
**no editor** for any of that.

At **runtime** a player can only:

- **Assign attributes** — raise or lower an attribute's value with its stepper.
  That value is the number of base pips available to every skill in the row.
- **Assign skill points** — add points to a single card with its `−` / `+`.
  Extra points show as white pips on top of the attribute-coloured ones.

Those assignments (and nothing else) are saved to `localStorage`. **Export build**
/ **Import build** / **Reset** operate only on that set of numbers.

## Editing content (dev-side)

Open `data.js`. Each attribute has a `name` and six `skills`; each skill has a
`name`, a `desc` (the hover text), and a `portrait` path. Edit those freely. Do not
rename the four `slot` values (`intellect` / `psyche` / `physique` / `motorics`) —
the colours and layout key off them, and each row expects exactly six skills.

## Portraits

Images live in `portraits/<slot>-<n>.png`, 150x200 each (see
`portraits/README.md`). A missing file just shows the tinted frame, so the app
never breaks. To cut a single 6x4 sheet into all 24 files, open
`tools/slice-sheet.html` in a browser.

## Running it

Static site, no build step, no dependencies:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page shell |
| `styles.css` | Theme, layout, card styling, tooltip |
| `data.js` | **Dev-side content**: attributes, skills, descriptions, portrait paths |
| `app.js` | Runtime: renders from `data.js`, handles assignment, hover tooltips, build save/load |
| `portraits/` | 150x200 portrait images |
| `tools/slice-sheet.html` | Cuts a 6x4 source sheet into the 24 named portraits |
