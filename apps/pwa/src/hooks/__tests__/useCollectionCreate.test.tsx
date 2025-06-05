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
import { useCollectionCreate } from "../useCollectionCreate"
import type { Collection } from "@nasti/common/types"
import { getMutationKey } from "../useCollectionCreate"
import { parsePostGISPoint } from "@nasti/common/utils"

vi.mock("@nasti/common/supabase", () => {
  // Create a mock that matches how createCollection(...) is called:
  const singleFn = vi.fn(() =>
    Promise.resolve({ data: mockCollection, error: null }),
  )
  const selectFn = vi.fn(() => ({ single: singleFn }))
  const insertFn = vi.fn(() => ({ select: selectFn }))
  const fromFn = vi.fn(() => ({ insert: insertFn }))

  return {
    supabase: {
      from: fromFn,
    },
  }
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
  created_at: "2025-05-13T08:58:52.807+00:00",
  trip_id: "trip123",
  description: "",
  weight_estimate_kg: 0,
  plants_sampled_estimate: 0,
}

const mockTrip = {
  created_at: Date.now().toString(),
  created_by: "db47a359-4510-47db-8f0e-1a6cb8919af2",
  end_date: null,
  id: "trip123",
  location_coordinate: null,
  location_name: "test location",
  metadata: {},
  name: "test trip",
  organisation_id: "orgId-123",
  start_date: null,
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

  it("mutateAsync should insert a new Collection and return it (and call supabase.from/insert)", async () => {
    // 1. Seed "trip details" so onMutate doesn’t throw:
    const tripId = mockCollection.trip_id
    queryClient.setQueryData(["trip", "details", tripId], {
      ...mockTrip,
      collections: [],
    })

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
    const { result } = renderHook(() => useCollectionCreate({ tripId }), {
      wrapper,
    })

    // 4. Act: call mutateAsync:
    let returned: Collection | undefined
    await act(async () => {
      returned = await result.current.mutateAsync(mockCollection)
    })

    // 5. Assert: returned value must equal our mockCollection
    expect(returned).toEqual(mockCollection)

    // 6. Now that mutateAsync has run, supabase.from should have been called with "collection":
    expect(spyFrom).toHaveBeenCalledWith("collection")

    // 7. Next, ensure that the `insert(...)` method was called with our payload:
    //    Because our module mock defined: supabase.from() → { insert: insertFn },
    //    we can reach insertFn via `supabase.from().insert`.
    const insertMock = supabase.from("collection").insert as Mock
    expect(insertMock).toHaveBeenCalledWith(mockCollection)

    // 8. Finally, ensure that the querydata cache now contains the new collection
    const data = queryClient.getQueryData(["trip", "details", tripId])
    const expectedCollection = {
      ...returned,
      locationCoord: parsePostGISPoint(returned!.location!),
    }
    expect(data).toStrictEqual({
      ...mockTrip,
      collections: [expectedCollection],
    })
  })

  it("mutateAsync should throw an error if the tripId doesn't exist", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    // 3. Render the hook
    const { result } = renderHook(
      () => useCollectionCreate({ tripId: "nonsense" }),
      {
        wrapper,
      },
    )

    // 4. Act: Call mutateAsync(...) with our mockCollection
    let error: Error | undefined
    await act(async () => {
      try {
        await result.current.mutateAsync(mockCollection)
      } catch (err) {
        error = err as Error
      }
    })

    waitFor(() => {
      expect(error?.message).toEqual("Unknown trip")
    })
  })
})

describe("getMutationKey", () => {
  it('returns ["createCollection", tripId] when tripId is provided', () => {
    const tripId = "abc123"
    const key = getMutationKey(tripId)
    expect(Array.isArray(key)).toBe(true)
    expect(key).toEqual(["createCollection", "abc123"])
  })

  it('still returns ["createCollection", undefined] if tripId is undefined', () => {
    // Although our hook always passes a string, we guard against misuse:
    const key = getMutationKey(undefined)
    expect(key).toEqual(["createCollection", undefined])
  })
})
