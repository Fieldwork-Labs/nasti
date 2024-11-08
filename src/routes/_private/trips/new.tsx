import { TripForm } from "@/components/trips/tripForm"
import { useAdminOnly } from "@/hooks/useAdminOnly"
import { createFileRoute } from "@tanstack/react-router"

const TripFormNew = () => {
  useAdminOnly()
  return (
    <div className="mt-6 flex flex-col pb-6 sm:w-full md:w-1/2 lg:w-1/3 gap-4">
      <div>
        <h4 className="mb-2 text-xl font-bold">New Trip</h4>
      </div>
      <TripForm />
    </div>
  )
}

export const Route = createFileRoute("/_private/trips/new")({
  component: TripFormNew,
})
