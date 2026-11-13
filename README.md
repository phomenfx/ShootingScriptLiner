# Shooting Script Liner

A free, open-source web app for creating a lined shooting script and building a shot list. Import the script PDF, draw coverage lines on it, build your scenes and shots beside it, and export a lined PDF and a shot list.

**Use it online:** [phomenfx.github.io/ShootingScriptLiner](https://phomenfx.github.io/ShootingScriptLiner/). The tool runs entirely locally in your browser, and works offline once installed as an app or run from the portable version. Projects are saved as `.zip` files containing a `.json` project file and the original script PDF.

Tested in Chrome, Edge and Firefox. Built with TypeScript, React, PDF.js and pdf-lib.

## Features

### Lining the script

- **Lines** with any number of points, a different pattern per segment (straight, dashes, dotted, wavy, zigzag, double, triple, hashed, straight + wavy, hidden, or your own dash pattern), smooth or sharp bends, and endings (arrows, square, circle, diamond, bracket, double arrow and more).
- **Captions** on each line built from the shot's fields, such as `1A-WS Subject (Info)`. Choose the fields, their order and the dividers between them; a line can hide fields just for itself.
- **Notes, shapes and images**: text notes, rectangles, ellipses, highlights, polygons, stars and stamps, freehand Pen and click-by-click Polygon paths (with smooth curves and draggable corners), and pictures dropped or pasted onto the page.
- **Outlines** around lines, captions, notes and shapes so they read over the script.
- **Verticle margin continuation**: drag a line past the page edge and it shows `(cont.)`.
- **Find on script** (Ctrl+F), with every match highlighted.
- **Detect scenes** from the script's headings, using its printed scene numbers if it has them.

### Scenes and shots

- **Scene list** with drag-and-drop, collapse, search, and show or hide per shot or scene.
- **Shot fields**: type, angle, subject, cast, tags, additional info, movement, system, cameras and lenses, audio, FPS, sync, shoot date, status, priority, setup, estimated time and notes. Scene values flow down to shots until a shot sets its own, and the lock beside a field shows which.
- **Numbering**: `1A, 1B` or `1.1, 1.2`, counted by position, or type your own numbers (gaps like `1A, 1C` and inserts like `5A` are fine).
- **Suggestion lists** for shot type, angle, cast, movement, system, lenses, audio and FPS, editable per project. Cast stays with its project.
- **Shot list table**: group by scene or shoot date, reorder, resize and hide columns, filter, zoom, edit cells and paste blocks from a spreadsheet.
- **Import a shot list** from CSV or pasted text; the app remembers how your columns map.

### Exports

- **Lined PDF**: the script with your lines, captions, notes and shapes, filtered by status, priority, scene and kind of mark, for all pages, only marked pages or a page range.
- **Shot list PDF**: choose the columns, paper size, orientation, scale or fit-to-width, font, grouping and filters.
- **Shot list CSV** for spreadsheets.

Export choices are saved with the project, and **Save as my defaults** makes them the starting point for new projects.

### Saving

- **Save** writes a `.zip` with the project (`.json`) and the script PDF. **Open** reads a `.zip` or `.json`.
- **Autosave** keeps unsaved work in your browser and offers it back on the next start, and **restore points** keep earlier copies you can go back to.
- Projects reopen at the page, zoom and layout you left them at.

### Tablets and touch

- On narrower screens one side panel is open at a time; on the narrowest it slides over the script.
- A pen draws; fingers scroll once you've used a pen (or always draw or always scroll, in Settings). Two fingers pinch to zoom; holding a finger still opens the right-click menu.
- Buttons and handles grow on touch screens.

## Privacy

Everything happens on your own device. Your script and projects are never uploaded anywhere.

- Opening a script or project reads it in your browser; drawing, the shot list, Find, scene detection and script comparison all run locally.
- Exports (lined PDF, shot list PDF, CSV, project ZIP) are made on your device and downloaded straight to it.
- Autosave, restore points and the cached script stay in your browser's storage on that computer. Clearing the browser's site data removes them.
- No accounts, analytics or tracking. The website only delivers the app's own files when you open it; after that the installed app (or the portable version) works with no connection at all.

## Keyboard shortcuts

Press **?** in the app for the full list.

| Action | Keys |
| --- | --- |
| Select, Line, Text, Shape, Pen, Polygon, Image tools | V, F, T, R, B, G, I (change them in Settings) |
| Save / Open | Ctrl+S / Ctrl+O |
| Export lined PDF | Ctrl+E |
| Undo / Redo | Ctrl+Z / Ctrl+Shift+Z |
| Copy / Paste / Paste in place | Ctrl+C / Ctrl+V / Ctrl+Shift+V |
| Duplicate / Delete | Ctrl+D / Del |
| Lock in place | Ctrl+L |
| Find on script | Ctrl+F |
| Hide shot / scene, show everything | Ctrl+H / Ctrl+Shift+H, Alt+H |
| Zoom in / out / fit | Ctrl+= / Ctrl+- / Ctrl+0 |
| Settings | Ctrl+, |

## Develop

```bash
npm install
npm run dev
```

Open the URL shown (usually http://localhost:5173/ShootingScriptLiner/).

## Build

```bash
npm run build
npm run preview
```

`npm run build` type-checks and builds the app into `dist/`. `npm run preview` serves that build locally, with offline support turned on.

## Test

```bash
npm test
```

## Portable / offline

Double-click **`Start-Windows.bat`** (or `Start-macOS.command` / `start-linux.sh`) in the project root. The script opens the app in your browser at http://127.0.0.1:8080/index.html.

**First-time setup:**

```bash
npm install
npm run build:portable
```

That fills [`portable/dist/`](portable/dist/) (the built app and fonts), downloads small server binaries under `portable/server/`, and generates `portable/Start-*.bat`, `Start-macOS.command`, `start-linux.sh` and `portable/README.md`. The launchers in the project root use those files. If `portable/dist` is missing but Node.js is installed, the start script tries to build it automatically.

Zip the whole `portable/` folder for release downloads. Don't commit the generated portable output to git.

## Built with

- **App and UI:** TypeScript, React, Vite, Zustand (with zundo for undo), Radix UI, dnd-kit, Lucide icons
- **PDF:** PDF.js (shows the script), pdf-lib (writes the exported PDFs)
- **Project files:** JSZip
- **Portable package:** Node.js, miniserve
- **Development:** Visual Studio Code, Vitest

## License

Free and open source under the MIT license — see [LICENSE](LICENSE). Source: [github.com/phomenfx/ShootingScriptLiner](https://github.com/phomenfx/ShootingScriptLiner).

Icons, including the app icon (made from `file-pen-line`), are from [Lucide](https://lucide.dev) under the ISC license — see [public/ICONS-LICENSE.txt](public/ICONS-LICENSE.txt).

## AI Disclosure

AI was used in the development of this project to assist with  refactoring, debugging, and documentation.  I'm a filmmaker, not a programmer; I created this tool because this kept becoming a slow portion of my preproduction workflow and, as far as I could find, no other tool filled this niche.  If that affects whether you trust or use the tool, I completely understand.  As a creative, I am not a fan of AI either, but it made this project possible to be made.  All creative decisions (features, UX, shot/outliner behavior, and base functionality) are mine.
