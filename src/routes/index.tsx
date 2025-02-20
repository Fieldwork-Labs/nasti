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
  beforeLoad: async ({ location, context, params }) => {
    console.log({ params, location })
    if (
      (await context.getSession()) &&
      !location.pathname.startsWith("/auth")
    ) {
      throw redirect({
        to: "/trips",
      })
    }
  },
})
