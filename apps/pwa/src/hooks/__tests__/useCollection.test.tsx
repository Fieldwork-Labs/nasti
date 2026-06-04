import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useCollection } from "../useCollection"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const collectionId = "a9b6d7f6-bf43-455b-a306-6050191e3637"
const tripId = "cd9aa864-3bae-43d9-af5a-2e635a5bd640"
const speciesId = "3ef49a8c-c020-4418-b3ef-9efbc9a80d57"

const mockCollection = {
  id: collectionId,
  species_id: speciesId,
  species_uncertain: 0,
  field_name: "",
  specimen_collected: 0,
  organisation_id: "33db6b9c-2920-4a36-b970-0d399d1f3a66",
  location: "0101000020E6100000798A691471F35C4037D5DD4FAE0940C0",
  created_by: "db47a359-4510-47db-8f0e-1a6cb8919af2",
  created_at: "2025-05-13T08:58:52.807+00:00",
  trip_id: tripId,
  description: "",
  amount_quantity: 0,
}

const mockSpecies = {
  id: speciesId,
  name: "Lenwebbia sp. Main Range (P.R.Sharpe+ 4877)",
  description: null,
  created_at: "2025-01-28T13:53:33.661023+00:00",
  ala_guid: "https://id.biodiversity.org.au/taxon/apni/51440239",
  indigenous_name: null,
  organisation_id: "33db6b9c-2920-4a36-b970-0d399d1f3a66",
}

const mockPhotos = [
  {
    id: "bbc7440d-011f-452b-8c98-a2984784ae43",
    collection_id: collectionId,
    url: "collection-photo.jpg",
    caption: null,
    uploaded_at: "2025-05-13T08:58:52.948996+00:00",
  },
]

const { powerSyncUseQueryMock } = vi.hoisted(() => ({
  powerSyncUseQueryMock: vi.fn(),
}))

vi.mock("@powersync/tanstack-react-query", () => ({
  useQuery: powerSyncUseQueryMock,
}))

vi.mock("../useSpeciesList", () => ({
  useSpeciesList: vi.fn(() => ({ data: [mockSpecies] })),
}))

vi.mock("../usePhotosForTrip", () => ({
  usePhotosForTrip: vi.fn(() => ({ data: mockPhotos })),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("useCollection hook", () => {
  it("returns a collection with photos and species when one exists", async () => {
    powerSyncUseQueryMock.mockReturnValue({
      data: [mockCollection],
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    })

    const { result } = renderHook(
      () => useCollection({ collectionId, tripId }),
      { wrapper: createWrapper() },
    )

    expect(result.current).toEqual(
      expect.objectContaining({
        id: collectionId,
        species_id: speciesId,
        species: mockSpecies,
        photos: mockPhotos,
      }),
    )
  })
})
