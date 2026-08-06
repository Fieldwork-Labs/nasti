import { createFileRoute, redirect } from "@tanstack/react-router"
import { landingRoute } from "@/utils/permissions"

const HomePage = () => {
  return (
    <div>
      <h1>Home Page</h1>
    </div>
  )
}

export const Route = createFileRoute("/")({
  component: HomePage,
  beforeLoad: async ({ location, context }) => {
    if (
      (await context.getSession()) &&
      !location.pathname.startsWith("/auth")
    ) {
      // "/" is outside /_private, so the store may not have loaded membership
      // yet — resolve it before deciding which area to open.
      const access = context.role
        ? { role: context.role, permissions: context.permissions }
        : await context.getUser().then((details) => ({
            role: details?.role ?? null,
            permissions: details?.permissions ?? [],
          }))

      throw redirect({
        to: landingRoute(access),
      })
    }
  },
})
