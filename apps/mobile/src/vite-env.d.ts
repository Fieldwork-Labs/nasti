/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SB_PUBLISHABLE_KEY: string
  readonly VITE_MAPBOX_ACCESS_TOKEN: string
  readonly VITE_WEB_APP_URL: string
  readonly VITE_SENTRY_DSN: string
}

declare const __BUILD_ID__: string

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __NASTI_TARGET__: "pwa" | "capacitor" | string
