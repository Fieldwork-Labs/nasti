import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useCollectionUpdate } from "../useCollectionUpdate"
import type { Collection } from "@nasti/common/types"
import { parsePostGISPoint } from "@nasti/common/utils"

vi.mock("@nasti/common/supabase", () => {
  // Create a mock that matches how supabase api is called in updateCollection(...):
  const overrideTypesFn = vi.fn(() =>
    Promise.resolve({ data: mockUpdatedCollection, error: null }),
  )
  const singleFn = vi.fn(() => ({ overrideTypes: overrideTypesFn }))
  const selectFn = vi.fn(() => ({ single: singleFn }))
  const eqFn = vi.fn(() => ({ select: selectFn }))
  const updateFn = vi.fn(() => ({ eq: eqFn }))
  const fromFn = vi.fn(() => ({ upsert: updateFn }))

  return {
    supabase: {
      from: fromFn,
    },
  }
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
  weight_estimate_kg: 0,
  plants_sampled_estimate: 0,
}

const field_name = "Updated Field Name"
const mockUpdatedCollection = {
  ...mockCollection,
  field_name,
}

describe("useCollectionCreate · mutateAsync", () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    // Create a fresh QueryClient for each test, disabling retries so that errors bubble immediately
    const { queryClient: importedQueryClient } = await import(
      "@/lib/queryClient"
    )
    queryClient = importedQueryClient
  })

  afterEach(() => {
    // Clear mocks between tests
    vi.clearAllMocks()
  })

  it("mutateAsync should update a Collection and return it (and call supabase.from/upsert)", async () => {
    // 1. Seed query cache so onMutate doesn’t throw:
    const tripId = mockCollection.trip_id
    queryClient.setQueryData(
      ["collections", "byTrip", tripId],
      [
        {
          ...mockCollection,
          locationCoord: parsePostGISPoint(mockCollection.location),
        },
      ],
    )

    // 2. Immediately grab and spy on `supabase.from` before invoking mutateAsync:
    const { supabase } = await import("@nasti/common/supabase")
    // At this point, supabase.from is the mock we defined above.
    const spyFrom = vi.spyOn(supabase, "from")
    // Because the module mock above already set supabase.from to a vi.fn(),
    // this spy will wrap that same mock function.

    // 3. Render our hook under a QueryClientProvider:
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCollectionUpdate({ tripId }), {
      wrapper,
    })

    // 4. Act: call mutateAsync:
    let returned: Collection | undefined
    await act(async () => {
      returned = await result.current.mutateAsync(mockUpdatedCollection)
    })

    // 5. Assert: returned value must equal our mockCollection
    expect(returned).toEqual(mockUpdatedCollection)

    // 6. Now that mutateAsync has run, supabase.from should have been called with "collection":
    expect(spyFrom).toHaveBeenCalledWith("collection")

    // 7. Next, ensure that the `upsert(...)` method was called with our payload:
    //    Because our module mock defined: supabase.from() → { upsert: upsertFn },
    //    we can reach upsertFn via `supabase.from().upsert`.
    const upsertMock = supabase.from("collection").upsert as Mock
    expect(upsertMock).toHaveBeenCalledWith(mockUpdatedCollection)

    // 8. Finally, ensure that the querydata cache now contains the new collection
    const collections = queryClient.getQueryData([
      "collections",
      "byTrip",
      tripId,
    ])
    const expectedUpdatedCollections = [
      {
        ...returned,
        locationCoord: parsePostGISPoint(returned!.location!),
      },
    ]
    expect(collections).toStrictEqual(expectedUpdatedCollections)
  })

  it("mutateAsync should throw an error if the tripId doesn't exist", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    // 3. Render the hook
    const { result } = renderHook(
      () => useCollectionUpdate({ tripId: "nonsense" }),
      {
        wrapper,
      },
    )

    // 4. Act: Call mutateAsync(...) with our mockUpdatedCollection
    let error: Error | undefined
    await act(async () => {
      try {
        await result.current.mutateAsync(mockUpdatedCollection)
      } catch (err) {
        error = err as Error
      }
    })

    waitFor(() => {
      expect(error?.message).toEqual("Unknown trip")
    })
  })
})
