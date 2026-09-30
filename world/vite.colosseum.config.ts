import { defineConfig } from "vite";

// Fly Colosseum: its own page on the site at /colosseum/, built like Fly Race. No publicDir: the brain files are not
// copied again; the page loads them from /simulation/connectome/.
export default defineConfig({
  base: "/colosseum/",
  publicDir: false,
  // the site's strings live in docs/assets/i18n/, outside this folder
  server: { fs: { allow: [".."] } },
  build: {
    target: "es2022",
    outDir: "dist-colosseum",
    emptyOutDir: true,
    rollupOptions: { input: { index: "colosseum.html" } },
  },
});
