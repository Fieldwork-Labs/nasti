import { GeoLocationProvider } from "@/contexts/location"
import { useAuth } from "@/hooks/useAuth"
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

function AuthLayout() {
  const { isLoggedIn } = useAuth()
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
        queryClient.setQueryData(["auth", "user"], session.user)
        queryClient.setQueryData(["auth", "loggedIn"], true)
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
