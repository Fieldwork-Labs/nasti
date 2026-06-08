import { UpdateCollection, type Collection } from "@nasti/common/types"

import { useMutation } from "@tanstack/react-query"
import { psUpdate } from "@/lib/powersync/crud"

const updateCollection = async (updatedItem: UpdateCollection) => {
  await psUpdate(
    "collection",
    updatedItem.id,
    updatedItem as unknown as Record<string, unknown>,
  )
  return updatedItem as Collection
}

export const useCollectionUpdate = ({ tripId }: { tripId: string }) => {
  return useMutation<Collection, unknown, UpdateCollection>({
    mutationKey: ["collections", "update", tripId],
    mutationFn: (updatedItem) => updateCollection(updatedItem),
  })
}
