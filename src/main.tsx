import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./globals.css"

import { RouterProvider, createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import useUserStore from "./store/userStore"

// Create a new router instance
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultNotFoundComponent: () => (
    <div className="mt-6 flex-col pb-6 sm:w-full">
      <div className="rounded-lg border-2 text-lg p-6 md:w-1/2">
        <h4 className="mb-2 text-xl font-bold text-gray-800">404 Error</h4>
        We were unable to find the page you are looking for.
      </div>
    </div>
  ),
  context: {
    user: null,
  },
})

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const App = () => {
  const { user } = useUserStore()
  return <RouterProvider router={router} context={{ user }} />
}

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("No root element found")
if (!rootElement.innerHTML) {
  const root = createRoot(rootElement)
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
