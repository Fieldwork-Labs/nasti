import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_private/layout")({
  component: () => <div>Hello /_private/layout!</div>,
})
