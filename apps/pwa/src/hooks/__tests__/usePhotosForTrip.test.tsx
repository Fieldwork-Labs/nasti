// __tests__/usePhotosForTrip.test.tsx
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { usePhotosForTrip } from "../usePhotosForTrip"
import type { CollectionPhoto } from "@nasti/common/types"

type CollectionPhotoWithCollection = CollectionPhoto & {
  collection: {
    id: string
    trip_id: string
  }
}

// ── OUTSIDE: Define the expected array (duplicate of what the factory will return) ─────────
const expectedPhotos: CollectionPhotoWithCollection[] = [
  {
    id: "photo1",
    caption: "A leaf",
    collection_id: "col1",
    uploaded_at: "2025-05-13T10:00:00.000+00:00",
    url: "public/image1.jpg",
    collection: {
      id: "col1",
      trip_id: "trip123",
    },
  },
  {
    id: "photo2",
    caption: "Another leaf",
    collection_id: "col2",
    uploaded_at: "2025-05-13T11:00:00.000+00:00",
    url: "public/image2.jpg",
    collection: {
      id: "col2",
      trip_id: "trip123",
    },
  },
]

const { powerSyncUseQueryMock } = vi.hoisted(() => ({
  powerSyncUseQueryMock: vi.fn(),
}))

vi.mock("@powersync/tanstack-react-query", () => ({
  useQuery: powerSyncUseQueryMock,
}))

vi.mock("@nasti/common/supabase", () => {
  const createSignedUrlsFn = vi.fn(() =>
    Promise.resolve({ data: [], error: null }),
  )
  const storageFromFn = vi.fn(() => ({ createSignedUrls: createSignedUrlsFn }))
  const storage = { from: storageFromFn }

  return {
    supabase: {
      storage,
    },
  }
})

// ── Mock getImage / putImage so that no photos are “missing” ─────────────────────────────
vi.mock("@/lib/persistFiles", () => {
  return {
    getImage: vi.fn(() => Promise.resolve("already-present-base64")), // always “found”
    putImage: vi.fn(() => Promise.resolve()), // should never be called
  }
})

describe("usePhotosForTrip", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    powerSyncUseQueryMock.mockReturnValue({
      data: expectedPhotos,
      isSuccess: true,
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    })
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns the PowerSync data array when all images are already cached locally", async () => {
    const tripId = "trip123"

    // Wrap the hook in a QueryClientProvider
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    // Render the hook
    const { result } = renderHook(
      () => usePhotosForTrip({ entityType: "collection", tripId }),
      { wrapper },
    )

    // Wait until it finishes loading
    await waitFor(() => {
      if (!result.current.isSuccess) {
        throw new Error("Still loading")
      }
    })

    expect(powerSyncUseQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["photos", "collection", "byTrip", tripId],
      }),
    )
    expect(result.current.data).toEqual(expectedPhotos)

    const { getImage, putImage } = await import("@/lib/persistFiles")
    expect(getImage).toHaveBeenCalledTimes(expectedPhotos.length)

    const { supabase: supa } = await import("@nasti/common/supabase")
    expect(supa.storage.from).not.toHaveBeenCalled()
    expect(putImage).not.toHaveBeenCalled()
  })

  it("fetches signed URLs and calls putImage for missing photos", async () => {
    const tripId = "trip123"

    // ── Step A: Override getImage so that it returns null for every photo (all missing) ────
    const persist = await import("@/lib/persistFiles")
    ;(persist.getImage as Mock).mockImplementation(() => Promise.resolve(null))
    // putImage is already a vi.fn() from the top-level mock

    // ── Step B: Override supabase.storage.from("collection-photos").createSignedUrls(...) ───
    const { supabase } = await import("@nasti/common/supabase")
    // Let’s prepare two fake signed URLs—one for each photo’s original `url`.
    const fakeSignedUrls = [
      { signedUrl: "https://example.com/fake1.jpg" },
      { signedUrl: "https://example.com/fake2.jpg" },
    ]
    ;(supabase.storage.from as Mock).mockImplementation(() => ({
      createSignedUrls: vi.fn((keys: string[], ttl: number) => {
        // Ensure keys match the original `url` fields
        expect(keys).toEqual(["public/image1.jpg", "public/image2.jpg"])
        expect(ttl).toBe(60 * 10)
        return Promise.resolve({ data: fakeSignedUrls, error: null })
      }),
    }))

    // ── Step C: Stub `fetch` + `FileReader` so imageUrlToBase64 resolves to “data:fake” ─────
    // 1) Stub global.fetch(...) to return an object whose blob() → dummy Blob
    const dummyBlob = new Blob(["dummy"], { type: "image/jpeg" })
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          blob: () => Promise.resolve(dummyBlob),
        }),
      ),
    )

    // 2) Stub FileReader so that readAsDataURL(...) immediately invokes onload and sets result
    class MockFileReader {
      result: string = "data:fake"
      onload: ((this: FileReader) => void) | null = null
      readAsDataURL(_blob: Blob) {
        // Directly call onload synchronously
        this.onload?.call(this as any)
      }
    }
    vi.stubGlobal("FileReader", MockFileReader)

    // ── Step D: Render the hook as before ───────────────────────────────────────────────
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => usePhotosForTrip({ entityType: "collection", tripId }),
      { wrapper },
    )

    // ── Step E: Wait for the query to succeed ───────────────────────────────────────────
    await waitFor(() => {
      if (!result.current.isSuccess) throw new Error("Still loading")
    })

    // ── Step F: Assertions ─────────────────────────────────────────────────────────────

    // 1) The returned data must still match expectedPhotos (the hook returns PowerSync data)
    expect(result.current.data).toEqual(expectedPhotos)

    // 2) Because getImage returned null, the hook should have called storage.createSignedUrls(...)
    //    and then putImage(...) for each missing photo.
    expect(supabase.storage.from).toHaveBeenCalledWith("collection-photos")

    // We already checked inside our mockImplementation that createSignedUrls received
    // the correct keys and TTL. Let’s check that putImage was called twice, with id & dataURL:
    const { putImage } = await import("@/lib/persistFiles")
    expect(putImage).toHaveBeenCalledTimes(expectedPhotos.length)
    expect(putImage).toHaveBeenNthCalledWith(1, "photo1", "data:fake")
    expect(putImage).toHaveBeenNthCalledWith(2, "photo2", "data:fake")

    // 3) Verify that fetch was called with each fake signedUrl
    const fetchSpy = global.fetch as Mock
    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/fake1.jpg")
    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/fake2.jpg")

  })
})
