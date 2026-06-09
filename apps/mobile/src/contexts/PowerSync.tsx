import { PowerSyncContext, useSyncStream } from "@powersync/react"
import { useEffect, useMemo, useRef } from "react"
import { powerSyncDb } from "@/lib/powersync/db"
import { SupabaseConnector } from "@/lib/powersync/connector"
import { useAuth } from "@/hooks/useAuth"

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
    .catch((error) => {
      connectedRef.current = false
      console.error("[PowerSync] Failed to connect:", error)
    })
}

function disconnectPowerSync(connectedRef: React.MutableRefObject<boolean>) {
  if (!connectedRef.current) return
  connectedRef.current = false
  powerSyncDb.disconnect().catch((error) => {
    console.error("[PowerSync] Failed to disconnect:", error)
  })
}

function TripListSyncStream({
  connectedRef,
  organisationId,
}: {
  connectedRef: React.MutableRefObject<boolean>
  organisationId: string
}) {
  const parameters = useMemo(
    () => ({ organisation_id: organisationId }),
    [organisationId],
  )

  useSyncStream({
    name: "trip_list",
    parameters,
  })

  useEffect(() => {
    connectPowerSync(connectedRef)
  }, [connectedRef, organisationId])

  return null
}

export function TripDataSyncStream({ tripId }: { tripId?: string }) {
  if (!tripId) return null
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
  const { organisation } = useAuth()
  const organisationId = organisation?.id ?? undefined

  useEffect(() => {
    if (!isLoggedIn && connectedRef.current) {
      disconnectPowerSync(connectedRef)
    }
  }, [isLoggedIn])

  useEffect(() => {
    if (!organisationId && connectedRef.current) {
      disconnectPowerSync(connectedRef)
    }
  }, [organisationId])

  return (
    <PowerSyncContext.Provider value={powerSyncDb}>
      {organisationId ? (
        <TripListSyncStream
          connectedRef={connectedRef}
          organisationId={organisationId}
        />
      ) : null}
      {children}
    </PowerSyncContext.Provider>
  )
}
