import type { Collection } from "@nasti/common/types"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, afterEach, vi } from "vitest"
import { parseLocation } from "../useTripDetails/helpers"

const mockTrip = {
  error: null,
  data: {
    id: "cd9aa864-3bae-43d9-af5a-2e635a5bd640",
    organisation_id: "33db6b9c-2920-4a36-b970-0d399d1f3a66",
    name: "Test trip",
    metadata: null,
    start_date: "2025-01-08",
    end_date: "2025-01-22",
    created_at: "2025-01-13T06:21:32.971891+00:00",
    created_by: "db47a359-4510-47db-8f0e-1a6cb8919af2",
    location_coordinate: "0101000020E61000003048FAB48A785D404DA088450C8341C0",
    location_name: "Albany",
  },
  count: null,
  status: 200,
  statusText: "OK",
}
const mockTripSpecies = {
  error: null,
  data: [
    {
      id: "7880cc25-e407-4309-baf0-3bc4e44cee39",
      trip_id: "cd9aa864-3bae-43d9-af5a-2e635a5bd640",
      species_id: "1b31f525-3397-434f-82e6-73ad2e6b9ac3",
    },
    {
      id: "807331e3-2955-4a02-8a68-0b022be6ea07",
      trip_id: "cd9aa864-3bae-43d9-af5a-2e635a5bd640",
      species_id: "3ef49a8c-c020-4418-b3ef-9efbc9a80d57",
    },
    {
      id: "4f7bd4cf-10a3-4404-bc4b-aeb756e91b52",
      trip_id: "cd9aa864-3bae-43d9-af5a-2e635a5bd640",
      species_id: "a1f7381f-efed-4c9e-ac8a-84f29f1a61ea",
    },
  ],
  count: null,
  status: 200,
  statusText: "OK",
}

const mockTripMembers = {
  error: null,
  data: [
    {
      id: "16bd784b-4eae-4c3e-9cd3-ac7643abff3d",
      trip_id: "cd9aa864-3bae-43d9-af5a-2e635a5bd640",
      user_id: "94765611-1f91-4164-8b61-9a5bcce7b4c1",
      role: "Member",
      joined_at: "2025-01-28T08:46:19+00:00",
    },
    {
      id: "8a70a2b4-ed97-4258-ba77-88ee883f9063",
      trip_id: "cd9aa864-3bae-43d9-af5a-2e635a5bd640",
      user_id: "db47a359-4510-47db-8f0e-1a6cb8919af2",
      role: "Member",
      joined_at: "2025-01-28T08:46:19+00:00",
    },
  ],
  count: null,
  status: 200,
  statusText: "OK",
}

const mockTripCollections = {
  error: null,
  data: [
    {
      id: "a9b6d7f6-bf43-455b-a306-6050191e3637",
      species_id: "3ef49a8c-c020-4418-b3ef-9efbc9a80d57",
      species_uncertain: false,
      field_name: "",
      specimen_collected: false,
      organisation_id: "33db6b9c-2920-4a36-b970-0d399d1f3a66",
      location: "0101000020E6100000798A691471F35C4037D5DD4FAE0940C0",
      created_by: "db47a359-4510-47db-8f0e-1a6cb8919af2",
      created_at: "2025-05-13T08:58:52.807+00:00",
      trip_id: "cd9aa864-3bae-43d9-af5a-2e635a5bd640",
      description: "",
      weight_estimate_kg: 0,
      plants_sampled_estimate: 0,
    },
    {
      id: "random-collection-id-1",
      species_id: "3ef49a8c-c020-4418-b3ef-9efbc9a80d57",
      species_uncertain: false,
      field_name: "",
      specimen_collected: false,
      organisation_id: "33db6b9c-2920-4a36-b970-0d399d1f3a66",
      location: "0101000020E6100000798A691471F35C4037D5DD4FAE0940C0",
      created_by: "db47a359-4510-47db-8f0e-1a6cb8919af2",
      created_at: "2025-05-13T08:58:52.807+00:00",
      trip_id: "cd9aa864-3bae-43d9-af5a-2e635a5bd640",
      description: "",
      weight_estimate_kg: 0,
      plants_sampled_estimate: 0,
    },
  ],
  count: null,
  status: 200,
  statusText: "OK",
}

const getUseTripDetailsExpected = () => {
  const collectionsWithCoord = (mockTripCollections.data as Collection[]).map(
    parseLocation,
  )

  return {
    ...mockTrip.data,
    collections: collectionsWithCoord,
    species: mockTripSpecies.data,
    members: mockTripMembers.data,
  }
}

describe("useTripDetailsQuery", () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    vi.resetModules()
    // Create a fresh QueryClient for each test, disabling retries so that errors bubble immediately
    const { queryClient: importedQueryClient } = await import(
      "@/lib/queryClient"
    )
    queryClient = importedQueryClient

    vi.mock(import("../useTripDetails/helpers"), async (getOriginal) => {
      type Original = typeof import("../useTripDetails/helpers")
      type Return<T extends keyof Original> = ReturnType<Original[T]>
      const original = await getOriginal<Original>()

      return {
        ...original,
        getTrip: vi.fn(() => {
          console.log("calling mocked getTrip")
          return Promise.resolve(mockTrip) as unknown as Return<"getTrip">
        }),
        getTripSpecies: vi.fn(
          () =>
            Promise.resolve(
              mockTripSpecies,
            ) as unknown as Return<"getTripSpecies">,
        ),
        getTripMembers: vi.fn(
          () =>
            Promise.resolve(
              mockTripMembers,
            ) as unknown as Return<"getTripMembers">,
        ),
        getTripCollections: vi.fn(
          () =>
            Promise.resolve(
              mockTripCollections,
            ) as unknown as Return<"getTripCollections">,
        ),
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns a query result with the expected structure", async () => {
    const tripId = mockTrip.data.id
    const { useTripDetails } = await import("../useTripDetails")

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () =>
        useTripDetails({
          tripId,
        }),
      { wrapper },
    )

    const expected = getUseTripDetailsExpected()

    await waitFor(() => {
      expect(result.current.data).toEqual(expected)
    })
  })
})
