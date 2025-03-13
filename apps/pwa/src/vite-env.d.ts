/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_MAPBOX_ACCESS_TOKEN: string
  readonly VITE_ALA_CLIENT_ID: string
  readonly VITE_ALA_CLIENT_SECRET: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
