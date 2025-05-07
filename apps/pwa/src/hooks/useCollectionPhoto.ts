import { CollectionPhoto } from "@nasti/common/types"

import { PendingCollectionPhoto } from "./useCollectionPhotosMutate"
import { queryClient } from "@/lib/queryClient"

export const useCollectionPhoto = ({ id }: { id?: string }) => {
  const queries = queryClient.getQueriesData<
    Array<CollectionPhoto | PendingCollectionPhoto>
  >({
    queryKey: ["collectionPhotos", "byTrip"],
  })
  let photo: CollectionPhoto | PendingCollectionPhoto | undefined
  while (!photo && queries.length > 0) {
    //
    const query = queries.pop()
    if (!query) continue
    const [, queryData] = query
    photo = queryData?.find((item) => item.id === id)
  }
  return photo
}
