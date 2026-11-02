// The table app's Electron build (#181 "The table app"): the main process, the two views'
// preloads, and their renderers. `pnpm table` builds it into out/ and starts it.
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: { rollupOptions: { input: { index: resolve(import.meta.dirname, "src/main/index.ts") } } },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { table: resolve(import.meta.dirname, "src/preload/table.ts"), sketch: resolve(import.meta.dirname, "src/preload/sketch.ts") },
        // Sandboxed preloads can't be ES modules.
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, "src/renderer"),
    build: {
      rollupOptions: {
        input: {
          table: resolve(import.meta.dirname, "src/renderer/table/index.html"),
          sketch: resolve(import.meta.dirname, "src/renderer/sketch/index.html"),
        },
      },
    },
  },
});
