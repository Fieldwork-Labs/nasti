import { useEffect, useState, type ReactNode } from "react"
import { useIsRestoring, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { authStateQueryKey, setAuthState } from "@/hooks/useAuth"
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
  readOfflineAuthSnapshot,
  snapshotFromSession,
  writeOfflineAuthSnapshot,
} from "@/lib/offlineAuth"

/** One subscription owns auth events, regardless of the number of useAuth consumers. */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient()
  const isRestoring = useIsRestoring()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isRestoring) return
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
        void readOfflineAuthSnapshot().then((snapshot) => {
          if (
            disposed ||
            version !== eventVersion ||
            isExplicitLogoutInProgress() ||
            revision !== getAuthRevision()
          )
            return
          const retained = snapshot ?? getRetainedOfflineAuthSnapshot()
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
    void getAuthStateWithOfflineFallback().then((state) => {
      if (disposed) return
      if (version === eventVersion && !isExplicitLogoutInProgress()) {
        setAuthState(queryClient, state)
        setReady(true)
      }
    })
    return () => {
      disposed = true
      subscription.unsubscribe()
      unsubscribeQuery()
      clearTimeout(expiryTimer)
    }
  }, [isRestoring, queryClient])

  // Old persisted query caches are not an authority for local access.
  return ready && !isRestoring ? children : null
}
