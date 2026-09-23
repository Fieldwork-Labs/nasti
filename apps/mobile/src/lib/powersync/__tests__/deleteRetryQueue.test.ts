import { beforeEach, describe, expect, it, vi } from "vitest"
const { confirmMediaRowDeleteMock } = vi.hoisted(() => ({ confirmMediaRowDeleteMock: vi.fn() }))
vi.mock("../db", () => ({ powerSyncDb: {} }))
vi.mock("../attachments", () => ({ confirmMediaRowDelete: confirmMediaRowDeleteMock }))
import { deleteRowWithToken, RowDeleteRetryQueue } from "../deleteRetryQueue"
import {
  isQueueAuthBlocked,
  resetQueueAuthBlockedState,
} from "../queueAuthState"

function fakeDatabase(initial: Array<Record<string, unknown>> = []) {
  const jobs = new Map(initial.map((job) => [String(job.id), { ...job }]))
  const failures = new Set(initial.map((job) => String(job.id)))
  const writes: Array<{ sql: string; params: unknown[] }> = []
  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    writes.push({ sql, params })
    const [id] = params as [string]
    if (sql.includes("INSERT OR IGNORE INTO row_delete_retry_jobs")) {
      if (!jobs.has(id)) jobs.set(id, { id, target_table: params[1], entity_id: params[2], status: "pending", attempt_count: 0, next_attempt_at: params[3], created_at: params[4], last_error: null, notice_dismissed: 0, lease_expires_at: null })
    } else if (sql.startsWith("UPDATE row_delete_retry_jobs SET status = 'sending'")) {
      const job = jobs.get(String(params[1]))
      if (job) Object.assign(job, { status: "sending", lease_expires_at: params[0] })
    } else if (sql.startsWith("UPDATE row_delete_retry_jobs SET status = 'pending'")) {
      for (const job of jobs.values()) if (job.status === "sending" && (!job.lease_expires_at || String(job.lease_expires_at) <= String(params[1]))) Object.assign(job, { status: "pending", next_attempt_at: params[0], lease_expires_at: null })
    } else if (sql.startsWith("UPDATE row_delete_retry_jobs SET status =")) {
      const job = jobs.get(String(params[5]))
      if (job) Object.assign(job, { status: params[0], attempt_count: params[1], next_attempt_at: params[2], last_error: params[3], lease_expires_at: null, ...(params[4] === "failed" ? { notice_dismissed: 0 } : {}) })
    } else if (sql.startsWith("UPDATE row_delete_retry_jobs SET attempt_count")) {
      const job = jobs.get(String(params[3]))
      if (job) Object.assign(job, { attempt_count: params[0], next_attempt_at: params[1], last_error: params[2] })
    } else if (sql === "DELETE FROM row_delete_retry_jobs WHERE id = ?") jobs.delete(id)
    else if (sql.startsWith("UPDATE row_delete_retry_jobs SET notice_dismissed = 1")) {
      const job = jobs.get(id)
      if (job) job.notice_dismissed = 1
    }
    else if (sql === "DELETE FROM sync_failures WHERE id = ?") failures.delete(id)
    else if (sql.includes("UPDATE sync_failures SET retry_count")) { /* failure remains present */ }
  })
  const getAll = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("WHERE status = 'pending'")) {
      return [...jobs.values()].filter((job) => job.status === "pending" && (String(job.next_attempt_at) <= String(params[0]) || String(job.next_attempt_at) > String(params[1]))).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    }
    if (sql.includes("WHERE id = ? AND status = 'pending'")) {
      const job = jobs.get(String(params[0]))
      return job?.status === "pending" ? [{ id: job.id }] : []
    }
    return []
  })
  const db = {
    execute,
    getAll,
    writeTransaction: vi.fn(async (callback: (transaction: typeof db) => Promise<unknown>) => callback(db)),
    jobs, failures, writes,
  }
  return db
}

describe("durable row DELETE retries", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetQueueAuthBlockedState()
  })

  it("registers duplicate clicks as one local job without target row SQL", async () => {
    const db = fakeDatabase()
    const queue = new RowDeleteRetryQueue(db as never, vi.fn() as never, { acquire: vi.fn().mockResolvedValue(null) } as never, () => false)
    const failure = { id: "failure-1", target_table: "trip", entity_id: "trip-1" }
    await Promise.all([queue.enqueue(failure), queue.enqueue(failure)])
    expect(db.jobs.size).toBe(1)
    expect(db.writes.every(({ sql }) => sql.includes("row_delete_retry_jobs"))).toBe(true)
  })

  it("recovers in-flight jobs after restart and defers cleanly offline or without credentials", async () => {
    const db = fakeDatabase([{ id: "failure-1", target_table: "trip", entity_id: "trip-1", status: "sending", attempt_count: 1, next_attempt_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z", lease_expires_at: "2026-01-01T00:00:00.000Z" }])
    const queue = new RowDeleteRetryQueue(db as never, vi.fn() as never, { acquire: vi.fn().mockResolvedValue(null) } as never, () => false, () => new Date("2026-01-02T00:00:00.000Z"))
    await queue.recoverInFlight()
    expect(db.jobs.get("failure-1")?.status).toBe("pending")
    expect(await queue.processNext()).toBe(false)
    expect(db.jobs.get("failure-1")?.attempt_count).toBe(1)

    const onlineQueue = new RowDeleteRetryQueue(db as never, vi.fn() as never, { acquire: vi.fn().mockResolvedValue(null) } as never, () => true, () => new Date("2026-09-24T00:00:03.000Z"))
    expect(await onlineQueue.processNext()).toBe(true)
    expect(db.jobs.get("failure-1")?.status).toBe("pending")
    expect(db.jobs.get("failure-1")?.attempt_count).toBe(2)
    expect(isQueueAuthBlocked("deleteRetries")).toBe(true)
    onlineQueue.stop()
    expect(isQueueAuthBlocked("deleteRetries")).toBe(false)
  })

  it("does not reclaim a fresh sending lease from another tab", async () => {
    const db = fakeDatabase([{ id: "failure-1", target_table: "trip", entity_id: "trip-1", status: "sending", attempt_count: 1, next_attempt_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z", lease_expires_at: "2026-01-02T00:01:00.000Z" }])
    const queue = new RowDeleteRetryQueue(db as never, vi.fn() as never, { acquire: vi.fn().mockResolvedValue(null) } as never, () => true, () => new Date("2026-01-02T00:00:00.000Z"))
    await queue.recoverInFlight()
    expect(db.jobs.get("failure-1")?.status).toBe("sending")
  })

  it("binds the acquired exact token to an allowlisted direct DELETE request", async () => {
    const transport = vi.fn(async (_url: string, init: RequestInit) => init.method === "GET"
      ? new Response("[]", { status: 200 })
      : new Response(null, { status: 204 }))
    const db = fakeDatabase([{ id: "failure-1", target_table: "trip", entity_id: "trip-1", status: "pending", attempt_count: 0, next_attempt_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" }])
    const credentials = { acquire: vi.fn().mockResolvedValue({ accessToken: "fresh-live-token" }) }
    const queue = new RowDeleteRetryQueue(db as never, transport, credentials as never, () => true, () => new Date("2026-01-02T00:00:00.000Z"))
    await queue.processNext()
    const [url, init] = transport.mock.calls[0] as [string, RequestInit]
    expect(new URL(url).pathname).toBe("/rest/v1/trip")
    expect(new URL(url).searchParams.get("id")).toBe("eq.trip-1")
    expect(init.method).toBe("DELETE")
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer fresh-live-token")
    expect(init.body).toBeUndefined()
    expect(transport).toHaveBeenCalledTimes(2)
    expect(isQueueAuthBlocked("deleteRetries")).toBe(false)
  })

  it("aborts a stalled DELETE so the queue can retry later", async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      const transport = vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
        })
      })
      const pending = deleteRowWithToken("trip", "trip-1", "live-token", transport)
      const rejected = expect(pending).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(31_000)
      expect(signal?.aborted).toBe(true)
      await rejected
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps terminal failures visible and advances to a later job", async () => {
    const db = fakeDatabase([
      { id: "failure-1", target_table: "trip", entity_id: "trip-1", status: "pending", attempt_count: 0, next_attempt_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z", notice_dismissed: 1 },
      { id: "failure-2", target_table: "person", entity_id: "person-2", status: "pending", attempt_count: 0, next_attempt_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:01.000Z" },
    ])
    const transport = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 422 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
    const queue = new RowDeleteRetryQueue(db as never, transport, { acquire: vi.fn().mockResolvedValue({ accessToken: "live-token" }) } as never, () => true, () => new Date("2026-01-02T00:00:00.000Z"))
    await queue.processNext()
    expect(db.jobs.get("failure-1")?.status).toBe("failed")
    expect(db.jobs.get("failure-1")?.notice_dismissed).toBe(0)
    expect(db.failures.has("failure-1")).toBe(true)
    await queue.processNext()
    expect(db.jobs.has("failure-2")).toBe(false)
    expect(db.failures.has("failure-2")).toBe(false)
  })

  it("backs off an unconfirmed authorization failure without hiding the failure", async () => {
    const db = fakeDatabase([{ id: "failure-1", target_table: "trip", entity_id: "trip-1", status: "pending", attempt_count: 0, next_attempt_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" }])
    const transport = vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
    const acquired = { accessToken: "unconfirmed-token" }
    const credentials = { acquire: vi.fn().mockResolvedValue(acquired), confirm: vi.fn().mockResolvedValue(false) }
    const queue = new RowDeleteRetryQueue(db as never, transport, credentials as never, () => true, () => new Date("2026-01-02T00:00:00.000Z"))
    await queue.processNext()
    expect(new Headers((transport.mock.calls[0]?.[1] as RequestInit).headers).get("Authorization")).toBe("Bearer unconfirmed-token")
    expect(credentials.confirm).toHaveBeenCalledOnce()
    expect(credentials.confirm.mock.calls[0]?.[0]).toBe(acquired)
    expect(db.jobs.get("failure-1")?.status).toBe("pending")
    expect(db.failures.has("failure-1")).toBe(true)
    expect(db.jobs.get("failure-1")?.next_attempt_at).toBe("2026-01-02T00:00:02.000Z")
  })

  it("retries a foreign key conflict while keeping the issue visible", async () => {
    const db = fakeDatabase([{ id: "failure-1", target_table: "collection", entity_id: "collection-1", status: "pending", attempt_count: 0, next_attempt_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" }])
    const queue = new RowDeleteRetryQueue(
      db as never,
      vi.fn().mockResolvedValue(new Response(null, { status: 409 })),
      { acquire: vi.fn().mockResolvedValue({ accessToken: "live-token" }) } as never,
      () => true,
      () => new Date("2026-01-02T00:00:00.000Z"),
    )
    await queue.processNext()
    expect(db.jobs.get("failure-1")?.status).toBe("pending")
    expect(db.jobs.get("failure-1")?.attempt_count).toBe(1)
    expect(db.failures.has("failure-1")).toBe(true)
  })

  it("retries a job whose due time was stranded by a clock correction", async () => {
    const db = fakeDatabase([{ id: "clock-job", target_table: "trip", entity_id: "trip-1", status: "pending", attempt_count: 2, next_attempt_at: "2030-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" }])
    const transport = vi.fn(async (_url: string, init: RequestInit) => init.method === "GET"
      ? new Response("[]", { status: 200 })
      : new Response(null, { status: 204 }))
    const queue = new RowDeleteRetryQueue(
      db as never,
      transport,
      { acquire: vi.fn().mockResolvedValue({ accessToken: "live-token" }) } as never,
      () => true,
      () => new Date("2026-09-23T00:00:00.000Z"),
    )
    await queue.processNext()
    expect(transport).toHaveBeenCalledTimes(2)
    expect(db.jobs.has("clock-job")).toBe(false)
  })

  it("cleans job and failure together only after successful DELETE", async () => {
    const db = fakeDatabase([{ id: "failure-1", target_table: "trip", entity_id: "trip-1", status: "pending", attempt_count: 0, next_attempt_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" }])
    const transport = vi.fn(async (_url: string, init: RequestInit) => init.method === "GET"
      ? new Response("[]", { status: 200 })
      : new Response(null, { status: 204 }))
    const queue = new RowDeleteRetryQueue(db as never, transport, { acquire: vi.fn().mockResolvedValue({ accessToken: "live-token" }) } as never, () => true, () => new Date("2026-01-02T00:00:00.000Z"))
    await queue.processNext()
    expect(db.jobs.has("failure-1")).toBe(false)
    expect(db.failures.has("failure-1")).toBe(false)
    expect(db.writes.map(({ sql }) => sql).some((sql) => /(?:INSERT|UPDATE|DELETE FROM) trip\b/.test(sql))).toBe(false)
  })

  it("releases a media Storage delete only after retry confirms the row is absent", async () => {
    const db = fakeDatabase([{ id: "failure-1", target_table: "collection_photo", entity_id: "photo-1", status: "pending", attempt_count: 0, next_attempt_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" }])
    const transport = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }))
    const queue = new RowDeleteRetryQueue(db as never, transport, { acquire: vi.fn().mockResolvedValue({ accessToken: "live-token" }) } as never, () => true, () => new Date("2026-01-02T00:00:00.000Z"))
    await queue.processNext()
    expect(transport).toHaveBeenCalledTimes(2)
    expect((transport.mock.calls[1]?.[1] as RequestInit).method).toBe("GET")
    expect(confirmMediaRowDeleteMock).toHaveBeenCalledWith("collection_photo", "photo-1", db)
    expect(db.jobs.has("failure-1")).toBe(false)
  })

  it("keeps a media delete queued if the server row still exists", async () => {
    const db = fakeDatabase([{ id: "failure-1", target_table: "collection_photo", entity_id: "photo-1", status: "pending", attempt_count: 0, next_attempt_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" }])
    const transport = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('[{"id":"photo-1"}]', { status: 200, headers: { "Content-Type": "application/json" } }))
    const queue = new RowDeleteRetryQueue(db as never, transport, { acquire: vi.fn().mockResolvedValue({ accessToken: "live-token" }) } as never, () => true, () => new Date("2026-01-02T00:00:00.000Z"))
    await queue.processNext()
    expect(confirmMediaRowDeleteMock).not.toHaveBeenCalled()
    expect(db.jobs.get("failure-1")?.status).toBe("pending")
    expect(db.failures.has("failure-1")).toBe(true)
  })
})
