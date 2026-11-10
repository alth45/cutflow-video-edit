#!/usr/bin/env node
/* ============================================================
   BUILD ICONS
   ------------------------------------------------------------
   Generate app icon PNG dari SVG source.

   Usage:
     npm run icons

   Requires: sharp (dev dependency)
   ============================================================ */
import sharp from "sharp";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "build/icon.svg");
const outDir = join(root, "resources");

await fs.mkdir(outDir, { recursive: true });

/* ---- 1. Main PNG (512×512, untuk window icon + macOS dock) ---- */
await sharp(svgPath)
  .resize(512, 512)
  .png({ compressionLevel: 9 })
  .toFile(join(outDir, "icon.png"));

/* ---- 2. Intermediate sizes untuk .ico / .icns (future) ---- */
const sizes = [16, 32, 48, 64, 128, 256];
await Promise.all(
  sizes.map((size) =>
    sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(join(root, "build", `icon-${size}.png`)),
  ),
);

console.log("✅ Icons generated:");
console.log("   resources/icon.png              (512×512, main icon)");
console.log("   build/icon-{16..256}.png        (intermediate sizes)");
console.log("");
console.log("For Windows .ico (packaging):");
console.log(
  "   npx png-to-ico build/icon-16.png build/icon-32.png build/icon-48.png build/icon-64.png build/icon-128.png build/icon-256.png > build/icon.ico",
);
console.log("");
console.log("For macOS .icns (packaging, run on macOS):");
console.log(
  "   npx electron-icon-builder --input=resources/icon.png --output=build",
);
