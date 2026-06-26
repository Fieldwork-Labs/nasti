import { useViewState } from "@nasti/common/hooks"
import { Trip } from "@nasti/common/types"
import { parseWktPoint } from "@nasti/common/utils"
import { Link } from "@tanstack/react-router"
import { MapPin } from "lucide-react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { useEffect, useRef, useState } from "react"
import Map, { Marker, Popup } from "react-map-gl"

export type TripWithLocation = Omit<Trip, "location_coordinate"> & {
  location_coordinate: string
}

export const tripWithLocationFilter = (trip: Trip): trip is TripWithLocation =>
  Boolean(trip.location_coordinate)

export const getTripCoordinates = (
  trip: Trip,
): { latitude: number; longitude: number } => {
  const wktString = trip.location_coordinate
  if (!wktString) throw new Error("No location coordinate")
  return parseWktPoint(wktString)
}

export const TripsMap = ({ trips }: { trips: Trip[] }) => {
  const [showPopup, setShowPopup] = useState<TripWithLocation | null>(null)
  const [mapHeight, setMapHeight] = useState("calc(100vh - 100px)")
  const mapContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateMapHeight = () => {
      if (mapContainerRef.current) {
        // Get the top position of the map container
        const topPosition = mapContainerRef.current.getBoundingClientRect().top
        // Calculate remaining viewport height
        setMapHeight(`calc(100vh - ${topPosition}px)`)
      }
    }

    // Initial calculation
    updateMapHeight()

    // Add resize listener
    window.addEventListener("resize", updateMapHeight)

    // Cleanup
    return () => window.removeEventListener("resize", updateMapHeight)
  }, [])

  const mapTrips = trips
    .filter(tripWithLocationFilter)
    .map((t) => ({ ...t, ...getTripCoordinates(t) }))

  // Calculate bounds based on all trip coordinates
  const initialViewState = useViewState(
    mapTrips.map(({ longitude, latitude }) => [longitude, latitude]),
  )

  return (
    <div ref={mapContainerRef} className="w-full" style={{ height: mapHeight }}>
      <Map
        mapLib={mapboxgl as never}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
        initialViewState={initialViewState}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
      >
        {mapTrips.map((trip) => (
          <Marker {...trip} key={trip.id}>
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
              {showPopup?.name}
            </Link>
          </Popup>
        )}
      </Map>
    </div>
  )
}
