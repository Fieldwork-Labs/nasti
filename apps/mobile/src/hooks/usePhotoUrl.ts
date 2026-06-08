import { getImage } from "@/lib/persistFiles"
import { useQuery } from "@tanstack/react-query"

export const usePhotoUrl = ({ photoId }: { photoId?: string }) => {
  return useQuery({
    queryKey: ["photo", "url", photoId],
    queryFn: async () => {
      if (!photoId) return null

      try {
        const imageRecord = await getImage(photoId)

        if (!imageRecord) {
          return null
        }

        return imageRecord.image
      } catch (error) {
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
