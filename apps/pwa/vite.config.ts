import { sentryVitePlugin } from "@sentry/vite-plugin"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vitest/config"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import path from "path"

import { nodePolyfills } from "vite-plugin-node-polyfills"

const isProd = process.env.CF_PAGES === "1"

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    setupFiles: ["vitest-localstorage-mock"],
    mockReset: false,
    environment: "jsdom",
    coverage: { provider: "istanbul" },
    deps: {
      // since v0.34 you can also do:
      optimizer: {
        web: {
          include: [
            "vite-plugin-node-polyfills/shims/buffer",
            "vite-plugin-node-polyfills/shims/global",
          ],
          enabled: true,
        },
      },
    },
  },
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
    nodePolyfills({ globals: { Buffer: true }, include: ["buffer"] }),
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
        runtimeCaching: [
          {
            // match   /functions/v1/ala_image_proxy?url=…
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/functions/v1/ala_image_proxy"),

            handler: "CacheFirst", // serve from cache when offline
            method: "GET",
            options: {
              cacheName: "ala-remote-images",
              expiration: {
                maxEntries: 300, // keep at most 300 images
                maxAgeSeconds: 60 * 60 * 24 * 7, // …for 7 days
              },
              cacheableResponse: {
                // opaque responses from CORS proxies come back with status 0
                statuses: [0, 200],
              },
              matchOptions: {
                ignoreSearch: false, // each unique ?url=… gets its own entry
              },
            },
          },
        ],
      },

      devOptions: {
        enabled: true,
        navigateFallback: "/",
        type: "module",
        suppressWarnings: true,
      },
    }),
    sentryVitePlugin({
      org: "fieldworklabs",
      project: "nasti-pwa",
      telemetry: isProd,
    }),
  ],

  build: {
    sourcemap: true,
  },
})
