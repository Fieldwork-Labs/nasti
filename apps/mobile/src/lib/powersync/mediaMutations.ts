import { psInsert } from "./crud"
import { mediaAttachmentQueue, type MediaKind } from "./attachments"
import { powerSyncDb } from "./db"
import { powerSyncQueryClient } from "./query"

export async function createQueuedMediaRecord({
  id,
  kind,
  table,
  bucket,
  path,
  mimeType,
  record,
}: {
  id: string
  kind: MediaKind
  table: string
  bucket: string
  path: string
  mimeType: string
  record: Record<string, unknown>
}): Promise<void> {
  await powerSyncDb.writeTransaction(async (transaction) => {
    await mediaAttachmentQueue.enqueue(
      { id, kind, table, bucket, path, mimeType },
      transaction,
    )
    await psInsert(table, record, transaction)
  })
  await powerSyncQueryClient.invalidateQueries()
  mediaAttachmentQueue.wake()
}

export async function deleteQueuedMediaRecord({
  id,
  kind,
  table,
  bucket,
  entityLabel,
  fallbackMimeType,
}: {
  id: string
  kind: MediaKind
  table: string
  bucket: string
  entityLabel: string
  fallbackMimeType: string
}): Promise<string> {
  const row = await powerSyncDb.getOptional<{
    id: string
    url: string | null
    mime_type?: string | null
  }>(`SELECT * FROM ${table} WHERE id = ?`, [id])
  if (!row) throw new Error(`${entityLabel} ${id} not found`)
  if (!row.url) throw new Error(`${entityLabel} ${id} has no URL`)

  await powerSyncDb.writeTransaction(async (transaction) => {
    await mediaAttachmentQueue.enqueueDelete(
      {
        id,
        kind,
        table,
        bucket,
        path: row.url!,
        mimeType: row.mime_type ?? fallbackMimeType,
      },
      transaction,
    )
    await transaction.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
  })
  await powerSyncQueryClient.invalidateQueries()
  mediaAttachmentQueue.wake()
  return id
}
