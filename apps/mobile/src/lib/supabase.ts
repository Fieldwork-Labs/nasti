import {
  createNastiSupabaseClient,
  setNastiSupabaseClient,
} from "@nasti/common/supabaseClient"
import { authStorage } from "@/platform"
import { fetchWithTimeout } from "./fetchWithTimeout"

export const supabase = createNastiSupabaseClient({
  authStorage,
  fetch: fetchWithTimeout,
})
setNastiSupabaseClient(supabase)
