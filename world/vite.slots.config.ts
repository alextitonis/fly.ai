import { defineConfig } from "vite";

// Fly Slots: its own page on the site at /slots/, built like Fly Roulette. No publicDir: the brain files are not
// copied again; the page loads them from /simulation/connectome/.
export default defineConfig({
  base: "/slots/",
  publicDir: false,
  // the site's strings live in docs/assets/i18n/, outside this folder
  server: { fs: { allow: [".."] } },
  build: {
    target: "es2022",
    outDir: "dist-slots",
    emptyOutDir: true,
    rollupOptions: { input: { index: "slots.html" } },
  },
});
