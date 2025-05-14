import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vite"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import path from "path"

import { nodePolyfills } from "vite-plugin-node-polyfills"

const isProd = process.env.CF_PAGES === "1"

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0", // Listen on all network interfaces
    allowedHosts: [
      // Allow these hosts
      "nasti.loca.lt",
      "localhost",
      "127.0.0.1",
    ],
    cors: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Use no envDir in production, default behavior works with Cloudflare
  envDir: isProd ? undefined : path.resolve(__dirname, "../.."),
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    nodePolyfills({ globals: { Buffer: true } }),
    tailwindcss(),
    VitePWA({
      srcDir: "./src",
      registerType: "prompt",
      includeAssets: [
        "assets/favicon.ico",
        "pwa-64x64.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
      ],
      pwaAssets: {
        disabled: false,
        config: true,
      },

      manifest: {
        id: "/",
        name: "NASTI App",
        short_name: "NASTI",
        description: "NASTI PWA",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#092a0b",
        background_color: "#092a0b",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },

      workbox: {
        globPatterns: ["**/*.{ts,tsx,js,css,html,svg,png,jpg,ico}"],
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
      },

      devOptions: {
        enabled: true,
        navigateFallback: "/",
        type: "module",
      },
    }),
  ],
})
