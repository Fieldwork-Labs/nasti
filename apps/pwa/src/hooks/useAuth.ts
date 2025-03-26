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
    onSuccess: async (data) => {
      // Fetch organization and role
      const { data: orgData, error: orgError } = await supabase
        .from("org_user")
        .select("*, organisation(id, name)")
        .eq("user_id", data.user.id)
        .single()

      if (orgError) {
        throw new Error("Unable to fetch organisation")
      } else {
        // Update auth data in query client cache
        queryClient.setQueryData(["auth", "user"], data.user)
        queryClient.setQueryData(["auth", "orgUser"], orgData)
        // Prefetch necessary data for offline use
        queryClient.prefetchQuery({
          queryKey: ["trips", "list"],
          queryFn: fetchTrips,
        })
      }
    },
  })

  const logout = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut()

      if (error) throw error
    },
    onMutate: () => {
      // regardless of online state, we want to clear the user data
      queryClient.setQueryData(["auth"], null)
    },
    networkMode: "online",
  })

  const { data: user } = useQuery({
    queryKey: ["auth", "user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser()
      return data.user
    },
    networkMode: "online",
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  const { data: org } = useQuery({
    queryKey: ["auth", "orgUser"],
    queryFn: async () => {
      if (!user) return null
      const { data: orgData, error: orgError } = await supabase
        .from("org_user")
        .select("*, organisation(id, name)")
        .eq("user_id", user.id)
        .single()
      if (orgError) throw new Error("Unable to fetch organisation")
      return orgData
    },
    enabled: Boolean(user),
    networkMode: "online",
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  return {
    user,
    org,
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
