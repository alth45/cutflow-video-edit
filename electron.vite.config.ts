import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  /* ============================================================
     MAIN PROCESS
     ============================================================ */
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
        "@main": resolve("src/main"),
        "@app": resolve("src/renderer/app"),
      },
    },
    build: {
      outDir: "out/main",
      sourcemap: true,
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
        },
      },
    },
  },

  /* ============================================================
     PRELOAD SCRIPT
     ------------------------------------------------------------
     Output CJS `index.cjs` (bukan ESM `.mjs`) karena:
     - `sandbox: true` di BrowserWindow hanya support CJS preload.
     - `.cjs` extension menjamin Node/Electron treat sebagai CJS
       meski `package.json` punya `"type": "module"`.
     ============================================================ */
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
        "@preload": resolve("src/preload"),
      },
    },
    build: {
      outDir: "out/preload",
      sourcemap: true,
      rollupOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },

  /* ============================================================
     RENDERER (UI)
     ============================================================ */
  renderer: {
    root: "src/renderer",
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
        "@renderer": resolve("src/renderer"),
        "@core": resolve("src/renderer/core"),
        "@state": resolve("src/renderer/state"),
        "@modules": resolve("src/renderer/modules"),
        "@utils": resolve("src/renderer/utils"),
        "@styles": resolve("src/renderer/styles"),
      },
    },
    build: {
      outDir: "out/renderer",
      sourcemap: true,
      rollupOptions: {
        input: {
          index: resolve("src/renderer/index.html"),
        },
      },
    },
  },
});
