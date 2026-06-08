import { useGeoLocation } from "@/contexts/location"
import { useMemo } from "react"

export const useDisplayDistance = ({
  latitude,
  longitude,
}: {
  latitude?: number
  longitude?: number
}) => {
  const { getDistanceKm } = useGeoLocation()
  const displayDistance = useMemo(() => {
    const collLocation =
      latitude && longitude ? { latitude, longitude } : undefined
    if (!collLocation) return undefined
    const distance = getDistanceKm(collLocation)
    if (!distance) return undefined
    if (distance > 10) return distance?.toFixed(0)
    return distance.toFixed(2)
  }, [getDistanceKm, latitude, longitude])

  return displayDistance
}
