import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import { nodePolyfills } from "vite-plugin-node-polyfills"
import path from "path"

const isProd = process.env.NODE_ENV === "production"
let define = {}
if (isProd) {
  define = {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.VITE_SUPABASE_URL,
    ),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_ANON_KEY,
    ),
    "import.meta.env.VITE_MAPBOX_ACCESS_TOKEN": JSON.stringify(
      process.env.VITE_MAPBOX_ACCESS_TOKEN,
    ),
  }
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Use no envDir in production, default behavior works with Cloudflare
  envDir:
    process.env.NODE_ENV === "production"
      ? undefined
      : path.resolve(__dirname, "../.."),
  define,
  plugins: [
    react({ jsxRuntime: "automatic" }),
    TanStackRouterVite(),
    nodePolyfills({ globals: { Buffer: true } }),
  ],
})
