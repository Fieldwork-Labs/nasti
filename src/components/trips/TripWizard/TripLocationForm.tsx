import { useTripFormWizard } from "./useTripFormWizard"
import { TripWizardStage } from "./lib"
import Map, { Marker } from "react-map-gl"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useMapboxSession } from "@/hooks/useMapboxSessionToken"
import CreatableSelect from "react-select/creatable"
import { MapPin, XIcon } from "lucide-react"
import { Trip } from "@/types"
import debounce from "lodash/debounce"
import { parsePostGISPoint } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// Types for the suggest endpoint
interface MapboxSearchResponse {
  suggestions: SearchSuggestion[]
  attribution: string
}

interface SearchSuggestion {
  name: string
  mapbox_id: string
  feature_type: string
  address?: string
  full_address?: string
  place_formatted: string
  context: SearchContext
  language: string
  maki: string
  poi_category?: string[]
  poi_category_ids?: string[]
  external_ids?: {
    safegraph?: string
    foursquare?: string
    [key: string]: string | undefined
  }
  metadata: Record<string, unknown>
}

interface SearchContext {
  country: ContextItem & {
    country_code: string
    country_code_alpha_3: string
  }
  region: ContextItem & {
    region_code: string
    region_code_full: string
  }
  postcode: ContextItem
  place: ContextItem
  neighborhood?: ContextItem
  street?: ContextItem
}

interface ContextItem {
  name: string
}

// Types for the retrieve endpoint
interface MapboxRetrieveResponse {
  features: Array<{
    properties: {
      name: string
      full_address?: string
      place_formatted: string
    }
    geometry: {
      coordinates: [number, number] // [longitude, latitude]
    }
  }>
}

interface LocationResult {
  id: string
  name: string
  fullAddress: string
  details: {
    type: string
    place?: string
    region?: string
    postcode?: string
  }
}

interface LocationWithCoordinates extends LocationResult {
  coordinates: {
    longitude: number
    latitude: number
  }
}

async function searchLocations(
  query: string,
  sessionToken: string,
): Promise<LocationResult[]> {
  if (!query) return []
  console.log("doing a search")
  const params = new URLSearchParams({
    q: query,
    country: "AU",
    access_token: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN,
    session_token: sessionToken,
    types: "region,district,place,city,locality,neighborhood",
  })

  const response = await fetch(
    `https://api.mapbox.com/search/searchbox/v1/suggest?${params}`,
  )

  const data = (await response.json()) as MapboxSearchResponse

  return data.suggestions.map(
    (suggestion): LocationResult => ({
      id: suggestion.mapbox_id,
      name: suggestion.name,
      fullAddress: suggestion.full_address || suggestion.place_formatted,
      details: {
        type: suggestion.feature_type,
        place: suggestion.context.place?.name,
        region: suggestion.context.region?.name,
        postcode: suggestion.context.postcode?.name,
      },
    }),
  )
}

async function retrieveLocation(
  id: string,
  sessionToken: string,
): Promise<LocationWithCoordinates | null> {
  const params = new URLSearchParams({
    access_token: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN,
    session_token: sessionToken,
  })

  const response = await fetch(
    `https://api.mapbox.com/search/searchbox/v1/retrieve/${id}?${params}`,
  )

  const data = (await response.json()) as MapboxRetrieveResponse

  if (!data.features?.[0]) return null

  const feature = data.features[0]
  const [longitude, latitude] = feature.geometry.coordinates

  return {
    id,
    name: feature.properties.name,
    fullAddress:
      feature.properties.full_address || feature.properties.place_formatted,
    coordinates: { longitude, latitude },
    details: {
      type: "retrieved",
      // Other details would need to be passed through from the original selection
      // since they're not included in the retrieve response
    },
  }
}

function useLocationSearch(searchQuery: string) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { sessionToken } = useMapboxSession()

  const searchResults = useQuery({
    queryKey: ["locationSearch", searchQuery],
    queryFn: () => searchLocations(searchQuery, sessionToken),
    enabled: searchQuery.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  })

  const locationDetails = useQuery({
    queryKey: ["locationDetails", selectedId],
    queryFn: () =>
      selectedId ? retrieveLocation(selectedId, sessionToken) : null,
    enabled: Boolean(selectedId),
  })

  return {
    results: searchResults.data ?? [],
    isSearching: searchResults.isLoading,
    searchError: searchResults.error,
    selectedLocation: locationDetails.data,
    isRetrieving: locationDetails.isLoading,
    isLoading: searchResults.isLoading || locationDetails.isLoading,
    retrieveError: locationDetails.error,
    selectLocation: setSelectedId,
  }
}

export const TripLocationForm = () => {
  const { setCurrentStep, saveTrip, trip } = useTripFormWizard()

  const [inputValue, setInputValue] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const handleSearchDebounced = useRef(
    debounce((input) => setSearchQuery(input), 300),
  ).current
  const isDirty = useRef(false)

  const [showSearch, setShowSearch] = useState(!trip?.location_name)

  const existingCoords = useMemo(() => {
    if (!trip?.location_coordinate) return
    return parsePostGISPoint(trip.location_coordinate)
  }, [trip])

  // actual state variables
  const [locationCoords, setLocationCoords] = useState<
    | {
        latitude: number
        longitude: number
      }
    | undefined
  >(existingCoords)
  const [locationName, setLocationName] = useState<string | undefined>(
    trip?.location_name ?? undefined,
  )

  const [useCustomName, setUseCustomName] = useState(false)

  const {
    results,
    searchError,
    selectedLocation,
    retrieveError,
    isLoading,
    selectLocation,
  } = useLocationSearch(searchQuery)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (searchError) setError(searchError.message)
    else if (retrieveError) setError(retrieveError.message)
  }, [searchError, retrieveError])

  const [viewState, setViewState] = useState({
    longitude: locationCoords?.longitude || 124,
    latitude: locationCoords?.latitude || -28,
    zoom: 4.2,
  })

  // update viewState when locationCoords change
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

  // Handle input changes
  const handleInputChange = useCallback(
    (inputText: string) => {
      isDirty.current = true
      setInputValue(inputText)
      handleSearchDebounced(inputText.trim())
    },
    [handleSearchDebounced],
  )

  // Update map and hide search input when location is retrieved
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
        const newTripDetails: Partial<
          Pick<Trip, "location_coordinate" | "location_name">
        > = useCustomName
          ? { location_name: searchQuery }
          : {
              location_coordinate: locationCoords
                ? `POINT(${locationCoords.longitude} ${locationCoords.latitude})`
                : null,
              location_name: locationName ?? null,
            }
        await saveTrip(newTripDetails)
      }

      setCurrentStep(2)
    } catch (error) {
      setError((error as Error).message)
    }
  }, [
    setCurrentStep,
    useCustomName,
    searchQuery,
    locationCoords,
    locationName,
    saveTrip,
  ])

  const handleSkip = useCallback(() => {
    setCurrentStep(2)
  }, [setCurrentStep])

  return (
    <TripWizardStage
      title="Select Location"
      submitLabel="Next"
      cancelLabel="Back"
      allowSubmit={true}
      isSubmitting={false}
      onSubmit={handleSubmit}
      onSkip={handleSkip}
      onCancel={() => setCurrentStep(0)}
    >
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
              // Only update on user input
              if (action === "input-change") handleInputChange(newValue)
              return newValue
            }}
            value={{ value: selectedLocation?.id }}
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
    </TripWizardStage>
  )
}
