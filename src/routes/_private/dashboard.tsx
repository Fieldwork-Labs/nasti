import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_private/dashboard")({
  component: () => "Welcome to the dashboard",
})
