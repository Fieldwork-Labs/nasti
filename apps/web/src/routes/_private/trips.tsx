import { requirePermission } from "@/utils/permissions"
import { Outlet, createFileRoute } from "@tanstack/react-router"

// Area gate: everything under /trips — trips, collections and scouting notes
// — is the collections area.
export const Route = createFileRoute("/_private/trips")({
  beforeLoad: ({ context }) => {
    requirePermission(context, "collections")
  },
  component: () => <Outlet />,
})
