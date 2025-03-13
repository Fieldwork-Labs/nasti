import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vite"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import path from "path"
import basicSsl from "@vitejs/plugin-basic-ssl"

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
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
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
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },

      devOptions: {
        enabled: true,
        navigateFallback: "index.html",
        suppressWarnings: true,
        type: "module",
      },
    }),
    // basicSsl({
    //   /** name of certification */
    //   name: "nasti-pwa-dev-cert",
    // }),
  ],
})
