import { resolve } from "node:path";
import { defineConfig } from "vite";

// three pages: the pet's transparent window, its settings window and the hidden mining page, which shares mine/web's Miner
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, fs: { allow: [".."] } },
  worker: { format: "es" },
  build: { rollupOptions: { input: { index: resolve(__dirname, "index.html"), settings: resolve(__dirname, "settings.html"), panel: resolve(__dirname, "panel.html"), miner: resolve(__dirname, "miner.html") } } },
});
