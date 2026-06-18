import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useCollectionCreate } from "../useCollectionCreate"
import type { Collection } from "@nasti/common/types"
import { getMutationKey } from "../useEntityCreate"

const { psInsertMock } = vi.hoisted(() => ({
  psInsertMock: vi.fn(),
}))

vi.mock("@/lib/powersync/crud", () => {
  return { psInsert: psInsertMock }
})

const mockCollection = {
  id: "someId",
  species_id: "3ef49a8c-c020-4418-b3ef-9efbc9a80d57",
  species_uncertain: false,
  field_name: "",
  specimen_collected: false,
  organisation_id: "33db6b9c-2920-4a36-b970-0d399d1f3a66",
  location: "0101000020E6100000798A691471F35C4037D5DD4FAE0940C0",
  created_by: "db47a359-4510-47db-8f0e-1a6cb8919af2",
  collected_by: "db47a359-4510-47db-8f0e-1a6cb8919af2",
  created_at: "2025-05-13T08:58:52.807+00:00",
  trip_id: "trip123",
  description: "",
  amount_description: "0",
}

describe("useCollectionCreate · mutateAsync", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    psInsertMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    // Clear mocks between tests
    vi.clearAllMocks()
  })

  it("mutateAsync should insert a new Collection locally and return it", async () => {
    const tripId = mockCollection.trip_id
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCollectionCreate({ tripId }), {
      wrapper,
    })

    let returned: Collection | undefined
    await act(async () => {
      returned = await result.current.mutateAsync(mockCollection)
    })

    expect(returned).toEqual(mockCollection)
    expect(psInsertMock).toHaveBeenCalledWith("collection", mockCollection)
  })

  it("mutateAsync should surface PowerSync insert errors", async () => {
    const error = new Error("insert failed")
    psInsertMock.mockRejectedValueOnce(error)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(
      () => useCollectionCreate({ tripId: mockCollection.trip_id }),
      {
        wrapper,
      },
    )

    let thrown: Error | undefined
    await act(async () => {
      try {
        await result.current.mutateAsync(mockCollection)
      } catch (err) {
        thrown = err as Error
      }
    })

    expect(thrown).toBe(error)
  })
})

describe("getMutationKey", () => {
  it('returns ["createCollection", tripId] when tripId is provided', () => {
    const tripId = "abc123"
    const key = getMutationKey("collection", tripId)
    expect(Array.isArray(key)).toBe(true)
    expect(key).toEqual(["create_collection", "abc123"])
  })

  it('still returns ["create_collection", undefined] if tripId is undefined', () => {
    // Although our hook always passes a string, we guard against misuse:
    const key = getMutationKey("collection", undefined)
    expect(key).toEqual(["create_collection", undefined])
  })
})
