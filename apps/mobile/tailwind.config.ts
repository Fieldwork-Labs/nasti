import type { Config } from "tailwindcss"
import sharedConfig from "@nasti/tailwind-config"

const config: Pick<Config, "content" | "presets" | "theme"> = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/components/**/*.{js,ts,jsx,tsx}",
  ],
  presets: [sharedConfig],
  theme: {
    extend: {
      screens: {
        pwa: { raw: "(display-mode: standalone)" },
      },
    },
  },
}

export default config
