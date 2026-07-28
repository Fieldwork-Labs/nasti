import { useMemo, useState } from "react"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@nasti/ui/carousel"
import { Dialog, DialogContent, DialogTitle } from "@nasti/ui/dialog"
import { Skeleton } from "@nasti/ui/skeleton"

import {
  type BatchCleaningPhotoSignedUrl,
  type CleaningPhotoStage,
  useBatchCleaningPhotos,
} from "@/hooks/useBatchCleaningPhotos"
import { useBatchHistory } from "@/hooks/useBatches"

const stageLabels: Record<CleaningPhotoStage, string> = {
  before: "Before cleaning",
  after: "After cleaning",
}

const getCleaningId = (
  event:
    | {
        creation_event: string | null
        event_details: unknown
      }
    | null
    | undefined,
) => {
  if (
    event?.creation_event !== "cleaning" ||
    !event.event_details ||
    typeof event.event_details !== "object" ||
    Array.isArray(event.event_details)
  ) {
    return undefined
  }

  const cleaningId = (event.event_details as Record<string, unknown>)
    .batch_cleaning_id

  return typeof cleaningId === "string" ? cleaningId : undefined
}

const PhotoThumbnail = ({
  photo,
  index,
  onOpen,
}: {
  photo: BatchCleaningPhotoSignedUrl
  index: number
  onOpen: (index: number) => void
}) => (
  <button
    type="button"
    className="focus-visible:ring-ring group h-16 w-16 cursor-zoom-in overflow-hidden rounded-md border bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    aria-label={`Open ${stageLabels[photo.stage].toLowerCase()} photo ${index + 1}`}
    onClick={() => onOpen(index)}
  >
    <img
      src={photo.signedUrl}
      alt=""
      className="h-full w-full object-cover transition-transform group-hover:scale-105"
    />
  </button>
)

const CleaningPhotoViewer = ({
  photos,
  selectedIndex,
  onClose,
}: {
  photos: BatchCleaningPhotoSignedUrl[]
  selectedIndex: number
  onClose: () => void
}) => (
  <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
    <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl">
      <DialogTitle>Cleaning photos</DialogTitle>
      <Carousel
        opts={{ startIndex: selectedIndex }}
        className="mx-8"
        aria-label="Cleaning photo gallery"
      >
        <CarouselContent>
          {photos.map((photo, index) => (
            <CarouselItem key={photo.id}>
              <figure className="flex flex-col items-center gap-3">
                <img
                  src={photo.signedUrl}
                  alt={`${stageLabels[photo.stage]} photo ${index + 1} of ${photos.length}`}
                  className="max-h-[75vh] w-full rounded-md object-contain"
                />
                <figcaption className="text-muted-foreground text-center text-sm">
                  <span className="text-foreground font-medium">
                    {stageLabels[photo.stage]}
                  </span>
                  {photo.caption && <> · {photo.caption}</>}
                  {photo.uploaded_at && (
                    <> · {new Date(photo.uploaded_at).toLocaleString()}</>
                  )}
                  <span className="ml-2">
                    {index + 1} of {photos.length}
                  </span>
                </figcaption>
              </figure>
            </CarouselItem>
          ))}
        </CarouselContent>
        {photos.length > 1 && (
          <>
            <CarouselPrevious />
            <CarouselNext />
          </>
        )}
      </Carousel>
    </DialogContent>
  </Dialog>
)

export const BatchCleaningPhotos = ({ batchId }: { batchId: string }) => {
  const [selectedIndex, setSelectedIndex] = useState<number>()
  const { data: history, isLoading: isHistoryLoading } =
    useBatchHistory(batchId)
  const cleaningId = getCleaningId(history)
  const {
    data: photos = [],
    isLoading: arePhotosLoading,
    isError,
  } = useBatchCleaningPhotos(cleaningId)

  const photosByStage = useMemo(
    () => ({
      before: photos.filter((photo) => photo.stage === "before"),
      after: photos.filter((photo) => photo.stage === "after"),
    }),
    [photos],
  )

  if (isHistoryLoading) return null
  if (!cleaningId) return null

  if (arePhotosLoading) {
    return (
      <div className="col-span-full space-y-2">
        <span className="font-medium">Cleaning photos</span>
        <div className="flex gap-2">
          <Skeleton className="h-16 w-16" />
          <Skeleton className="h-16 w-16" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="text-destructive col-span-full text-xs">
        Cleaning photos could not be loaded.
      </div>
    )
  }

  if (photos.length === 0) return null

  return (
    <>
      <div className="col-span-full space-y-2">
        <span className="font-medium">Cleaning photos</span>
        <div className="flex flex-wrap gap-4">
          {(["before", "after"] as const).map((stage) => {
            const stagePhotos = photosByStage[stage]
            if (stagePhotos.length === 0) return null

            return (
              <div key={stage} className="space-y-1">
                <div className="text-muted-foreground text-xs">
                  {stageLabels[stage]}
                </div>
                <div className="flex flex-wrap gap-2">
                  {stagePhotos.map((photo) => (
                    <PhotoThumbnail
                      key={photo.id}
                      photo={photo}
                      index={photos.indexOf(photo)}
                      onOpen={setSelectedIndex}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selectedIndex !== undefined && (
        <CleaningPhotoViewer
          photos={photos}
          selectedIndex={selectedIndex}
          onClose={() => setSelectedIndex(undefined)}
        />
      )}
    </>
  )
}
