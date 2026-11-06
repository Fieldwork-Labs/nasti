import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { isAuthRetryableFetchError } from "@supabase/supabase-js"
import { hasOrgPermission } from "@nasti/common/permissions"
import {
  countPendingLocalWork,
  releaseLocalDataIfSynced,
} from "@/lib/powersync/localDataOwner"
import { powerSyncQueryClient } from "@/lib/powersync/query"
import { PERSIST_KEY } from "@/lib/queryClient"
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

export {
  getAuthStateFromSession,
  getAuthStateFromSnapshot,
} from "@/lib/offlineAuth"

export const authStateQueryKey = ["auth", "state"] as const

const LOGOUT_MUTATION_KEY = ["auth", "logout"] as const

/** Any app write still running, other than the logout doing the asking. */
const hasPendingWrites = (queryClient: QueryClient) => {
  const isNotLogout = (mutation: { options: { mutationKey?: readonly unknown[] } }) =>
    mutation.options.mutationKey?.[1] !== LOGOUT_MUTATION_KEY[1]
  return (
    queryClient.isMutating({ predicate: isNotLogout }) > 0 ||
    powerSyncQueryClient.isMutating() > 0
  )
}

/**
 * Drops everything the outgoing account had cached in memory and in the
 * persisted cache. Called once the device's local data has been released:
 * until then the lock screen keeps the next account away from these caches,
 * afterwards nothing would.
 */
const evictAccountCaches = (queryClient: QueryClient) => {
  queryClient.getQueryCache().clear()
  powerSyncQueryClient.getQueryCache().clear()
  // Settled mutations still hold their variables, i.e. the records written.
  // Pending ones are left alone; the release only runs when there are none
  // besides this logout.
  const mutationCache = queryClient.getMutationCache()
  for (const mutation of mutationCache.getAll()) {
    if (mutation.state.status !== "pending") mutationCache.remove(mutation)
  }
  try {
    window.localStorage.removeItem(PERSIST_KEY)
  } catch {
    // The in-memory cache is already empty, so the next persist overwrites it.
  }
  // Clearing removed the logged-out state that was set at the start of logout.
  setAuthState(queryClient, loggedOutAuthState)
}

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
    mutationKey: LOGOUT_MUTATION_KEY,
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
        // After the snapshot is gone, so its owner hint can be cleared too.
        const released = await releaseLocalDataIfSynced({
          hasPendingWrites: () => hasPendingWrites(queryClient),
        })
        if (released) evictAccountCaches(queryClient)
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
    /**
     * Unsynced work that logging out would leave behind: what is queued or
     * failed in the local database, plus one for any save still in flight
     * (e.g. a photo being written before its row is queued). Logout keeps the
     * device locked while this is above zero.
     */
    countUnsyncedWork: async () =>
      (await countPendingLocalWork()) + (hasPendingWrites(queryClient) ? 1 : 0),
    isLoggedIn: authState.isLoggedIn,
  }
}
