import { ScoutingNotePhoto, CollectionPhoto } from "@nasti/common/types"

import {
  PendingScoutingNotePhoto,
  PendingCollectionPhoto,
} from "./usePhotosMutate"
import { queryClient } from "@/lib/queryClient"

export const usePhoto = ({ id }: { id?: string }) => {
  const queries = queryClient.getQueriesData<
    Array<
      | ScoutingNotePhoto
      | PendingScoutingNotePhoto
      | CollectionPhoto
      | PendingCollectionPhoto
    >
  >({
    queryKey: ["photos"],
  })
  let photo:
    | ScoutingNotePhoto
    | PendingScoutingNotePhoto
    | CollectionPhoto
    | PendingCollectionPhoto
    | undefined
  while (!photo && queries.length > 0) {
    const query = queries.pop()
    if (!query) continue
    const [, queryData] = query
    photo = queryData?.find((item) => item.id === id)
  }
  return photo
}
