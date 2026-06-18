import { CollectionPhoto } from "@nasti/common/types"

import { useQuery } from "@/lib/powersync/query"
import type { PowerSyncCollectionPhotoRow } from "@/lib/powersync/schema"

export const useCollectionPhoto = ({ id }: { id?: string }) => {
  const query = useQuery<PowerSyncCollectionPhotoRow>({
    queryKey: ["photos", "collection", "detail", id],
    query: "SELECT * FROM collection_photo WHERE id = ?",
    parameters: [id ?? ""],
    enabled: Boolean(id),
  })

  return query.data?.[0] as CollectionPhoto | undefined
}
