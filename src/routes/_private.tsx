import { Link, Outlet, createFileRoute, redirect } from "@tanstack/react-router"

function AuthLayout() {
  return (
    <div className="p-2 h-full">
      <ul className="py-2 flex gap-2">
        <li>
          <Link
            to="/dashboard"
            className="hover:underline data-[status='active']:text-secondary-foreground text-muted-foreground"
          >
            Dashboard
          </Link>
        </li>
        <li>
          <Link
            to="/invitations"
            className="hover:underline data-[status='active']:text-secondary-foreground text-muted-foreground"
          >
            Invitations
          </Link>
        </li>
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute("/_private")({
  beforeLoad: async ({ context, location }) => {
    console.log({ context })
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
  component: AuthLayout,
})
