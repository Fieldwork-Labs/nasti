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
    if (!context.session) {
      const session = await context.getSession()
      if (!session)
        throw redirect({
          to: "/auth/login",
          search: {
            redirect: location.href,
          },
        })
    }
  },
  component: () => (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthLayout />
    </Suspense>
  ),
})
