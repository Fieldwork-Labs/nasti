import { useMemo } from "react"
import { ViewState } from "react-map-gl"

export const useViewState = (
  coords: Array<[number, number]>,
): Pick<ViewState, "longitude" | "latitude" | "zoom"> => {
  return useMemo(() => {
    if (coords.length === 0) {
      // Default view for Australia if no valid coordinates
      return {
        longitude: 133.7751,
        latitude: -25.2744,
        zoom: 3,
      }
    }

    const bounds = coords.reduce(
      (acc, coord) => {
        return {
          minLng: Math.min(acc.minLng, coord[0]),
          maxLng: Math.max(acc.maxLng, coord[0]),
          minLat: Math.min(acc.minLat, coord[1]),
          maxLat: Math.max(acc.maxLat, coord[1]),
        }
      },
      {
        minLng: coords[0][0],
        maxLng: coords[0][0],
        minLat: coords[0][1],
        maxLat: coords[0][1],
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
  }, [coords])
}
