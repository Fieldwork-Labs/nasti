import { getImage } from "@/lib/persistFiles"
import { useQuery } from "@tanstack/react-query"

export const usePhotoUrl = ({
  photoId,
  fallback,
}: {
  photoId?: string
  fallback?: string | null
}) => {
  return useQuery({
    queryKey: ["photo", "url", photoId],
    queryFn: async () => {
      if (!photoId) return fallback ?? null

      try {
        const imageRecord = await getImage(photoId)

        if (!imageRecord) {
          if (!fallback) throw new Error("Not found")
          return fallback
        }

        return imageRecord.image
      } catch (error) {
        if (fallback) return fallback
        throw error
      }
    },
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000 * 60, // 1 hour
    retry: 2,
    retryDelay: 1000,
    meta: {
      persisted: false,
    },
  })
}
