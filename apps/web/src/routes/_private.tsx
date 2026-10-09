import { Spinner } from "@nasti/ui/spinner"
import { ROLE } from "@nasti/common/types"
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
    let role = context.role
    let permissions = context.permissions
    // On a cold load the store is empty, so resolve membership here once and
    // hand role and permissions down: the area guards underneath run in
    // beforeLoad too and cannot wait on a component to fetch them.
    if (!orgId || !role) {
      const authDetails = await context.getUser()
      orgId = authDetails?.organisation?.id ?? null
      role = authDetails?.role ?? null
      permissions = authDetails?.permissions ?? []
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
      role,
      permissions,
      isAdmin: role === ROLE.ADMIN,
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
