import { supabase } from "@/lib/supabase"

export const getUsers = async () => {
  const { data: session } = await supabase.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) throw new Error("No user found")

  const { data: users, error } = await supabase.rpc("get_organisation_users", {
    current_user_id: userId,
  })

  if (error) throw new Error(error.message)

  return users
}
