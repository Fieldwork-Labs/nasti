import logo from "@/assets/logo.svg"
import { ButtonLink } from "@nasti/ui/button-link"
import { useTheme } from "@/contexts/theme"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import useUserStore, { AuthDetails } from "@/store/userStore"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@nasti/ui/dropdown-menu"
import { Session } from "@supabase/supabase-js"
import { QueryClientProvider } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useNavigate,
} from "@tanstack/react-router"
import {
  LeafIcon,
  Moon,
  PersonStandingIcon,
  Sun,
  User as UserIcon,
} from "lucide-react"
import React, { useCallback, useEffect } from "react"

import { Button } from "@nasti/ui/button"
import { Toaster } from "@nasti/ui/toaster"

const TanStackRouterDevtools = import.meta.env.DEV
  ? React.lazy(() =>
      // Lazy load in development
      import("@tanstack/router-devtools").then((res) => ({
        default: res.TanStackRouterDevtools,
        // For Embedded Mode
        // default: res.TanStackRouterDevtoolsPanel
      })),
    )
  : () => null // Render nothing in production

const ThemeToggle = () => {
  const { setTheme, theme } = useTheme()

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => (theme === "dark" ? setTheme("light") : setTheme("dark"))}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

const UserMenu = () => {
  const { logout, isAdmin } = useUserStore()
  const navigate = useNavigate()

  const handleSignout = useCallback(async () => {
    await logout()
    navigate({ to: "/auth/login" })
  }, [logout, navigate])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon">
          <UserIcon className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isAdmin && (
          <>
            <DropdownMenuItem onClick={() => navigate({ to: "/species" })}>
              <LeafIcon className="mr-2 h-4 w-4" /> Species
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/people" })}>
              <PersonStandingIcon className="mr-2 h-4 w-4" /> People
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleSignout}>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const RootComponent = () => {
  const { getSession, session } = useUserStore()

  useEffect(() => {
    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      getSession()
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [getSession])

  return (
    <QueryClientProvider client={queryClient}>
      <div className="bg-background flex min-h-screen flex-col">
        {/* Navbar */}
        <header className="border-b-2 border-green-800 bg-green-900/30 shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 justify-between align-middle">
              <div className="flex items-center gap-4 align-middle">
                <Link to="/" className="flex shrink-0 items-center">
                  <img src={logo} alt="Seed Log Logo" width={200} />
                </Link>
                {session && (
                  <Link to="/trips" className="text-lead">
                    My Trips
                  </Link>
                )}
              </div>
              {/* Right side - User Menu */}
              <div className="flex items-center gap-4">
                <ThemeToggle />
                {!session && <ButtonLink to="/auth/login">Login</ButtonLink>}
                {session && <UserMenu />}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="grow">
          <div className="mx-auto max-w-7xl pt-4 sm:px-6 lg:px-8">
            <Outlet />
            <TanStackRouterDevtools />
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-auto bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-gray-500">
              &copy; {new Date().getFullYear()} NASTI Project. All rights
              reserved.
            </p>
          </div>
        </footer>
        <Toaster />
      </div>
    </QueryClientProvider>
  )
}

export const Route = createRootRouteWithContext<{
  session: Session | null
  getSession: () => Promise<Session | null>
  getUser: () => Promise<AuthDetails | null>
  orgId: string | null
}>()({
  component: RootComponent,
})
