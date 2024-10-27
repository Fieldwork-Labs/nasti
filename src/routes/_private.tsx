import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"

const Nav = () => {
  const router = useRouterState()
  return (
    <NavigationMenu className="h-10">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink
            asChild
            className={navigationMenuTriggerStyle()}
            active={router.location.pathname === "/dashboard"}
          >
            <Link href="/dashboard">Dashboard</Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink
            asChild
            className={navigationMenuTriggerStyle()}
            active={router.location.pathname === "/invitations"}
          >
            <Link href="/invitations">Invitations</Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}

function AuthLayout() {
  return (
    <div className="p-2 h-full flex flex-col gap-2">
      <Nav />
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
