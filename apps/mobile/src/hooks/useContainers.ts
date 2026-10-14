import type { ContainerPurpose } from "@nasti/common/types"

import { psDelete, psInsert, psUpdate } from "@/lib/powersync/crud"
import { powerSyncDb } from "@/lib/powersync/db"
import { useQuery } from "@/lib/powersync/query"
import type {
  PowerSyncCollectionContainerRow,
  PowerSyncContainerRow,
} from "@/lib/powersync/schema"

export type ContainerOption = {
  id: string
  name: string
  purpose: ContainerPurpose
  active: boolean
}

const rowToContainer = (row: PowerSyncContainerRow): ContainerOption => ({
  id: row.id,
  name: row.name ?? "",
  purpose: (row.purpose ?? "collection") as ContainerPurpose,
  active: Boolean(row.active),
})

// Every container synced to the device, including the inactive ones so that
// existing collections can still show what they were collected into.
export const useContainers = () => {
  const query = useQuery<PowerSyncContainerRow>({
    queryKey: ["containers"],
    query: "SELECT * FROM containers ORDER BY name",
  })

  return { ...query, data: query.data?.map(rowToContainer) }
}

export const useActiveContainers = (purpose: ContainerPurpose) => {
  const query = useQuery<PowerSyncContainerRow>({
    queryKey: ["containers", purpose],
    query:
      "SELECT * FROM containers WHERE purpose = ? AND active = 1 ORDER BY name",
    parameters: [purpose],
  })

  return { ...query, data: query.data?.map(rowToContainer) }
}

export type CollectionContainerRow = {
  id: string
  container_id: string
  amount: number | null
}

// The containers a collection was collected into, ordered so the form and the
// detail view agree on the order rows appear in.
export const useCollectionContainers = (collectionId?: string) => {
  const query = useQuery<PowerSyncCollectionContainerRow>({
    queryKey: ["collections", "containers", collectionId],
    query: `SELECT cc.* FROM collection_containers cc
            LEFT JOIN containers c ON c.id = cc.container_id
            WHERE cc.collection_id = ?
            ORDER BY c.name`,
    parameters: [collectionId ?? ""],
    enabled: Boolean(collectionId),
  })

  const data: CollectionContainerRow[] | undefined = query.data?.map((row) => ({
    id: row.id,
    container_id: row.container_id ?? "",
    amount: row.amount ?? null,
  }))

  return { ...query, data }
}

export type CollectionContainerInput = {
  container_id: string
  amount: number | null
}

// Bring the stored join rows in line with the set the form submitted. Writes
// go through the PowerSync CRUD helpers so they queue for upload offline.
export const saveCollectionContainers = async (
  collectionId: string,
  containers: CollectionContainerInput[],
) => {
  const existing = await powerSyncDb.getAll<PowerSyncCollectionContainerRow>(
    "SELECT * FROM collection_containers WHERE collection_id = ?",
    [collectionId],
  )

  const unmatched = new Map(existing.map((row) => [row.container_id, row]))

  for (const { container_id, amount } of containers) {
    if (!container_id) continue

    const current = unmatched.get(container_id)
    if (current) {
      unmatched.delete(container_id)
      if (current.amount !== amount)
        await psUpdate("collection_containers", current.id, { amount })
    } else {
      await psInsert("collection_containers", {
        id: crypto.randomUUID(),
        collection_id: collectionId,
        container_id,
        amount,
        created_at: new Date().toISOString(),
      })
    }
  }

  for (const row of unmatched.values())
    await psDelete("collection_containers", row.id)
}
