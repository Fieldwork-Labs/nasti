import { renderHook } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useCollection } from "../useCollection"

const collectionId = "a9b6d7f6-bf43-455b-a306-6050191e3637"
const tripId = "cd9aa864-3bae-43d9-af5a-2e635a5bd640"
const mockTripDetails = {
  data: {
    trip: {
      id: tripId,
      organisation_id: "33db6b9c-2920-4a36-b970-0d399d1f3a66",
      name: "Test trip",
      metadata: null,
      start_date: "2025-01-08",
      end_date: "2025-01-22",
      created_at: "2025-01-13T06:21:32.971891+00:00",
      created_by: "db47a359-4510-47db-8f0e-1a6cb8919af2",
      location_coordinate: "0101000020E61000003048FAB48A785D404DA088450C8341C0",
      location_name: "Albany",
      species: [
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
      members: [
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
      collections: [
        {
          id: collectionId,
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
          locationCoord: {
            latitude: -32.075632079426605,
            longitude: 115.80377683932046,
          },
          photos: [
            {
              id: "bbc7440d-011f-452b-8c98-a2984784ae43",
              collection_id: "a9b6d7f6-bf43-455b-a306-6050191e3637",
              url: "33db6b9c-2920-4a36-b970-0d399d1f3a66/collections/a9b6d7f6-bf43-455b-a306-6050191e3637/bbc7440d-011f-452b-8c98-a2984784ae43.jpg",
              caption: null,
              uploaded_at: "2025-05-13T08:58:52.948996+00:00",
              collection: {
                id: "a9b6d7f6-bf43-455b-a306-6050191e3637",
                trip_id: "cd9aa864-3bae-43d9-af5a-2e635a5bd640",
              },
            },
            {
              id: "698a4c39-2c83-4236-9c03-2b746171a01d",
              collection_id: "a9b6d7f6-bf43-455b-a306-6050191e3637",
              url: "33db6b9c-2920-4a36-b970-0d399d1f3a66/collections/a9b6d7f6-bf43-455b-a306-6050191e3637/698a4c39-2c83-4236-9c03-2b746171a01d.jpg",
              caption: null,
              uploaded_at: "2025-05-13T08:58:52.94516+00:00",
              collection: {
                id: "a9b6d7f6-bf43-455b-a306-6050191e3637",
                trip_id: "cd9aa864-3bae-43d9-af5a-2e635a5bd640",
              },
            },
          ],
        },
      ],
    },
    species: [
      {
        id: "3ef49a8c-c020-4418-b3ef-9efbc9a80d57",
        name: "Lenwebbia sp. Main Range (P.R.Sharpe+ 4877)",
        description: null,
        created_at: "2025-01-28T13:53:33.661023+00:00",
        ala_guid: "https://id.biodiversity.org.au/taxon/apni/51440239",
        indigenous_name: null,
        organisation_id: "33db6b9c-2920-4a36-b970-0d399d1f3a66",
      },
    ],
    people: [
      {
        id: "94765611-1f91-4164-8b61-9a5bcce7b4c1",
        email: "someone@fieldworklabs.xyz",
        name: "Test Person",
        organisation_id: "33db6b9c-2920-4a36-b970-0d399d1f3a66",
        joined_at: "2025-01-28T06:04:11.909341+00:00",
        role: "Member",
        is_active: false,
      },
      {
        id: "db47a359-4510-47db-8f0e-1a6cb8919af2",
        email: "test@example.com",
        name: null,
        organisation_id: "33db6b9c-2920-4a36-b970-0d399d1f3a66",
        joined_at: "2025-01-13T03:49:07.868709+00:00",
        role: "Admin",
        is_active: true,
      },
    ],
  },
  isFetching: false,
  isPending: false,
  isError: false,
  isRefetching: false,
}

vi.mock("../useHydrateTripDetails", () => ({
  useHydrateTripDetails: vi.fn(() => mockTripDetails),
}))

describe("useAuth hook", () => {
  beforeEach(() => {
    // Clear any previous spies/mocks on supabase
    vi.restoreAllMocks()
  })

  it("returns a collection with species when one exists", async () => {
    const { result } = renderHook(() => useCollection({ collectionId, tripId }))
    const expectedCollection = mockTripDetails.data.trip?.collections.find(
      (c) => c.id === collectionId,
    )
    const expected = {
      ...expectedCollection,
      species:
        mockTripDetails.data.species?.find(
          (s) => s.id === expectedCollection?.species_id,
        ) ?? {},
    }
    expect(result.current).toEqual(expected)
  })
})
