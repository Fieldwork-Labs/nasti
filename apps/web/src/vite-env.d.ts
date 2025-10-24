/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_MAPBOX_ACCESS_TOKEN: string
  readonly VITE_ALA_CLIENT_ID: string
  readonly VITE_ALA_CLIENT_SECRET: string
  readonly VITE_PUBLIC_POSTHOG_KEY?: string
  readonly VITE_PUBLIC_POSTHOG_HOST?: string
  readonly VITE_IS_PROD?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
