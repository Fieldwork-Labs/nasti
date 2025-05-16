import { queryClient } from "../utils"
import { useQuery } from "@tanstack/react-query"

import { useCallback } from "react"

const BASE_URL = "https://api.ala.org.au/species/search/auto"
export interface AlaSpeciesSearchResult {
  commonName: string | null
  commonNameMatches: string[]
  georeferencedCount: number
  guid: string
  matchedNames: string[]
  name: string
  occurrenceCount: number
  rankID: number
  rankString: string
  scientificNameMatches: string[]
}

interface SearchResponse {
  autoCompleteList: AlaSpeciesSearchResult[]
}

interface SearchOptions {
  limit?: number
}

interface QueryOptions extends SearchOptions {
  enabled?: boolean
  staleTime?: number
  cacheTime?: number
  retry?: boolean | number
  retryDelay?: number
}

/**
 * Fetches plant species data from the Atlas of Living Australia API
 * @param searchTerm - The search term to query for
 * @param options - Additional options for the search
 * @returns Promise with the API response
 */
const fetchSpecies = async (
  searchTerm: string,
  options: SearchOptions = {},
): Promise<AlaSpeciesSearchResult[]> => {
  const { limit = 10 } = options

  const params = new URLSearchParams({
    q: searchTerm,
    idxType: "TAXON",
    kingdom: "plantae",
    limit: limit.toString(),
    sort: "name",
  })

  const response = await fetch(`${BASE_URL}?${params}`)

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }

  const data: SearchResponse = await response.json()

  const uniqueResults = data.autoCompleteList
    .filter((result, index, self) => {
      // returned data can contain duplicates, so we need to deduplicate
      return (
        index === self.findIndex((t) => t.guid === result.guid) &&
        // we should not include family or genus taxa in the search results
        result.rankString !== "family" &&
        result.rankString !== "genus"
      )
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  return uniqueResults
}

/**
 * Custom hook for searching plant species using the ALA API
 * @param searchTerm - The search term to query for
 * @param options - Additional options for the search and query configuration
 * @returns React Query result object
 */
export const useALASpeciesSearch = (
  searchTerm: string,
  options: QueryOptions = {},
) => {
  const {
    // Search options
    limit,

    // React Query options
    enabled = true,
    staleTime = 1000 * 60 * 60, // 60 minutes
    retry = 2,
    retryDelay = 1000,
    ...queryOptions
  } = options

  const queryResults = useQuery({
    queryKey: ["speciesSearch", searchTerm, limit],
    queryFn: () => fetchSpecies(searchTerm, { limit }),
    enabled: enabled && Boolean(searchTerm),
    staleTime,
    retry,
    retryDelay,
    placeholderData: (prev) => prev,
    ...queryOptions,
  })

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["speciesSearch", searchTerm, limit],
    })
  }, [searchTerm, limit])

  return {
    ...queryResults,
    invalidate,
  }
}
