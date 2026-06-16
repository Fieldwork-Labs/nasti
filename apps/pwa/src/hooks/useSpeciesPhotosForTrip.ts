import { supabase } from "@nasti/common/supabase"
import { useQuery } from "@powersync/tanstack-react-query"
import { getImage, putImage } from "@/lib/persistFiles"
import { SpeciesPhoto } from "@nasti/common"
import { useEffect } from "react"
import type { PowerSyncSpeciesPhotoRow } from "@/lib/powersync/schema"

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
  const speciesPhotosQuery = useQuery<PowerSyncSpeciesPhotoRow>({
    queryKey: getSpeciesPhotosByTripQueryKey(tripId),
    query: `
      SELECT sp.* FROM species_photo sp
      INNER JOIN trip_species ts ON ts.species_id = sp.species_id
      WHERE ts.trip_id = ?
      ORDER BY sp.display_order ASC
    `,
    parameters: [tripId ?? ""],
    enabled: Boolean(tripId),
  })

  const speciesPhotos = (speciesPhotosQuery.data ?? []) as TripSpeciesPhotos

  useEffect(() => {
    let cancelled = false

    async function cacheMissingPhotos() {
      type MissingPhotos = { id: string; url: string }
      const missingPhotos = (
        await Promise.all(
          speciesPhotos.map(({ id, url }) =>
            getImage(id).then((file) => (Boolean(file) ? null : { id, url })),
          ),
        )
      ).filter(Boolean) as MissingPhotos[]

      if (cancelled || missingPhotos.length === 0) return

      const { data, error } = await supabase.storage
        .from("species-profile-photos")
        .createSignedUrls(
          missingPhotos.map(({ url }) => url),
          60 * 10,
        )

      if (error) {
        console.error("[useSpeciesPhotosForTrip] Error getting signed URLs:", error)
        return
      }

      await Promise.all(
        data
          ?.filter((item) => item.signedUrl)
          .map(async ({ signedUrl }, index) => {
            const base64 = await imageUrlToBase64(signedUrl)
            await putImage(missingPhotos[index].id, base64)
          }) ?? [],
      )
    }

    cacheMissingPhotos()

    return () => {
      cancelled = true
    }
  }, [speciesPhotos])

  return { ...speciesPhotosQuery, data: speciesPhotos }
}
