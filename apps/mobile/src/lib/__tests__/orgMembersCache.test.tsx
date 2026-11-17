import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { deleteDB, openDB } from "idb"
import type { ReactNode } from "react"
import { supabase } from "@nasti/common/supabase"
import { useOrgMembers } from "@/hooks/useOrgMembers"
import { useAuth } from "@/hooks/useAuth"
import { fetchOrgMembers, orgMembersQueryKey } from "@/lib/orgMembers"
import { getOrgMembersCache } from "@/lib/orgMembersCache"
import {
  LEGACY_QUERY_CACHE_KEY,
  ROSTER_DB,
  readRosterGate,
  restoreRoster,
  saveRoster,
} from "@/lib/orgMembersStorage"
import { OFFLINE_ACCESS_MS } from "@/lib/offlineAuth"

vi.mock("@nasti/common/supabase", () => ({
  supabase: { rpc: vi.fn() },
}))
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }))

const roster = [{ id: "member-1", name: "Ada" }]
const userId = "user-1"
const key = orgMembersQueryKey(userId)
const rpcResult = (value: unknown) =>
  value as Awaited<ReturnType<typeof supabase.rpc>>

const tabs: Array<() => void> = []
function openTab(account = userId) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  const cache = getOrgMembersCache(client)
  const close = cache.start()
  tabs.push(() => {
    close()
    client.clear()
  })
  cache.setAccount(account)

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, cache, wrapper }
}

async function readRoster(account = userId) {
  const db = await openDB(ROSTER_DB, 1)
  try {
    return await db.get("rosters", account)
  } finally {
    db.close()
  }
}

const legacyEntry = (
  queryKey: readonly unknown[],
  data: unknown,
  dataUpdatedAt: number,
) => ({
  queryKey,
  state: { status: "success", data, dataUpdatedAt },
})
function seedLegacy(queries: unknown[], timestamp = Date.now()) {
  window.localStorage.setItem(
    LEGACY_QUERY_CACHE_KEY,
    JSON.stringify({
      buster: "",
      timestamp,
      clientState: { queries },
    }),
  )
}

beforeEach(async () => {
  vi.resetAllMocks()
  window.localStorage.clear()
  await deleteDB(ROSTER_DB)
  vi.mocked(useAuth).mockReturnValue({ user: { id: userId } } as ReturnType<
    typeof useAuth
  >)
  vi.mocked(supabase.rpc).mockResolvedValue(
    rpcResult({
      data: null,
      error: new Error("Offline"),
    }),
  )
})

afterEach(() => {
  cleanup()
  tabs.splice(0).forEach((close) => close())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("retains the last successful roster and its freshness on a multi-day offline restart", async () => {
  const { client, wrapper } = openTab()
  vi.mocked(supabase.rpc).mockResolvedValueOnce(
    rpcResult({
      data: [{ ...roster[0], email: "ada@example.com", role: "Admin" }],
      error: null,
    }),
  )
  const { result, unmount } = renderHook(useOrgMembers, { wrapper })
  await waitFor(() => expect(result.current.data).toEqual(roster))
  const updatedAt = client.getQueryState(key)?.dataUpdatedAt

  client.setQueryData(["auth", "state"], { access_token: "secret" })
  client.setQueryData(["sync", "status"], { errors: 0 })
  client.setQueryData(["species", "photo"], { base64: "photo" })
  await act(async () => {
    await client.refetchQueries({ queryKey: key })
  })
  await waitFor(() => expect(result.current.status).toBe("error"))
  expect(result.current.data).toEqual(roster)
  await waitFor(async () =>
    expect(await readRoster()).toMatchObject({
      data: roster,
      dataUpdatedAt: updatedAt,
    }),
  )
  const db = await openDB(ROSTER_DB, 1)
  expect(await db.getAllKeys("rosters")).toEqual([userId])
  db.close()
  unmount()

  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3 * 24 * 60 * 60 * 1_000)
  const cold = openTab()
  const relaunched = renderHook(useOrgMembers, { wrapper: cold.wrapper })
  await waitFor(() => expect(relaunched.result.current.status).toBe("error"))
  expect(relaunched.result.current.data).toEqual(roster)
  expect(cold.client.getQueryState(key)?.dataUpdatedAt).toBe(updatedAt)
})

it("does not restore another account's roster", async () => {
  const first = openTab()
  await waitFor(() => expect(first.cache.isReady(userId)).toBe(true))
  vi.mocked(supabase.rpc).mockResolvedValueOnce(
    rpcResult({ data: roster, error: null }),
  )
  await first.client.fetchQuery({ queryKey: key, queryFn: fetchOrgMembers })
  await waitFor(async () => expect(await readRoster()).toBeDefined())

  vi.mocked(useAuth).mockReturnValue({ user: { id: "user-2" } } as ReturnType<
    typeof useAuth
  >)
  const second = openTab("user-2")
  const { result } = renderHook(useOrgMembers, { wrapper: second.wrapper })
  await waitFor(() => expect(result.current.status).toBe("error"))
  expect(result.current.data).toBeUndefined()
  expect(second.client.getQueryData(key)).toBeUndefined()
})

it("saves a successful empty roster", async () => {
  vi.mocked(supabase.rpc).mockResolvedValueOnce(
    rpcResult({ data: [], error: null }),
  )
  const tab = openTab()
  const { result } = renderHook(useOrgMembers, { wrapper: tab.wrapper })
  await waitFor(() => expect(result.current.data).toEqual([]))
  await waitFor(async () =>
    expect(await readRoster()).toMatchObject({ data: [] }),
  )
})

describe("legacy migration", () => {
  it("imports the last good scoped roster independently of malformed siblings", async () => {
    const now = Date.now()
    seedLegacy(
      [
        {
          queryKey: ["sync", "status"],
          promise: {},
          state: { status: "pending" },
        },
        legacyEntry(key, [{ id: "invalid" }], now),
        legacyEntry(["people", "list"], [{ id: "old", name: "Unscoped" }], now),
        legacyEntry(orgMembersQueryKey("user-2"), roster, now),
        {
          ...legacyEntry(key, [{ id: "pending", name: "Pending" }], now),
          promise: {},
        },
        {
          ...legacyEntry(key, roster, now - 1_000),
          state: { data: roster, status: "error", dataUpdatedAt: now - 1_000 },
        },
      ],
      now,
    )

    const tab = openTab()
    const { result } = renderHook(useOrgMembers, { wrapper: tab.wrapper })
    await waitFor(() => expect(result.current.data).toEqual(roster))
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(await readRoster()).toEqual({
      data: roster,
      dataUpdatedAt: now - 1_000,
      cachedAt: now,
    })
    expect(await readRoster("user-2")).toBeUndefined()
    expect(window.localStorage.getItem(LEGACY_QUERY_CACHE_KEY)).toBeNull()
  })

  it.each(["malformed", "expired", "unscoped"])(
    "treats a %s snapshot as a miss",
    async (scenario) => {
      const expired = Date.now() - OFFLINE_ACCESS_MS - 1
      if (scenario === "malformed")
        window.localStorage.setItem(LEGACY_QUERY_CACHE_KEY, "{")
      else if (scenario === "expired")
        seedLegacy([legacyEntry(key, roster, expired)], expired)
      else seedLegacy([legacyEntry(["people", "list"], roster, Date.now())])

      const tab = openTab()
      await waitFor(() => expect(tab.cache.isReady(userId)).toBe(true))
      expect(tab.client.getQueryData(key)).toBeUndefined()
      expect(await readRoster()).toBeUndefined()
    },
  )

  it("leaves the legacy source intact if the transaction aborts after a write request succeeds", async () => {
    const gate = await readRosterGate()
    seedLegacy([legacyEntry(key, roster, Date.now())])
    const put = IDBObjectStore.prototype.put
    const abort = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (this: IDBObjectStore, ...args) {
        const request = put.apply(this, args)
        if (this.name === "state")
          request.addEventListener("success", () => this.transaction.abort())
        return request
      })
    await expect(restoreRoster(userId, gate.revision)).rejects.toBeDefined()
    expect(await readRoster()).toBeUndefined()
    expect(window.localStorage.getItem(LEGACY_QUERY_CACHE_KEY)).not.toBeNull()

    abort.mockRestore()
    const tab = openTab()
    await waitFor(() => expect(tab.client.getQueryData(key)).toEqual(roster))
    expect(window.localStorage.getItem(LEGACY_QUERY_CACHE_KEY)).toBeNull()
  })

  it("preserves newer IndexedDB data and only retries cleanup after migration commits", async () => {
    const gate = await readRosterGate()
    const now = Date.now()
    const newer = { data: [], dataUpdatedAt: now - 1_000, cachedAt: now }
    await saveRoster(userId, gate.revision, newer)
    seedLegacy([legacyEntry(key, roster, now - 2_000)], now)
    const remove = vi
      .mocked(window.localStorage.removeItem)
      .mockImplementationOnce(() => {
        throw new Error("Storage unavailable")
      })

    expect(await restoreRoster(userId, gate.revision)).toEqual({
      record: newer,
    })
    expect(window.localStorage.getItem(LEGACY_QUERY_CACHE_KEY)).not.toBeNull()
    seedLegacy([legacyEntry(key, roster, now)], now)
    expect(await restoreRoster(userId, gate.revision)).toEqual({
      record: newer,
    })
    expect(window.localStorage.getItem(LEGACY_QUERY_CACHE_KEY)).toBeNull()
    expect(remove).toHaveBeenCalledTimes(2)
  })
})

describe("logout revision", () => {
  it("clears open tabs, ignores late fetches and rejects queued writes even after the same user signs in", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce(
      rpcResult({ data: roster, error: null }),
    )
    const first = openTab()
    const { result } = renderHook(useOrgMembers, { wrapper: first.wrapper })
    await waitFor(() => expect(result.current.data).toEqual(roster))
    await waitFor(async () => expect(await readRoster()).toBeDefined())
    const second = openTab()
    const other = renderHook(useOrgMembers, { wrapper: second.wrapper })
    await waitFor(() => expect(other.result.current.data).toEqual(roster))
    const before = await readRosterGate()

    let release!: (value: ReturnType<typeof rpcResult>) => void
    vi.mocked(supabase.rpc).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    let refresh!: Promise<void>
    act(() => {
      refresh = second.client.refetchQueries({ queryKey: key })
    })
    expect(release).toBeDefined()

    await act(async () => {
      await first.cache.purge()
    })
    expect(await readRoster()).toBeUndefined()
    await waitFor(() => expect(other.result.current.data).toBeUndefined())
    await act(async () => {
      release(rpcResult({ data: roster, error: null }))
      await refresh
    })
    expect(second.client.getQueryData(key)).toBeUndefined()

    // A pre-upgrade tab can leave the legacy key behind after cleanup.
    const now = Date.now()
    const staleRecord = { data: roster, dataUpdatedAt: now, cachedAt: now }
    seedLegacy([legacyEntry(key, roster, now)], now)
    const revoked = await readRosterGate()
    expect(revoked.revoked).toBe(true)
    expect(await restoreRoster(userId, before.revision)).toBeNull()
    expect(await restoreRoster(userId, revoked.revision)).toBeNull()
    expect(await saveRoster(userId, before.revision, staleRecord)).toBe(false)

    const cold = openTab()
    cold.cache.authorize(revoked)
    cold.cache.setAccount(userId)
    await waitFor(() => expect(cold.cache.isReady(userId)).toBe(true))
    expect(cold.client.getQueryData(key)).toBeUndefined()
    expect(await saveRoster(userId, before.revision, staleRecord)).toBe(false)
    vi.mocked(supabase.rpc).mockResolvedValueOnce(
      rpcResult({ data: roster, error: null }),
    )
    await cold.client.fetchQuery({ queryKey: key, queryFn: fetchOrgMembers })
    await waitFor(async () =>
      expect(await readRoster()).toMatchObject({ data: roster }),
    )
  })

  it("checks the revision on focus if the tab missed the logout notification", async () => {
    vi.stubGlobal("BroadcastChannel", undefined)
    seedLegacy([legacyEntry(key, roster, Date.now())])
    const first = openTab()
    const second = openTab()
    const { result } = renderHook(useOrgMembers, { wrapper: second.wrapper })
    await waitFor(() => expect(result.current.data).toEqual(roster))
    await first.cache.purge()
    window.dispatchEvent(new Event("focus"))
    await waitFor(() => expect(result.current.data).toBeUndefined())
  })

  it("ignores a restore that was already reading the roster when logout began", async () => {
    const gate = await readRosterGate()
    const now = Date.now()
    await saveRoster(userId, gate.revision, {
      data: roster,
      dataUpdatedAt: now,
      cachedAt: now,
    })
    const get = IDBObjectStore.prototype.get
    let logout: Promise<void> | undefined
    const read = vi
      .spyOn(IDBObjectStore.prototype, "get")
      .mockImplementation(function (this: IDBObjectStore, ...args) {
        const request = get.apply(this, args)
        if (this.name === "rosters") {
          request.addEventListener("success", () => {
            read.mockRestore()
            logout = tab.cache.purge()
          })
        }
        return request
      })
    const tab = openTab()
    const hydrate = vi.spyOn(tab.client, "setQueryData")
    await waitFor(() => expect(logout).toBeDefined())
    await logout
    expect(hydrate).not.toHaveBeenCalled()
    expect(await readRoster()).toBeUndefined()
  })

  it("continues serving live results if IndexedDB cannot open", async () => {
    vi.spyOn(IDBFactory.prototype, "open").mockImplementation(() => {
      throw new Error("Storage unavailable")
    })
    vi.mocked(supabase.rpc).mockResolvedValueOnce(
      rpcResult({ data: roster, error: null }),
    )
    const tab = openTab()
    const { result } = renderHook(useOrgMembers, { wrapper: tab.wrapper })
    await waitFor(() => expect(result.current.data).toEqual(roster))
  })
})
