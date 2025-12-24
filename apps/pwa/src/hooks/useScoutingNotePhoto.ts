import { ScoutingNotePhoto } from "@nasti/common/types"

import { PendingScoutingNotePhoto } from "./usePhotosMutate"
import { queryClient } from "@/lib/queryClient"

export const useScoutingNotePhoto = ({ id }: { id?: string }) => {
  const queries = queryClient.getQueriesData<
    Array<ScoutingNotePhoto | PendingScoutingNotePhoto>
  >({
    queryKey: ["photos", "scoutingNote", "byTrip"],
  })
  let photo: ScoutingNotePhoto | PendingScoutingNotePhoto | undefined
  while (!photo && queries.length > 0) {
    const query = queries.pop()
    if (!query) continue
    const [, queryData] = query
    photo = queryData?.find((item) => item.id === id)
  }
  return photo
}
