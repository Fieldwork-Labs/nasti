import { createFileRoute } from "@tanstack/react-router"
import { useAdminOnly } from "@/hooks/useAdminOnly"
import { ContainersList } from "@/components/containers/ContainersList"

export const Route = createFileRoute("/_private/settings/containers")({
  component: ContainersPage,
})

function ContainersPage() {
  useAdminOnly()

  return (
    <div className="container mx-auto p-6">
      <ContainersList />
    </div>
  )
}
