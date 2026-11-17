import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import {
  dehydrate,
  hydrate,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import type { ReactNode } from "react"
import { supabase } from "@nasti/common/supabase"
import { useOrgMembers } from "@/hooks/useOrgMembers"
import { useAuth } from "@/hooks/useAuth"
import {
  fetchOrgMembers,
  ORG_MEMBERS_QUERY_KEY,
  orgMembersQueryKey,
} from "@/lib/orgMembers"
import {
  discardLegacyOrgMembersCache,
  PERSIST_KEY,
  PERSISTED_CACHE_MAX_AGE_MS,
  persistQueryCacheNow,
  purgeOrgMembersCache,
  queryClient as appQueryClient,
  shouldPersistQuery,
} from "@/lib/queryClient"
import { OFFLINE_ACCESS_MS } from "@/lib/offlineAuth"

vi.mock("@nasti/common/supabase", () => ({
  supabase: { rpc: vi.fn() },
}))
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }))

const roster = [{ id: "member-1", name: "Ada" }]
const rpcResult = (value: unknown) =>
  value as Awaited<ReturnType<typeof supabase.rpc>>

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  client = new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "offlineFirst",
        staleTime: Infinity,
        retry: false,
        gcTime: Infinity,
      },
      dehydrate: { shouldDehydrateQuery: shouldPersistQuery },
    },
  })
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "user-1" },
  } as ReturnType<typeof useAuth>)
})

afterEach(() => {
  cleanup()
  client.clear()
})

describe("persisted cache lifetime", () => {
  it("lasts as long as offline sign-in rather than the 24-hour default", () => {
    expect(PERSISTED_CACHE_MAX_AGE_MS).toBe(OFFLINE_ACCESS_MS)
    expect(PERSISTED_CACHE_MAX_AGE_MS).toBeGreaterThan(24 * 60 * 60 * 1_000)
  })

  it("never evicts queries from memory", () => {
    expect(appQueryClient.getDefaultOptions().queries?.gcTime).toBe(Infinity)
  })
})

describe("fetchOrgMembers", () => {
  it("throws on an RPC error instead of resolving with an empty result", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue(
      rpcResult({ data: null, error: new Error("Failed to fetch") }),
    )
    await expect(fetchOrgMembers()).rejects.toThrow("Failed to fetch")
  })
})

describe("useOrgMembers", () => {
  it("caches the roster per account", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue(
      rpcResult({ data: roster, error: null }),
    )
    const { result } = renderHook(useOrgMembers, { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(roster))
    expect(client.getQueryData(orgMembersQueryKey("user-1"))).toEqual(roster)
  })

  it("waits for a user before fetching", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as ReturnType<
      typeof useAuth
    >)
    const { result } = renderHook(useOrgMembers, { wrapper })
    expect(result.current.isLoading).toBe(false)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it("keeps the last roster when a refresh fails offline", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce(
      rpcResult({ data: roster, error: null }),
    )
    const { result } = renderHook(useOrgMembers, { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(roster))

    vi.mocked(supabase.rpc).mockResolvedValueOnce(
      rpcResult({ data: null, error: new Error("Failed to fetch") }),
    )
    await client.refetchQueries({ queryKey: ORG_MEMBERS_QUERY_KEY })
    const state = client.getQueryState(orgMembersQueryKey("user-1"))
    expect(state?.status).toBe("error")
    expect(state?.data).toEqual(roster)
    expect(result.current.data).toEqual(roster)
  })
})

describe("roster persistence", () => {
  it("persists a roster whose latest refresh failed, and restores it", async () => {
    const key = orgMembersQueryKey("user-1")
    vi.mocked(supabase.rpc).mockResolvedValueOnce(
      rpcResult({ data: roster, error: null }),
    )
    await client.fetchQuery({ queryKey: key, queryFn: fetchOrgMembers })
    vi.mocked(supabase.rpc).mockResolvedValueOnce(
      rpcResult({ data: null, error: new Error("Failed to fetch") }),
    )
    await client
      .fetchQuery({ queryKey: key, queryFn: fetchOrgMembers, staleTime: 0 })
      .catch(() => undefined)
    expect(client.getQueryState(key)?.status).toBe("error")

    const restored = new QueryClient()
    hydrate(restored, JSON.parse(JSON.stringify(dehydrate(client))))
    expect(restored.getQueryData(key)).toEqual(roster)
  })

  it("purges every account's roster from memory and storage at once", () => {
    client.setQueryData(orgMembersQueryKey("user-1"), roster)
    client.setQueryData(orgMembersQueryKey("user-2"), roster)
    client.setQueryData(["other"], "kept")
    persistQueryCacheNow(client)
    expect(window.localStorage.getItem(PERSIST_KEY)).toContain("member-1")

    purgeOrgMembersCache(client)

    expect(client.getQueryData(orgMembersQueryKey("user-1"))).toBeUndefined()
    expect(client.getQueryData(orgMembersQueryKey("user-2"))).toBeUndefined()
    expect(client.getQueryData(["other"])).toBe("kept")
    const persisted = window.localStorage.getItem(PERSIST_KEY) ?? ""
    expect(persisted).not.toContain("member-1")
    expect(persisted).toContain("kept")
  })

  it("discards only the legacy unscoped roster", () => {
    client.setQueryData(ORG_MEMBERS_QUERY_KEY, { data: roster, error: null })
    client.setQueryData(orgMembersQueryKey("user-1"), roster)
    discardLegacyOrgMembersCache(client)
    expect(client.getQueryData(ORG_MEMBERS_QUERY_KEY)).toBeUndefined()
    expect(client.getQueryData(orgMembersQueryKey("user-1"))).toEqual(roster)
  })
})
