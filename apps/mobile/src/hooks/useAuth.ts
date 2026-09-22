import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { isAuthRetryableFetchError } from "@supabase/supabase-js"
import {
  type AuthState,
  getAuthStateFromSession,
  getAuthStateWithOfflineFallback,
  isExplicitLogoutInProgress,
  loggedOutAuthState,
  readOfflineAuthSnapshot,
  snapshotFromSession,
  writeOfflineAuthSnapshot,
} from "@/lib/offlineAuth"

export {
  getAuthStateFromSession,
  getAuthStateFromSnapshot,
} from "@/lib/offlineAuth"

export const authStateQueryKey = ["auth", "state"] as const

export const setAuthState = (queryClient: QueryClient, state: AuthState) => {
  // A stale bootstrap must not overwrite a newer subscription event/logout.
  void queryClient.cancelQueries({ queryKey: authStateQueryKey, exact: true })
  queryClient.setQueryDefaults(authStateQueryKey, {
    meta: { persisted: false },
  })
  queryClient.setQueryData(authStateQueryKey, state)
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
      if (isExplicitLogoutInProgress()) return
      setAuthState(queryClient, getAuthStateFromSession(data.session))
      if (data.session) {
        const previous = await readOfflineAuthSnapshot()
        const snapshot = snapshotFromSession(data.session, previous, true)
        if (snapshot) await writeOfflineAuthSnapshot(snapshot)
      }
    },
  })

  const logout = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut()

      if (error) throw error
    },
    onMutate: () => {
      // Regardless of online state, clear local auth state immediately.
      setAuthState(queryClient, loggedOutAuthState)
    },
    networkMode: "online",
  })

  const { data: authState = loggedOutAuthState } = useQuery({
    queryKey: authStateQueryKey,
    queryFn: getAuthStateWithOfflineFallback,
    networkMode: "always",
    staleTime: Infinity,
    meta: { persisted: false },
  })

  return {
    session: authState.session,
    mode: authState.mode,
    user: authState.user,
    role: authState.claims?.role ?? null,
    organisation: authState.claims?.organisation ?? null,
    login,
    logout,
    isLoggedIn: authState.isLoggedIn,
  }
}
