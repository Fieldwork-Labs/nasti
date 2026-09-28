import { randomUUID } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createRealSqliteHarness } from "./realSqlite"
vi.mock("../db", () => ({ powerSyncDb: {} }))
import { confirmMediaRowDelete, LocalAttachmentQueue, mediaAttachmentQueue } from "../attachments"

describe("real SQLite localOnly view harness", () => {
  let db: Awaited<ReturnType<typeof createRealSqliteHarness>> | undefined

  afterEach(async () => {
    await db?.close()
    db = undefined
  })

  it("updates through a SQLite view and records a queued row operation", async () => {
    db = await createRealSqliteHarness()

    await db.execute("UPDATE local_collection SET name = 'After' WHERE id = 'collection-1'")

    expect(await db.query("SELECT * FROM collection")).toEqual([
      { id: "collection-1", name: "After" },
    ])
    const queued = await db.query("SELECT table_name, op, row_id, data FROM powersync_crud")
    expect(queued).toEqual([
      {
        table_name: "collection",
        op: "UPDATE",
        row_id: "collection-1",
        data: '{"id":"collection-1","name":"After"}',
      },
    ])
  })

  it("rolls back both the view update and queued operation in a transaction", async () => {
    db = await createRealSqliteHarness()

    await db.execute(`
      BEGIN;
      UPDATE local_collection SET name = 'Rolled back' WHERE id = 'collection-1';
      ROLLBACK;
    `)

    expect(await db.query("SELECT * FROM local_collection")).toEqual([
      { id: "collection-1", name: "Before" },
    ])
    expect(await db.query("SELECT * FROM powersync_crud")).toEqual([])
  })

  it("commits the view update and queued operation together", async () => {
    db = await createRealSqliteHarness()

    await db.execute(`
      BEGIN;
      UPDATE local_collection SET name = 'Committed' WHERE id = 'collection-1';
      COMMIT;
    `)

    expect(await db.query("SELECT * FROM collection")).toEqual([
      { id: "collection-1", name: "Committed" },
    ])
    expect(await db.query("SELECT op, row_id FROM powersync_crud")).toEqual([
      { op: "UPDATE", row_id: "collection-1" },
    ])
  })

  it("keeps a delete gated across SQLite reopen until row deletion is confirmed", async () => {
    const filename = `/tmp/real-sqlite-media-delete-${randomUUID()}.db`
    const id = "photo-delete-1"
    const table = "collection_photo"
    db = await createRealSqliteHarness({ filename })
    await db.execute(`CREATE TABLE media_upload_jobs (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, operation TEXT NOT NULL, table_name TEXT NOT NULL,
      bucket TEXT NOT NULL, path TEXT NOT NULL, mime_type TEXT NOT NULL, status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL, next_attempt_at TEXT, created_at TEXT NOT NULL
    )`)
    const queue = new LocalAttachmentQueue({
      database: db,
      now: () => new Date("2026-01-02T03:04:05.000Z"),
    })

    await queue.enqueueDelete({
      id,
      kind: "photo",
      table,
      bucket: "collection-photos",
      path: "org/collection/photo.jpg",
      mimeType: "image/jpeg",
    })
    expect(await db.query("SELECT status, operation FROM media_upload_jobs WHERE id = ?", [id])).toEqual([
      { status: "waiting_for_row_delete", operation: "delete" },
    ])

    await db.close()
    db = await createRealSqliteHarness({ filename, initialize: false })
    expect(await db.query("SELECT status, operation FROM media_upload_jobs WHERE id = ?", [id])).toEqual([
      { status: "waiting_for_row_delete", operation: "delete" },
    ])

    const wake = vi.spyOn(mediaAttachmentQueue, "wake").mockImplementation(() => undefined)
    await confirmMediaRowDelete(table, id, db)
    expect(await db.query("SELECT status FROM media_upload_jobs WHERE id = ?", [id])).toEqual([
      { status: "deleting" },
    ])
    expect(wake).toHaveBeenCalledOnce()
    wake.mockRestore()
  })

  it("recovers a pre-queue photo whose legacy timestamp falsely says uploaded", async () => {
    db = await createRealSqliteHarness({ initialize: false })
    for (const table of ["collection_photo", "scouting_notes_photos", "collection_audio", "scouting_notes_audio"]) {
      await db.execute(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, url TEXT, mime_type TEXT, uploaded_at TEXT)`)
    }
    await db.execute(`CREATE TABLE media_upload_jobs (
      id TEXT PRIMARY KEY, kind TEXT, operation TEXT, table_name TEXT, bucket TEXT,
      path TEXT, mime_type TEXT, status TEXT, attempt_count INTEGER,
      next_attempt_at TEXT, created_at TEXT
    )`)
    await db.execute("CREATE TABLE media_migrations (id TEXT PRIMARY KEY, completed_at TEXT)")
    await db.execute(
      "INSERT INTO collection_photo (id, url, uploaded_at) VALUES (?, ?, ?)",
      ["stranded-photo", "org/collections/c/stranded.jpg", "2025-01-01T00:00:00.000Z"],
    )
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "live-token" }), confirm: vi.fn() },
      getAllImages: vi.fn().mockResolvedValue([{ id: "stranded-photo" }]),
      getAllAudios: vi.fn().mockResolvedValue([]),
      objectExists: vi.fn().mockResolvedValue(false),
      now: () => new Date("2026-09-23T00:00:00.000Z"),
    } as never)

    await queue.reconcileLegacyMedia()

    expect(await db.query("SELECT status, path FROM media_upload_jobs WHERE id = ?", ["stranded-photo"])).toEqual([
      { status: "pending", path: "org/collections/c/stranded.jpg" },
    ])
    expect(await db.query("SELECT uploaded_at FROM collection_photo WHERE id = ?", ["stranded-photo"])).toEqual([
      { uploaded_at: "2025-01-01T00:00:00.000Z" },
    ])
    expect(await db.query("SELECT id FROM media_migrations WHERE id = ?", ["legacy-media-cache-v2"])).toEqual([
      { id: "legacy-media-cache-v2" },
    ])
  })
})
