import { CollectionAudio, ScoutingNoteAudio } from "@nasti/common/types"

import { useQuery } from "@/lib/powersync/query"
import type {
  PowerSyncCollectionAudioRow,
  PowerSyncScoutingNoteAudioRow,
} from "@/lib/powersync/schema"

export type TripCollectionAudio = Array<CollectionAudio>
export type TripScoutingNoteAudio = Array<ScoutingNoteAudio>

type EntityType = "collection" | "scoutingNote"
export const getAudiosByTripQueryKey = (
  entityType: EntityType,
  tripId?: string,
) => (tripId ? ["audio", entityType, "byTrip", tripId] : [])

/**
 * Audio rows for a trip — METADATA ONLY.
 *
 * Deliberately does NOT pre-fetch or cache any blobs (contrast with
 * `usePhotosForTrip`, which eagerly downloads every missing photo). Audio files
 * are large, so streaming happens lazily per-recording in `useAudioUrl`.
 */
export const useAudiosForTrip = ({
  tripId,
  entityType,
  enabled = true,
}: {
  entityType: EntityType
  tripId?: string
  enabled?: boolean
}) => {
  type AudioRow = PowerSyncCollectionAudioRow | PowerSyncScoutingNoteAudioRow
  const query =
    entityType === "collection"
      ? `SELECT ca.* FROM collection_audio ca
         INNER JOIN collection c ON c.id = ca.collection_id
         WHERE c.trip_id = ?
         ORDER BY ca.collection_id DESC, ca.uploaded_at DESC`
      : `SELECT sna.* FROM scouting_notes_audio sna
         INNER JOIN scouting_notes sn ON sn.id = sna.scouting_notes_id
         WHERE sn.trip_id = ?
         ORDER BY sna.scouting_notes_id DESC, sna.uploaded_at DESC`

  const audiosQuery = useQuery<AudioRow>({
    queryKey: getAudiosByTripQueryKey(entityType, tripId),
    query,
    parameters: [tripId ?? ""],
    enabled: Boolean(tripId) && enabled,
  })

  return {
    ...audiosQuery,
    data: audiosQuery.data as
      | TripCollectionAudio
      | TripScoutingNoteAudio
      | undefined,
  }
}
