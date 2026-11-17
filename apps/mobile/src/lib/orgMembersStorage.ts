import { openDB, type DBSchema, type IDBPTransaction } from "idb"
import { z } from "zod"
import { OFFLINE_ACCESS_MS } from "./offlineAuth"
import { orgMembersQueryKey, orgMembersSchema } from "./orgMembers"
import { TIMED_OUT, withTimeout } from "./withTimeout"

export const ROSTER_DB = "nasti-query-cache"
export const LEGACY_QUERY_CACHE_KEY = "nasti-persist-data-v2"

const timestamp = z.number().finite().positive()
const recordSchema = z.object({
  data: orgMembersSchema,
  dataUpdatedAt: timestamp,
  cachedAt: timestamp,
})
export type RosterRecord = z.infer<typeof recordSchema>

const gateSchema = z.object({ revision: z.string(), revoked: z.boolean() })
export type RosterGate = z.infer<typeof gateSchema>
const stateSchema = gateSchema.extend({ migrated: z.boolean() })
type RosterState = z.infer<typeof stateSchema>

interface RosterDB extends DBSchema {
  state: { key: "cache"; value: RosterState }
  rosters: { key: string; value: RosterRecord }
}

const newRevision = () => crypto.getRandomValues(new Uint32Array(4)).join("-")

async function write<T>(
  action: (
    tx: IDBPTransaction<RosterDB, ["state", "rosters"], "readwrite">,
  ) => Promise<T>,
): Promise<T> {
  const opening = openDB<RosterDB>(ROSTER_DB, 1, {
    upgrade(db) {
      db.createObjectStore("state")
      db.createObjectStore("rosters")
    },
  })
  const db = await withTimeout(opening, 1_000)
  if (db === TIMED_OUT) {
    // A blocked open can resolve later. Do not start a transaction then.
    void opening.then(
      (connection) => connection.close(),
      () => undefined,
    )
    throw new Error("Opening the offline roster cache timed out")
  }

  const tx = db.transaction(["state", "rosters"], "readwrite")
  const done = tx.done
  void done.catch(() => undefined)
  try {
    const result = await action(tx)
    await done
    return result
  } catch (error) {
    try {
      tx.abort()
    } catch {
      // IndexedDB may already have aborted the transaction.
    }
    throw error
  } finally {
    db.close()
  }
}

function usableRecord(value: unknown): RosterRecord | undefined {
  const parsed = recordSchema.safeParse(value)
  if (!parsed.success) return
  const { dataUpdatedAt, cachedAt } = parsed.data
  const age = Date.now() - cachedAt
  if (dataUpdatedAt > cachedAt || age < 0 || age >= OFFLINE_ACCESS_MS) return
  return parsed.data
}

const legacySchema = z.object({
  buster: z.literal(""),
  timestamp,
  clientState: z.object({ queries: z.array(z.unknown()) }),
})
const legacyEntrySchema = z.object({
  queryKey: z.tuple([z.literal("people"), z.literal("list"), z.string()]),
  promise: z.undefined(),
  state: z.object({
    status: z.enum(["success", "error"]),
    data: z.unknown(),
    dataUpdatedAt: timestamp,
  }),
})

function readLegacyRoster(userId: string): RosterRecord | undefined {
  try {
    const raw = window.localStorage.getItem(LEGACY_QUERY_CACHE_KEY)
    if (raw === null) return
    const parsed = legacySchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return
    const key = orgMembersQueryKey(userId)
    let newest: RosterRecord | undefined
    for (const query of parsed.data.clientState.queries) {
      const entry = legacyEntrySchema.safeParse(query)
      if (!entry.success || entry.data.queryKey[2] !== key[2]) continue
      const record = usableRecord({
        ...entry.data.state,
        cachedAt: parsed.data.timestamp,
      })
      if (record && (!newest || record.dataUpdatedAt > newest.dataUpdatedAt))
        newest = record
    }
    return newest
  } catch {
    return undefined
  }
}

function removeLegacyCache() {
  window.localStorage.removeItem(LEGACY_QUERY_CACHE_KEY)
  if (window.localStorage.getItem(LEGACY_QUERY_CACHE_KEY) !== null)
    throw new Error("Could not remove the legacy query cache")
}

export const readRosterGate = () =>
  write(async (tx) => {
    const store = tx.objectStore("state")
    const current = await store.get("cache")
    if (current !== undefined) return stateSchema.parse(current)
    const state = { revision: newRevision(), revoked: false, migrated: false }
    await tx.objectStore("rosters").clear()
    await store.put(state, "cache")
    return state
  })

export const restoreRoster = async (userId: string, revision: string) => {
  const result = await write(async (tx) => {
    const stateStore = tx.objectStore("state")
    const state = await stateStore.get("cache")
    if (state?.revision !== revision || state.revoked) return null

    const rosters = tx.objectStore("rosters")
    const existing = usableRecord(await rosters.get(userId))
    if (state.migrated) return { record: existing }

    const legacy = readLegacyRoster(userId)
    const useLegacy =
      legacy && (!existing || legacy.dataUpdatedAt > existing.dataUpdatedAt)
    if (useLegacy) await rosters.put(legacy, userId)
    await stateStore.put({ ...state, migrated: true }, "cache")
    return { record: useLegacy ? legacy : existing }
  })

  if (result) {
    try {
      removeLegacyCache()
    } catch {
      // A committed marker keeps subsequent restores from reimporting.
    }
  }
  return result
}

export const saveRoster = (
  userId: string,
  revision: string,
  record: RosterRecord,
) =>
  write(async (tx) => {
    const state = await tx.objectStore("state").get("cache")
    if (state?.revision !== revision || state.revoked) return false
    const rosters = tx.objectStore("rosters")
    const existing = usableRecord(await rosters.get(userId))
    if (!existing || existing.dataUpdatedAt <= record.dataUpdatedAt)
      await rosters.put(record, userId)
    return true
  })

/** Only a successful explicit login can replace a revoked revision. */
export const reopenRosterCache = (expected: RosterGate) =>
  write(async (tx) => {
    const store = tx.objectStore("state")
    const state = await store.get("cache")
    if (state?.revision !== expected.revision) return null
    if (!state.revoked) return state
    const reopened = { ...state, revision: newRevision(), revoked: false }
    await store.put(reopened, "cache")
    return reopened
  })

export const revokeRosterCache = async (notify: (revision: string) => void) => {
  const previous = await write(async (tx) => {
    const states = tx.objectStore("state")
    const state = await states.get("cache")
    await tx.objectStore("rosters").clear()
    await states.put(
      {
        revision: newRevision(),
        revoked: true,
        migrated: true,
      },
      "cache",
    )
    return state?.revision
  })
  if (previous) notify(previous)
  removeLegacyCache()
}
