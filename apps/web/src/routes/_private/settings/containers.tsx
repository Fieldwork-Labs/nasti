import { createFileRoute } from "@tanstack/react-router"
import { ContainersList } from "@/components/containers/ContainersList"

export const Route = createFileRoute("/_private/settings/containers")({
  component: ContainersPage,
})

function ContainersPage() {
  return (
    <div className="container mx-auto p-6">
      <ContainersList />
    </div>
  )
}
