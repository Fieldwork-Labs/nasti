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
  allowExplicitLogin,
  beginExplicitLogout,
  closeFailedLoginPersistence,
  deleteOfflineAuthSnapshot,
  deletePersistedSupabaseSession,
  finishExplicitLogout,
  getAuthRevision,
  getAuthStateFromSession,
  getAuthStateWithOfflineFallback,
  isExplicitLogoutInProgress,
  loggedOutAuthState,
  prepareExplicitLogin,
  readOfflineAuthSnapshot,
  snapshotFromSession,
  writeOfflineAuthSnapshot,
} from "@/lib/offlineAuth"
import { withTimeout } from "@/lib/withTimeout"

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

export const useAuth = ({
  onLogout,
}: { onLogout?: () => Promise<void> } = {}) => {
  const queryClient = useQueryClient()
  const login = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }) => {
      if (isExplicitLogoutInProgress())
        throw new Error("Please wait for logout to finish")
      const revision = getAuthRevision()
      prepareExplicitLogin()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        if (isAuthRetryableFetchError(error))
          throw new Error("Unable to connect to server")
        else throw error
      }
      return { ...data, revision }
    },
    networkMode: "online",
    retry: false,
    onError: closeFailedLoginPersistence,
    onSuccess: async (data) => {
      if (isExplicitLogoutInProgress() || data.revision !== getAuthRevision())
        return
      allowExplicitLogin()
      setAuthState(queryClient, getAuthStateFromSession(data.session))
      if (data.session) {
        const previous = await readOfflineAuthSnapshot()
        if (isExplicitLogoutInProgress() || data.revision !== getAuthRevision())
          return
        const snapshot = snapshotFromSession(data.session, previous, true)
        if (snapshot) await writeOfflineAuthSnapshot(snapshot)
      }
    },
  })

  const logout = useMutation({
    mutationFn: async () => {
      beginExplicitLogout()
      setAuthState(queryClient, loggedOutAuthState)
      try {
        await deleteOfflineAuthSnapshot()
        // Both scopes can contact the server. Neither may block local logout.
        for (const scope of ["global", "local"] as const) {
          await withTimeout(
            Promise.resolve()
              .then(() => supabase.auth.signOut({ scope }))
              .catch(() => null),
          )
        }
        await deletePersistedSupabaseSession()
        await onLogout?.()
      } finally {
        finishExplicitLogout()
      }
    },
    networkMode: "always",
    retry: false,
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
    requiresSignIn: authState.reauthRequired,
    user: authState.user,
    role: authState.claims?.role ?? null,
    organisation: authState.claims?.organisation ?? null,
    login,
    logout,
    isLoggedIn: authState.isLoggedIn,
  }
}
