import { authStorage } from "@/platform"
import { powerSyncDb } from "@/lib/powersync/db"
import {
  getRetainedOfflineAuthIdentity,
  OFFLINE_DATA_OWNER_HINT_KEY,
  UNKNOWN_DATA_OWNER_HINT,
  readOfflineAuthSnapshot,
} from "@/lib/offlineAuth"

const OWNER_KEY = "nasti-powersync-owner-v1"
const OWNER_ROW_ID = "device"

export type LocalDataAccess =
  | { status: "allowed"; ownerId: string; canClaim: false }
  | { status: "mismatch"; ownerId: string | null; canClaim: boolean }

const tables = [
  "trip",
  "trip_member",
  "species",
  "trip_species",
  "collection",
  "collection_photo",
  "collection_audio",
  "scouting_notes",
  "scouting_notes_photos",
  "scouting_notes_audio",
  "species_photo",
  "person",
  "sync_failures",
  "row_delete_retry_jobs",
  "media_upload_jobs",
  "media_upload_failures",
  "media_migrations",
] as const

/**
 * Read or claim the database owner in one SQLite transaction. The fixed row id
 * serializes simultaneous first-use checks from separate tabs through PowerSync.
 */
async function claimOwner(
  userId: string,
  options: { explicitlyClaimUnknownData: boolean },
): Promise<LocalDataAccess> {
  const [storedOwnerHint, storedIdentity, uploadQueue] = await Promise.all([
    authStorage.getItem(OFFLINE_DATA_OWNER_HINT_KEY),
    readOfflineAuthSnapshot(),
    powerSyncDb.getUploadQueueStats(),
  ])
  const identity = storedIdentity ?? getRetainedOfflineAuthIdentity()
  const priorOwnerId =
    storedOwnerHint === UNKNOWN_DATA_OWNER_HINT
      ? null
      : storedOwnerHint ?? identity?.userId ?? null

  let ownerId: string | null = null
  let canClaim = false
  await powerSyncDb.writeTransaction(async (transaction) => {
    const existing = await transaction.getAll<{ owner_id: string }>(
      "SELECT owner_id FROM local_data_owner WHERE id = ? LIMIT 1",
      [OWNER_ROW_ID],
    )
    if (existing[0]?.owner_id) {
      ownerId = existing[0].owner_id
      return
    }

    const rowCounts = await transaction.getAll<{ rowCount: number }>(
      `SELECT ${tables.map((table) => `(SELECT COUNT(*) FROM ${table})`).join(" + ")} AS rowCount`,
    )
    const hasLocalData = (rowCounts[0]?.rowCount ?? 0) > 0 || uploadQueue.count > 0

    // A prior identity hint is written before replacing/deleting its snapshot.
    // The current snapshot alone may already describe a newly signed-in user.
    if (hasLocalData && priorOwnerId) {
      ownerId = priorOwnerId
    } else if (hasLocalData && !options.explicitlyClaimUnknownData) {
      canClaim = true
      return
    } else {
      ownerId = userId
    }

    await transaction.execute(
      "INSERT OR IGNORE INTO local_data_owner (id, owner_id, created_at) VALUES (?, ?, ?)",
      [OWNER_ROW_ID, ownerId, new Date().toISOString()],
    )
    const claimed = await transaction.getAll<{ owner_id: string }>(
      "SELECT owner_id FROM local_data_owner WHERE id = ? LIMIT 1",
      [OWNER_ROW_ID],
    )
    ownerId = claimed[0]?.owner_id ?? null
  })

  if (ownerId) {
    // The SQLite row is authoritative. Keep both legacy and prior-identity
    // markers aligned for upgrades and recovery after logout.
    try {
      await authStorage.setItem(OWNER_KEY, ownerId)
    } catch {
      // The transaction already durably established ownership in SQLite.
    }
    try {
      await authStorage.setItem(OFFLINE_DATA_OWNER_HINT_KEY, ownerId)
    } catch {
      // The transaction already durably established ownership in SQLite.
    }
  }

  return ownerId === userId
    ? { status: "allowed", ownerId, canClaim: false }
    : { status: "mismatch", ownerId, canClaim }
}

/** Adopt known ownership or retain a lock when legacy data is ambiguous. */
export function resolveLocalDataAccess(userId: string): Promise<LocalDataAccess> {
  return claimOwner(userId, { explicitlyClaimUnknownData: false })
}

/** Call only after an explicit user confirmation and while live-authenticated. */
export function claimUnownedLocalData(userId: string): Promise<LocalDataAccess> {
  return claimOwner(userId, { explicitlyClaimUnknownData: true })
}
