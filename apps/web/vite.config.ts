import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import { nodePolyfills } from "vite-plugin-node-polyfills"
import path from "path"

const isProd = process.env.CF_PAGES === "1"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    watch: {
      ignored: ["**/.wrangler/**", "**/node_modules/**"],
    },
  },
  test: {
    setupFiles: ["vitest-localstorage-mock"],
    mockReset: false,
    environment: "jsdom",
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
  // Use no envDir in production, default behavior works with Cloudflare
  envDir: isProd ? undefined : path.resolve(__dirname, "../.."),
  define: {
    "import.meta.env.VITE_IS_PROD": JSON.stringify(isProd),
  },
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react({ jsxRuntime: "automatic" }),
    nodePolyfills({ globals: { Buffer: true } }),
    sentryVitePlugin({
      org: "fieldworklabs",
      project: "nasti-web",
      telemetry: isProd,
    }),
  ],

  build: {
    sourcemap: true,
  },
})
