import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useMapboxSession } from "@/hooks/useMapboxSessionToken"

// Types
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

// API Functions
async function searchLocations(
  query: string,
  sessionToken: string,
): Promise<LocationResult[]> {
  if (!query) return []

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
    },
  }
}

// Hook
export function useLocationSearch(searchQuery: string) {
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
