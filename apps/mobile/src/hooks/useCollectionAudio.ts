import { CollectionAudio } from "@nasti/common/types"

import { useQuery } from "@/lib/powersync/query"
import type { PowerSyncCollectionAudioRow } from "@/lib/powersync/schema"

export const getCollectionAudioQueryKey = (collectionId?: string) =>
  collectionId ? ["audio", "collection", "byCollection", collectionId] : []

export const useCollectionAudio = ({
  collectionId,
  enabled = true,
}: {
  collectionId?: string
  enabled?: boolean
}) => {
  const query = useQuery<PowerSyncCollectionAudioRow>({
    queryKey: getCollectionAudioQueryKey(collectionId),
    query:
      "SELECT * FROM collection_audio WHERE collection_id = ? ORDER BY uploaded_at DESC",
    parameters: [collectionId ?? ""],
    enabled: Boolean(collectionId) && enabled,
  })

  return { ...query, data: query.data as CollectionAudio[] | undefined }
}
