import { createClient } from "@supabase/supabase-js"
import { Database } from "../types/database"

console.log("ENV check:", {
  directAccess: process.env.VITE_SUPABASE_URL,
  viteAccess: import.meta.env.VITE_SUPABASE_URL,
  allViteEnv: import.meta.env,
})

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
