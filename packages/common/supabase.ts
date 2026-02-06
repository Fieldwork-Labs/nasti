import { createClient } from "@supabase/supabase-js"
import { Database } from "./types/database"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

const supabasePubKey = import.meta.env.VITE_SB_PUBLISHABLE_KEY

export const supabase = createClient<Database>(supabaseUrl, supabasePubKey)
