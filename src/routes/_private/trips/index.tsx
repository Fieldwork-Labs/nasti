import { useCallback, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useQueryClient } from "@tanstack/react-query"
import useUserStore from "@/store/userStore"
import { createFileRoute } from "@tanstack/react-router"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { MapPin, PencilIcon, PlusIcon, TrashIcon } from "lucide-react"
import { ButtonLink } from "@/components/ui/buttonLink"
import { TripWithCoordinates } from "@/types"
import Map, { Marker, Popup } from "react-map-gl"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"

import { TripFormWizard, TripFormProvider } from "@/components/trips/TripWizard"

import { useTrips } from "@/hooks/useTrips"
import { useTripFormWizard } from "@/components/trips/TripWizard/useTripFormWizard"

interface TripsMapProps {
  trips: TripWithCoordinates[]
}

const TripsMap = ({ trips }: TripsMapProps) => {
  const [showPopup, setShowPopup] = useState<TripWithCoordinates | null>(null)

  // Calculate bounds based on all trip coordinates
  const initialViewState = useMemo(() => {
    const validTrips = trips.filter((trip) => trip.latitude && trip.longitude)

    if (validTrips.length === 0) {
      // Default view for Australia if no valid coordinates
      return {
        longitude: 133.7751,
        latitude: -25.2744,
        zoom: 3,
      }
    }

    // Find min and max coordinates
    const bounds = validTrips.reduce(
      (acc, trip) => {
        return {
          minLng: Math.min(acc.minLng, trip.longitude),
          maxLng: Math.max(acc.maxLng, trip.longitude),
          minLat: Math.min(acc.minLat, trip.latitude),
          maxLat: Math.max(acc.maxLat, trip.latitude),
        }
      },
      {
        minLng: validTrips[0].longitude,
        maxLng: validTrips[0].longitude,
        minLat: validTrips[0].latitude,
        maxLat: validTrips[0].latitude,
      },
    )

    // Calculate center point
    const centerLng = (bounds.minLng + bounds.maxLng) / 2
    const centerLat = (bounds.minLat + bounds.maxLat) / 2

    // Calculate appropriate zoom level
    const latDiff = bounds.maxLat - bounds.minLat
    const lngDiff = bounds.maxLng - bounds.minLng
    const maxDiff = Math.max(latDiff, lngDiff)

    const zoom = Math.floor(8 - Math.log2(maxDiff))

    return {
      longitude: centerLng,
      latitude: centerLat,
      zoom: Math.min(Math.max(zoom, 3), 15), // Clamp zoom between 3 and 15
    }
  }, [trips])

  return (
    <Map
      mapLib={mapboxgl as never}
      mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
      initialViewState={initialViewState}
      style={{ height: 540 }}
      mapStyle="mapbox://styles/mapbox/satellite-v9"
    >
      {trips
        .filter((trip) => trip.latitude && trip.longitude)
        .map((trip) => (
          <Marker
            latitude={trip.latitude}
            longitude={trip.longitude}
            key={trip.id}
          >
            <div className="rounded-full bg-white bg-opacity-50 p-2">
              <MapPin
                className="h-5 w-5 cursor-pointer text-primary"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPopup(trip)
                }}
              />
            </div>
          </Marker>
        ))}
      {showPopup && (
        <Popup
          onClose={() => setShowPopup(null)}
          longitude={showPopup.longitude}
          latitude={showPopup.latitude}
        >
          <span className="text-primary">{showPopup.name}</span>
        </Popup>
      )}
    </Map>
  )
}

const NewTripButton = () => {
  const { open } = useTripFormWizard()
  return (
    <Button className="flex gap-1" onClick={open}>
      <PlusIcon aria-label="New Trip" size={16} /> <span>New</span>
    </Button>
  )
}

const TripsList = () => {
  // TODO pagination
  // TODO search function

  const { orgId, isAdmin } = useUserStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Fetch trips
  const { data, isLoading, isError, error } = useTrips()

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

  if (isError && error) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">Error: {error.message}</p>
      </div>
    )
  }

  return (
    <TripFormProvider>
      <div>
        <div className="flex justify-between">
          <h2 className="mb-4 text-2xl font-semibold">Trips</h2>
          {isAdmin && <NewTripButton />}
        </div>
        {!data || data.length === 0 ? (
          <p>No trips found.</p>
        ) : (
          <>
            <TripsMap trips={data} />

            <div className="overflow-x-auto">
              <table className="min-w-full overflow-hidden rounded-lg">
                <thead className="">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Start Date</th>
                    <th className="px-4 py-2 text-left">End Date</th>
                    <th className="px-4 py-2 text-left">Location</th>
                    {isAdmin && <th className="px-4 py-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.map((trip) => (
                    <tr key={trip.id} className="border-t">
                      <td className="px-4 py-2">{trip.name}</td>
                      <td className="px-4 py-2">
                        {trip.start_date &&
                          new Date(trip.start_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">
                        {trip.end_date &&
                          new Date(trip.end_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">{trip.location_name}</td>
                      {isAdmin && (
                        <td className="flex justify-center gap-2 px-4 py-2">
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

        <TripFormWizard />
      </div>
    </TripFormProvider>
  )
}

export const Route = createFileRoute("/_private/trips/")({
  component: TripsList,
})
