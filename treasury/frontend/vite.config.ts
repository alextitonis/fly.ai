import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";
import { defineConfig, Plugin } from "vite";
import webfontDownload from "vite-plugin-webfont-dl";

function copyTokenomics(): Plugin {
  return {
    name: "copy-tokenomics",
    apply: "build",
    generateBundle() {
      const srcDir = path.resolve(__dirname, "tokenomics");
      const copyDir = (dir: string, base: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === "__pycache__") continue;
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(srcDir, fullPath);
          const isDir = entry.isDirectory() || (entry.isSymbolicLink() && fs.statSync(fullPath).isDirectory());
          if (isDir) {
            copyDir(fullPath, base);
          } else {
            this.emitFile({
              type: "asset",
              fileName: path.join("tokenomics", relPath),
              source: fs.readFileSync(fullPath),
            });
          }
        }
      };
      if (fs.existsSync(srcDir)) copyDir(srcDir, srcDir);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    svgr(),
    webfontDownload([
      "https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,100..900;1,100..900&display=swap",
    ]),
    copyTokenomics(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  build: {
    sourcemap: "hidden",
    outDir: "./dist",
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // wagmi/viem/wallet-connector packages import each other extensively;
          // splitting them into separate chunks creates circular chunk
          // dependencies (Rollup then silently merges them back together).
          // Group them as one cohesive "web3" chunk instead.
          if (
            /[\\/]node_modules[\\/](@wagmi|wagmi|viem|ox|@reown|@walletconnect|@metamask|@coinbase|@safe-global|@privy-io)[\\/]/.test(
              id,
            )
          ) {
            return "vendor-web3";
          }
          if (/[\\/]node_modules[\\/](@radix-ui|@remixicon|lucide-react)[\\/]/.test(id))
            return "vendor-ui";
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id))
            return "vendor-react";
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return "vendor-tanstack";
          if (/[\\/]node_modules[\\/](recharts|d3|victory|nivo|chart\.js|@nivo)[\\/]/.test(id))
            return "vendor-charts";
          if (/[\\/]node_modules[\\/](lottie-react|lottie-web|framer-motion|motion)[\\/]/.test(id))
            return "vendor-animation";
          if (/[\\/]node_modules[\\/](date-fns|dayjs|luxon|moment)[\\/]/.test(id))
            return "vendor-dates";
          // Leave everything else unbucketed — Rollup will inline these
          // (mostly small shared polyfills used by web3 libs) into whichever
          // chunk imports them, avoiding artificial circular chunk deps that
          // occur when forcing every remaining node_modules into one bucket.
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1024,
  },
});
