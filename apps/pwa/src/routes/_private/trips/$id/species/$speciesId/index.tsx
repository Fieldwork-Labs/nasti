import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { ChevronLeft, ImageIcon, PlusCircle, XIcon } from "lucide-react"
import { Spinner } from "@nasti/ui/spinner"
import { useHydrateTripDetails } from "@/hooks/useHydrateTripDetails"
import { useState, useEffect } from "react"
import { ButtonLink } from "@nasti/ui/button-link"
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch"
import { useSpeciesList } from "@/hooks/useSpeciesList"

const SpeciesDetail = () => {
  const { id: tripId, speciesId } = useParams({
    from: "/_private/trips/$id/species/$speciesId/",
  })
  const navigate = useNavigate()
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(
    null,
  )

  const { data: tripData, isFetching } = useHydrateTripDetails({ id: tripId })

  // Get species from species list (offline-safe)
  const { data: speciesList } = useSpeciesList()
  const species = speciesList?.find((s) => s.id === speciesId)
  const speciesPhotos = tripData?.speciesPhotosMap?.[speciesId] || []
  const primaryPhoto = speciesPhotos[0]

  const handleBackClick = () => {
    navigate({ to: "/trips/$id", params: { id: tripId } })
  }

  const openFullscreen = (index: number) => {
    setSelectedPhotoIndex(index)
  }

  const closeFullscreen = () => {
    setSelectedPhotoIndex(null)
  }

  if (isFetching || !tripData) {
    return (
      <div className="px-auto mx-auto mt-36 flex flex-col items-center text-center">
        <Spinner size={"xl"} />
        <span className="text-2xl">Loading Trip Data</span>
      </div>
    )
  }

  if (!species) {
    return (
      <div className="px-auto mx-auto mt-36 flex flex-col items-center text-center">
        <span className="text-2xl text-orange-600/80">Species not found</span>
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden">
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center text-2xl">
          <ChevronLeft onClick={handleBackClick} width={36} height={36} />
          <h1 className="truncate font-semibold">{species.name}</h1>
        </div>
      </div>

      <div className="flex h-[calc(100vh-140px)] flex-col overflow-y-auto p-4">
        {species.indigenous_name && (
          <div className="mb-4">
            <span className="text-lg italic text-gray-600">
              {species.indigenous_name}
            </span>
          </div>
        )}

        <div className="mb-6">
          <h2 className="mb-4 text-xl font-bold">Profile Photos</h2>
          {speciesPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
              <ImageIcon className="mb-2 h-12 w-12 text-gray-400" />
              <p className="text-gray-500">
                No profile photos available offline
              </p>
            </div>
          ) : (
            <>
              <div
                onClick={() => openFullscreen(0)}
                className="relative w-full cursor-pointer rounded-lg"
              >
                <SpeciesPhotoImage
                  photoId={primaryPhoto.id}
                  caption={primaryPhoto.caption}
                />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {speciesPhotos.slice(1).map((photo, index) => (
                  <div
                    key={photo.id}
                    onClick={() => openFullscreen(index)}
                    className="relative aspect-square cursor-pointer overflow-hidden rounded-lg"
                  >
                    <SpeciesPhotoImage
                      photoId={photo.id}
                      caption={photo.caption}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="fixed bottom-4 right-4">
        <ButtonLink
          to="/trips/$id/collections/new"
          params={{ id: tripId }}
          search={{ speciesId }}
          className="fab from-secondary to-primary z-50 flex items-center justify-center bg-gradient-to-br"
        >
          <PlusCircle width={42} height={42} />
        </ButtonLink>
      </div>

      {selectedPhotoIndex !== null && (
        <FullscreenPhotoViewer
          photos={speciesPhotos}
          currentIndex={selectedPhotoIndex}
          onClose={closeFullscreen}
          onNext={() =>
            setSelectedPhotoIndex((prev) =>
              prev !== null && prev < speciesPhotos.length - 1
                ? prev + 1
                : prev,
            )
          }
          onPrevious={() =>
            setSelectedPhotoIndex((prev) =>
              prev !== null && prev > 0 ? prev - 1 : prev,
            )
          }
        />
      )}
    </div>
  )
}

// Component to load species photo from IndexedDB
const SpeciesPhotoImage = ({
  photoId,
  caption,
}: {
  photoId: string
  caption: string | null
}) => {
  const [imageData, setImageData] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadImage = async () => {
      try {
        const { getImage } = await import("@/lib/persistFiles")
        const image = await getImage(photoId)
        if (image) {
          setImageData(image.image)
        }
      } catch (error) {
        console.error("Error loading image from IndexedDB:", error)
      } finally {
        setLoading(false)
      }
    }
    loadImage()
  }, [photoId])

  return (
    <>
      {loading ? (
        <div className="flex h-full w-full items-center justify-center bg-gray-100">
          <Spinner className="h-8 w-8" />
        </div>
      ) : imageData ? (
        <TransformWrapper>
          <TransformComponent wrapperClass="overflow-visible">
            <img
              src={imageData}
              alt={caption || "Species photo"}
              className="h-full w-full object-cover"
            />
          </TransformComponent>
        </TransformWrapper>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gray-100">
          <ImageIcon className="h-8 w-8 text-gray-400" />
        </div>
      )}
      {caption && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
          <p className="truncate text-xs text-white">{caption}</p>
        </div>
      )}
    </>
  )
}

// Fullscreen photo viewer component
const FullscreenPhotoViewer = ({
  photos,
  currentIndex,
  onClose,
  onNext,
  onPrevious,
}: {
  photos: Array<{ id: string; caption: string | null }>
  currentIndex: number
  onClose: () => void
  onNext: () => void
  onPrevious: () => void
}) => {
  const currentPhoto = photos[currentIndex]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-gray-400/30 p-2 text-white backdrop-blur-sm"
      >
        <XIcon className="h-6 w-6" />
      </button>

      {currentIndex > 0 && (
        <button
          onClick={onPrevious}
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-gray-400/30 p-2 text-white backdrop-blur-sm"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}

      <div className="flex h-full w-full items-center justify-center">
        <SpeciesPhotoImage
          photoId={currentPhoto.id}
          caption={currentPhoto.caption}
        />
      </div>

      {currentIndex < photos.length - 1 && (
        <button
          onClick={onNext}
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-gray-400/30 p-2 text-white backdrop-blur-sm"
        >
          <ChevronLeft className="h-8 w-8 rotate-180" />
        </button>
      )}

      {currentPhoto.caption && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-4 text-center">
          <p className="text-white">{currentPhoto.caption}</p>
        </div>
      )}

      <div className="absolute bottom-20 left-0 right-0 text-center text-white">
        {currentIndex + 1} / {photos.length}
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_private/trips/$id/species/$speciesId/")(
  {
    component: SpeciesDetail,
    pendingComponent: () => (
      <div className="px-auto mx-auto mt-36">
        <Spinner size={"xl"} />
      </div>
    ),
  },
)
