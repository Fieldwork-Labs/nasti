import {
  defineConfig,
  minimal2023Preset as preset,
} from "@vite-pwa/assets-generator/config"

export default defineConfig({
  headLinkOptions: {
    preset: "2023",
  },
  overrideAssets: false,
  preset,
  images: ["src/assets/logo.png"],
})
