/**
 * After `next build` runs in standalone mode, the `public/` and `.next/static`
 * directories are NOT copied automatically into `.next/standalone/`.
 * electron-builder picks them up via `extraResources`, but for local
 * `electron .` testing against a built app we also need them in the
 * standalone tree. This script handles both cases idempotently.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(STANDALONE)) {
  console.warn(
    "[copy-standalone-assets] .next/standalone not found — did you run `next build` with output:'standalone'?"
  );
  process.exit(0);
}

copyDir(path.join(ROOT, "public"), path.join(STANDALONE, "public"));
copyDir(path.join(ROOT, ".next", "static"), path.join(STANDALONE, ".next", "static"));

// Belt-and-suspenders: never ship the dev cmail-settings.json (it contains
// the developer's local Obsidian path / preferences). The production app
// reads/writes settings from %APPDATA%\Cmail\ instead.
const strayDevSettings = path.join(STANDALONE, "cmail-settings.json");
if (fs.existsSync(strayDevSettings)) {
  fs.rmSync(strayDevSettings, { force: true });
  console.log("[copy-standalone-assets] stripped dev cmail-settings.json from standalone.");
}

console.log("[copy-standalone-assets] public/ and .next/static copied into standalone tree.");
