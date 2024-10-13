import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_private/species/")({
  component: () => <div>Hello /_private/species/!</div>,
})
