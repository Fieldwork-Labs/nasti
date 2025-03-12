import useUserStore from "@/store/userStore"
import { Trip } from "@nasti/common/types"
import { Button } from "@nasti/ui/button"
import { createFileRoute, Link } from "@tanstack/react-router"
import { MapPin, PlusIcon } from "lucide-react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { useState } from "react"
import Map, { Marker, Popup } from "react-map-gl"

import { TripFormProvider, TripFormWizard } from "@/components/trips/TripWizard"

import { useTripFormWizard } from "@/components/trips/TripWizard/useTripFormWizard"
import {
  getTripCoordinates,
  TripWithLocation,
  tripWithLocationFilter,
} from "@/components/trips/utils"
import { useTrips } from "@/hooks/useTrips"
import { useViewState } from "@/hooks/useViewState"

interface TripsMapProps {
  trips: Trip[]
}

const TripsMap = ({ trips }: TripsMapProps) => {
  const [showPopup, setShowPopup] = useState<TripWithLocation | null>(null)

  // Calculate bounds based on all trip coordinates
  const initialViewState = useViewState(
    trips
      .filter(tripWithLocationFilter)
      .map(getTripCoordinates)
      .map(({ longitude, latitude }) => [longitude, latitude]),
  )

  return (
    <Map
      mapLib={mapboxgl as never}
      mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
      initialViewState={initialViewState}
      style={{ height: 540 }}
      mapStyle="mapbox://styles/mapbox/satellite-v9"
    >
      {trips.filter(tripWithLocationFilter).map((trip) => (
        <Marker {...getTripCoordinates(trip)} key={trip.id}>
          <div className="rounded-full bg-white/50 p-2">
            <MapPin
              className="text-primary h-5 w-5 cursor-pointer"
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
          {...getTripCoordinates(showPopup)}
        >
          <Link
            to={"/trips/$id"}
            params={{ id: showPopup.id }}
            className="text-primary"
          >
            {showPopup?.name} trip
          </Link>
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

const TripTableRow = ({ trip }: { trip: Trip }) => {
  return (
    <tr className="border-t">
      <td className="px-4 py-2">
        <Link to={`/trips/$id`} params={{ id: trip.id }}>
          {trip.name}
        </Link>
      </td>
      <td className="px-4 py-2">
        {trip.start_date && new Date(trip.start_date).toLocaleDateString()}
      </td>
      <td className="px-4 py-2">
        {trip.end_date && new Date(trip.end_date).toLocaleDateString()}
      </td>
      <td className="px-4 py-2">{trip.location_name}</td>
    </tr>
  )
}

const TripsList = () => {
  // TODO pagination
  // TODO search function

  const { isAdmin } = useUserStore()

  // Fetch trips
  const { data, isPending, isError, error } = useTrips()

  if (isPending) {
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
                  </tr>
                </thead>
                <tbody>
                  {data.map((trip) => (
                    <TripTableRow key={trip.id} trip={trip} />
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
