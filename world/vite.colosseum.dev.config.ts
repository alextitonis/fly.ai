import { createReadStream, existsSync } from "node:fs";
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.colosseum.config.ts";

// Local look at Fly Colosseum against the live backend: /api goes to the compute server on Fly, /compute (the account
// modules the page loads at run time) to the live site, the brain files come from public/connectome.
//   npx vite --config vite.colosseum.dev.config.ts --port 5199   ->   http://localhost:5199/colosseum/colosseum.html
export default mergeConfig(base, defineConfig({
  publicDir: "public",
  // the fly pictures are in docs/ until the site is pushed
  plugins: [{
    name: "colosseum-flies",
    configureServer(server) {
      server.middlewares.use("/colosseum/flies", (req, res, next) => {
        const f = new URL(`../docs/colosseum/flies${req.url?.split("?")[0]}`, import.meta.url);
        if (!/^\/\d+\.webp$/.test(req.url?.split("?")[0] ?? "") || !existsSync(f)) return next();
        res.setHeader("content-type", "image/webp");
        createReadStream(f).pipe(res);
      });
    },
  }],
  server: {
    // MOCK=1: the stand-in API of tools/arena-mock.ts (seasons, a signed-in wallet with flies) instead of the live one
    proxy: process.env.MOCK ? {
      "/api": { target: "http://localhost:5200" },
      "/compute": { target: "http://localhost:5200" },
      "/mock": { target: "http://localhost:5200" },
    } : {
      "/api": { target: "https://flyai-mine.fly.dev", changeOrigin: true, headers: { origin: "https://www.flyaiworld.com" } },
      "/compute": { target: "https://www.flyaiworld.com", changeOrigin: true },
    },
  },
}));
