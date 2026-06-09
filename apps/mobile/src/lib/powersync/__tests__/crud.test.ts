import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Transaction } from "@powersync/web"
import { psDelete, psInsert, psUpdate } from "../crud"

const { executeMock, invalidateQueriesMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
}))

vi.mock("../db", () => ({
  powerSyncDb: {
    execute: executeMock,
  },
}))

vi.mock("../query", () => ({
  powerSyncQueryClient: {
    invalidateQueries: invalidateQueriesMock,
  },
}))

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}))

describe("PowerSync CRUD helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executeMock.mockResolvedValue(undefined)
    invalidateQueriesMock.mockResolvedValue(undefined)
  })

  it("invalidates PowerSync queries after standalone inserts", async () => {
    await psInsert("collection", { id: "collection-1", trip_id: "trip-1" })

    expect(executeMock).toHaveBeenCalledOnce()
    expect(invalidateQueriesMock).toHaveBeenCalledOnce()
  })

  it("does not invalidate per insert when a transaction is supplied", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
    }

    await psInsert("collection", { id: "collection-1" }, tx as unknown as Transaction)

    expect(tx.execute).toHaveBeenCalledOnce()
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })

  it("invalidates PowerSync queries after standalone updates and deletes", async () => {
    await psUpdate("collection", "collection-1", { field_name: "Updated" })
    await psDelete("collection", "collection-1")

    expect(invalidateQueriesMock).toHaveBeenCalledTimes(2)
  })
})
