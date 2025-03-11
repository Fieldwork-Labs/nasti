import { defineConfig } from "vite"
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
  // Use no envDir in production, default behavior works with Cloudflare
  envDir: isProd ? undefined : path.resolve(__dirname, "../.."),
  // define,
  plugins: [
    react({ jsxRuntime: "automatic" }),
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    nodePolyfills({ globals: { Buffer: true } }),
  ],
})
