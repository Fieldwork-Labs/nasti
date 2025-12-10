import {
  InfiniteData,
  UndefinedInitialDataInfiniteOptions,
  useInfiniteQuery,
} from "@tanstack/react-query"
import {
  Occurrence,
  OccurrencesQueryResponse,
  UseALAOccurrencesResult,
} from "./types"
import { useCallback, useMemo } from "react"

const BASE_URL = "https://api.ala.org.au/occurrences"

const ITEMS_PER_PAGE = 100 // ALA's default page size

type UseALAOccurrencesOptions = {
  lat?: number
  lng?: number
  radius?: number
  maxResults?: number
  pageSize?: number
} & Partial<
  UndefinedInitialDataInfiniteOptions<
    OccurrencesQueryResponse | null,
    Error,
    InfiniteData<OccurrencesQueryResponse | null, unknown>,
    readonly unknown[],
    number
  >
>

export const useALAOccurrencesByLocation = ({
  radius = 50,
  maxResults = 5000, // the max allowed by ALA, greater than this causes buggy behaviour
  pageSize = ITEMS_PER_PAGE,
  lat,
  lng,
  ...options
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
    ...options,
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
        pageSize: pageSize.toString(),
        fl: "scientificName,taxonConceptID,raw_occurrenceRemarks,stateConservation,decimalLatitude,decimalLongitude,year",
      })
      params.append("fq", "country:Australia")
      params.append("fq", `taxonRank:"species" OR taxonRank:"subspecies"`)

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
      if (prevPage.occurrences.length === 0) {
        return undefined
      }

      const nextStartIndex = prevPage.startIndex + prevPage.pageSize
      if (maxResults) {
        const endIndex = Math.min(prevPage.totalRecords, maxResults)
        return nextStartIndex < endIndex ? nextStartIndex : undefined
      }
      return nextStartIndex < prevPage.totalRecords ? nextStartIndex : undefined
    },
    initialPageParam: 0,
    refetchOnMount: false,
  })

  // Combine all occurrences from all fetched pages
  const occurrences = useMemo(
    () =>
      data?.pages.reduce<Occurrence[]>(
        (acc, page) => [...acc, ...(page ? page.occurrences : [])],
        [],
      ) ?? [],
    [data],
  )

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
