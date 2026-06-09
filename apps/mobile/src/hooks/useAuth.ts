import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { isAuthRetryableFetchError, type Session } from "@supabase/supabase-js"
import { getAppMeta } from "@nasti/common/authClaims"
import { ROLE, type Role } from "@nasti/common/types"

type Claims = {
  organisation: { id: string; name: string }
  orgId: string
  role: Role | null
  isAdmin: boolean
} | null

type AuthState = {
  session: Session | null
  user: Session["user"] | null
  claims: Claims
  isLoggedIn: boolean
}

export const authStateQueryKey = ["auth", "state"] as const

const loggedOutAuthState: AuthState = {
  session: null,
  user: null,
  claims: null,
  isLoggedIn: false,
}

// Given a session, derive the portion of auth state that comes from JWT
// claims. Returns null if the session has no access-token-hook claims.
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

export const getAuthStateFromSession = (
  session: Session | null,
): AuthState => ({
  session,
  user: session?.user ?? null,
  claims: deriveFromClaims(session),
  isLoggedIn: Boolean(session?.user),
})

export const setAuthState = (
  queryClient: QueryClient,
  session: Session | null,
) => {
  queryClient.setQueryData(authStateQueryKey, getAuthStateFromSession(session))
  queryClient.removeQueries({ queryKey: ["auth", "user"], exact: true })
  queryClient.removeQueries({ queryKey: ["auth", "organisation"], exact: true })
  queryClient.removeQueries({ queryKey: ["auth", "claims"], exact: true })
  queryClient.removeQueries({ queryKey: ["auth", "loggedIn"], exact: true })
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
      setAuthState(queryClient, data.session)
    },
  })

  const logout = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut()

      if (error) throw error
    },
    onMutate: () => {
      // Regardless of online state, clear local auth state immediately.
      setAuthState(queryClient, null)
    },
    networkMode: "online",
  })

  const { data: authState = loggedOutAuthState } = useQuery({
    queryKey: authStateQueryKey,
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      return getAuthStateFromSession(session)
    },
    networkMode: "online",
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  return {
    session: authState.session,
    user: authState.user,
    role: authState.claims?.role ?? null,
    organisation: authState.claims?.organisation ?? null,
    getSession: () => supabase.auth.getSession(),
    login,
    logout,
    isLoggedIn: authState.isLoggedIn,
  }
}
