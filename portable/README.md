# Portable Shooting Script Liner

Offline package: local web server + built app. No internet required after this folder is prepared.

## Prepare (once, on a machine with Node.js)

From the **project root** (not this folder):

```bash
npm install
npm run build:portable
```

That builds the app, copies `dist/` here, and downloads [miniserve](https://github.com/svenstaro/miniserve) for Windows, macOS (Intel + Apple Silicon), and Linux.

To rebuild without re-downloading servers:

```bash
npm run build:portable -- --skip-download
```

## Run

| OS | Easiest (project root) | Or from this folder |
|----|------------------------|---------------------|
| **Windows** | Double-click `..\Start-Windows.bat` | `Start-Windows.bat` |
| **macOS** | Double-click `..\Start-macOS.command` | `Start-macOS.command` |
| **Linux** | Run `../start-linux.sh` | `./start-linux.sh` |

Root launchers use this folder’s `dist/` and `server/`. If files are missing and Node.js is installed, they run `npm run build:portable` automatically.

Your browser opens **http://127.0.0.1:8080**. Close the terminal window to stop the server.

## Copy to USB

Copy the entire `portable/` folder (including `dist/`, `server/`, and the start script for each OS you need). Works offline on any machine that matches a bundled server binary.

## Troubleshooting

- **Port in use** — Edit `PORT=8080` in the start script and change `-p 8080` to match.
- **macOS “cannot be opened”** — Right-click the `.command` file → Open, or run: `xattr -cr server/mac-arm64 server/mac-x64`
- **Missing server binary** — Run `npm run build:portable` again on a machine with internet.
- **Fonts** — Must be present under `dist/fonts/` (included when you build from a project with `public/fonts/` populated).

## Layout

```text
portable/
  dist/              # built app (from npm run build)
  server/
    win/miniserve.exe
    mac-arm64/miniserve
    mac-x64/miniserve
    linux-x64/miniserve
  Start-Windows.bat
  Start-macOS.command
  start-linux.sh
```
