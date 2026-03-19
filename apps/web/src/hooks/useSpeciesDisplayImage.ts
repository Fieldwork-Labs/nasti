import { useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { useALAImage } from "@nasti/common/hooks/useALAImage"
import { useALASpeciesDetail } from "@nasti/common/hooks/useALASpeciesDetail"

/**
 * Hook to get the display image for a species
 * Priority: Profile photo (first by display_order) -> ALA image -> null
 */
export const useSpeciesDisplayImage = (
  speciesId?: string | null,
  alaGuid?: string | null,
  format: "thumbnail" | "original" = "thumbnail",
) => {
  // Fetch first profile photo
  const { data: profilePhoto, isLoading: profileLoading } = useQuery({
    queryKey: ["speciesPhotos", "first", speciesId],
    queryFn: async () => {
      if (!speciesId) return null

      const { data, error } = await supabase
        .from("species_photo")
        .select("url")
        .eq("species_id", speciesId)
        .order("display_order", { ascending: true })
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error || !data) return null

      // Get signed URL
      const { data: signedUrlData } = await supabase.storage
        .from("species-profile-photos")
        .createSignedUrl(data.url, 60 * 60) // 1 hour

      return signedUrlData?.signedUrl || null
    },
    enabled: Boolean(speciesId),
    // Refetch before URL expires
    refetchInterval: 60 * 59 * 1000, // 59 minutes
  })

  // Fallback to ALA image
  const { data: alaData } = useALASpeciesDetail(alaGuid)
  const { data: alaImage, isLoading: alaLoading } = useALAImage(
    alaData?.imageIdentifier,
    format,
  )

  // Return profile photo if available, otherwise ALA image
  const image = profilePhoto || alaImage
  const isLoading = profileLoading || (alaLoading && !profilePhoto)

  return {
    image,
    isLoading,
    isProfilePhoto: Boolean(profilePhoto),
    isALAImage: Boolean(alaImage && !profilePhoto),
  }
}
