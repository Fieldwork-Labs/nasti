import { TripForm } from "@/components/trips/tripForm"
import {
  createFileRoute,
  CatchNotFound,
  useLoaderData,
} from "@tanstack/react-router"
import { queryClient } from "@/lib/utils"
import { Trip } from "@/types"
import { getTrips } from "@/queries/trips"
import { useAdminOnly } from "@/hooks/useAdminOnly"

const TripFormEdit = () => {
  useAdminOnly()
  const { instance } = useLoaderData({ from: "/_private/trips/$id/edit" })
  if (!instance) return <CatchNotFound>Trip Not found</CatchNotFound>

  return (
    <div className="mt-6 flex flex-col pb-6 sm:w-full md:w-1/2 lg:w-1/3 gap-4">
      <div>
        <h4 className="mb-2 text-xl font-bold">Edit Trip</h4>
      </div>
      <TripForm instance={instance} />
    </div>
  )
}

export const Route = createFileRoute("/_private/trips/$id/edit")({
  loader: async ({ params, context }) => {
    // TODO find out why no orgID present in this function on reload
    const { id } = params
    const { orgId } = context
    if (!orgId) console.error("no org id")

    const tripsQueryData = await queryClient.ensureQueryData<Trip[]>({
      queryKey: ["trips", orgId],
      queryFn: () => {
        if (!orgId) {
          return Promise.resolve([])
        }
        return getTrips(orgId)
      },
    })

    const instance = tripsQueryData.find((t) => t.id === id)

    return { instance }
  },
  component: TripFormEdit,
})
