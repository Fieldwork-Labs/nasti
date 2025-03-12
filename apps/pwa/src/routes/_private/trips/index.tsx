import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_private/trips/")({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_private/trips/"!</div>
}
