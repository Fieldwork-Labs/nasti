import { supabase } from "@nasti/common/supabase"
import { useQuery } from "@tanstack/react-query"
import { getImage, putImage } from "@/lib/persistFiles"
import { SpeciesPhoto } from "@nasti/common"

export type TripSpeciesPhotos = SpeciesPhoto[]

const imageUrlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader()
      reader.onload = function () {
        resolve(this.result as string)
      }
      reader.readAsDataURL(blob)
    } catch (e) {
      reject(e)
    }
  })
}

export const getSpeciesPhotosByTripQueryKey = (tripId?: string) =>
  tripId ? ["speciesPhotos", "byTrip", tripId] : []

export const useSpeciesPhotosForTrip = ({ tripId }: { tripId?: string }) => {
  const speciesPhotosQuery = useQuery({
    queryKey: getSpeciesPhotosByTripQueryKey(tripId),
    enabled: Boolean(tripId),
    refetchOnMount: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      if (!tripId) return []

      console.log("[useSpeciesPhotosForTrip] Starting sync for trip:", tripId)

      // Get all species for this trip
      const { data: tripSpecies, error: tripSpeciesError } = await supabase
        .from("trip_species")
        .select("species_id")
        .eq("trip_id", tripId)

      if (tripSpeciesError) throw new Error(tripSpeciesError.message)

      if (!tripSpecies || tripSpecies.length === 0) {
        console.log("[useSpeciesPhotosForTrip] No species found for trip")
        return []
      }

      const speciesIds = tripSpecies.map((ts) => ts.species_id)

      // Get all species photos for these species
      const { data: speciesPhotos, error: speciesPhotosError } = await supabase
        .from("species_photo")
        .select("*")
        .in("species_id", speciesIds)
        .order("display_order", { ascending: true })
        .overrideTypes<TripSpeciesPhotos>()

      if (speciesPhotosError) throw new Error(speciesPhotosError.message)

      if (!speciesPhotos || speciesPhotos.length === 0) {
        console.log("[useSpeciesPhotosForTrip] No species photos found")
        return []
      }

      console.log(
        "[useSpeciesPhotosForTrip] Found species photos:",
        speciesPhotos.length,
      )

      // Get photos that we need to fetch
      type MissingPhotos = { id: string; url: string }
      const missingPhotos = (
        await Promise.all(
          speciesPhotos.map(({ id, url }) =>
            getImage(id).then((file) => (Boolean(file) ? null : { id, url })),
          ),
        )
      ).filter(Boolean) as MissingPhotos[]

      console.log(
        "[useSpeciesPhotosForTrip] Missing photos to download:",
        missingPhotos.length,
      )

      // Request to supabase storage for an empty array throws an error
      if (missingPhotos && missingPhotos.length > 0) {
        const { data, error } = await supabase.storage
          .from("species-profile-photos")
          .createSignedUrls(
            missingPhotos.map(({ url }) => url),
            60 * 10,
          )

        if (error) {
          console.error(
            "[useSpeciesPhotosForTrip] Error getting signed URLs:",
            error,
          )
        } else {
          console.log(
            "[useSpeciesPhotosForTrip] Got signed URLs, downloading:",
            data?.length,
          )

          await Promise.all(
            data
              ?.filter((d) => d.signedUrl)
              .map(async ({ signedUrl }, i) => {
                try {
                  const base64 = await imageUrlToBase64(signedUrl)
                  await putImage(missingPhotos[i].id, base64)
                  console.log(
                    "[useSpeciesPhotosForTrip] Stored image:",
                    missingPhotos[i].id,
                  )
                } catch (err) {
                  console.error(
                    "[useSpeciesPhotosForTrip] Error storing image:",
                    missingPhotos[i].id,
                    err,
                  )
                }
              }) ?? [],
          )
        }
      }

      console.log(
        "[useSpeciesPhotosForTrip] Sync complete, returning photos:",
        speciesPhotos.length,
      )
      const result = speciesPhotos ?? []
      return result
    },
    refetchInterval: 1000 * 60 * 60, // every 1 hour
  })

  return speciesPhotosQuery
}
