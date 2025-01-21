import { useAdminOnly } from "@/hooks/useAdminOnly"
import { usePeople } from "@/hooks/usePeople"
import { getTripDetail, TripWithDetails } from "@/hooks/useTripDetail"
import { useTripSpecies } from "@/hooks/useTripSpecies"
import { getTripCoordinates, queryClient } from "@/lib/utils"
import { createFileRoute, useLoaderData } from "@tanstack/react-router"
import { MapPin } from "lucide-react"
import { Map, Marker } from "react-map-gl"
import mapboxgl from "mapbox-gl"
import { useMemo, useState } from "react"
import { TripSpeciesDetail } from "@/components/trips/TripSpeciesDetail"

const TripDetail = () => {
  useAdminOnly()
  const { instance } = useLoaderData({ from: "/_private/trips/$id/" })
  const { data: people } = usePeople()
  const { data: tripSpecies } = useTripSpecies(instance?.id)

  const [viewState, setViewState] = useState(
    instance
      ? {
          ...getTripCoordinates(instance),
          zoom: 6.5,
        }
      : { longitude: 133.7751, latitude: -25.2744, zoom: 3 },
  )

  const members = useMemo(() => {
    if (instance && people && people.length > 0) {
      return instance.members.map((member) =>
        people.find((person) => person.id === member),
      )
    }
  }, [instance, people])

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
        <div className="rounded-lg border border-foreground/50 p-2">
          <h4 className="mb-2 text-xl font-bold">Members</h4>
          {!members || members.length === 0 ? (
            <p>No members found.</p>
          ) : (
            members.map((member) => <p>{member?.name}</p>)
          )}
        </div>
        <div className="rounded-lg border border-foreground/50 p-2">
          <h4 className="mb-2 text-xl font-bold">Species</h4>
          {!instance.species ||
          instance.species.length === 0 ||
          !tripSpecies ? (
            <p>No species found.</p>
          ) : (
            tripSpecies.map((species) => (
              <TripSpeciesDetail
                key={species.species.ala_guid}
                species={species.species}
              />
            ))
          )}
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
