import { useInfiniteQuery } from "@tanstack/react-query"
import {
  Occurrence,
  OccurrencesQueryResponse,
  UseALAOccurrencesResult,
} from "./types"
import { useCallback } from "react"

const BASE_URL = "https://api.ala.org.au/occurrences"

const ITEMS_PER_PAGE = 100 // ALA's default page size

type UseALAOccurrencesOptions = {
  lat?: number
  lng?: number
  radius?: number
  maxResults?: number
}

export const useALAOccurrencesByLocation = ({
  radius = 50,
  maxResults,
  lat,
  lng,
}: UseALAOccurrencesOptions): UseALAOccurrencesResult => {
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
    queryKey: [
      "alaOccurrences",
      "byLocation",
      `${lat}-${lng}`,
      radius,
      maxResults,
    ],
    queryFn: async ({ pageParam = 0 }) => {
      if (!lat || !lng) return null
      const params = new URLSearchParams({
        fq: "kingdom:Plantae",
        lat: lat.toString(),
        lon: lng.toString(),
        radius: (radius ?? 50).toString(),
        start: pageParam.toString(),
        pageSize: ITEMS_PER_PAGE.toString(),
        fl: "scientificName,taxonConceptID,raw_occurrenceRemarks,stateConservation,decimalLatitude,decimalLongitude,year",
      })
      params.append("fq", "country:Australia")

      const response = await fetch(
        `${BASE_URL}/occurrences/search/?${params.toString()}`,
      )

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`)
      }

      const result: OccurrencesQueryResponse = await response.json()
      return result
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
