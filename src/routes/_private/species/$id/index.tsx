import useOpenClose from "@/hooks/useOpenClose"
import { getSpecies } from "@/hooks/useSpecies"
import { queryClient } from "@/lib/utils"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { ArrowLeftIcon, MapPin, PencilIcon } from "lucide-react"
import mapboxgl from "mapbox-gl"
import { useCallback, useState } from "react"
import { Map, Marker } from "react-map-gl"

import {
  getTripCoordinates,
  tripWithLocationFilter,
} from "@/components/trips/utils"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { Modal } from "@/components/ui/modal"
import { useALAImage } from "@/hooks/useALAImage"
import { useALAImages } from "@/hooks/useALAImages"
import { useALAOccurrences } from "@/hooks/useALAOccurrences"
import { useSpeciesDetail } from "@/hooks/useALASpeciesDetail"
import { useTripsForSpecies } from "@/hooks/useTripsForSpecies"
import { useViewState } from "@/hooks/useViewState"
import { Species } from "@/types"
import { useSuspenseQuery } from "@tanstack/react-query"
import { SpeciesIndigNameForm } from "@/components/species/SpeciesIndigNameForm"

const getSpeciesQueryOptions = (id: string) => ({
  queryKey: ["species", id],
  queryFn: () => getSpecies(id),
  enabled: Boolean(id),
})

const useSpeciesImages = (alaGuid: string | null) => {
  const { data: alaData } = useSpeciesDetail(alaGuid)
  const { data: image } = useALAImage(alaData?.imageIdentifier)
  const [modalImage, setModalImage] = useState<number>()
  const { data: images } = useALAImages(alaGuid)
  const { open, isOpen, close } = useOpenClose()

  return {
    mainImage: image,
    images,
    allImages: image ? [image, ...images] : images,
    modalImage,
    setModalImage,
    open,
    isOpen,
    close,
  }
}

const useSpeciesDetailQuery = (id: string) => {
  const { data: instance } = useSuspenseQuery(getSpeciesQueryOptions(id))

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["species", id],
    })
  }, [id])

  return { invalidate, instance }
}

const SpeciesDetail = () => {
  const { id } = useParams({ from: "/_private/species/$id/" })
  const { instance, invalidate } = useSpeciesDetailQuery(id)
  const { data: alaData } = useSpeciesDetail(instance.ala_guid)

  const { data: trips } = useTripsForSpecies(instance?.id)
  const mapTrips = trips?.filter(tripWithLocationFilter) ?? []
  const initialViewState = useViewState(
    mapTrips
      .map(getTripCoordinates)
      .map(({ longitude, latitude }) => [longitude, latitude]),
  )
  const [viewState, setViewState] = useState(initialViewState)

  const { images, mainImage, allImages, setModalImage, modalImage } =
    useSpeciesImages(instance.ala_guid)

  const { isOpen, setIsOpen, close, open } = useOpenClose()

  // TODO waiting on approval of registration with ALA
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { occurrences } = useALAOccurrences(instance?.ala_guid)

  if (!instance) return <div>No species found</div>
  return (
    <div className="mt-2">
      <Link
        to="/species"
        className="flex items-center gap-2 text-sm text-secondary-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        <span>All Species</span>
      </Link>
      <div className="mt-6 flex flex-col gap-4 pb-6">
        <div className="xs:flex-col justify-between md:flex">
          <div className="flex flex-col gap-1">
            <span className="text-xl font-bold">
              <i>{alaData?.taxonConcept?.nameString}</i>{" "}
              {alaData?.taxonConcept?.author}
            </span>
            <span>{alaData?.classification?.family}</span>
            <span>{alaData?.commonNames?.[0]?.nameString}</span>
            <div>
              {instance.indigenous_name && (
                <div className="inline">
                  <span className="flex items-center gap-2 align-middle">
                    <i>{instance.indigenous_name}</i>{" "}
                    <PencilIcon
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => open()}
                    />
                  </span>
                </div>
              )}
              {!instance.indigenous_name && (
                <span>
                  <i
                    className="cursor-pointer text-sm underline"
                    onClick={() => setIsOpen(true)}
                  >
                    Add indigenous name?
                  </i>
                </span>
              )}
            </div>
          </div>
        </div>
        {mainImage && (
          <span
            className="xs:px-6 flex cursor-pointer content-center justify-center md:max-w-96 md:px-0"
            onClick={() => setModalImage(0)}
          >
            <img
              src={`${mainImage}%2Foriginal`}
              alt={`${instance.name} Image`}
              className="rounded-sm object-cover text-sm"
            />
          </span>
        )}
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {images.map((image, i) => (
              <div
                className="flex h-20 w-20 flex-shrink-0 cursor-pointer rounded-sm"
                key={image}
                onClick={() => setModalImage(i + 1)} // use +1 to account for main image coming first
              >
                <img
                  src={`${image}%2Fthumbnail`}
                  alt={`${instance.name} Image`}
                  className="w-20 rounded-sm object-cover text-xs"
                />
              </div>
            ))}
          </div>
        )}
        <div className="rounded-lg border border-foreground/50 p-2">
          <h1 className="text-lead">Species Targeted Trips Map</h1>
          <Map
            mapLib={mapboxgl as never}
            mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            style={{ height: 460 }}
            mapStyle="mapbox://styles/mapbox/satellite-v9"
          >
            {mapTrips.map((mapTrip) => (
              <Marker {...getTripCoordinates(mapTrip)} key={mapTrip.id}>
                <div className="rounded-full bg-white bg-opacity-50 p-2">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
              </Marker>
            ))}
          </Map>
        </div>
      </div>
      <Modal
        open={modalImage !== undefined}
        onOpenChange={(isOpen) => (!isOpen ? setModalImage(undefined) : null)}
      >
        <Carousel opts={{ startIndex: modalImage }}>
          <CarouselContent>
            {allImages.map((img) => (
              <CarouselItem
                key={img}
                className="flex max-h-[650px] items-center justify-center p-0"
              >
                <img
                  src={`${img}%2Foriginal`}
                  className="max-w-full object-cover"
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </Modal>
      <Modal
        open={isOpen}
        title={`Edit ${instance.name}`}
        onOpenChange={setIsOpen}
      >
        <SpeciesIndigNameForm
          onCancel={close}
          onSuccess={() => {
            invalidate()
            close()
          }}
          instance={instance}
        />
      </Modal>
    </div>
  )
}

export const Route = createFileRoute("/_private/species/$id/")({
  loader: async ({ params }) => {
    const { id } = params

    return queryClient.ensureQueryData<Species | null>(
      getSpeciesQueryOptions(id),
    )
  },
  component: SpeciesDetail,
})
