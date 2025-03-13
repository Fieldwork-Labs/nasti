import { supabase } from "@nasti/common/supabase"
import { Spinner } from "@nasti/ui/spinner"
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { Suspense } from "react"

function AuthLayout() {
  return <Outlet />
}

export const Route = createFileRoute("/_private")({
  beforeLoad: async ({ context, location }) => {
    console.log({ context, location })
    if (!context.isLoggedIn) {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      console.log("gettgin session ", session)
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
