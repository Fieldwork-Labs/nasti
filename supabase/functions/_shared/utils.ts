import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4/dist/module/index.d.ts"

export const getUser = async (req: Request, supabase: SupabaseClient) => {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: new Error("No Authorization header"), data: null }
  }

  const token = authHeader.split("Bearer ")[1]

  // Verify the JWT token
  return await supabase.auth.getUser(token)
}
