import { PowerSyncContext, useSyncStream } from "@powersync/react"
import { useEffect, useMemo, useRef } from "react"
import { powerSyncDb } from "@/lib/powersync/db"
import { SupabaseConnector } from "@/lib/powersync/connector"
import { useAuth } from "@/hooks/useAuth"
import { useAppIsActive } from "@/hooks/useAppIsActive"
import { mediaAttachmentQueue } from "@/lib/powersync/attachments"
import { rowDeleteRetryQueue } from "@/lib/powersync/deleteRetryQueue"

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
  const isAppActive = useAppIsActive()

  useEffect(() => {
    if (isLoggedIn) {
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
  }, [isLoggedIn, organisationId])

  return (
    <PowerSyncContext.Provider value={powerSyncDb}>
      {organisationId && isAppActive ? (
        <TripListSyncStream
          organisationId={organisationId}
        />
      ) : null}
      {children}
    </PowerSyncContext.Provider>
  )
}
