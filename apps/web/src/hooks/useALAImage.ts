import { useQuery } from "@tanstack/react-query"

const BASE_URL = "https://images.ala.org.au/image"

interface QueryOptions {
  enabled?: boolean
  staleTime?: number
  cacheTime?: number
  retry?: boolean | number
  retryDelay?: number
}

export type ImageFormat = "original" | "thumbnail" | undefined
/**
 * Fetches imaages from the Atlas of Living Australia API
 * @param id - The image id
 * @param thumbnail - Whether to return a thumbnail or full size image
 * @returns Promise with the image data
 */
const getSpeciesImageUrl = async ({
  id,
  format,
}: {
  id: string
  format?: ImageFormat
}): Promise<string | null> => {
  // URL encode the id as it contains special characters
  const alaUrl = `${BASE_URL}/${id}${format ? `/${format}` : ""}`
  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ala_image_proxy?url=${encodeURIComponent(alaUrl)}`
  return proxyUrl
}

export const getALAImageQuery = (
  id: string | null | undefined,
  format: ImageFormat,
  options: QueryOptions = {},
) => {
  const { enabled = true, ...queryOptions } = options

  return {
    queryKey: ["speciesImage", id, format],
    queryFn: () => (id ? getSpeciesImageUrl({ id, format }) : null),
    enabled: enabled && Boolean(id),
    ...queryOptions,
  }
}

/**
 * Custom hook for fetching detailed species information using the ALA API
 * @param id - The image id
 * @param format - Whether to return a thumbnail or full size image - options "original" or "thumbnail"
 * @param options - Query configuration options
 * @returns React Query result object
 */
export const useALAImage = (
  id?: string | null,
  format?: ImageFormat,
  options: QueryOptions = {},
) => {
  return useQuery(getALAImageQuery(id, format, options))
}
