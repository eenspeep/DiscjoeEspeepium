# Portraits

Skill portrait images, **150 x 200** each. The app loads them by a fixed naming
scheme keyed to `data.js`:

```
portraits/<slot>-<n>.png
```

- `<slot>` is one of `intellect`, `psyche`, `physique`, `motorics` (one per row).
- `<n>` is `1`..`6`, left-to-right, matching the six skills in that row.

So the full set is 24 files:

```
intellect-1.png … intellect-6.png
psyche-1.png    … psyche-6.png
physique-1.png  … physique-6.png
motorics-1.png  … motorics-6.png
```

A missing file is not an error: the card just shows its tinted frame.

## Slicing a source sheet

If you have a single grid sheet (6 columns x 4 rows, one attribute per row),
open `tools/slice-sheet.html` in a browser, choose the sheet, and it crops and
downloads all 24 files with the correct names. Drop them in this folder.
