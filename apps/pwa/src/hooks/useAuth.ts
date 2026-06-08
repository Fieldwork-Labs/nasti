import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { isAuthRetryableFetchError, type Session } from "@supabase/supabase-js"
import { getAppMeta } from "@nasti/common/authClaims"
import { ROLE, type Role } from "@nasti/common/types"

// Given a session, derive the portion of the store that comes purely
// from JWT claims. Returns null if the session has no claims (pre-hook
// session) — caller falls back to org_user lookup.
type Claims = {
  organisation: { id: string; name: string }
  orgId: string
  role: Role | null
  isAdmin: boolean
} | null

const deriveFromClaims = (session: Session | null): Claims => {
  const meta = getAppMeta(session)
  if (!meta.org_id) return null
  return {
    organisation: { id: meta.org_id, name: meta.org_name ?? "" },
    orgId: meta.org_id,
    role: meta.role ?? null,
    isAdmin: meta.role === ROLE.ADMIN,
  }
}

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
        if (isAuthRetryableFetchError(error))
          throw new Error("Unable to connect to server")
        else throw error
      }
      return data
    },
    networkMode: "online",
    retry: false,
    onSuccess: async (data) => {
      const claims = deriveFromClaims(data.session)

      // Update auth data in query client cache
      queryClient.setQueryData(["auth", "user"], data.user)
      queryClient.setQueryData(["auth", "organisation"], claims?.organisation)
      queryClient.setQueryData<Claims>(["auth", "claims"], claims)
      queryClient.setQueryData(["auth", "loggedIn"], true)
    },
  })

  const logout = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut()

      if (error) throw error
    },
    onMutate: () => {
      // regardless of online state, we want to clear the user data
      queryClient.setQueriesData({ queryKey: ["auth"] }, null)
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

  const isLoggedIn =
    queryClient.getQueryData<boolean>(["auth", "loggedIn"]) ?? false

  return {
    user,
    role: queryClient.getQueryData<Claims>(["auth", "claims"])?.role ?? null,
    organisation:
      queryClient.getQueryData<Claims>(["auth", "claims"])?.organisation ??
      null,
    getSession: () => supabase.auth.getSession(),
    login,
    logout,
    isLoggedIn,
  }
}
