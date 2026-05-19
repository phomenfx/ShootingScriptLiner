# Bundled fonts

Place **real `.ttf` or `.otf` files** here (one face per file). The app cannot use `.ttc` collections, WOFF files, or shortcuts — only copy the actual font binary.

## Copy from Windows (PowerShell)

From the project root:

```powershell
.\scripts\copy-windows-fonts.ps1
npm run verify-fonts
```

Or copy manually from `C:\Windows\Fonts\` using the filenames in `manifest.json` (e.g. `arial.ttf` → `Arial.ttf`, `arialbd.ttf` → `Arial-Bold.ttf`).

Roboto is not installed by default on Windows — add `Roboto.ttf` / `Roboto-Bold.ttf` yourself, or remove Roboto from `manifest.json`.

## Verify all fonts

From the project root (checks every **regular** and **bold** file in `manifest.json`):

```bash
npm run verify-fonts
```

If bold export works but regular-weight export shows garbled text, a **regular** file is often missing or wrong while the bold file is fine — re-copy both faces from `C:\Windows\Fonts\`.

## Verify a single file

In PowerShell:

```powershell
Format-Hex public\fonts\Consolas.ttf -Count 4
```

The first four bytes should **not** be `3C 3F 78 6D` (`<?xm` — that means HTML/XML, not a font). Valid fonts usually start with `00 01 00 00` (TrueType) or `4F 54 54 4F` (`OTTO` OpenType).

## Manifest

Filenames must match `manifest.json`. Restart `npm run dev` after adding or replacing files.

### Firefox: Calibri warnings

Firefox may log `kern: Too large subtable` / `Table discarded` for **Calibri**. That is a Firefox quirk with some Microsoft fonts; labels usually still draw. If Calibri fails entirely, pick another font in Settings or use Chrome for lining.
