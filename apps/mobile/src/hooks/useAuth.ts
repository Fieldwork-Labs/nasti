import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { isAuthRetryableFetchError } from "@supabase/supabase-js"
import { hasOrgPermission } from "@nasti/common/permissions"
import type { OrgPermission } from "@nasti/common/types"
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
import { getOrgMembersCache } from "@/lib/orgMembersCache"

export {
  getAuthStateFromSession,
  getAuthStateFromSnapshot,
} from "@/lib/offlineAuth"

export const authStateQueryKey = ["auth", "state"] as const
export const logoutMutationKey = ["auth", "logout"] as const

export const setAuthState = (queryClient: QueryClient, state: AuthState) => {
  // A stale bootstrap must not overwrite a newer subscription event/logout.
  void queryClient.cancelQueries({ queryKey: authStateQueryKey, exact: true })
  getOrgMembersCache(queryClient).setAccount(
    state.isLoggedIn ? state.user?.id : undefined,
  )
  queryClient.setQueryData(authStateQueryKey, state)
  queryClient.removeQueries({ queryKey: ["auth", "user"], exact: true })
  queryClient.removeQueries({ queryKey: ["auth", "organisation"], exact: true })
  queryClient.removeQueries({ queryKey: ["auth", "claims"], exact: true })
  queryClient.removeQueries({ queryKey: ["auth", "loggedIn"], exact: true })
}

export const useLogout = (onLogout?: () => Promise<void>) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: logoutMutationKey,
    // A failed cleanup must stay retryable after the initiating screen unmounts.
    gcTime: Infinity,
    mutationFn: async () => {
      beginExplicitLogout()
      setAuthState(queryClient, loggedOutAuthState)
      // Block and revoke the roster immediately. Still remove saved login
      // credentials if roster storage fails, so a reload cannot restore it.
      const purge = getOrgMembersCache(queryClient)
        .purge()
        .catch((error: Error) => error)
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
        const purgeError = await purge
        if (purgeError) throw purgeError
        await onLogout?.()
      } finally {
        await purge
        finishExplicitLogout()
      }
    },
    networkMode: "always",
    retry: false,
  })
}

export const useAuth = ({
  onLogout,
}: { onLogout?: () => Promise<void> } = {}) => {
  const queryClient = useQueryClient()
  const rosterCache = getOrgMembersCache(queryClient)
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
      const rosterGate = await rosterCache.readGate()
      if (revision !== getAuthRevision())
        throw new Error("Please sign in again after logout finishes")
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
      return { ...data, revision, rosterGate }
    },
    networkMode: "online",
    retry: false,
    onError: closeFailedLoginPersistence,
    onSuccess: async (data) => {
      if (isExplicitLogoutInProgress() || data.revision !== getAuthRevision())
        return
      if (data.session) rosterCache.authorize(data.rosterGate)
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

  const logout = useLogout(onLogout)

  const { data: authState = loggedOutAuthState } = useQuery({
    queryKey: authStateQueryKey,
    queryFn: getAuthStateWithOfflineFallback,
    networkMode: "always",
    staleTime: Infinity,
  })

  const role = authState.claims?.role ?? null
  const permissions = authState.claims?.permissions ?? []

  return {
    session: authState.session,
    mode: authState.mode,
    requiresSignIn: authState.reauthRequired,
    user: authState.user,
    role,
    permissions,
    // Sessions issued before member permissions shipped carry no permissions
    // claim; the database applies the same fallback until the token refreshes.
    hasPermission: (permission: OrgPermission) =>
      hasOrgPermission(role, permissions, permission),
    organisation: authState.claims?.organisation ?? null,
    login,
    logout,
    isLoggedIn: authState.isLoggedIn,
  }
}
