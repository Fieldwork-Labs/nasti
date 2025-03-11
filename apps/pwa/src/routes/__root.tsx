import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"

export const Route = createRootRoute({
  component: () => {
    const { pathname } = useLocation()
    console.log({ pathname })
    return (
      <>
        <div className="flex gap-2 p-2">SEED STORE</div>
        <Outlet />
        <TanStackRouterDevtools />
      </>
    )
  },
})
