import { PowerSyncContext, useSyncStream } from "@powersync/react"
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { powerSyncDb } from "@/lib/powersync/db"
import { SupabaseConnector } from "@/lib/powersync/connector"
import { useAppIsActive } from "@/hooks/useAppIsActive"
import { mediaAttachmentQueue } from "@/lib/powersync/attachments"
import { rowDeleteRetryQueue } from "@/lib/powersync/deleteRetryQueue"
import { claimUnownedLocalData, resolveLocalDataAccess, type LocalDataAccess } from "@/lib/powersync/localDataOwner"
import { useAuth } from "@/hooks/useAuth"

const PowerSyncSyncEnabledContext = createContext(false)

function connectPowerSync(connectedRef: React.MutableRefObject<boolean>) {
  if (connectedRef.current) return
  connectedRef.current = true
  powerSyncDb
    .connect(new SupabaseConnector(), {
      appMetadata: {
        app: "nasti-mobile",
        target: __NASTI_TARGET__,
      },
    })
    .catch(() => {
      connectedRef.current = false
      console.error("[PowerSync] Failed to connect")
    })
}

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
  const { organisation, user, mode, logout } = useAuth()
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
    if (shouldRunSync) {
      mediaAttachmentQueue.start()
      rowDeleteRetryQueue.start()
      connectPowerSync(connectedRef)
      return
    }
    mediaAttachmentQueue.stop()
    rowDeleteRetryQueue.stop()
    if (connectedRef.current) {
      disconnectPowerSync(connectedRef)
    }
  }, [shouldRunSync, organisationId, user?.id])

  if (isLoggedIn && !hasLocalDataAccess) {
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">Local data is locked for this account.</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {ownerCheckFailed
            ? "This device could not confirm which account owns its saved sync data. Try again after reconnecting the app."
            : ownerAccess?.ownerId
              ? "Sign in with the account that owns this device’s saved data. Local records and queued work stay private to that account."
              : "This device has saved sync data with no confirmed account owner. Sign in as its previous owner or recover the local data before using another account."}
        </p>
        {ownerCheckFailed && (
          <button type="button" onClick={() => setOwnerCheckAttempt((attempt) => attempt + 1)}>
            Try again
          </button>
        )}
        {ownerAccess?.canClaim && mode === "live" && user?.id && (
          <button
            type="button"
            onClick={() => {
              const confirmed = window.confirm(
                "This device has saved data with no verified owner. Claim it only if you are signed in as the person who created or queued that data. Other accounts must not claim it.",
              )
              if (!confirmed) return
              void claimUnownedLocalData(user.id).then(setOwnerAccess).catch(() => setOwnerCheckFailed(true))
            }}
          >
            I’m signed in as the previous owner
          </button>
        )}
        <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {logout.isPending ? "Logging out…" : "Log out"}
        </button>
      </div>
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
