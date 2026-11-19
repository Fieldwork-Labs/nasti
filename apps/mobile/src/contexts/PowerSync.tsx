import { PowerSyncContext, useSyncStream } from "@powersync/react"
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { powerSyncDb } from "@/lib/powersync/db"
import { SupabaseConnector } from "@/lib/powersync/connector"
import { useAppIsActive } from "@/hooks/useAppIsActive"
import { mediaAttachmentQueue } from "@/lib/powersync/attachments"
import { rowDeleteRetryQueue } from "@/lib/powersync/deleteRetryQueue"
import { resolveLocalDataAccess, type LocalDataAccess } from "@/lib/powersync/localDataOwner"
import { useAuth } from "@/hooks/useAuth"
import { LocalDataLockedScreen } from "./LocalDataLockedScreen"

const PowerSyncSyncEnabledContext = createContext(false)

function disconnectPowerSync(connectedRef: React.MutableRefObject<boolean>) {
  if (!connectedRef.current) return
  connectedRef.current = false
  powerSyncDb.disconnect().catch(() => {
    console.error("[PowerSync] Failed to disconnect")
  })
}

function TripListSyncStream({ organisationId }: { organisationId: string }) {
  const parameters = useMemo(
    () => ({ organisation_id: organisationId }),
    [organisationId],
  )

  useSyncStream({
    name: "trip_list",
    parameters,
  })

  return null
}

export function TripDataSyncStream({ tripId }: { tripId?: string }) {
  const syncEnabled = useContext(PowerSyncSyncEnabledContext)
  if (!tripId || !syncEnabled) return null
  return <TripDataSyncStreamInner tripId={tripId} />
}

function TripDataSyncStreamInner({ tripId }: { tripId: string }) {
  const parameters = useMemo(() => ({ trip_id: tripId }), [tripId])

  useSyncStream({
    name: "trip_data",
    parameters,
  })

  return null
}

export function PowerSyncProvider({
  children,
  isLoggedIn,
}: {
  children: React.ReactNode
  isLoggedIn: boolean
}) {
  const connectedRef = useRef(false)
  const connectionAttemptRef = useRef(0)
  const runtimeActiveRef = useRef(false)
  const { organisation, user, mode } = useAuth()
  const organisationId = organisation?.id ?? undefined
  const isAppActive = useAppIsActive()
  const [ownerAccess, setOwnerAccess] = useState<LocalDataAccess | null>(null)
  const [ownerCheckFailed, setOwnerCheckFailed] = useState(false)
  const [ownerCheckAttempt, setOwnerCheckAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!isLoggedIn || !user?.id) {
      setOwnerAccess(null)
      setOwnerCheckFailed(false)
      return
    }
    setOwnerAccess(null)
    setOwnerCheckFailed(false)
    void resolveLocalDataAccess(user.id).then(
      (access) => {
        if (!cancelled) setOwnerAccess(access)
      },
      () => {
        if (!cancelled) setOwnerCheckFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [isLoggedIn, user?.id, ownerCheckAttempt])

  const hasLocalDataAccess =
    !isLoggedIn ||
    (ownerAccess?.status === "allowed" && ownerAccess.ownerId === user?.id)
  const shouldRunSync =
    isLoggedIn && mode === "live" && hasLocalDataAccess && isAppActive

  useLayoutEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const stopRuntime = () => {
      connectionAttemptRef.current += 1
      if (runtimeActiveRef.current) {
        mediaAttachmentQueue.stop()
        rowDeleteRetryQueue.stop()
        runtimeActiveRef.current = false
      }
      disconnectPowerSync(connectedRef)
    }
    const connect = () => {
      if (cancelled || connectedRef.current) return
      const attempt = ++connectionAttemptRef.current
      connectedRef.current = true
      void powerSyncDb.connect(new SupabaseConnector(), {
        appMetadata: {
          app: "nasti-mobile",
          target: __NASTI_TARGET__,
        },
      }).catch(() => {
        if (connectionAttemptRef.current !== attempt) return
        connectedRef.current = false
        console.error("[PowerSync] Failed to connect")
        if (!cancelled) retryTimer = setTimeout(connect, 2_000)
      })
    }

    if (shouldRunSync) {
      mediaAttachmentQueue.start()
      rowDeleteRetryQueue.start()
      runtimeActiveRef.current = true
      connect()
    } else {
      stopRuntime()
    }

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      if (shouldRunSync) stopRuntime()
    }
  }, [shouldRunSync, organisationId, user?.id])

  // Ownership is still being checked. Keep local data hidden, but don't show
  // the lock screen: on most logins the check passes a moment later.
  const isCheckingOwner = isLoggedIn && ownerAccess === null && !ownerCheckFailed
  if (isCheckingOwner) {
    return (
      <div
        role="status"
        aria-label="Loading local data"
        className="flex min-h-screen items-center justify-center"
      >
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />
      </div>
    )
  }

  if (isLoggedIn && !hasLocalDataAccess) {
    return (
      <LocalDataLockedScreen
        ownerAccess={ownerAccess}
        ownerCheckFailed={ownerCheckFailed}
        onRetry={() => setOwnerCheckAttempt((attempt) => attempt + 1)}
        onClaimed={setOwnerAccess}
        onClaimFailed={() => setOwnerCheckFailed(true)}
      />
    )
  }

  return (
    <PowerSyncContext.Provider value={powerSyncDb}>
      <PowerSyncSyncEnabledContext.Provider value={shouldRunSync}>
        {shouldRunSync && organisationId ? (
          <TripListSyncStream organisationId={organisationId} />
        ) : null}
        {children}
      </PowerSyncSyncEnabledContext.Provider>
    </PowerSyncContext.Provider>
  )
}
