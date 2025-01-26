import { useQuery } from "@tanstack/react-query"

const BASE_URL = "https://images.ala.org.au/image"

interface QueryOptions {
  enabled?: boolean
  staleTime?: number
  cacheTime?: number
  retry?: boolean | number
  retryDelay?: number
}

/**
 * Fetches imaages from the Atlas of Living Australia API
 * @param id - The image id
 * @param thumbnail - Whether to return a thumbnail or full size image
 * @returns Promise with the image data
 */
const getSpeciesImageUrl = async ({
  id,
  thumbnail,
}: {
  id: string
  thumbnail?: boolean
}): Promise<string | null> => {
  // URL encode the id as it contains special characters
  const encodedGuid = encodeURIComponent(id)
  const alaUrl = `${BASE_URL}/${encodedGuid}${thumbnail ? "/thumbnail" : "original"}`
  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ala_image_proxy?url=${encodeURIComponent(alaUrl)}`
  return proxyUrl
}

/**
 * Custom hook for fetching detailed species information using the ALA API
 * @param id - The image id
 * @param thumbnail - Whether to return a thumbnail or full size image
 * @param options - Query configuration options
 * @returns React Query result object
 */
export const useALAImage = (
  id?: string | null,
  thumbnail: boolean = false,
  options: QueryOptions = {},
) => {
  const { enabled = true, ...queryOptions } = options

  return useQuery({
    queryKey: ["speciesImage", id, thumbnail],
    queryFn: () => (id ? getSpeciesImageUrl({ id, thumbnail }) : null),
    enabled: enabled && Boolean(id),
    ...queryOptions,
  })
}
