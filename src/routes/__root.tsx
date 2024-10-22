import logo from "@/assets/logo.svg"
import { ButtonLink } from "@/components/ui/buttonLink"
import { useTheme } from "@/contexts/theme"
import { supabase } from "@/lib/supabase"
import useUserStore from "@/store/userStore"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Session } from "@supabase/supabase-js"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useNavigate,
} from "@tanstack/react-router"
import { Moon, Sun, User as UserIcon } from "lucide-react"
import React, { useCallback, useEffect } from "react"

import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/toaster"

const queryClient = new QueryClient()

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
  const { logout } = useUserStore()
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
        <DropdownMenuItem onClick={handleSignout}>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const RootComponent = () => {
  const { getUser, getSession, session } = useUserStore()

  useEffect(() => {
    // Fetch user on app load
    getUser()

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      console.log({ authChangeEvent: event })
      getSession()
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [getUser, getSession])

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col min-h-screen bg-background">
        {/* Navbar */}
        <header className="shadow bg-green-900 bg-opacity-30 border-b-2 border-green-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <Link to="/" className="flex-shrink-0 flex items-center">
                <img src={logo} alt="NASTI Logo" />
              </Link>
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
        <main className="flex-grow">
          <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <Outlet />
            <TanStackRouterDevtools />
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-white shadow mt-auto">
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
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
}>()({
  component: RootComponent,
})
