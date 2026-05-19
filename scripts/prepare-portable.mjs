#!/usr/bin/env node
/**
 * Build portable/offline package: copy dist/ + download miniserve binaries.
 * Usage: node scripts/prepare-portable.mjs [--skip-download]
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const portableRoot = join(root, "portable");
const distSrc = join(root, "dist");
const distDest = join(portableRoot, "dist");
const serverRoot = join(portableRoot, "server");

const MINISERVE_VERSION = "v0.27.1";
const BASE_URL = `https://github.com/svenstaro/miniserve/releases/download/${MINISERVE_VERSION}`;

const TARGETS = [
  {
    id: "win",
    url: `${BASE_URL}/miniserve-0.27.1-x86_64-pc-windows-msvc.exe`,
    dest: join(serverRoot, "win", "miniserve.exe"),
  },
  {
    id: "mac-arm64",
    url: `${BASE_URL}/miniserve-0.27.1-aarch64-apple-darwin`,
    dest: join(serverRoot, "mac-arm64", "miniserve"),
  },
  {
    id: "mac-x64",
    url: `${BASE_URL}/miniserve-0.27.1-x86_64-apple-darwin`,
    dest: join(serverRoot, "mac-x64", "miniserve"),
  },
  {
    id: "linux-x64",
    url: `${BASE_URL}/miniserve-0.27.1-x86_64-unknown-linux-musl`,
    dest: join(serverRoot, "linux-x64", "miniserve"),
  },
];

const skipDownload = process.argv.includes("--skip-download");

async function download(url, destPath) {
  const dir = dirname(destPath);
  await mkdir(dir, { recursive: true });
  console.log(`Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  if (!destPath.endsWith(".exe")) {
    try {
      const { chmod } = await import("node:fs/promises");
      await chmod(destPath, 0o755);
    } catch {
      /* Windows cannot chmod; mac/linux packagers fix on copy */
    }
  }
  console.log(`  -> ${destPath}`);
}

async function main() {
  console.log("Building app...");
  execSync("npm run build", { cwd: root, stdio: "inherit" });

  if (!existsSync(distSrc)) {
    throw new Error("dist/ missing after build");
  }

  console.log("Copying dist/ to portable/dist/ ...");
  await rm(distDest, { recursive: true, force: true });
  await mkdir(portableRoot, { recursive: true });
  await cp(distSrc, distDest, { recursive: true });

  if (skipDownload) {
    console.log("Skipped miniserve download (--skip-download).");
  } else {
    console.log("Downloading miniserve binaries...");
    for (const t of TARGETS) {
      try {
        await download(t.url, t.dest);
      } catch (err) {
        console.warn(`WARN: could not fetch ${t.id}:`, err.message);
      }
    }
  }

  console.log("\nPortable package ready in portable/");
  console.log("  Windows: portable\\Start-Windows.bat");
  console.log("  macOS:   portable/Start-macOS.command");
  console.log("  Linux:   portable/start-linux.sh");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
