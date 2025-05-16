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

export interface FacetResult {
  label: string
  i18nCode: string
  count: number
  fq: string
}

export interface FacetField {
  fieldName: string
  fieldResult: FacetResult[]
  count: number
}

export interface ActiveFacet {
  name: string
  displayName: string
  value: string
}

export interface OccurrencesQueryResponse {
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

export interface UseALAOccurrencesResult {
  occurrences: Occurrence[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  hasNextPage: boolean
  isFetching: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
  fetchAll: () => void
}
