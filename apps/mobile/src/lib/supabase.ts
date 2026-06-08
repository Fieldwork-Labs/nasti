import {
  createNastiSupabaseClient,
  setNastiSupabaseClient,
} from "@nasti/common/supabaseClient"
import { authStorage } from "@/platform"

export const supabase = createNastiSupabaseClient({ authStorage })
setNastiSupabaseClient(supabase)
