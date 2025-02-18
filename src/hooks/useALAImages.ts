import { useQueries, useQuery } from "@tanstack/react-query"
import { getALAImageQuery, type ImageFormat } from "./useALAImage"

interface QueryOptions {
  enabled?: boolean
  staleTime?: number
  cacheTime?: number
  retry?: boolean | number
  retryDelay?: number
}

type ImageQueryResponse = string[]
const OCCURRENCES_BASE_URL = "https://api.ala.org.au/occurrences/images/taxon"
const getSpeciesImages = async (guid: string) => {
  const encodedGuid = encodeURIComponent(guid)
  const response = await fetch(`${OCCURRENCES_BASE_URL}/${encodedGuid}`)
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<ImageQueryResponse>
}

/**
 * Custom hook for fetching detailed species information using the ALA API
 * @param guid - The taxon guid
 * @param thumbnails - Whether to returns thumbnails or full size image
 * @param options - Query configuration options
 * @returns React Query result object
 */
export const useALAImages = (
  guid?: string | null,
  format?: ImageFormat,
  options: QueryOptions = {},
) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["speciesImages", guid],
    queryFn: () => (guid ? getSpeciesImages(guid) : []),
    enabled: Boolean(guid),
  })

  const imageUrls = useQueries({
    queries: (data ?? [])
      .filter((imageId) => imageId !== "Not supplied")
      .map((imageId) => getALAImageQuery(imageId, format, options)),
  })
  const images = imageUrls.map((url) => url.data).filter(Boolean) as string[]

  return { data: images, isLoading, isError, error }
}
