import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ToastContainer } from "react-toastify"
import React, { useEffect } from "react"
import useUserStore from "@/store/userStore"
import { supabase } from "@/lib/supabase"
import { User } from "@supabase/supabase-js"
import logo from "@/assets/logo.svg"
import { ButtonLink } from "@/components/ui/buttonLink"
// import "react-toastify/dist/ReactToastify.css"
const queryClient = new QueryClient()

const TanStackRouterDevtools = import.meta.env.DEV
  ? React.lazy(() =>
      // Lazy load in development
      import("@tanstack/router-devtools").then((res) => ({
        default: res.TanStackRouterDevtools,
        // For Embedded Mode
        // default: res.TanStackRouterDevtoolsPanel
      }))
    )
  : () => null // Render nothing in production

const RootComponent = () => {
  const { getUser, getSession } = useUserStore()

  useEffect(() => {
    // Fetch user on app load
    getUser()

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      getSession()
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [getUser, getSession])

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col min-h-screen">
        {/* Navbar */}
        <header className="shadow bg-green-900 bg-opacity-30 border-b-2 border-green-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <Link to="/" className="flex-shrink-0 flex items-center">
                <img src={logo} alt="NASTI Logo" />
              </Link>
              {/* Right side - User Menu */}
              <div className="flex items-center">
                <ButtonLink to="/auth/login">Login</ButtonLink>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-grow bg-gray-100">
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
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
        <ToastContainer />
      </div>
    </QueryClientProvider>
  )
}

export const Route = createRootRouteWithContext<{ user: User | null }>()({
  component: RootComponent,
})
