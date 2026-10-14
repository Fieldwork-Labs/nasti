import { requirePermission } from "@/utils/permissions"
import { Outlet, createFileRoute } from "@tanstack/react-router"

// Area gate: storage, cleaning, treating and testing all live under
// /inventory.
export const Route = createFileRoute("/_private/inventory")({
  beforeLoad: ({ context }) => {
    requirePermission(context, "inventory")
  },
  component: () => <Outlet />,
})
