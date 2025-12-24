import {
  CollectionWithCoord,
  ScoutingNoteWithCoord,
  Trip,
} from "@nasti/common/types"

import { TripCollectionPhotos } from "@/hooks/useCollectionPhotosForTrip"

export type CollectionWithCoordAndPhotos = CollectionWithCoord & {
  photos: TripCollectionPhotos
}

export type ScoutingNoteWithCoordAndPhotos = ScoutingNoteWithCoord & {
  photos: TripCollectionPhotos
}

export type TripDetails = Trip & {
  collections: Array<CollectionWithCoordAndPhotos>
  scoutingNotes: Array<ScoutingNoteWithCoordAndPhotos>
  species:
    | {
        id: string
        species_id: string
        trip_id: string
      }[]
    | null
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
