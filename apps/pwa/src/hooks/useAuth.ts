import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"

export const useAuth = () => {
  const queryClient = useQueryClient()

  const login = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      // Update auth data in query client cache
      queryClient.setQueryData(["authUser"], data.user)

      // Prefetch necessary data for offline use
      queryClient.prefetchQuery({
        queryKey: ["trips", "list"],
        queryFn: fetchTrips,
      })
    },
  })

  const logout = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.setQueryData(["authUser"], null)
    },
  })

  const { data: user } = useQuery({
    queryKey: ["authUser"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser()
      return data.user
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  return {
    user,
    getSession: supabase.auth.getSession,
    login,
    logout,
    isLoggedIn: Boolean(user),
  }
}

const fetchTrips = async () => {
  const { data, error } = await supabase.from("trip").select("*")

  if (error) throw error
  return data
}
