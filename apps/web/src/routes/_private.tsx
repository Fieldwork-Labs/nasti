import { Spinner } from "@nasti/ui/spinner"
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { Suspense } from "react"

function AuthLayout() {
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute("/_private")({
  beforeLoad: async ({ context, location }) => {
    let session = context.session
    if (!session) {
      session = await context.getSession()
      if (!session)
        throw redirect({
          to: "/auth/login",
          search: {
            redirect: location.href,
          },
        })
    }
    let orgId = context.orgId
    if (!orgId) {
      const authDetails = await context.getUser()
      orgId = authDetails?.orgId ?? null
      if (!orgId)
        throw redirect({
          to: "/auth/login",
          search: {
            redirect: location.href,
          },
        })
    }
    return {
      orgId,
      session,
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
