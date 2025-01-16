import { Button } from "@/components/ui/button"
import { parsePostGISPoint } from "@/lib/utils"
import { Trip } from "@/types"
import debounce from "lodash/debounce"
import { MapPin, XIcon } from "lucide-react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Map, { Marker } from "react-map-gl"
import CreatableSelect from "react-select/creatable"
import { useLocationSearch } from "./useLocationSearch"

// Types
export type TripLocationDetails = Partial<
  Pick<Trip, "location_coordinate" | "location_name">
>

interface TripLocationFormProps {
  trip?: Trip
  onSave: (newTripDetails?: TripLocationDetails) => void
}

// Custom Hook for form logic
export function useTripLocationForm({ trip, onSave }: TripLocationFormProps) {
  const [inputValue, setInputValue] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const handleSearchDebounced = useRef(
    debounce((input) => setSearchQuery(input), 300),
  ).current
  const isDirty = useRef(false)

  const [showSearch, setShowSearch] = useState(!trip?.location_name)
  const [error, setError] = useState<string | null>(null)
  const [useCustomName, setUseCustomName] = useState(false)

  const existingCoords = useMemo(() => {
    if (!trip?.location_coordinate) return
    return parsePostGISPoint(trip.location_coordinate)
  }, [trip])

  const [locationCoords, setLocationCoords] = useState<
    { latitude: number; longitude: number } | undefined
  >(existingCoords)
  const [locationName, setLocationName] = useState<string | undefined>(
    trip?.location_name ?? undefined,
  )

  const [viewState, setViewState] = useState({
    longitude: locationCoords?.longitude || 124,
    latitude: locationCoords?.latitude || -28,
    zoom: 4.2,
  })

  const {
    results,
    searchError,
    selectedLocation,
    retrieveError,
    isLoading,
    selectLocation,
  } = useLocationSearch(searchQuery)

  useEffect(() => {
    if (searchError) setError(searchError.message)
    else if (retrieveError) setError(retrieveError.message)
  }, [searchError, retrieveError])

  useEffect(() => {
    if (locationCoords)
      setViewState({
        ...locationCoords,
        zoom: 4.2,
      })
  }, [locationCoords])

  const handleResultClick = useCallback(
    (newValue: { value: string | undefined } | null) => {
      const id = newValue?.value
      const result = id && results?.find((result) => result.id === id)
      if (!result) return
      selectLocation(result.id)
    },
    [results, selectLocation],
  )

  const handleInputChange = useCallback(
    (inputText: string) => {
      isDirty.current = true
      setInputValue(inputText)
      handleSearchDebounced(inputText.trim())
    },
    [handleSearchDebounced],
  )

  useEffect(() => {
    if (selectedLocation) {
      setLocationCoords(selectedLocation.coordinates)
      setLocationName(selectedLocation.name)
      setShowSearch(false)
    }
  }, [selectedLocation])

  const handleSubmit = useCallback(async () => {
    try {
      if (isDirty.current) {
        const newTripDetails: TripLocationDetails = useCustomName
          ? { location_name: searchQuery }
          : {
              location_coordinate: locationCoords
                ? `POINT(${locationCoords.longitude} ${locationCoords.latitude})`
                : null,
              location_name: locationName ?? null,
            }
        onSave(newTripDetails)
      } else onSave()
    } catch (error) {
      setError((error as Error).message)
    }
  }, [onSave, useCustomName, searchQuery, locationCoords, locationName])

  return {
    inputValue,
    showSearch,
    error,
    locationName,
    locationCoords,
    viewState,
    results,
    isLoading,
    selectedLocation,
    handleInputChange,
    handleResultClick,
    setUseCustomName,
    handleSubmit,
    setShowSearch,
    setViewState,
  }
}

// Extract the return type of the hook to use as props for the presentational component
export type TripLocationFormStateAndHandlers = ReturnType<
  typeof useTripLocationForm
>

// Presentational Component
export const TripLocationForm = ({
  inputValue,
  showSearch,
  error,
  locationName,
  locationCoords,
  viewState,
  results,
  isLoading,
  handleInputChange,
  handleResultClick,
  handleSubmit,
  setUseCustomName,
  setShowSearch,
  setViewState,
}: TripLocationFormStateAndHandlers) => {
  return (
    <div className="relative flex flex-col gap-4">
      {!showSearch && (
        <div className="flex justify-between rounded-md border p-2">
          <div className="flex flex-col justify-around">
            <span className="text-sm font-medium leading-none">
              Selected Location
            </span>
            <span className="font-bold">{locationName}</span>
          </div>
          <Button
            variant="secondary"
            size="icon"
            title="Clear"
            onClick={() => setShowSearch(true)}
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
      )}

      {showSearch && (
        <CreatableSelect
          isClearable
          escapeClearsValue
          inputValue={inputValue}
          onInputChange={(newValue, { action }) => {
            if (action === "input-change") handleInputChange(newValue)
            return newValue
          }}
          value={{ value: locationCoords?.longitude.toString() }}
          onChange={handleResultClick}
          options={results.map(({ id, name }) => ({
            value: id,
            label: name,
          }))}
          isLoading={isLoading}
          placeholder="Search location"
          allowCreateWhileLoading
          formatCreateLabel={(inputValue) =>
            `Use ${inputValue} as a custom location`
          }
          onCreateOption={() => {
            setUseCustomName(true)
            handleSubmit()
          }}
        />
      )}

      {error && <div className="text-red-500">{error}</div>}

      <Map
        mapLib={mapboxgl as never}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        style={{ height: 460 }}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
      >
        {locationCoords && (
          <Marker
            latitude={locationCoords.latitude}
            longitude={locationCoords.longitude}
          >
            <div className="rounded-full bg-white bg-opacity-50 p-2">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
          </Marker>
        )}
      </Map>
    </div>
  )
}
