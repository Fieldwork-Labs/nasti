import { useInfiniteQuery } from "@tanstack/react-query"
import {
  Occurrence,
  OccurrencesQueryResponse,
  UseALAOccurrencesResult,
} from "./types"
import { useCallback } from "react"

const BASE_URL = "https://api.ala.org.au/occurrences"

const ITEMS_PER_PAGE = 100 // ALA's default page size

export const useALASpeciesOccurrences = (
  guid?: string | null,
  maxResults?: number,
): UseALAOccurrencesResult => {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["alaOccurrences", "bySpecies", guid, maxResults],
    queryFn: async ({ pageParam = 0 }) => {
      if (!guid) return null
      const params = new URLSearchParams({
        q: `taxonConceptID:${guid}`,
        fq: `decimalLatitude:[* TO *]`, // Only return records with coordinates
        start: pageParam.toString(),
        pageSize: ITEMS_PER_PAGE.toString(),
      })
      params.append("fq", "country:Australia")

      const response = await fetch(
        `${BASE_URL}/occurrences/search/?${params.toString()}`,
      )

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`)
      }

      const result: OccurrencesQueryResponse = await response.json()
      return {
        ...result,
        // ala returns some records with no coordinates
        occurrences: result.occurrences.filter(
          (occ) => occ.decimalLatitude && occ.decimalLongitude,
        ),
      }
    },
    getNextPageParam: (prevPage) => {
      if (!prevPage) return undefined

      const nextStartIndex = prevPage.startIndex + prevPage.pageSize
      if (maxResults) {
        const endIndex = Math.min(prevPage.totalRecords, maxResults)
        return nextStartIndex < endIndex ? nextStartIndex : null
      }
      return nextStartIndex < prevPage.totalRecords ? nextStartIndex : undefined
    },
    initialPageParam: 0,
    enabled: Boolean(guid),
    refetchOnMount: false,
  })

  // Combine all occurrences from all fetched pages
  const occurrences =
    data?.pages.reduce<Occurrence[]>(
      (acc, page) => [...acc, ...(page ? page.occurrences : [])],
      [],
    ) ?? []

  const fetchAll = useCallback(async () => {
    // keep fetching em
    if (hasNextPage && !isFetching) await fetchNextPage()
  }, [hasNextPage, isFetching, fetchNextPage])

  return {
    occurrences,
    isLoading,
    isFetching,
    isError,
    error: error as Error | null,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    fetchAll,
  }
}
