import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Novou verzi aplikace nainstalujeme až po potvrzení uživatelem (UpdatePrompt)
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Aurum – osobní finance",
        short_name: "Aurum",
        description: "Local-first přehled osobních financí. Data zůstávají v zařízení.",
        lang: "cs",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#e5e4df",
        theme_color: "#e5e4df",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Celá aplikace (včetně líně načítaných stránek) se uloží předem → funguje offline
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          charts: ["recharts"],
          data: ["dexie", "dexie-react-hooks", "zod"],
        },
      },
    },
  },
});
