import {
  CollectionWithCoord,
  ScoutingNoteWithCoord,
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
