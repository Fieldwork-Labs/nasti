import { useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import useUserStore from "@/store/userStore"
import { createFileRoute } from "@tanstack/react-router"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react"
import { ButtonLink } from "@/components/ui/buttonLink"
import { getTrips } from "@/queries/trips"
import Map from "react-map-gl"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"

const TripsList = () => {
  // TODO pagination
  // TODO search function

  const { orgId, isAdmin } = useUserStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Fetch trips
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["trips", orgId],
    queryFn: async () => {
      if (!orgId) {
        throw new Error("Organisation not found")
      }
      return getTrips(orgId)
    },
    enabled: Boolean(orgId),
  })

  // Handle deletion of an trip
  const handleDelete = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("trip").delete().eq("id", id)
      if (error) {
        toast({
          variant: "destructive",
          description: `Failed to delete trip: ${error.message}`,
        })
      } else {
        toast({ description: "Trip deleted successfully." })
        queryClient.invalidateQueries({ queryKey: ["trips", orgId] })
      }
    },
    [orgId, queryClient, toast],
  )

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <p>Loading trips...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">Error: {error.message}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between">
        <h2 className="text-2xl font-semibold mb-4">Trips</h2>
        {isAdmin && (
          <ButtonLink to="/trips/new" className="flex gap-1">
            <PlusIcon aria-label="New Trip" size={16} /> <span>New</span>
          </ButtonLink>
        )}
      </div>
      {!data || data.length === 0 ? (
        <p>No trips found.</p>
      ) : (
        <>
          <Map
            mapLib={mapboxgl as never}
            mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
            initialViewState={{
              longitude: 124,
              latitude: -28,
              zoom: 4.2,
            }}
            style={{ height: 540 }}
            mapStyle="mapbox://styles/mapbox/satellite-v9"
          />

          <div className="overflow-x-auto">
            <table className="min-w-full rounded-lg overflow-hidden">
              <thead className="">
                <tr>
                  <th className="py-2 px-4 text-left">Name</th>
                  <th className="py-2 px-4 text-left">Start Date</th>
                  <th className="py-2 px-4 text-left">End Date</th>
                  {isAdmin && <th className="py-2 px-4 ">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.map((trip) => (
                  <tr key={trip.id} className="border-t">
                    <td className="py-2 px-4">{trip.name}</td>
                    <td className="py-2 px-4">
                      {trip.start_date &&
                        new Date(trip.start_date).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-4">
                      {trip.end_date &&
                        new Date(trip.end_date).toLocaleDateString()}
                    </td>
                    {isAdmin && (
                      <td className="py-2 px-4 flex gap-2 justify-center">
                        <ButtonLink
                          size="icon"
                          to={`/trips/$id/edit`}
                          params={{ id: trip.id }}
                          title="Edit"
                        >
                          <PencilIcon aria-label="Edit" size={16} />
                        </ButtonLink>
                        <Button
                          size="icon"
                          onClick={() => handleDelete(trip.id)}
                          title="Delete"
                        >
                          <TrashIcon aria-label="Delete" size={16} />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_private/trips/")({
  component: TripsList,
})
