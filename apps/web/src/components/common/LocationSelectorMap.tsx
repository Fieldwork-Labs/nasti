import React, { useCallback, useRef } from "react"
import mapboxgl, { type Marker } from "mapbox-gl"
import Map, { Marker as MapMarker } from "react-map-gl"

import "mapbox-gl/dist/mapbox-gl.css"
import { MapPin } from "lucide-react"

type ViewState = {
  longitude: number
  latitude: number
  zoom: number
}

interface LocationSelectorProps {
  viewState?: ViewState
  setViewState: (viewState: ViewState) => void
  location?: { lat: number; lng: number }
  onLocationSelected?: (location: { lat: number; lng: number }) => void
}

export const LocationSelectorMap: React.FC<LocationSelectorProps> = ({
  viewState,
  setViewState,
  location,
  onLocationSelected,
}) => {
  const mapRef = useRef(null)
  const markerRef = useRef<Marker>(null)

  const handleMarkerDragEnd = useCallback(() => {
    const lngLat = markerRef.current?.getLngLat()
    if (lngLat) {
      const newLocation = { ...lngLat }
      onLocationSelected?.(newLocation)
    }
  }, [onLocationSelected])

  const handleMapClick = useCallback(
    (e: mapboxgl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat
      markerRef.current?.setLngLat([lng, lat])
      const newLocation = { lat, lng }
      onLocationSelected?.(newLocation)
    },
    [onLocationSelected],
  )

  return (
    <div className="location-selector">
      <Map
        ref={mapRef}
        mapLib={mapboxgl as never}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        style={{ height: 460 }}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
        onClick={handleMapClick}
      >
        {location && (
          <span className="bg-accent-foreground relative ml-1 mt-1 inline-flex rounded-lg p-1 text-right text-sm font-medium leading-none">
            {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
          </span>
        )}

        {location && (
          <MapMarker
            ref={markerRef}
            draggable
            onDragEnd={handleMarkerDragEnd}
            latitude={location.lat}
            longitude={location.lng}
          >
            <div className="rounded-full bg-white/50 p-2">
              <MapPin className="text-primary h-5 w-5" />
            </div>
          </MapMarker>
        )}
      </Map>
    </div>
  )
}
