import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./style.css"

import { RouterProvider, createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import useUserStore from "./store/userStore"
import { ThemeProvider } from "./contexts/theme"

// Create a new router instance
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultNotFoundComponent: () => (
    <div className="mt-6 flex-col pb-6 sm:w-full">
      <div className="rounded-lg border-2 p-6 text-lg md:w-1/2">
        <h4 className="mb-2 text-xl font-bold text-gray-800">404 Error</h4>
        We were unable to find the page you are looking for.
      </div>
    </div>
  ),
  context: {
    session: null,
    getSession: () => Promise.resolve(null),
    orgId: null,
  },
})

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const App = () => {
  const { session, getSession, orgId } = useUserStore()
  return (
    <ThemeProvider>
      <RouterProvider
        router={router}
        context={{ session, getSession, orgId }}
      />
    </ThemeProvider>
  )
}

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("No root element found")
if (!rootElement.innerHTML) {
  const root = createRoot(rootElement)
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
