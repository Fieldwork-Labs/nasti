import { type Collection } from "@nasti/common/types"

import { powerSyncDb } from "@/lib/powersync/db"
import { useMutation } from "@tanstack/react-query"
import { psDelete } from "@/lib/powersync/crud"
import type { PowerSyncCollectionRow } from "@/lib/powersync/schema"
import { rowToCollection } from "@/lib/powersync/rows"

const deleteCollection = async (id: string) => {
  const row = await powerSyncDb.getOptional<PowerSyncCollectionRow>(
    "SELECT * FROM collection WHERE id = ?",
    [id],
  )
  await psDelete("collection", id)
  return rowToCollection(row ?? ({ id } as PowerSyncCollectionRow))
}

export const useCollectionDelete = () => {
  return useMutation<Collection, unknown, string>({
    mutationFn: (id) => deleteCollection(id),
  })
}
