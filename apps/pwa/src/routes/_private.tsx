import { GeoLocationProvider } from "@/contexts/location"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@nasti/common/supabase"
import { Spinner } from "@nasti/ui/spinner"
import {
  Outlet,
  createFileRoute,
  useNavigate,
  redirect,
} from "@tanstack/react-router"
import { Suspense } from "react"

function AuthLayout() {
  const { isLoggedIn } = useAuth()
  const navigate = useNavigate()
  if (!isLoggedIn) {
    navigate({
      to: "/auth/login",
    })
    return <Spinner />
  }
  return (
    <GeoLocationProvider>
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
})
