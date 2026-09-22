import type { SupabaseClient, SupportedStorage } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import { Database } from "./types/database"
import { createIdbAuthStorage } from "./authStorage"

const isTest = import.meta.env.MODE === "test"
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ??
  (isTest ? "http://localhost:54321" : undefined)
const supabaseAnonKey =
  import.meta.env.VITE_SB_PUBLISHABLE_KEY ?? (isTest ? "test-anon-key" : "")

// Matches Supabase's existing default; making it explicit preserves installed sessions.
export const SUPABASE_AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`

let sessionPersistenceEnabled = true
let pendingSessionWrites: Promise<void> = Promise.resolve()
export const setNastiSessionPersistenceEnabled = (enabled: boolean) => {
  sessionPersistenceEnabled = enabled
}
export const waitForNastiSessionWrites = () => pendingSessionWrites

/** Used only for injected (mobile) storage. Default web storage is unchanged. */
export const withSessionPersistenceGate = (
  storage: SupportedStorage,
): SupportedStorage => ({
  ...storage,
  getItem: (key) => storage.getItem(key),
  setItem: (key, value) => {
    const isSessionKey =
      key === SUPABASE_AUTH_STORAGE_KEY ||
      key === `${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`
    if (!isSessionKey) return storage.setItem(key, value)
    if (!sessionPersistenceEnabled) return
    const write = Promise.resolve().then(() => {
      if (sessionPersistenceEnabled) return storage.setItem(key, value)
    })
    pendingSessionWrites = Promise.allSettled([pendingSessionWrites, write])
      .then(() => undefined)
      .catch(() => undefined)
    return write
  },
  removeItem: (key) => storage.removeItem(key),
})

export const createNastiSupabaseClient = (options?: {
  authStorage?: SupportedStorage
}) =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      storage: options?.authStorage
        ? withSessionPersistenceGate(options.authStorage)
        : createIdbAuthStorage(),
    },
  })

/** Creates a client whose every request uses this caller-supplied token. */
export const createNastiSupabaseClientForToken = (accessToken: string) =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => accessToken,
  })

let configuredNastiSupabaseClient: SupabaseClient<Database> | undefined

const getNastiSupabaseClient = () => {
  configuredNastiSupabaseClient ??= createNastiSupabaseClient()
  return configuredNastiSupabaseClient
}

export const nastiSupabaseClient = new Proxy({} as SupabaseClient<Database>, {
  get(target, property, receiver) {
    if (Reflect.has(target, property)) {
      return Reflect.get(target, property, receiver)
    }

    const client = getNastiSupabaseClient()
    const value = Reflect.get(client, property, receiver)
    return typeof value === "function" ? value.bind(client) : value
  },
  set(target, property, value, receiver) {
    return Reflect.set(target, property, value, receiver)
  },
  has(target, property) {
    return Reflect.has(target, property) || property in getNastiSupabaseClient()
  },
  getOwnPropertyDescriptor(target, property) {
    const targetDescriptor = Reflect.getOwnPropertyDescriptor(target, property)
    if (targetDescriptor) return targetDescriptor

    const value = Reflect.get(getNastiSupabaseClient(), property)
    if (value === undefined) return undefined

    return {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    }
  },
})

export const setNastiSupabaseClient = (client: SupabaseClient<Database>) => {
  configuredNastiSupabaseClient = client
}
