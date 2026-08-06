import { GeoLocationProvider } from "@/contexts/location"
import { setAuthState, useAuth } from "@/hooks/useAuth"
import { queryClient } from "@/lib/queryClient"
import { supabase } from "@nasti/common/supabase"
import { Spinner } from "@nasti/ui/spinner"
import {
  Outlet,
  createFileRoute,
  useNavigate,
  redirect,
  useLocation,
} from "@tanstack/react-router"
import { Suspense, useEffect } from "react"
import * as Sentry from "@sentry/react"
import { ErrorFallback } from "@/components/common/ErrorComponent"
import { TripDataSyncStream } from "@/contexts/PowerSync"
import { canUseApp } from "@/utils/permissions"

// Members without the collections permission have a valid account but nothing
// they can do here — every screen in the PWA is a collections screen. Blocking
// at the layout keeps them out of the sync stream too, rather than letting
// them fill in a form the database will refuse to store.
const NoAccess = ({ organisationName }: { organisationName?: string }) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
    <h1 className="text-xl font-bold">No field access</h1>
    <p>
      Your account with {organisationName ?? "this organisation"} does not have
      Collections access, so there is nothing to record here.
    </p>
    <p className="text-sm">Ask an administrator to grant it.</p>
  </div>
)

function AuthLayout() {
  const { isLoggedIn, role, permissions, organisation } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const tripId = location.pathname.match(/^\/trips\/([^/]+)/)?.[1]

  useEffect(() => {
    if (!isLoggedIn) {
      navigate({
        to: "/auth/login",
      })
    }
  }, [isLoggedIn])

  if (isLoggedIn && !canUseApp({ role, permissions }))
    return <NoAccess organisationName={organisation?.name} />

  return (
    <GeoLocationProvider>
      <TripDataSyncStream tripId={tripId} />
      <Outlet />
    </GeoLocationProvider>
  )
}

export const Route = createFileRoute("/_private")({
  beforeLoad: async ({ context, location }) => {
    if (!context.isLoggedIn) {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        throw redirect({
          to: "/auth/login",
          search: {
            redirect: location.href,
          },
        })
      } else {
        setAuthState(queryClient, session)
        return {
          isLoggedIn: true,
        }
      }
    }
  },
  component: () => (
    <Suspense
      fallback={
        <div className="px-auto mx-auto h-screen">
          <Spinner size={"large"} />
        </div>
      }
    >
      <AuthLayout />
    </Suspense>
  ),
  errorComponent: (error) => {
    Sentry.captureException(error)
    return <ErrorFallback error={error} resetError={() => location.reload()} />
  },
})
