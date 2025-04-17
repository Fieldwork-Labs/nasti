import mapboxgl from "mapbox-gl"
import Map, { Marker, MapRef } from "react-map-gl"
import { useEffect, useMemo, useRef, useState } from "react"
import { ShoppingBag } from "lucide-react"
import { useCollection } from "@/hooks/useCollection"
import { useGeoLocation } from "@/contexts/location"

export const CollectionMap = ({
  tripId,
  collectionId,
}: {
  tripId: string
  collectionId: string
}) => {
  const collection = useCollection({ tripId, collectionId })
  const { location } = useGeoLocation()

  const [mapHeight, setMapHeight] = useState("calc(99vh - 100px)")
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)

  useEffect(() => {
    const updateMapHeight = () => {
      if (!mapContainerRef.current) return
      const top = mapContainerRef.current.getBoundingClientRect().top
      setMapHeight(`calc(99vh - ${top}px)`)
    }
    updateMapHeight()
    window.addEventListener("resize", updateMapHeight)
    return () => window.removeEventListener("resize", updateMapHeight)
  }, [])

  const coords = useMemo(() => {
    const pts: [number, number][] = []
    if (collection.locationCoord)
      pts.push([
        collection.locationCoord.longitude,
        collection.locationCoord.latitude,
      ])
    if (location) pts.push([location.longitude, location.latitude])
    return pts
  }, [collection.locationCoord, location])

  useEffect(() => {
    if (!mapRef.current || coords.length === 0) return

    mapRef.current.resize()

    const bounds = coords.reduce(
      (bounds, coord) => bounds.extend(coord),
      new mapboxgl.LngLatBounds(coords[0], coords[0]),
    )

    mapRef.current.fitBounds(bounds, {
      padding: 120,
      duration: 200,
    })
  }, [coords, mapHeight])

  /* ----------------------------------------------------------- */
  if (!collection.locationCoord) return null

  return (
    <div ref={mapContainerRef} className="w-full" style={{ height: mapHeight }}>
      <Map
        ref={mapRef}
        mapLib={mapboxgl as never}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
        initialViewState={{ longitude: 133.7751, latitude: -25.2744, zoom: 3 }} // only a fallback
        style={{ width: "100%", height: "100%", position: "relative" }}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
      >
        {location && (
          <Marker {...location}>
            <div className="h-4 w-4 rounded-full border border-blue-400 bg-blue-500" />
          </Marker>
        )}
        <Marker {...collection.locationCoord} key={collection.id}>
          <div className="rounded-full bg-white/50 p-2">
            <ShoppingBag className="text-primary h-5 w-5 cursor-pointer" />
          </div>
        </Marker>
      </Map>
    </div>
  )
}
