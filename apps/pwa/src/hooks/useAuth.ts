import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { AuthRetryableFetchError } from "@supabase/supabase-js"

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
      if (error) {
        if (error instanceof AuthRetryableFetchError)
          throw new Error("Unable to connect to server")
        else throw error
      }
      return data
    },
    networkMode: "online",
    retry: false,
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
    onMutate: () => {
      // regardless of online state, we want to clear the user data
      queryClient.setQueryData(["authUser"], null)
    },
    networkMode: "online",
  })

  const { data: user } = useQuery({
    queryKey: ["authUser"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser()
      return data.user
    },
    networkMode: "online",
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  return {
    user,
    getSession: () => supabase.auth.getSession(),
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
