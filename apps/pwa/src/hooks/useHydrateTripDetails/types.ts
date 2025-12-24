import {
  CollectionWithCoord,
  ScoutingNoteWithCoord,
  Trip,
} from "@nasti/common/types"

import {
  TripCollectionPhotos,
  TripScoutingNotePhotos,
} from "@/hooks/usePhotosForTrip"

export type CollectionWithCoordAndPhotos = CollectionWithCoord & {
  photos: TripCollectionPhotos
}

export type ScoutingNoteWithCoordAndPhotos = ScoutingNoteWithCoord & {
  photos: TripScoutingNotePhotos
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
