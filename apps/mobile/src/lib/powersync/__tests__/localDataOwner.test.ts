import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRealSqliteHarness } from "./realSqlite"

type TestDb = {
  execute: (sql: string, parameters?: (string | number | null)[]) => Promise<unknown>
  getAll: <T>(sql: string, parameters?: (string | number | null)[]) => Promise<T[]>
  writeTransaction: (callback: (transaction: { execute: (sql: string, parameters?: (string | number | null)[]) => Promise<unknown>; getAll: <T>(sql: string, parameters?: (string | number | null)[]) => Promise<T[]> }) => Promise<void>) => Promise<void>
  close: () => Promise<void>
}

const { storage, state, appTablesForMock } = vi.hoisted(() => ({
  appTablesForMock: [
    "trip", "trip_member", "species", "trip_species", "collection",
    "collection_photo", "collection_audio", "scouting_notes",
    "scouting_notes_photos", "scouting_notes_audio", "species_photo", "person",
    "sync_failures", "row_delete_retry_jobs", "media_upload_jobs",
    "media_upload_failures", "media_migrations",
  ],
  storage: new Map<string, string>(),
  state: {
    db: null as null | TestDb,
    transactionTail: Promise.resolve() as Promise<unknown>,
    uploadQueueCount: 0,
    disconnect: (async () => undefined) as () => Promise<void>,
  },
}))

vi.mock("@/platform", () => ({
  authStorage: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value) }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key) }),
  },
}))
vi.mock("@/lib/powersync/db", () => ({
  powerSyncDb: {
    getAll: <T>(sql: string, parameters?: (string | number | null)[]) => state.db!.getAll<T>(sql, parameters),
    getUploadQueueStats: async () => {
      const [row] = await state.db!.getAll<{ count: number }>("SELECT COUNT(*) AS count FROM ps_crud")
      return { count: row.count + state.uploadQueueCount }
    },
    disconnect: () => state.disconnect(),
    writeTransaction: (callback: (transaction: { execute: (sql: string, parameters?: (string | number | null)[]) => Promise<unknown>; getAll: <T>(sql: string, parameters?: (string | number | null)[]) => Promise<T[]> }) => Promise<void>) => {
      // The harness has no PowerSync extension, so emulate powersync_clear(1):
      // empty every synced and local-only table, and the upload queue.
      const result = state.transactionTail.then(() => state.db!.writeTransaction((transaction) => callback({
        getAll: transaction.getAll,
        execute: async (sql, parameters) => {
          if (!sql.includes("powersync_clear")) return transaction.execute(sql, parameters)
          for (const table of [...appTablesForMock, "local_data_owner", "ps_crud"]) {
            await transaction.execute(`DELETE FROM ${table}`)
          }
        },
      })))
      state.transactionTail = result.catch(() => undefined)
      return result
    },
  },
}))

import { powerSyncDb } from "@/lib/powersync/db"
import {
  resolveLocalDataAccess,
  claimUnownedLocalData,
  releaseLocalDataIfSynced,
  RELEASE_TIMEOUT_MS,
} from "../localDataOwner"
import {
  OFFLINE_ACCESS_MS,
  OFFLINE_AUTH_KEY,
  OFFLINE_DATA_OWNER_HINT_KEY,
  UNKNOWN_DATA_OWNER_HINT,
  allowExplicitLogin,
  beginExplicitLogout,
  finishExplicitLogout,
  snapshotFromSession,
  deleteOfflineAuthSnapshot,
  writeOfflineAuthSnapshot,
} from "@/lib/offlineAuth"

const appTables = appTablesForMock

function snapshotFor(userId: string, now: number) {
  const session = {
    access_token: `header.${btoa(JSON.stringify({ app_metadata: { org_id: "org-a", role: "Admin" } }))}.signature`,
    refresh_token: `refresh-${userId}`,
    token_type: "bearer",
    expires_in: 3600,
    user: {
      id: userId,
      email: `${userId}@example.com`,
      user_metadata: {},
      app_metadata: {},
      created_at: "",
      aud: "authenticated",
    },
  } as const
  return snapshotFromSession(session, null, true, now)!
}

describe("local PowerSync database ownership", () => {
  beforeEach(async () => {
    beginExplicitLogout()
    finishExplicitLogout()
    allowExplicitLogin()
    storage.clear()
    const expiredRefresh = Date.now() - OFFLINE_ACCESS_MS - 1_000
    const expiredAt = new Date(expiredRefresh).toISOString()
    storage.set(OFFLINE_AUTH_KEY, JSON.stringify({
      userId: "expired-user",
      orgId: "org-expired",
      lastSuccessfulLoginAt: expiredAt,
      lastSuccessfulSessionRefreshAt: expiredAt,
      offlineAccessUntil: new Date(expiredRefresh + OFFLINE_ACCESS_MS).toISOString(),
    }))
    storage.set(OFFLINE_DATA_OWNER_HINT_KEY, UNKNOWN_DATA_OWNER_HINT)
    state.uploadQueueCount = 0
    state.disconnect = async () => undefined
    state.transactionTail = Promise.resolve()
    const db = await createRealSqliteHarness({ initialize: false }) as unknown as TestDb
    state.db = db
    for (const table of appTables) {
      await db.execute(
        table === "media_upload_jobs"
          ? `CREATE TABLE ${table} (id TEXT PRIMARY KEY, status TEXT)`
          : `CREATE TABLE ${table} (id TEXT PRIMARY KEY)`,
      )
    }
    await db.execute("CREATE TABLE ps_crud (id INTEGER PRIMARY KEY, data TEXT)")
    await db.execute(`CREATE TABLE local_data_owner (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`)
  })

  afterEach(async () => {
    await state.db?.close()
    state.db = null
  })

  it("binds an empty local database to its first user", async () => {
    await expect(resolveLocalDataAccess("user-a")).resolves.toEqual({
      status: "allowed",
      ownerId: "user-a",
      canClaim: false,
    })
    await expect(state.db!.getAll("SELECT owner_id FROM local_data_owner")).resolves.toEqual([
      { owner_id: "user-a" },
    ])
  })

  it("does not trust a legacy marker without transaction-backed proof", async () => {
    storage.set("nasti-powersync-owner-v1", "user-a")
    await state.db!.execute("INSERT INTO trip (id) VALUES (?)", ["trip-a"])
    await expect(resolveLocalDataAccess("user-b")).resolves.toEqual({
      status: "mismatch",
      ownerId: null,
      canClaim: true,
    })
    await expect(state.db!.getAll("SELECT owner_id FROM local_data_owner")).resolves.toEqual([])
  })

  it("keeps unowned legacy rows locked until the user explicitly claims them", async () => {
    await state.db!.execute("INSERT INTO trip (id) VALUES (?)", ["trip-a"])
    await expect(resolveLocalDataAccess("user-b")).resolves.toEqual({
      status: "mismatch",
      ownerId: null,
      canClaim: true,
    })
  })

  it("adopts existing rows when a valid offline identity proves the owner", async () => {
    const snapshotA = snapshotFor("user-a", Date.now())
    storage.set(OFFLINE_AUTH_KEY, JSON.stringify(snapshotA))
    storage.set(OFFLINE_DATA_OWNER_HINT_KEY, "user-a")
    await state.db!.execute("INSERT INTO trip (id) VALUES (?)", ["trip-a"])

    await expect(resolveLocalDataAccess("user-a")).resolves.toEqual({
      status: "allowed",
      ownerId: "user-a",
      canClaim: false,
    })
    expect(storage.get("nasti-powersync-owner-v1")).toBe("user-a")
  })

  it("uses an expired legacy snapshot as prior-owner evidence for its matching user", async () => {
    const snapshotA = snapshotFor("user-a", Date.now() - OFFLINE_ACCESS_MS - 1_000)
    storage.delete(OFFLINE_DATA_OWNER_HINT_KEY)
    storage.set(OFFLINE_AUTH_KEY, JSON.stringify(snapshotA))
    await state.db!.execute("INSERT INTO trip (id) VALUES (?)", ["trip-a"])

    await expect(resolveLocalDataAccess("user-a")).resolves.toEqual({
      status: "allowed",
      ownerId: "user-a",
      canClaim: false,
    })
  })

  it("keeps A's rows owned by A when B's login replaces A's offline snapshot", async () => {
    const snapshotA = snapshotFor("user-a", Date.now())
    const snapshotB = snapshotFor("user-b", Date.now() + 1_000)
    storage.set(OFFLINE_AUTH_KEY, JSON.stringify(snapshotA))
    storage.delete(OFFLINE_DATA_OWNER_HINT_KEY)
    await state.db!.execute("INSERT INTO trip (id) VALUES (?)", ["trip-a"])

    // Models AuthProvider's SIGNED_IN write: the prior-owner hint must be
    // durable before B's snapshot replaces A's.
    await writeOfflineAuthSnapshot(snapshotB)

    expect(storage.get(OFFLINE_DATA_OWNER_HINT_KEY)).toBe("user-a")
    await expect(resolveLocalDataAccess("user-b")).resolves.toEqual({
      status: "mismatch",
      ownerId: "user-a",
      canClaim: false,
    })
  })

  it("preserves A's owner hint across logout before B signs in", async () => {
    const snapshotA = snapshotFor("user-a", Date.now())
    const snapshotB = snapshotFor("user-b", Date.now() + 1_000)
    storage.set(OFFLINE_AUTH_KEY, JSON.stringify(snapshotA))
    storage.delete(OFFLINE_DATA_OWNER_HINT_KEY)
    await state.db!.execute("INSERT INTO trip (id) VALUES (?)", ["trip-a"])

    await deleteOfflineAuthSnapshot()
    await writeOfflineAuthSnapshot(snapshotB)

    expect(storage.get(OFFLINE_DATA_OWNER_HINT_KEY)).toBe("user-a")
    await expect(resolveLocalDataAccess("user-b")).resolves.toEqual({
      status: "mismatch",
      ownerId: "user-a",
      canClaim: false,
    })
  })

  it("keeps unknown ownership through B logout so C cannot auto-adopt A's rows", async () => {
    const snapshotB = snapshotFor("user-b", Date.now())
    const snapshotC = snapshotFor("user-c", Date.now() + 1_000)
    storage.delete(OFFLINE_AUTH_KEY)
    await state.db!.execute("INSERT INTO trip (id) VALUES (?)", ["trip-a"])

    // B is the first account seen by this version; no prior identity exists.
    await writeOfflineAuthSnapshot(snapshotB)
    expect(storage.get(OFFLINE_DATA_OWNER_HINT_KEY)).toBe(UNKNOWN_DATA_OWNER_HINT)
    await deleteOfflineAuthSnapshot()
    await writeOfflineAuthSnapshot(snapshotC)

    expect(storage.get(OFFLINE_DATA_OWNER_HINT_KEY)).toBe(UNKNOWN_DATA_OWNER_HINT)
    await expect(resolveLocalDataAccess("user-c")).resolves.toEqual({
      status: "mismatch",
      ownerId: null,
      canClaim: true,
    })
    await expect(state.db!.getAll("SELECT owner_id FROM local_data_owner")).resolves.toEqual([])
  })

  it("blocks pending PowerSync CRUD work with no owner evidence", async () => {
    state.uploadQueueCount = 1
    await expect(resolveLocalDataAccess("user-b")).resolves.toEqual({
      status: "mismatch",
      ownerId: null,
      canClaim: true,
    })
  })

  it("lets only one simultaneous account claim an empty database", async () => {
    const results = await Promise.all([
      resolveLocalDataAccess("user-a"),
      resolveLocalDataAccess("user-b"),
    ])

    expect(results.filter((result) => result.status === "allowed")).toHaveLength(1)
    expect(results.filter((result) => result.status === "mismatch")).toHaveLength(1)
    const [owner] = await state.db!.getAll<{ owner_id: string }>(
      "SELECT owner_id FROM local_data_owner WHERE id = 'device'",
    )
    expect(results.find((result) => result.status === "allowed")?.ownerId).toBe(owner.owner_id)
  })

  it("serializes explicit claims of ambiguous legacy data", async () => {
    await state.db!.execute("INSERT INTO trip (id) VALUES (?)", ["trip-a"])
    const results = await Promise.all([
      claimUnownedLocalData("user-a"),
      claimUnownedLocalData("user-b"),
    ])

    expect(results.filter((result) => result.status === "allowed")).toHaveLength(1)
    expect(results.filter((result) => result.status === "mismatch")).toHaveLength(1)
  })

  describe("releasing on logout", () => {
    const signInAsAThenLogOut = async () => {
      storage.set(OFFLINE_AUTH_KEY, JSON.stringify(snapshotFor("user-a", Date.now())))
      storage.delete(OFFLINE_DATA_OWNER_HINT_KEY)
      await expect(resolveLocalDataAccess("user-a")).resolves.toMatchObject({ status: "allowed" })
      await state.db!.execute("INSERT INTO trip (id) VALUES (?)", ["trip-a"])
      await deleteOfflineAuthSnapshot()
    }

    it("hands a fully synced device to the next account", async () => {
      await signInAsAThenLogOut()

      await expect(releaseLocalDataIfSynced()).resolves.toBe(true)
      await expect(state.db!.getAll("SELECT id FROM trip")).resolves.toEqual([])
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(storage.has(OFFLINE_DATA_OWNER_HINT_KEY)).toBe(false)
      expect(storage.has("nasti-powersync-owner-v1")).toBe(false)

      await writeOfflineAuthSnapshot(snapshotFor("user-b", Date.now() + 1_000))
      await expect(resolveLocalDataAccess("user-b")).resolves.toEqual({
        status: "allowed",
        ownerId: "user-b",
        canClaim: false,
      })
    })

    it("treats finished media uploads as synced", async () => {
      await signInAsAThenLogOut()
      await state.db!.execute(
        "INSERT INTO media_upload_jobs (id, status) VALUES ('done', 'complete'), ('up', 'uploaded')",
      )

      await expect(releaseLocalDataIfSynced()).resolves.toBe(true)
    })

    it.each([
      ["queued CRUD uploads", async () => {
        await state.db!.execute("INSERT INTO ps_crud (data) VALUES ('{}')")
      }],
      ["a pending media upload", async () => {
        await state.db!.execute("INSERT INTO media_upload_jobs (id, status) VALUES ('m', 'pending')")
      }],
      ["a sync failure", async () => {
        await state.db!.execute("INSERT INTO sync_failures (id) VALUES ('f')")
      }],
      ["a media upload failure", async () => {
        await state.db!.execute("INSERT INTO media_upload_failures (id) VALUES ('f')")
      }],
      ["a delete retry job", async () => {
        await state.db!.execute("INSERT INTO row_delete_retry_jobs (id) VALUES ('d')")
      }],
    ])("keeps the device locked to A while it holds %s", async (_label, addPendingWork) => {
      await signInAsAThenLogOut()
      await addPendingWork()

      await expect(releaseLocalDataIfSynced()).resolves.toBe(false)
      await expect(state.db!.getAll("SELECT id FROM trip")).resolves.toEqual([{ id: "trip-a" }])
      await expect(resolveLocalDataAccess("user-b")).resolves.toEqual({
        status: "mismatch",
        ownerId: "user-a",
        canClaim: false,
      })
    })

    it("keeps the device locked while an app write is still in flight", async () => {
      await signInAsAThenLogOut()

      await expect(releaseLocalDataIfSynced({ hasPendingWrites: () => true })).resolves.toBe(false)
      await expect(state.db!.getAll("SELECT id FROM trip")).resolves.toEqual([{ id: "trip-a" }])
    })

    it("never wipes a write that lands while the release is running", async () => {
      await signInAsAThenLogOut()
      let finishDisconnect!: () => void
      state.disconnect = () => new Promise<void>((resolve) => {
        finishDisconnect = resolve
      })

      const release = releaseLocalDataIfSynced()
      // A queued media record written while the release waits on disconnect.
      const write = powerSyncDb.writeTransaction(async (transaction) => {
        await transaction.execute("INSERT INTO media_upload_jobs (id, status) VALUES ('late', 'pending')")
      })
      finishDisconnect()
      await Promise.all([release, write])

      // Whichever runs first, the pending job survives: either it was seen and
      // the lock kept, or it was written after the clear.
      await expect(state.db!.getAll("SELECT id FROM media_upload_jobs")).resolves.toEqual([{ id: "late" }])
    })

    it("gives up and keeps the lock when disconnecting hangs", async () => {
      await signInAsAThenLogOut()
      let finishDisconnect!: () => void
      state.disconnect = () => new Promise<void>((resolve) => {
        finishDisconnect = resolve
      })
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined)
      vi.useFakeTimers()
      try {
        const release = releaseLocalDataIfSynced()
        await vi.advanceTimersByTimeAsync(RELEASE_TIMEOUT_MS)
        await expect(release).resolves.toBe(false)
      } finally {
        vi.useRealTimers()
        errorLog.mockRestore()
      }

      // A disconnect that finally returns must not clear anything afterwards.
      finishDisconnect()
      await state.transactionTail
      await new Promise((resolve) => setTimeout(resolve, 0))
      await state.transactionTail
      await expect(state.db!.getAll("SELECT id FROM trip")).resolves.toEqual([{ id: "trip-a" }])
      await expect(resolveLocalDataAccess("user-b")).resolves.toMatchObject({
        status: "mismatch",
        ownerId: "user-a",
      })
    })

    it("reports a committed clear even when tidying up storage is slow", async () => {
      await signInAsAThenLogOut()
      const { authStorage } = await import("@/platform")
      vi.mocked(authStorage.removeItem).mockImplementationOnce(() => new Promise(() => undefined))

      await expect(releaseLocalDataIfSynced()).resolves.toBe(true)
      await expect(state.db!.getAll("SELECT owner_id FROM local_data_owner")).resolves.toEqual([])
    })
  })
})
