import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useCollectionUpdate } from "../useCollectionUpdate"
import type { Collection } from "@nasti/common/types"

const { psUpdateMock } = vi.hoisted(() => ({
  psUpdateMock: vi.fn(),
}))

vi.mock("@/lib/powersync/crud", () => {
  return { psUpdate: psUpdateMock }
})

const mockCollection = {
  id: "someId",
  code: "someCode",
  species_id: "3ef49a8c-c020-4418-b3ef-9efbc9a80d57",
  species_uncertain: false,
  field_name: "Old Field Name",
  specimen_collected: false,
  organisation_id: "33db6b9c-2920-4a36-b970-0d399d1f3a66",
  location: "0101000020E6100000798A691471F35C4037D5DD4FAE0940C0",
  created_by: "db47a359-4510-47db-8f0e-1a6cb8919af2",
  created_at: "2025-05-13T08:58:52.807+00:00",
  trip_id: "trip123",
  description: "",
  amount_description: "0",
}

const field_name = "Updated Field Name"
const mockUpdatedCollection = {
  ...mockCollection,
  field_name,
}

describe("useCollectionUpdate · mutateAsync", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    psUpdateMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    // Clear mocks between tests
    vi.clearAllMocks()
  })

  it("mutateAsync should update a Collection locally and return it", async () => {
    const tripId = mockCollection.trip_id
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCollectionUpdate({ tripId }), {
      wrapper,
    })

    let returned: Collection | undefined
    await act(async () => {
      returned = await result.current.mutateAsync(mockUpdatedCollection)
    })

    expect(returned).toEqual(mockUpdatedCollection)
    expect(psUpdateMock).toHaveBeenCalledWith(
      "collection",
      mockUpdatedCollection.id,
      mockUpdatedCollection,
    )
  })

  it("mutateAsync should surface PowerSync update errors", async () => {
    const error = new Error("update failed")
    psUpdateMock.mockRejectedValueOnce(error)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(
      () => useCollectionUpdate({ tripId: mockCollection.trip_id }),
      {
        wrapper,
      },
    )

    let thrown: Error | undefined
    await act(async () => {
      try {
        await result.current.mutateAsync(mockUpdatedCollection)
      } catch (err) {
        thrown = err as Error
      }
    })

    expect(thrown).toBe(error)
  })
})
