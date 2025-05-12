/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_MAPBOX_ACCESS_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Extend WindowEventMap to include our custom events
declare global {
  type ServiceWorkerUpdateEvent = CustomEvent<ServiceWorkerRegistration>
  interface WindowEventMap {
    "sw-updated": ServiceWorkerUpdateEvent
    "sw-ready": CustomEvent
  }
}

export {}
