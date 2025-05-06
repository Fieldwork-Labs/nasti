import { LocationSelectorMap } from "@/components/common/LocationSelectorMap"
import { Trip } from "@nasti/common/types"
import { parsePostGISPoint } from "@nasti/common/utils"
import { Button } from "@nasti/ui/button"
import debounce from "lodash/debounce"
import { XIcon } from "lucide-react"
import "mapbox-gl/dist/mapbox-gl.css"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import CreatableSelect from "react-select/creatable"
import { useLocationSearch } from "./useLocationSearch"

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
  const [selectionMode, setSelectionMode] = useState<"search" | "map">("search")

  const [error, setError] = useState<string | null>(null)
  const [selectOnMap, setSelectOnMap] = useState(false)

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

  const clearLocationName = useCallback(() => {
    setLocationName(undefined)
    selectLocation(null)
    setInputValue("")
    setLocationCoords(undefined)
    setError(null)
  }, [selectLocation])

  useEffect(() => {
    if (searchError) setError(searchError.message)
    else if (retrieveError) setError(retrieveError.message)
  }, [searchError, retrieveError])

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

  const handleSelectCoords = useCallback(
    (coords: { longitude: number; latitude: number }) => {
      isDirty.current = true
      setLocationCoords(coords)
    },
    [],
  )

  useEffect(() => {
    if (selectedLocation) {
      setLocationCoords(selectedLocation.coordinates)
      setLocationName(selectedLocation.name)
      setViewState({
        latitude: selectedLocation.coordinates.latitude,
        longitude: selectedLocation.coordinates.longitude,
        zoom: 4.2,
      })
    }
  }, [selectedLocation])

  const handleSubmit = useCallback(async () => {
    try {
      if (isDirty.current) {
        onSave({
          location_coordinate: locationCoords
            ? `POINT(${locationCoords.longitude} ${locationCoords.latitude})`
            : null,
          location_name: locationName ?? null,
        })
      } else onSave()
    } catch (error) {
      setError((error as Error).message)
    }
  }, [onSave, locationCoords, locationName])

  return {
    inputValue,
    error,
    locationName,
    setLocationName,
    locationCoords,
    clearLocationName,
    viewState,
    results,
    isLoading,
    selectedLocation,
    handleInputChange,
    handleResultClick,
    handleSubmit,
    setViewState,
    selectOnMap,
    setSelectOnMap,
    handleSelectCoords,
    selectionMode,
    setSelectionMode,
  }
}

// Extract the return type of the hook to use as props for the presentational component
export type TripLocationFormStateAndHandlers = ReturnType<
  typeof useTripLocationForm
>

// Presentational Component
export const TripLocationForm = ({
  inputValue,
  error,
  locationName,
  setLocationName,
  locationCoords,
  clearLocationName,
  viewState,
  results,
  isLoading,
  handleInputChange,
  handleResultClick,
  setViewState,
  handleSelectCoords,
}: TripLocationFormStateAndHandlers) => {
  return (
    <div className="relative flex flex-col gap-4">
      {locationName && (
        <div className="flex justify-between rounded-md border p-2">
          <div className="flex flex-col justify-around">
            <span className="text-sm font-medium leading-none">
              Location Name
            </span>
            <span className="font-bold">{locationName}</span>
          </div>
          <Button
            variant="secondary"
            size="icon"
            title="Clear"
            onClick={clearLocationName}
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
      )}

      {!locationName && (
        <>
          <span className="text-sm font-medium leading-none">
            Location Name
          </span>
          <CreatableSelect
            isClearable
            escapeClearsValue
            inputValue={inputValue}
            onInputChange={(newValue, { action }) => {
              if (action === "input-change") handleInputChange(newValue)
              return newValue
            }}
            onChange={handleResultClick}
            options={results.map(({ id, name, ...rest }) => ({
              value: id,
              label: `${name}, ${rest.details.region}`,
            }))}
            isLoading={isLoading}
            placeholder="Search location"
            allowCreateWhileLoading
            formatCreateLabel={(inputValue) =>
              `Use ${inputValue} as a custom location`
            }
            onCreateOption={(value) => {
              setLocationName(value)
            }}
            classNames={{
              control: (state) =>
                "border rounded-lg! bg-secondary-background! " +
                (state.isFocused
                  ? "shadow-xs! shadow-gray-200!"
                  : "border-gray-300!"),
              valueContainer: () => "gap-1! px-3! py-1!",
              placeholder: () => "text-gray-400!",
              input: () => "text-sm! text-primary-foreground!",
              menu: () =>
                "bg-white! mt-1! border! border-gray-200! rounded-lg! shadow-md! bg-secondary-background! z-20",
              menuList: () => "py-1!",
              option: (state) =>
                "px-3! py-2! text-sm! text-primary!" +
                (state.isSelected
                  ? "bg-blue-600! text-white!"
                  : state.isFocused
                    ? "bg-secondary! text-gray-900!"
                    : "text-gray-700!"),
              noOptionsMessage: () => "text-gray-400! text-sm! p-2!",
            }}
          />
        </>
      )}

      {error && <div className="text-red-500">{error}</div>}
      <span className="text-sm font-medium leading-none">
        Location Coordinates
      </span>
      <LocationSelectorMap
        viewState={viewState}
        setViewState={setViewState}
        location={
          locationCoords && {
            lat: locationCoords.latitude,
            lng: locationCoords.longitude,
          }
        }
        onLocationSelected={(location) => {
          handleSelectCoords({
            latitude: location.lat,
            longitude: location.lng,
          })
        }}
      />
    </div>
  )
}
