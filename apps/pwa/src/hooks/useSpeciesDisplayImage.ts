import { useMemo } from "react"
import { getImage } from "@/lib/persistFiles"
import { useQuery } from "@tanstack/react-query"

type SpeciesPhotosMap = Record<
  string,
  Array<{
    id: string
    species_id: string
    url: string
    caption: string | null
    source_type: string
    source_reference: string | null
    display_order: number
    uploaded_at: string | null
    organisation_id: string
  }>
>

/**
 * PWA hook to get the display image for a species from IndexedDB
 * Uses the first profile photo by display_order
 */
export const useSpeciesDisplayImage = (
  speciesId?: string,
  speciesPhotosMap?: SpeciesPhotosMap,
) => {
  const firstPhoto = useMemo(() => {
    if (!speciesId || !speciesPhotosMap) return null
    const photos = speciesPhotosMap[speciesId]
    if (!photos || photos.length === 0) return null
    // Photos are already sorted by display_order in the query
    return photos[0]
  }, [speciesId, speciesPhotosMap])

  const { data: imageBase64, isLoading } = useQuery({
    queryKey: ["speciesPhoto", "image", firstPhoto?.id],
    queryFn: async () => {
      if (!firstPhoto) return null
      // Get image from IndexedDB
      const image = await getImage(firstPhoto.id)
      return image
    },
    enabled: Boolean(firstPhoto),
    staleTime: Infinity, // Images don't change once cached
  })

  return {
    image: imageBase64,
    isLoading,
    hasProfilePhoto: Boolean(firstPhoto),
  }
}
