import { supabase } from "@/lib/supabase"

export const getUsers = async () => {
  const { data: users, error } = await supabase.rpc("get_organisation_users")

  if (error) throw new Error(error.message)

  return users
}
