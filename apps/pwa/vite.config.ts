import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vite"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import path from "path"
import basicSsl from "@vitejs/plugin-basic-ssl"
import { nodePolyfills } from "vite-plugin-node-polyfills"

const isProd = process.env.CF_PAGES === "1"

// https://vitejs.dev/config/
export default defineConfig({
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
      registerType: "autoUpdate",
      injectRegister: "auto",
      pwaAssets: {
        disabled: false,
        config: true,
      },

      manifest: {
        name: "nasti-pwa",
        short_name: "nasti-pwa",
        description: "nasti-pwa",
        theme_color: "#092a0b",
        start_url: "/",
      },

      workbox: {
        globPatterns: ["**/*.{ts,tsx,js,css,html,svg,png,ico}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "index.html",
      },

      devOptions: {
        enabled: true,
        navigateFallback: "/",
        type: "module",
      },
      injectManifest: {
        globDirectory: "dist",
        globPatterns: [
          "**/assets/**/*.{js,css}",
          "index.html",
          "manifest.webmanifest",
        ],
        globIgnores: ["**/*.map"],
      },
    }),
    // basicSsl({
    //   /** name of certification */
    //   name: "nasti-pwa-dev-cert",
    // }),
  ],
})
