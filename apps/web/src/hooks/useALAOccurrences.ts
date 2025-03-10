import { useInfiniteQuery } from "@tanstack/react-query"

const BASE_URL = "https://api.ala.org.au/occurrences"

interface ImageMetadata {
  [key: string]: Record<string, unknown>
}

export interface Occurrence {
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
  isFetching: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}

const ITEMS_PER_PAGE = 100 // ALA's default page size

export const useALAOccurrences = (
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
    queryKey: ["alaOccurrences", guid, maxResults],
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

      const result: QueryResponse = await response.json()
      return {
        ...result,
        // ala returns some records with no coordinates
        occurrences: result.occurrences.filter(
          (occ) => occ.decimalLatitude && occ.decimalLongitude,
        ),
      }
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage) return undefined
      const nextStartIndex = lastPage.startIndex + lastPage.pageSize
      return nextStartIndex < (maxResults ? maxResults : lastPage.totalRecords)
        ? nextStartIndex
        : undefined
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

  return {
    occurrences,
    isLoading,
    isFetching,
    isError,
    error: error as Error | null,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  }
}
