import useUserStore from "@/store/userStore"
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"

function AuthLayout() {
  const router = useRouter()
  const navigate = Route.useNavigate()
  const auth = useUserStore()

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      auth.logout().then(() => {
        router.invalidate().finally(() => {
          navigate({ to: "/" })
        })
      })
    }
  }

  return (
    <div className="p-2 h-full">
      <h1>Authenticated Route</h1>
      <p>This route's content is only visible to authenticated users.</p>
      <ul className="py-2 flex gap-2">
        <li>
          <Link
            to="/dashboard"
            className="hover:underline data-[status='active']:font-semibold"
          >
            Dashboard
          </Link>
        </li>
        <li>
          <Link
            to="/invitations"
            className="hover:underline data-[status='active']:font-semibold"
          >
            Invoices
          </Link>
        </li>
        <li>
          <button
            type="button"
            className="hover:underline"
            onClick={handleLogout}
          >
            Logout
          </button>
        </li>
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute("/_private")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
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
