import { createFileRoute, redirect } from "@tanstack/react-router"

const HomePage = () => {
  return (
    <div>
      <h1>Home Page</h1>
    </div>
  )
}

export const Route = createFileRoute("/")({
  component: HomePage,
  beforeLoad: async ({ context }) => {
    if (await context.getSession()) {
      throw redirect({
        to: "/trips",
      })
    }
  },
})
