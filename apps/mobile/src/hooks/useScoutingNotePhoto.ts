import { ScoutingNotePhoto } from "@nasti/common/types"

import { useQuery } from "@/lib/powersync/query"
import type { PowerSyncScoutingNotePhotoRow } from "@/lib/powersync/schema"

export const useScoutingNotePhoto = ({ id }: { id?: string }) => {
  const query = useQuery<PowerSyncScoutingNotePhotoRow>({
    queryKey: ["photos", "scoutingNote", "detail", id],
    query: "SELECT * FROM scouting_notes_photos WHERE id = ?",
    parameters: [id ?? ""],
    enabled: Boolean(id),
  })

  return query.data?.[0] as ScoutingNotePhoto | undefined
}
