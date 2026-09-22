import { useEffect, useState, type ReactNode } from "react"
import { useIsRestoring, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { setAuthState } from "@/hooks/useAuth"
import {
  getAuthStateFromSession,
  getAuthStateFromSnapshot,
  getAuthStateWithOfflineFallback,
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed || isExplicitLogoutInProgress()) return
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
      if (session && event !== "SIGNED_OUT") {
        setAuthState(queryClient, getAuthStateFromSession(session))
        setReady(true)
        // Never await Supabase work inside its auth callback (it holds a lock).
        void readOfflineAuthSnapshot().then(async (previous) => {
          if (
            disposed ||
            version !== eventVersion ||
            isExplicitLogoutInProgress()
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
            isExplicitLogoutInProgress()
          )
            return
          setAuthState(
            queryClient,
            isSnapshotValid(snapshot)
              ? getAuthStateFromSnapshot(snapshot)
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
    }
  }, [isRestoring, queryClient])

  // Old persisted query caches are not an authority for local access.
  return ready && !isRestoring ? children : null
}
