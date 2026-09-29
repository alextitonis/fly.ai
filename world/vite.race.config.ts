import { defineConfig } from "vite";

// Fly Race: its own page on the site at /race/, built like Fly Roulette. No publicDir: the brain files are not
// copied again; the page loads them from /simulation/connectome/.
export default defineConfig({
  base: "/race/",
  publicDir: false,
  // the site's strings live in docs/assets/i18n/, outside this folder
  server: { fs: { allow: [".."] } },
  build: {
    target: "es2022",
    outDir: "dist-race",
    emptyOutDir: true,
    rollupOptions: { input: { index: "race.html" } },
  },
});
