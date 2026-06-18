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

export const createNastiSupabaseClient = (options?: {
  authStorage?: SupportedStorage
}) =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: options?.authStorage ?? createIdbAuthStorage(),
    },
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
