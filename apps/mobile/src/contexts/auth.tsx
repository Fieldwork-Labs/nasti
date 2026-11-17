import { useEffect, useState, type ReactNode } from "react"
import { useMutationState, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import {
  authStateQueryKey,
  logoutMutationKey,
  setAuthState,
  useLogout,
} from "@/hooks/useAuth"
import { getOrgMembersCache } from "@/lib/orgMembersCache"
import {
  areAuthSessionEventsAllowed,
  type AuthState,
  getAuthRevision,
  getAuthStateFromSession,
  getAuthStateFromSnapshot,
  getAuthStateWithOfflineFallback,
  getRetainedOfflineAuthSnapshot,
  isExplicitLogoutInProgress,
  isSnapshotValid,
  loggedOutAuthState,
  markOfflineAuthRequiresSignIn,
  readOfflineAuthSnapshot,
  snapshotFromSession,
  writeOfflineAuthSnapshot,
} from "@/lib/offlineAuth"

/** One subscription owns auth events, regardless of the number of useAuth consumers. */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient()
  const [ready, setReady] = useState(false)
  const latestLogout = useMutationState({
    filters: { mutationKey: logoutMutationKey, exact: true },
    select: (mutation) => mutation.state,
  }).at(-1)
  const retryLogout = useLogout()
  const logoutError = latestLogout?.error

  useEffect(() => {
    const stopRosterCache = getOrgMembersCache(queryClient).start()
    let disposed = false
    let eventVersion = 0
    let expiryTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleExpiry = () => {
      clearTimeout(expiryTimer)
      const state = queryClient.getQueryData<AuthState>(authStateQueryKey)
      if (state?.mode !== "offline" || !state.offlineAccessUntil) return
      const remaining = Date.parse(state.offlineAccessUntil) - Date.now()
      if (remaining <= 0) {
        setAuthState(queryClient, loggedOutAuthState)
        return
      }
      // JS timers cannot represent the full 30-day duration in one interval.
      expiryTimer = setTimeout(
        scheduleExpiry,
        Math.min(remaining, 2_147_483_647),
      )
    }
    const unsubscribeQuery = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.query.queryHash === JSON.stringify(authStateQueryKey)
      )
        scheduleExpiry()
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        disposed ||
        isExplicitLogoutInProgress() ||
        !areAuthSessionEventsAllowed()
      )
        return
      if (
        ![
          "INITIAL_SESSION",
          "SIGNED_IN",
          "TOKEN_REFRESHED",
          "SIGNED_OUT",
        ].includes(event)
      )
        return
      const version = ++eventVersion
      const revision = getAuthRevision()
      if (session && event !== "SIGNED_OUT") {
        setAuthState(queryClient, getAuthStateFromSession(session))
        setReady(true)
        // Never await Supabase work inside its auth callback (it holds a lock).
        void readOfflineAuthSnapshot().then(async (previous) => {
          if (
            disposed ||
            version !== eventVersion ||
            isExplicitLogoutInProgress() ||
            revision !== getAuthRevision()
          )
            return
          const snapshot = snapshotFromSession(
            session,
            previous,
            event === "SIGNED_IN",
          )
          if (snapshot) await writeOfflineAuthSnapshot(snapshot)
        })
      } else {
        void readOfflineAuthSnapshot().then(async (snapshot) => {
          if (
            disposed ||
            version !== eventVersion ||
            isExplicitLogoutInProgress() ||
            revision !== getAuthRevision()
          )
            return
          let retained = snapshot ?? getRetainedOfflineAuthSnapshot()
          if (event === "SIGNED_OUT" && isSnapshotValid(retained)) {
            retained = await markOfflineAuthRequiresSignIn(retained)
            if (
              disposed ||
              version !== eventVersion ||
              isExplicitLogoutInProgress() ||
              revision !== getAuthRevision()
            )
              return
          }
          setAuthState(
            queryClient,
            isSnapshotValid(retained)
              ? getAuthStateFromSnapshot(retained)
              : loggedOutAuthState,
          )
          setReady(true)
        })
      }
    })

    const version = eventVersion
    const revision = getAuthRevision()
    void getAuthStateWithOfflineFallback().then((state) => {
      if (disposed) return
      if (
        version === eventVersion &&
        revision === getAuthRevision() &&
        !isExplicitLogoutInProgress()
      ) {
        setAuthState(queryClient, state)
        setReady(true)
        if (state.mode === "logged_out") {
          // If both bounded startup reads raced a temporarily stalled secure
          // storage adapter, make one final bounded read after unlocking the
          // app. Restore only while no newer auth event or explicit logout has
          // superseded this bootstrap.
          void readOfflineAuthSnapshot().then((snapshot) => {
            if (
              disposed ||
              version !== eventVersion ||
              revision !== getAuthRevision() ||
              isExplicitLogoutInProgress() ||
              !areAuthSessionEventsAllowed() ||
              !isSnapshotValid(snapshot)
            )
              return
            setAuthState(queryClient, getAuthStateFromSnapshot(snapshot))
          })
        }
      }
    })
    return () => {
      disposed = true
      stopRosterCache()
      subscription.unsubscribe()
      unsubscribeQuery()
      clearTimeout(expiryTimer)
    }
  }, [queryClient])

  if (logoutError || retryLogout.isPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        {logoutError && <p role="alert">{logoutError.message}</p>}
        <button
          type="button"
          className="rounded-md border px-4 py-2"
          disabled={retryLogout.isPending}
          onClick={() => retryLogout.mutate()}
        >
          {retryLogout.isPending ? "Logging out…" : "Retry logout"}
        </button>
      </div>
    )
  }

  return ready ? (
    children
  ) : (
    <div
      role="status"
      aria-live="polite"
      className="text-muted-foreground flex min-h-screen items-center justify-center text-sm"
    >
      Restoring your session…
    </div>
  )
}
