import { useHydrateTripDetails } from "@/hooks/useHydrateTripDetails"

import { useViewState } from "@nasti/common/hooks"
import { CollectionWithCoord } from "@nasti/common/types"
import { ShoppingBag } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useGeoLocation } from "@/contexts/location"
import mapboxgl from "mapbox-gl"
import Map, { MapRef, Marker, Popup } from "react-map-gl"
import { Link } from "@tanstack/react-router"
import { useCollection } from "@/hooks/useCollection"
import "mapbox-gl/dist/mapbox-gl.css"

const CollectionPopup = ({
  collectionId,
  tripId,
  onClose,
}: {
  collectionId: string
  tripId: string
  onClose: () => void
}) => {
  const collection = useCollection({ collectionId, tripId })
  if (!collection || !collection.locationCoord) return <></>
  return (
    <Popup onClose={onClose} {...collection.locationCoord}>
      <Link
        to={"/trips/$id/collections/$collectionId"}
        params={{ id: tripId, collectionId: collection.id }}
        className="text-primary"
      >
        {collection?.species?.name || collection.field_name} collection
      </Link>
    </Popup>
  )
}

export const TripCollectionsMap = ({ id }: { id: string }) => {
  const { data } = useHydrateTripDetails({ id })
  const { location } = useGeoLocation()

  const [showPopup, setShowPopup] = useState<CollectionWithCoord | null>(null)
  const [mapHeight, setMapHeight] = useState("calc(100vh - 100px)")
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)

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
    initialCollectionCoords.push([location.longitude, location.latitude])
  }
  // Calculate bounds based on all trip coordinates
  const initialViewState = useViewState(initialCollectionCoords)

  useEffect(() => {
    if (!mapRef.current || initialCollectionCoords.length === 0) return

    mapRef.current.resize()

    const bounds = initialCollectionCoords.reduce(
      (bounds, coord) => bounds.extend(coord),
      new mapboxgl.LngLatBounds(
        initialCollectionCoords[0],
        initialCollectionCoords[0],
      ),
    )

    mapRef.current.fitBounds(bounds, {
      padding: 120,
      duration: 200,
    })
  }, [initialCollectionCoords, mapHeight])

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
          <CollectionPopup
            tripId={id}
            collectionId={showPopup.id}
            onClose={() => setShowPopup(null)}
          />
        )}
      </Map>
    </div>
  )
}
