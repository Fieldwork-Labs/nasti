import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useMemo,
  useCallback,
} from "react"

import { point, distance } from "@turf/turf"
import debounce from "lodash/debounce"
import { geolocation } from "@/platform"

// Type definitions
type GeolocationData = Omit<GeolocationCoordinates, "toJSON">

interface GeoLocationContextType {
  locationDisplay: string | undefined
  location: GeolocationData | undefined
  warning: number | undefined
  getDistanceKm: ({
    latitude,
    longitude,
  }: {
    latitude: number
    longitude: number
  }) => number | undefined
}

// Create context with a default undefined value
const GeoLocationContext = createContext<GeoLocationContextType | undefined>(
  undefined,
)

// Props for the provider component
interface GeoLocationProviderProps {
  children: ReactNode
}

// Provider component
export const GeoLocationProvider: React.FC<GeoLocationProviderProps> = ({
  children,
}) => {
  const [location, setLocation] = useState<GeolocationData>()
  const [warning, setWarning] = useState<number | undefined>(undefined)

  useEffect(() => {
    let stopWatching: (() => void) | undefined

    const onUpdate = debounce(({ location, warning }) => {
      if (location) setLocation(location)
      if (warning) setWarning(warning)
    }, 1000)

    void geolocation.watchPosition(onUpdate).then((stop: () => void) => {
      stopWatching = stop
    })

    return () => {
      stopWatching?.()
      onUpdate.cancel()
    }
  }, [])

  const getDistanceKm = useCallback(
    ({ latitude, longitude }: { latitude: number; longitude: number }) => {
      if (!location) return undefined
      const myPoint = point([location.longitude, location.latitude])
      const otherPoint = point([longitude, latitude])
      return distance(myPoint, otherPoint, { units: "kilometers" })
    },
    [location],
  )

  const locationDisplay = useMemo(() => {
    if (location) {
      return `${location.latitude.toPrecision(
        6,
      )}, ${location.longitude.toPrecision(7)}`
    } else if (warning) {
      switch (warning) {
        case 1:
          return "Permission denied. Please check your permissions to use the location functionality."
        default:
          return "Unable to get location"
      }
    }
    return "Accessing location..."
  }, [location, warning])

  // Create the value object that will be provided to consumers
  const contextValue: GeoLocationContextType = {
    locationDisplay,
    location,
    warning,
    getDistanceKm,
  }

  return (
    <GeoLocationContext.Provider value={contextValue}>
      {children}
    </GeoLocationContext.Provider>
  )
}

// Custom hook for consuming the context
export const useGeoLocation = (): GeoLocationContextType => {
  const context = useContext(GeoLocationContext)

  if (context === undefined) {
    throw new Error("useGeoLocation must be used within a GeoLocationProvider")
  }

  return context
}

export const useHasGeoLocationPermission = () => {
  const [permStatus, setPermStatus] = useState<
    "granted" | "denied" | "prompt"
  >()

  useEffect(() => {
    void geolocation.getPermissionState().then(setPermStatus)
    const unsubscribe = geolocation.subscribePermissionState?.(setPermStatus)

    return () => {
      unsubscribe?.()
    }
  }, [])

  return permStatus
}
