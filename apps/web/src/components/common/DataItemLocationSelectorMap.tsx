import { useMemo, useState } from "react"

import { useTripDetail } from "@/hooks/useTripDetail"
import { parsePostGISPoint } from "@nasti/common/utils"
import { Button } from "@nasti/ui/button"
import { LocationSelectorMap } from "../common/LocationSelectorMap"

export const DataItemLocationSelectorMap = ({
  tripId,
  onLocationSelected,
  initialLocation,
  onClose,
}: {
  tripId: string
  onLocationSelected: ({ lat, lng }: { lat: number; lng: number }) => void
  initialLocation?: { lat: number; lng: number }
  onClose: () => void
}) => {
  const { data: trip } = useTripDetail(tripId)
  const [location, setLocation] = useState<
    { lat: number; lng: number } | undefined
  >(initialLocation)

  const initialViewCoord = useMemo(() => {
    if (initialLocation) return initialLocation
    if (trip?.location_coordinate) {
      const parsedLocation = parsePostGISPoint(trip?.location_coordinate)
      return {
        lat: parsedLocation.latitude,
        lng: parsedLocation.longitude,
      }
    }
    return {
      lat: -28,
      lng: 124,
    }
  }, [initialLocation, trip])

  const [viewState, setViewState] = useState({
    latitude: initialViewCoord.lat,
    longitude: initialViewCoord.lng,
    zoom: 10,
  })

  const handleSave = () => {
    if (location) {
      onLocationSelected(location)
      onClose()
    }
  }

  return (
    <div className="space-y-2">
      <LocationSelectorMap
        onLocationSelected={setLocation}
        location={location}
        viewState={viewState}
        setViewState={setViewState}
      />
      <div className="flex w-full justify-between gap-2">
        <Button
          className="w-full cursor-pointer"
          onClick={onClose}
          variant="secondary"
        >
          Cancel
        </Button>
        <Button
          className="w-full cursor-pointer"
          onClick={handleSave}
          disabled={!location}
        >
          Save
        </Button>
      </div>
    </div>
  )
}
