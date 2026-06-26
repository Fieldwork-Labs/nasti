import {
  CollectionWithCoord,
  ScoutingNoteWithCoord,
} from "@nasti/common/types"

import {
  TripCollectionPhotos,
  TripScoutingNotePhotos,
} from "@/hooks/usePhotosForTrip"
import {
  TripCollectionAudio,
  TripScoutingNoteAudio,
} from "@/hooks/useAudiosForTrip"

export type CollectionWithCoordAndPhotos = CollectionWithCoord & {
  photos: TripCollectionPhotos
  audios: TripCollectionAudio
}

export type ScoutingNoteWithCoordAndPhotos = ScoutingNoteWithCoord & {
  photos: TripScoutingNotePhotos
  audios: TripScoutingNoteAudio
}
