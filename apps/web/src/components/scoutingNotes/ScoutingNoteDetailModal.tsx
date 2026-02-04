import { useCallback, useMemo, useState } from "react"
import { Modal } from "@nasti/ui/modal"
import Map, { Marker } from "react-map-gl"
import mapboxgl from "mapbox-gl"
import { parsePostGISPoint } from "@nasti/common/utils"
import { ScoutingNote } from "@nasti/common/types"
import { SpeciesListItem } from "@/routes/_private/species"
import { PencilIcon, ShoppingBag, TrashIcon } from "lucide-react"
import { usePeople } from "@/hooks/usePeople"
import { Button } from "@nasti/ui/button"
import { Badge } from "@nasti/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"

import useUserStore from "@/store/userStore"
import { UpdateScoutingNoteWizardModal } from "./ScoutingNoteFormModal"
import { useOpenClose, useToast } from "@nasti/ui/hooks"
import {
  useScoutingNotePhotos,
  ScoutingNotePhotoSignedUrl,
} from "@/hooks/useScoutingNotePhotos"
import { ScoutingNotePhotoCard } from "./ScoutingNotePhotoCard"
import { useDeleteScoutingNote } from "@/hooks/useUpdateScoutingNote"
import { Link, useLocation } from "@tanstack/react-router"
import { useTripDetail } from "@/hooks/useTripDetail"
import { Dialog, DialogContent, DialogTitle } from "@nasti/ui/dialog"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@nasti/ui/carousel"

const PhotosTab = ({
  photos,
  onClickPhoto,
}: {
  photos: ScoutingNotePhotoSignedUrl[]
  onClickPhoto?: (photo: ScoutingNotePhotoSignedUrl) => void
}) => {
  if (!photos || photos.length === 0)
    return (
      <p className="py-4 text-center text-gray-500">
        No photos added yet. Upload some photos to get started.
      </p>
    )
  return (
    <div className="space-y-4">
      <div className="grid max-h-96 grid-cols-2 gap-4 overflow-scroll lg:grid-cols-3">
        {photos.map((photo) => (
          <ScoutingNotePhotoCard
            key={photo.id}
            photo={photo}
            onClickPhoto={onClickPhoto}
          />
        ))}
      </div>
    </div>
  )
}

export const ScoutingNoteDetailModal = ({
  scoutingNote,
  open,
  onClose,
}: {
  scoutingNote?: ScoutingNote
  open: boolean
  onClose: () => void
}) => {
  const { isAdmin } = useUserStore()
  const { pathname } = useLocation()
  // Parse location coordinates
  const coordinates = useMemo(() => {
    if (!scoutingNote?.location) return null
    return parsePostGISPoint(scoutingNote.location)
  }, [scoutingNote])

  const [viewState, setViewState] = useState({
    longitude: coordinates?.longitude || 124,
    latitude: coordinates?.latitude || -28,
    zoom: 8,
  })

  const {
    open: openUpdateModal,
    isOpen: isOpenUpdateModal,
    close: closeUpdateModal,
  } = useOpenClose()
  const {
    open: openDeleteModal,
    isOpen: isOpenDeleteModal,
    close: closeDeleteModal,
  } = useOpenClose()

  const { mutateAsync: deleteScoutingNote, isPending: isPendingDelete } =
    useDeleteScoutingNote()
  const { toast } = useToast()

  const handleDelete = useCallback(async () => {
    if (!scoutingNote) return
    await deleteScoutingNote(scoutingNote.id)
    closeDeleteModal()
    close()
    toast({ description: "Scouting Note deleted successfully." })
  }, [closeDeleteModal, deleteScoutingNote, toast, scoutingNote])

  const [modalImage, setModalImage] = useState<number>()

  const { data: trip } = useTripDetail(scoutingNote?.trip_id ?? undefined)

  const { photos } = useScoutingNotePhotos(scoutingNote?.id)
  const handleClickPhoto = useCallback(
    (photo: ScoutingNotePhotoSignedUrl) => {
      const index = photos?.findIndex((p) => p.id === photo.id)
      if (index !== undefined) setModalImage(index)
    },
    [setModalImage, photos],
  )

  const { data: people } = usePeople()
  const creator = people?.find(
    (person) => person.id === scoutingNote?.created_by,
  )

  const EditButtons = () => (
    <span className="inline-flex space-x-2">
      <Button
        size={"icon"}
        onClick={openUpdateModal}
        title="Edit ScoutingNote"
        className="bg-transparent"
      >
        <PencilIcon className="h-4 w-4 text-white" />
      </Button>
      <Button
        size={"icon"}
        onClick={openDeleteModal}
        title="Delete ScoutingNote"
        className="bg-transparent"
        variant={"destructive"}
      >
        <TrashIcon className="h-4 w-4" />
      </Button>
    </span>
  )
  if (!scoutingNote) return null

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onClose}
        title={
          <div className="flex justify-between">
            <span>Scouting Note</span>
            {isAdmin && <EditButtons />}
          </div>
        }
      >
        <div className="space-y-4">
          {/* Species Info */}
          {scoutingNote.species_id && (
            <div>
              <div className="text-lead mb-1">Species</div>
              <SpeciesListItem id={scoutingNote.species_id} />
            </div>
          )}
          {!scoutingNote.species_id && scoutingNote.field_name && (
            <div>
              <div className="text-lead mb-1">Species unknown</div>
              <div className="text-sm">Field Name:</div>
              <div>{scoutingNote.field_name}</div>
            </div>
          )}
          <Tabs defaultValue="details">
            <TabsList className="bg-secondary-background grid w-full grid-cols-2">
              <TabsTrigger value="details">Details</TabsTrigger>
              {photos?.length && photos.length > 0 && (
                <TabsTrigger value="photos">Photos</TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="details">
              <div className="space-y-2">
                <div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-muted-foreground h-min text-left align-middle font-medium">
                          Trip
                        </th>
                        <th className="text-muted-foreground h-min text-left align-middle font-medium">
                          Recorded at
                        </th>
                        <th className="text-muted-foreground h-min text-left align-middle font-medium">
                          Recorded by
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="h-min align-middle">
                          {trip && (
                            <>
                              {pathname !== `/trips/${scoutingNote.trip_id}` &&
                                scoutingNote.trip_id && (
                                  <Link
                                    to={`/trips/$id`}
                                    params={{ id: scoutingNote.trip_id }}
                                    className="underline"
                                  >
                                    {trip.name}
                                  </Link>
                                )}
                              {pathname ===
                                `/trips/${scoutingNote.trip_id}` && (
                                <Button
                                  className="bg-transparent p-0 text-xs underline hover:bg-transparent"
                                  onClick={onClose}
                                >
                                  <span>{trip.name}</span>
                                </Button>
                              )}
                            </>
                          )}
                        </td>
                        <td className="h-min align-middle">
                          {new Date(scoutingNote.created_at).toLocaleString()}
                        </td>
                        <td className="h-min align-middle">
                          {creator?.name || "Unknown Person"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <div className="flex gap-2">
                    {scoutingNote.species_uncertain ? (
                      <Badge variant={"secondary"}>ID uncertain</Badge>
                    ) : (
                      <Badge>ID certain</Badge>
                    )}
                    {scoutingNote.specimen_collected && (
                      <Badge>Specimen Collected</Badge>
                    )}
                  </div>
                </div>
                {scoutingNote.description && (
                  <div>
                    <div className="text-lead mb-1">Description</div>
                    <div className="bg-secondary-background rounded-sm p-1 text-sm">
                      {scoutingNote.description}
                    </div>
                  </div>
                )}
                {/* Map */}
                {coordinates && (
                  <div className="h-[300px] w-full">
                    <Map
                      mapLib={mapboxgl as never}
                      mapboxAccessToken={
                        import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
                      }
                      mapStyle="mapbox://styles/mapbox/satellite-v9"
                      {...viewState}
                      onMove={(evt) => setViewState(evt.viewState)}
                      style={{ width: "100%", height: "100%" }}
                    >
                      <Marker
                        longitude={coordinates.longitude}
                        latitude={coordinates.latitude}
                      >
                        <div className="rounded-full bg-white/50 p-2">
                          <ShoppingBag className="text-primary h-5 w-5" />
                        </div>
                      </Marker>
                    </Map>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="photos">
              <PhotosTab
                photos={photos ?? []}
                onClickPhoto={handleClickPhoto}
              />
            </TabsContent>
          </Tabs>
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </Modal>
      {isOpenUpdateModal && (
        <UpdateScoutingNoteWizardModal
          instance={scoutingNote}
          open={isOpenUpdateModal}
          close={closeUpdateModal}
        />
      )}
      {isOpenDeleteModal && (
        <Modal
          open={Boolean(isOpenDeleteModal)}
          title={`Delete ScoutingNote`}
          onCancel={closeDeleteModal}
          onSubmit={handleDelete}
          isPending={isPendingDelete}
          allowSubmit={!isPendingDelete}
        >
          This action cannot be undone. This will permanently delete the
          scoutingNote.
        </Modal>
      )}
      {
        <Dialog
          open={modalImage !== undefined}
          onOpenChange={(isOpen) => (!isOpen ? setModalImage(undefined) : null)}
        >
          <DialogContent className="lg:min-w-[720px]">
            {/* DialogTitle required for screenreaders */}
            <DialogTitle hidden>Species Image</DialogTitle>
            <Carousel opts={{ startIndex: modalImage }} className="pt-4">
              <CarouselContent>
                {photos?.map((img) => (
                  <CarouselItem key={img.url} className="my-auto h-full p-0">
                    <div className="relative flex h-full w-full flex-col gap-1 text-center">
                      <img
                        src={`${img.signedUrl}`}
                        className="max-h-[564px] w-full object-contain"
                      />
                      <div>
                        {img.caption && (
                          <span>
                            <span className="text-secondary">
                              {img.caption}
                            </span>{" "}
                            ·
                          </span>
                        )}{" "}
                        {img.uploaded_at && (
                          <span className="text-sm">
                            {new Date(img.uploaded_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </DialogContent>
        </Dialog>
      }
    </>
  )
}
