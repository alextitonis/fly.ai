import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite configuration for development tooling and local proxy
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Development proxy for backend API
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
