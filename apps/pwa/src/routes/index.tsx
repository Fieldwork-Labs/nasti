import { createFileRoute } from "@tanstack/react-router"

const HomePage = () => {
  return (
    <div>
      <h1>Home Page</h1>
    </div>
  )
}

export const Route = createFileRoute("/")({
  component: HomePage,
  // @ts-expect-error
  beforeLoad: async ({ location, context }) => {
    // can use context to determine auth state and redirect to login page
  },
})
