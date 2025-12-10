import { useQuery } from "@tanstack/react-query"

const BASE_URL = "https://api.ala.org.au/species/species"

interface TaxonConcept {
  guid: string
  parentGuid: string
  nameString: string
  nameComplete: string
  nameFormatted: string
  author: string
  nomenclaturalCode: string
  taxonomicStatus: string
  nomenclaturalStatus: string | null
  rankString: string
  nameAuthority: string
  rankID: number
  nameAccordingTo: string
  nameAccordingToID: string
  namePublishedIn: string
  namePublishedInYear: string
  namePublishedInID: string | null
  taxonRemarks: string | null
  provenance: string | null
  favourite: boolean | null
  infoSourceURL: string
  datasetURL: string | null
  taxonConceptID: string
  scientificNameID: string
}

interface Classification {
  kingdom: string
  kingdomGuid: string
  phylum: string
  phylumGuid: string
  class: string
  classGuid: string
  subclass: string
  subclassGuid: string
  superorder: string
  superorderGuid: string
  order: string
  orderGuid: string
  family: string
  familyGuid: string
  genus: string
  genusGuid: string
  species: string
  speciesGuid: string
  scientificName: string
  guid: string
}

interface Synonym {
  nameString: string
  nameComplete: string
  nameFormatted: string
  nameGuid: string
  nomenclaturalCode: string
  taxonomicStatus: string
  nomenclaturalStatus: string | null
  nameAccordingTo: string
  nameAccordingToID: string
  namePublishedIn: string
  namePublishedInYear: string
  namePublishedInID: string | null
  nameAuthority: string
  taxonRemarks: string | null
  provenance: string | null
  infoSourceURL: string
  datasetURL: string | null
}

interface CommonName {
  nameString: string
  status: string
  priority: number
  language: string
  temporal: string | null
  locationID: string
  locality: string
  countryCode: string
  sex: string | null
  lifeStage: string | null
  isPlural: boolean | null
  organismPart: string | null
  taxonRemarks: string | null
  provenance: string | null
  labels: string | null
  infoSourceName: string
  infoSourceURL: string
  datasetURL: string
}

interface Identifier {
  identifier: string
  nameString: string
  status: string
  subject: string | null
  format: string | null
  provenance: string | null
  infoSourceName: string
  infoSourceURL: string | null
  datasetURL: string | null
}

interface Variant {
  nameString: string
  nameComplete: string
  nameFormatted: string
  identifier: string
  nomenclaturalCode: string
  taxonomicStatus: string
  nomenclaturalStatus: string | null
  nameAccordingTo: string
  nameAccordingToID: string
  namePublishedIn: string
  namePublishedInYear: string
  namePublishedInID: string | null
  nameAuthority: string
  taxonRemarks: string | null
  provenance: string | null
  infoSourceName: string
  infoSourceURL: string
  datasetURL: string | null
  priority: number
}

export interface SpeciesDetail {
  taxonConcept: TaxonConcept
  taxonName: unknown[]
  classification: Classification
  synonyms: Synonym[]
  commonNames?: CommonName[]
  imageIdentifier: string | null
  wikiUrl: string | null
  conservationStatuses: Record<string, unknown>
  extantStatuses: unknown[]
  habitats: unknown[]
  categories: unknown[]
  simpleProperties: unknown[]
  images: unknown[]
  identifiers: Identifier[]
  variants: Variant[]
  linkIdentifier: string
}

interface QueryOptions {
  enabled?: boolean
  staleTime?: number
  cacheTime?: number
  retry?: boolean | number
  retryDelay?: number
}

/**
 * Fetches detailed species information from the Atlas of Living Australia API
 * @param guid - The species GUID from the search results
 * @returns Promise with the species details
 */
const fetchSpeciesDetail = async (guid: string): Promise<SpeciesDetail> => {
  // URL encode the GUID as it contains special characters
  const encodedGuid = encodeURIComponent(guid)
  const response = await fetch(`${BASE_URL}/${encodedGuid}`)

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Custom hook for fetching detailed species information using the ALA API
 * @param guid - The species GUID from the search results
 * @param options - Query configuration options
 * @returns React Query result object
 */
export const useALASpeciesDetail = (
  guid?: string | null,
  options: QueryOptions = {},
) => {
  const {
    enabled = true,
    staleTime = 1000 * 60 * 60, // 60 minutes
    retry = 2,
    retryDelay = 1000,
    ...queryOptions
  } = options

  return useQuery({
    queryKey: ["alaSpeciesDetail", guid],
    queryFn: () => (guid ? fetchSpeciesDetail(guid) : null),
    enabled: enabled && Boolean(guid),
    staleTime,
    retry,
    retryDelay,
    ...queryOptions,
  })
}
