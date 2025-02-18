import { useInfiniteQuery } from "@tanstack/react-query"
import { useALAAuth } from "./useALAAuth"

const BASE_URL = "https://api.ala.org.au/occurrences"

interface ImageMetadata {
  [key: string]: Record<string, unknown>
}

interface Occurrence {
  uuid: string
  occurrenceID: string
  dataHubUid: string[]
  dataHub: string[]
  institutionUid: string
  raw_institutionCode: string
  institutionName: string
  raw_collectionCode: string
  collectionUid: string
  collectionName: string
  raw_catalogNumber: string
  taxonConceptID: string
  eventDate: string
  eventDateEnd: string
  scientificName: string
  vernacularName: string
  taxonRank: string
  taxonRankID: number
  raw_countryCode: string
  country: string
  kingdom: string
  phylum: string
  classs: string
  order: string
  family: string
  genus: string
  genusGuid: string
  species: string
  speciesGuid: string
  subspecies: string
  subspeciesGuid: string
  stateProvince: string
  decimalLatitude: number
  decimalLongitude: number
  coordinateUncertaintyInMeters: number
  year: number
  month: string
  basisOfRecord: string
  typeStatus: string[]
  raw_locationRemarks: string
  raw_occurrenceRemarks: string
  dataProviderUid: string
  dataProviderName: string
  dataResourceUid: string
  dataResourceName: string
  assertions: string[]
  userAssertions: string
  hasUserAssertions: boolean
  speciesGroups: string[]
  image: string
  images: string[]
  spatiallyValid: boolean
  recordedBy: string[]
  collectors: string[]
  raw_scientificName: string
  raw_basisOfRecord: string
  raw_typeStatus: string
  raw_vernacularName: string
  multimedia: string[]
  license: string
  identificationVerificationStatus: string
  countryConservation: string
  stateConservation: string
  countryInvasive: string
  stateInvasive: string
  sensitive: string
  recordNumber: string
  references: string
  rights: string
  gridReference: string
  imageMetadata: ImageMetadata[]
  imageUrl: string
  largeImageUrl: string
  smallImageUrl: string
  thumbnailUrl: string
  imageUrls: string[]
  occurrenceYear: string
}

interface FacetResult {
  label: string
  i18nCode: string
  count: number
  fq: string
}

interface FacetField {
  fieldName: string
  fieldResult: FacetResult[]
  count: number
}

interface ActiveFacet {
  name: string
  displayName: string
  value: string
}

interface QueryResponse {
  pageSize: number
  startIndex: number
  totalRecords: number
  sort: string
  dir: string
  status: string
  errorMessage: string
  occurrences: Occurrence[]
  facetResults: FacetField[]
  query: string
  urlParameters: string
  queryTitle: string
  activeFacetMap: {
    [key: string]: ActiveFacet
  }
  activeFacetObj: {
    [key: string]: ActiveFacet[]
  }
}

interface UseALAOccurrencesResult {
  occurrences: Occurrence[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}

const ITEMS_PER_PAGE = 50 // ALA's default page size

export const useALAOccurrences = (
  guid?: string | null,
): UseALAOccurrencesResult => {
  const { data: authData } = useALAAuth()
  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["alaOccurrences", guid],
    queryFn: async ({ pageParam = 0 }) => {
      if (!guid || !authData) return null
      const encodedGuid = encodeURIComponent(guid)
      const response = await fetch(
        `${BASE_URL}/taxon/${encodedGuid}?start=${pageParam}&pageSize=${ITEMS_PER_PAGE}`,
        {
          headers: {
            Authorization: `Bearer ${authData.access_token}`,
          },
        },
      )

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`)
      }

      return response.json() as Promise<QueryResponse>
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage) return undefined
      const nextStartIndex = lastPage.startIndex + lastPage.pageSize
      return nextStartIndex < lastPage.totalRecords ? nextStartIndex : undefined
    },
    initialPageParam: 0,
    enabled: Boolean(guid) && Boolean(authData),
  })

  // Combine all occurrences from all fetched pages
  const occurrences =
    data?.pages.reduce<Occurrence[]>(
      (acc, page) => [...acc, ...(page ? page.occurrences : [])],
      [],
    ) ?? []

  return {
    occurrences,
    isLoading,
    isError,
    error: error as Error | null,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  }
}
