import { createFileRoute } from "@tanstack/react-router"
import { useAdminOnly } from "@/hooks/useAdminOnly"
import { StorageLocationsList } from "@/components/storage/StorageLocationsList"

export const Route = createFileRoute("/_private/settings/storage-locations")({
  component: StorageLocationsPage,
})

function StorageLocationsPage() {
  useAdminOnly()

  return (
    <div className="container mx-auto p-6">
      <StorageLocationsList />
    </div>
  )
}
