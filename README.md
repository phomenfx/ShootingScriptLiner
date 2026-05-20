# Shooting Script Liner

Local web app for building a scene/shot outliner and lining shooting scripts on PDF.
Runs in the browser and should run offline after initial setup. Tested with Firefox and Google Chrome. Projects are saved as .ZIP files containing a .JSON project file and the original script PDF.
Built with TypeScript, React, PDF.js, and pdf-lib.

## Features

- **Outliner** — Scenes and shots with drag-and-drop reorder; labels ripple (`5A` > `3A` when you move scenes). Letter (`1A`) or decimal (`1.1`) shot IDs in Settings.
- **PDF lining** — Draw coverage lines (V select, L line), angle snap, and line endings (arrows, shapes, dash patterns), link lines to shots, visibility toggles.
- **Labels & text** — Shot captions on lines; **Text** tool for script notes. Per-line and per-text **bold**, font, and size in Properties; defaults in Settings.
- **Margin continuation** — Drag past page top/bottom to trim and show `(cont.)` labels (visual only).
- **Export** — **Export lined PDF** writes lines, labels, and text into the script PDF. **Save ZIP** / **Open** for project JSON + PDF.

## Settings

- **Default line properties** — Font, size, bold, stroke, width, start/end caps. New lines use these (or inherit from the previous line if enabled).
- **Script labels** — Offset X/Y and secondary gap for `(cont.)` labels (preview and export stay aligned).
- **Tool shortcuts** — Customize letter keys for select / line / text.

## Saving projects

1. **Save ZIP** — JSON + cached PDF. Unzip to edit the `.json` by hand, then re-zip if needed.
2. **Open** — `.json` or a ZIP from Save ZIP.
3. **Export lined PDF** — Flattened script with annotations.

## Develop

```bash
npm install
npm run dev
```

Open the URL shown (usually http://localhost:5173). Should work in Firefox and Chrome.

## Build

```bash
npm run build
npm run preview
```

`npm run preview` serves the built app from `dist/` with no network required (fonts must still be in `public/fonts/`).

## Test

```bash
npm test
```

## Portable / offline (USB)

Double-click **`Start-Windows.bat`** (or `Start-macOS.command` / `start-linux.sh`) in the **project root**. The script opens the app in your browser at http://127.0.0.1:8080.

**First-time setup:**

```bash
npm install
npm run build:portable
```

That fills [`portable/dist/`](portable/dist/) (the built app + fonts) and downloads small server binaries under `portable/server/`. Root launchers use those files. If `portable/dist` is missing but Node.js is installed, the start script tries to build automatically.

## Built with
### App & UI
TypeScript, 
React, 
Vite, 
Zustand, 
@dnd-kit, 

### PDF
PDF.js (displays the script PDF in the browser),
pdf-lib (builds the Export lined PDF)

### Project Files
JSZip (Save / Open ZIP files)

### Offline / portable package
Node.js, miniserve

### Development
Visual Studio Code,
Vitest

## License

MIT — see [LICENSE](LICENSE).

## AI Disclosure

AI was used in the development of this project to assist with  refactoring, debugging, and documentation.  I'm a filmmaker, not a programmer; I created this tool because this kept becoming a slow portion of my preproduction workflow and, as far as I could find, no other tool filled this niche.  If that affects whether you trust or use the tool, I completely understand.  As a creative, I am not a fan of AI either, but it made this project possible to be made.  All creative decisions (features, UX, shot/outliner behavior, and base functionality) are mine.
