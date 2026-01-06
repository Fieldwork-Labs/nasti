import { CollectionWithCoord, Trip } from "@nasti/common/types"

import { TripCollectionPhotos } from "@/hooks/useCollectionPhotosForTrip"

export type CollectionWithCoordAndPhotos = CollectionWithCoord & {
  photos: TripCollectionPhotos
}

export type TripDetails = Trip & {
  collections: Array<CollectionWithCoordAndPhotos>
  members:
    | {
        id: string
        joined_at: string | null
        role: string | null
        trip_id: string
        user_id: string
      }[]
    | null
}
