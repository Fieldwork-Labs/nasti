import { useHydrateTripDetails } from "@/hooks/useHydrateTripDetails"

import { useViewState } from "@nasti/common/hooks"
import { CollectionWithCoord } from "@nasti/common/types"
import { ShoppingBag } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useGeoLocation } from "@/contexts/location"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import Map, { Marker, Popup } from "react-map-gl"

export const TripCollectionsMap = ({ id }: { id: string }) => {
  const { data } = useHydrateTripDetails({ id })
  const { location } = useGeoLocation()

  const [showPopup, setShowPopup] = useState<CollectionWithCoord | null>(null)
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

  const collections =
    data.trip?.collections.filter((col) => Boolean(col.locationCoord)) ?? []

  const initialCollectionCoords: Array<[number, number]> = collections.map(
    ({ locationCoord }) => [locationCoord!.longitude, locationCoord!.latitude],
  )

  if (location) {
    console.log({ location })
    initialCollectionCoords.push([location.longitude, location.latitude])
  }
  // Calculate bounds based on all trip coordinates
  const initialViewState = useViewState(initialCollectionCoords)

  return (
    <div ref={mapContainerRef} className="w-full" style={{ height: mapHeight }}>
      <Map
        mapLib={mapboxgl as never}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
        initialViewState={initialViewState}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
      >
        {location && (
          <Marker {...location}>
            <div className="h-4 w-4 rounded-full border border-blue-400 bg-blue-500" />
          </Marker>
        )}
        {collections.map((col) => (
          <Marker {...col.locationCoord!} key={col.id}>
            <div className="rounded-full bg-white/50 p-2">
              <ShoppingBag
                className="text-primary h-5 w-5 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPopup(col)
                }}
              />
            </div>
          </Marker>
        ))}
        {showPopup && (
          <Popup
            onClose={() => setShowPopup(null)}
            {...showPopup.locationCoord!}
          >
            {/* <Link
              to={"/trips/$id"}
              params={{ id: showPopup.id }}
              className="text-primary"
            >
              {showPopup?.name} trip
            </Link> */}
          </Popup>
        )}
      </Map>
    </div>
  )
}
