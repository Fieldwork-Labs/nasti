import mapboxgl from "mapbox-gl"
import Map, { Marker, MapRef } from "react-map-gl"
import { useEffect, useMemo, useRef, useState } from "react"
import { ShoppingBag } from "lucide-react"
import { useGeoLocation } from "@/contexts/location"

export const LocationMap = ({
  coord,
  Marker: LocationMarker,
}: {
  coord: {
    latitude: number
    longitude: number
  }
  Marker: React.FC
}) => {
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
    const pts: [number, number][] = [[coord.longitude, coord.latitude]]
    if (location) pts.push([location.longitude, location.latitude])
    return pts
  }, [coord, location])

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
        <Marker {...coord}>
          <LocationMarker />
        </Marker>
      </Map>
    </div>
  )
}
