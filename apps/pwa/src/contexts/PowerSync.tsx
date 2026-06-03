import { PowerSyncContext, useSyncStream } from "@powersync/react"
import { useEffect, useMemo, useRef } from "react"
import { supabase } from "@nasti/common/supabase"
import { powerSyncDb } from "@/lib/powersync/db"
import { SupabaseConnector } from "@/lib/powersync/connector"

function connectPowerSync(connectedRef: React.MutableRefObject<boolean>) {
  if (connectedRef.current) return
  powerSyncDb.connect(new SupabaseConnector())
  connectedRef.current = true
}

function disconnectPowerSync(connectedRef: React.MutableRefObject<boolean>) {
  if (!connectedRef.current) return
  powerSyncDb.disconnect()
  connectedRef.current = false
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
  organisationId,
}: {
  children: React.ReactNode
  isLoggedIn: boolean
  organisationId?: string
}) {
  const connectedRef = useRef(false)

  useEffect(() => {
    if (isLoggedIn) {
      connectPowerSync(connectedRef)
    } else if (connectedRef.current) {
      disconnectPowerSync(connectedRef)
    }
  }, [isLoggedIn])

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session) connectPowerSync(connectedRef)
      })
      .catch((error) => {
        console.error("[PowerSync] Failed to check existing session:", error)
      })
  }, [])

  return (
    <PowerSyncContext.Provider value={powerSyncDb}>
      {organisationId ? (
        <TripListSyncStream organisationId={organisationId} />
      ) : null}
      {children}
    </PowerSyncContext.Provider>
  )
}
