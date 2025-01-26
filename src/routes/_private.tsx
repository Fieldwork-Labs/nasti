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
import { Suspense } from "react"
import useUserStore from "@/store/userStore"

const Nav = () => {
  const router = useRouterState()
  const { isAdmin } = useUserStore()
  return (
    <NavigationMenu className="h-10">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink
            asChild
            className={navigationMenuTriggerStyle()}
            active={router.location.pathname.startsWith("/trips")}
          >
            <Link href="/trips">Trips</Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
        {isAdmin && (
          <>
            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className={navigationMenuTriggerStyle()}
                active={router.location.pathname.startsWith("/invitations")}
              >
                <Link href="/invitations">Invitations</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className={navigationMenuTriggerStyle()}
                active={router.location.pathname.startsWith("/people")}
              >
                <Link href="/people">People</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </>
        )}
      </NavigationMenuList>
    </NavigationMenu>
  )
}

function AuthLayout() {
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <Nav />
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
