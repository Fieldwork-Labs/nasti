import { authStorage } from "@/platform"
import { powerSyncDb } from "@/lib/powersync/db"
import { TIMED_OUT, withTimeout } from "@/lib/withTimeout"
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

// Work that exists only on this device. Synced rows are not counted: the
// server holds them, so dropping the local copy loses nothing. ps_crud is
// PowerSync's upload queue, read here rather than via getUploadQueueStats so
// the count is taken inside the same transaction as the clear.
const PENDING_LOCAL_WORK_SQL = `SELECT
  (SELECT COUNT(*) FROM ps_crud)
  + (SELECT COUNT(*) FROM sync_failures)
  + (SELECT COUNT(*) FROM row_delete_retry_jobs)
  + (SELECT COUNT(*) FROM media_upload_failures)
  + (SELECT COUNT(*) FROM media_upload_jobs WHERE status NOT IN ('uploaded', 'complete'))
  AS pendingCount`

/**
 * How long logout waits for PowerSync to disconnect, which can stall behind an
 * in-flight upload. Past this, logout goes ahead with the device still locked.
 */
export const RELEASE_TIMEOUT_MS = 5_000

type ReleaseOptions = {
  /**
   * Whether the app still has a write in flight that has not reached SQLite
   * yet, such as a photo being encoded before its row is queued. Checked
   * inside the clearing transaction.
   */
  hasPendingWrites?: () => boolean
}

/**
 * Called on logout. When the outgoing account has nothing left that exists
 * only on this device, clear the local database so the next account to sign
 * in starts empty and becomes the owner, instead of finding the device locked
 * to the previous account. Anything unsynced keeps the lock in place, so it can
 * only be recovered by the account that created it.
 *
 * Returns true exactly when the clear committed, so the caller can evict the
 * account's caches. Never throws. If disconnecting takes longer than
 * {@link RELEASE_TIMEOUT_MS}, nothing is cleared and the lock stays.
 */
export async function releaseLocalDataIfSynced({
  hasPendingWrites,
}: ReleaseOptions = {}): Promise<boolean> {
  try {
    // Stop syncing so no download lands and no upload starts mid-release.
    // Only this step is bounded: the steps after it either have not started
    // (nothing cleared) or must be allowed to finish and be reported, so a
    // committed clear is never mistaken for a kept lock.
    const disconnected = await withTimeout(
      powerSyncDb.disconnect().then(() => true),
      RELEASE_TIMEOUT_MS,
    )
    if (disconnected === TIMED_OUT) {
      console.error("[PowerSync] Timed out disconnecting on logout; local data kept")
      return false
    }
  } catch {
    console.error("[PowerSync] Failed to disconnect on logout; local data kept")
    return false
  }

  let released = false
  try {
    // Local writes also go through write transactions, so checking and
    // clearing in one leaves no gap for a write to land between them unseen.
    await powerSyncDb.writeTransaction(async (transaction) => {
      if (hasPendingWrites?.()) return
      const [row] = await transaction.getAll<{ pendingCount: number }>(
        PENDING_LOCAL_WORK_SQL,
      )
      if ((row?.pendingCount ?? 0) > 0) return

      // What disconnectAndClear() runs, with clearLocal: synced and
      // local-only tables, including local_data_owner.
      await transaction.execute("SELECT powersync_clear(1)")
      released = true
    })
  } catch {
    // A failed transaction rolled back, so nothing was cleared.
    console.error("[PowerSync] Failed to release local data on logout")
    return false
  }
  if (!released) return false

  // The SQLite owner row is already gone, which is what decides ownership, so
  // these markers are tidy-up only. Don't hold logout or the result on them.
  void Promise.allSettled([
    authStorage.removeItem(OWNER_KEY),
    authStorage.removeItem(OFFLINE_DATA_OWNER_HINT_KEY),
  ])
  return true
}
