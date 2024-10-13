import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ToastContainer } from "react-toastify"
import React, { useEffect } from "react"
import useUserStore from "@/store/userStore"
import { supabase } from "@/lib/supabase"
import { User } from "@supabase/supabase-js"
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
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Organisation Management
            </h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto p-4">
          <Outlet />
          <TanStackRouterDevtools />
        </main>
        <ToastContainer />
      </div>
    </QueryClientProvider>
  )
}

export const Route = createRootRouteWithContext<{ user: User | null }>()({
  component: RootComponent,
})
