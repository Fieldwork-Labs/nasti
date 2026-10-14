import { requireAdmin } from "@/utils/permissions"
import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_private/species")({
  beforeLoad: ({ context }) => {
    requireAdmin(context)
  },
  component: () => <Outlet />,
})
