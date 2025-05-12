import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./style.css"

import { RouterProvider, createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import { ThemeProvider } from "./contexts/theme"
import { NastiPersistQueryClientProvider } from "./lib/queryClient"
import { useAuth } from "./hooks/useAuth"
import { SwStatusProvider } from "./contexts/swStatus"

// Create a new router instance
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultNotFoundComponent: () => (
    <div className="mt-6 flex-col pb-6 sm:w-full">
      <div className="rounded-lg border-2 p-6 text-lg md:w-1/2">
        <h4 className="text-primary mb-2 text-xl font-bold">404 Error</h4>
        We were unable to find the page you are looking for.
      </div>
    </div>
  ),
  context: {
    isLoggedIn: false,
    getSession: undefined,
  },
})

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const App = () => {
  const { isLoggedIn, getSession } = useAuth()
  return (
    <ThemeProvider>
      <SwStatusProvider>
        <RouterProvider router={router} context={{ isLoggedIn, getSession }} />
      </SwStatusProvider>
    </ThemeProvider>
  )
}

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("No root element found")
if (!rootElement.innerHTML) {
  const root = createRoot(rootElement)
  root.render(
    <StrictMode>
      <NastiPersistQueryClientProvider>
        <App />
      </NastiPersistQueryClientProvider>
    </StrictMode>,
  )
}
