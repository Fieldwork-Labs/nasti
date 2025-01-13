import { useAdminOnly } from "@/hooks/useAdminOnly"
import { getTripDetail, TripWithDetails } from "@/hooks/useTripDetail"
import { getTripCoordinates, queryClient } from "@/lib/utils"
import { createFileRoute, useLoaderData } from "@tanstack/react-router"
import { MapPin } from "lucide-react"
import { Map, Marker } from "react-map-gl"
import mapboxgl from "mapbox-gl"
import { useState } from "react"

const TripDetail = () => {
  useAdminOnly()
  const { instance } = useLoaderData({ from: "/_private/trips/$id/" })

  const [viewState, setViewState] = useState(
    instance
      ? {
          ...getTripCoordinates(instance),
          zoom: 6.5,
        }
      : { longitude: 133.7751, latitude: -25.2744, zoom: 3 },
  )

  if (!instance) return <div>No trip found</div>
  return (
    <div className="mt-6 flex flex-col gap-4 pb-6">
      <div>
        <h4 className="mb-2 text-xl font-bold">{instance.name}</h4>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-foreground/50 p-2">
          <h4 className="mb-2 text-xl font-bold">Trip Details</h4>
          <p>Trip ID: {instance.id}</p>
          <p>Trip Name: {instance.name}</p>
          <p>Trip Start: {instance.start_date}</p>
          <p>Trip End: {instance.end_date}</p>
          {instance.location_name && (
            <p>Trip Location: {instance.location_name}</p>
          )}
        </div>
        <div className="rounded-lg border border-foreground/50 p-2">
          <h4 className="mb-2 text-xl font-bold">Map</h4>
          <Map
            mapLib={mapboxgl as never}
            mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            style={{ height: 460 }}
            mapStyle="mapbox://styles/mapbox/satellite-v9"
          >
            <Marker {...getTripCoordinates(instance)}>
              <div className="rounded-full bg-white bg-opacity-50 p-2">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
            </Marker>
          </Map>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_private/trips/$id/")({
  loader: async ({ params }) => {
    const { id } = params

    const instance = await queryClient.ensureQueryData<TripWithDetails | null>({
      queryKey: ["trip", id],
      queryFn: () => {
        if (!id) {
          return Promise.resolve(null)
        }
        return getTripDetail(id)
      },
    })

    return { instance }
  },
  component: TripDetail,
})
