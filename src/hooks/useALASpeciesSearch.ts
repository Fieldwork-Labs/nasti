import { queryClient } from "@/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { useDebounce } from "@uidotdev/usehooks"
import { useCallback } from "react"

const BASE_URL = "https://api.ala.org.au/species/search/auto"
export interface SearchResult {
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
  autoCompleteList: SearchResult[]
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
): Promise<SearchResult[]> => {
  const { limit = 10 } = options

  const params = new URLSearchParams({
    q: searchTerm,
    idxType: "TAXON",
    kingdom: "plantae",
    limit: limit.toString(),
  })

  const response = await fetch(`${BASE_URL}?${params}`)

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }

  const data: SearchResponse = await response.json()

  // returned data can contain duplicates, so we need to deduplicate
  const uniqueResults = data.autoCompleteList.filter(
    (result, index, self) =>
      index === self.findIndex((t) => t.guid === result.guid),
  )
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

  const debouncedSearch = useDebounce(searchTerm, 300)

  const queryResults = useQuery({
    queryKey: ["speciesSearch", debouncedSearch, limit],
    queryFn: () => fetchSpecies(debouncedSearch, { limit }),
    enabled: enabled && Boolean(debouncedSearch),
    staleTime,
    retry,
    retryDelay,
    ...queryOptions,
  })

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["speciesSearch", debouncedSearch, limit],
    })
  }, [debouncedSearch, limit])

  return {
    ...queryResults,
    invalidate,
  }
}
