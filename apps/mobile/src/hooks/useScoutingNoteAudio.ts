import { ScoutingNoteAudio } from "@nasti/common/types"

import { useQuery } from "@/lib/powersync/query"
import type { PowerSyncScoutingNoteAudioRow } from "@/lib/powersync/schema"

export const getScoutingNoteAudioQueryKey = (scoutingNoteId?: string) =>
  scoutingNoteId
    ? ["audio", "scoutingNote", "byScoutingNote", scoutingNoteId]
    : []

export const useScoutingNoteAudio = ({
  scoutingNoteId,
  enabled = true,
}: {
  scoutingNoteId?: string
  enabled?: boolean
}) => {
  const query = useQuery<PowerSyncScoutingNoteAudioRow>({
    queryKey: getScoutingNoteAudioQueryKey(scoutingNoteId),
    query:
      "SELECT * FROM scouting_notes_audio WHERE scouting_notes_id = ? ORDER BY uploaded_at DESC",
    parameters: [scoutingNoteId ?? ""],
    enabled: Boolean(scoutingNoteId) && enabled,
  })

  return { ...query, data: query.data as ScoutingNoteAudio[] | undefined }
}
