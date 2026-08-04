import { requireAdmin } from "@/utils/permissions"
import { Outlet, createFileRoute } from "@tanstack/react-router"

// User and personnel management, including the permissions editor, is
// admin-only.
export const Route = createFileRoute("/_private/people")({
  beforeLoad: ({ context }) => {
    requireAdmin(context)
  },
  component: () => <Outlet />,
})
