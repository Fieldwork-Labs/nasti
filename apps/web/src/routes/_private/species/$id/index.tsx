import { useOpenClose } from "@nasti/ui/hooks"
import { getSpecies, useSpecies } from "@/hooks/useSpecies"
import { parsePostGISPoint } from "@nasti/common/utils"
import { queryClient } from "@nasti/common/utils"
import {
  createFileRoute,
  Link,
  notFound,
  useParams,
} from "@tanstack/react-router"
import { ArrowLeftIcon, MapPin, PencilIcon } from "lucide-react"
import mapboxgl from "mapbox-gl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Map as MapboxMap, Marker, Source, Layer, Popup } from "react-map-gl"
import type { FeatureCollection } from "geojson"

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
} from "@nasti/ui/carousel"
import { Modal } from "@nasti/ui/modal"
import { useALAImage } from "@nasti/common/hooks/useALAImage"
import { useALAImages } from "@nasti/common/hooks/useALAImages"
import { useALASpeciesOccurrences } from "@nasti/common/hooks/useALASpeciesOccurrences"
import { useALASpeciesDetail } from "@nasti/common/hooks/useALASpeciesDetail"
import { useTripsForSpecies } from "@/hooks/useTripsForSpecies"
import { getViewState, type PartialViewState } from "@nasti/common/hooks"
import { Species } from "@nasti/common/types"
import { SpeciesIndigNameForm } from "@/components/species/SpeciesIndigNameForm"
import { Dialog, DialogContent, DialogTitle } from "@nasti/ui/dialog"
import { useCollectionsBySpecies } from "@/hooks/useCollectionsBySpecies"
import { Tabs, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import { CollectionListItem } from "@/components/collections/CollectionListItem"
import { CollectionMapMarker } from "@/components/collections/CollectionMapMarker"
import { Spinner } from "@nasti/ui/spinner"

type SourceNames = "trips" | "collections" | "occurrences"

const OccurrencesLayer = ({
  id,
  onUpdateViewState,
}: {
  id: string
  onUpdateViewState: (viewState: PartialViewState) => void
}) => {
  const { data: species } = useSpecies(id)

  const { occurrences, fetchAll } = useALASpeciesOccurrences(
    species?.ala_guid,
    1000,
  )

  useEffect(() => {
    if (species?.ala_guid) {
      fetchAll()
    }
  }, [species?.ala_guid, fetchAll])

  const occurencesCoords: Array<[number, number]> = useMemo(
    () =>
      occurrences.map(({ decimalLongitude, decimalLatitude }) => [
        decimalLongitude,
        decimalLatitude,
      ]),
    [occurrences],
  )

  const occurrencesGeoJson: FeatureCollection = useMemo(
    () => ({
      type: "FeatureCollection",
      features: occurencesCoords.map((coordinates) => {
        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates,
          },
          properties: {},
        }
      }),
    }),
    [occurencesCoords],
  )

  const viewStateRef = useRef<string | null>(null)

  useEffect(() => {
    // Calculate the new view state
    const newViewState = getViewState(occurencesCoords)
    // Only update parent if there's a meaningful difference
    // (using JSON.stringify is a simple way to do deep comparison)
    const viewStateString = JSON.stringify(newViewState)

    if (!viewStateRef.current || viewStateRef.current !== viewStateString) {
      viewStateRef.current = viewStateString
      onUpdateViewState(newViewState)
    }
  }, [occurencesCoords, onUpdateViewState])

  return (
    <Source id="map-data" type="geojson" data={occurrencesGeoJson}>
      <Layer type="circle" id="markers" paint={{ "circle-color": "orange" }} />
    </Source>
  )
}

const SpeciesMap = ({
  id,
  collectionHovered,
}: {
  id: string
  collectionHovered?: string
}) => {
  const { data: collections } = useCollectionsBySpecies(id)
  const { data: trips } = useTripsForSpecies(id)

  const mapTrips = useMemo(
    () =>
      (trips?.filter(tripWithLocationFilter) ?? []).map((trip) => ({
        ...trip,
        ...getTripCoordinates(trip),
      })),
    [trips],
  )

  const tripsCoordArray: Array<[number, number]> = useMemo(
    () => mapTrips.map(({ longitude, latitude }) => [longitude, latitude]),
    [mapTrips],
  )

  const [viewState, setViewState] = useState(getViewState(tripsCoordArray))

  const [selectedLayer, setSelectedLayer] = useState<SourceNames>("trips")

  const mapCollectionsCoords = useMemo(
    () =>
      collections
        ?.filter(({ location }) => Boolean(location))
        .map((coll) => ({
          id: coll.id,
          trip_id: coll.trip_id,
          ...parsePostGISPoint(coll.location!),
        })) as {
        id: string
        trip_id: string
        latitude: number
        longitude: number
      }[],
    [collections],
  )

  useEffect(() => {
    if (selectedLayer === "trips") setViewState(getViewState(tripsCoordArray))
    if (selectedLayer === "collections")
      setViewState(
        getViewState(
          mapCollectionsCoords.map(({ longitude, latitude }) => [
            longitude,
            latitude,
          ]),
        ),
      )
  }, [selectedLayer, tripsCoordArray, mapCollectionsCoords])

  const [tripPopup, setTripPopup] = useState<string>()
  const tripForPopup = tripPopup
    ? mapTrips?.find(({ id }) => id === tripPopup)
    : undefined

  return (
    <Tabs
      defaultValue="trips"
      onValueChange={(val) => setSelectedLayer(val as SourceNames)}
    >
      <TabsList className="bg-secondary-background mb-2 w-full">
        <TabsTrigger className="w-full" value="trips">
          Trips
        </TabsTrigger>
        {mapCollectionsCoords && mapCollectionsCoords.length > 0 && (
          <TabsTrigger className="w-full" value="collections">
            Collections
          </TabsTrigger>
        )}
        <TabsTrigger className="w-full" value="occurrences">
          Public Records
        </TabsTrigger>
      </TabsList>
      <MapboxMap
        mapLib={mapboxgl as never}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        style={{ height: 460 }}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
      >
        {selectedLayer === "occurrences" && (
          <OccurrencesLayer id={id} onUpdateViewState={setViewState} />
        )}
        {selectedLayer === "trips" && (
          <>
            {mapTrips.map(({ latitude, longitude, id }) => (
              <Marker
                latitude={latitude}
                longitude={longitude}
                key={id}
                onClick={() => setTripPopup(id)}
                className="cursor-pointer"
              >
                <div className="rounded-full bg-white/50 p-2">
                  <MapPin className="text-primary h-5 w-5" />
                </div>
              </Marker>
            ))}
            {tripPopup && tripForPopup && (
              <Popup
                onClose={() => setTripPopup(undefined)}
                latitude={tripForPopup.latitude}
                longitude={tripForPopup.longitude}
                closeOnClick={false}
                closeButton={true}
                anchor="bottom"
                offset={25}
              >
                <Link
                  to={"/trips/$id"}
                  params={{ id: tripForPopup.id }}
                  className="text-primary"
                >
                  {tripForPopup?.name} trip
                </Link>
              </Popup>
            )}
          </>
        )}
        {selectedLayer === "collections" &&
          mapCollectionsCoords.map(({ id, trip_id, latitude, longitude }) => {
            const trip = trips?.find((trip) => trip.id === trip_id)
            return (
              <CollectionMapMarker
                latitude={latitude}
                longitude={longitude}
                key={id}
                isHovered={collectionHovered === id}
                popupContent={
                  <Link
                    to={"/trips/$id"}
                    params={{ id: trip_id }}
                    className="text-primary"
                  >
                    {trip?.name} trip
                  </Link>
                }
              />
            )
          })}
      </MapboxMap>
    </Tabs>
  )
}

const getSpeciesQueryOptions = (id: string) => ({
  queryKey: ["species", id],
  queryFn: () => getSpecies(id),
  enabled: Boolean(id),
  refetchOnMount: false,
})

const useSpeciesImages = (alaGuid?: string | null) => {
  const { data: alaData } = useALASpeciesDetail(alaGuid)
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

const useSpeciesDetailInvalidate = (id: string) => {
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["species", id],
    })
  }, [id])

  return { invalidate }
}

const SpeciesDetail = () => {
  const instance = Route.useLoaderData()

  const { id } = useParams({ from: "/_private/species/$id/" })
  const { invalidate } = useSpeciesDetailInvalidate(id)
  const { data: collections } = useCollectionsBySpecies(id)
  const { data: alaData } = useALASpeciesDetail(instance?.ala_guid)
  const { images, mainImage, allImages, setModalImage, modalImage } =
    useSpeciesImages(instance?.ala_guid)

  const { isOpen, setIsOpen, close, open } = useOpenClose()
  const [collectionHovered, setCollectionHovered] = useState<string>()

  if (!instance) return <div>No species found</div>
  return (
    <div className="mt-2">
      <Link
        to="/species"
        className="text-secondary-foreground flex items-center gap-2 text-sm"
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
                    Add indigenous name
                  </i>
                </span>
              )}
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
        </div>
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {images.map((image, i) => (
              <div
                className="flex h-20 w-20 shrink-0 cursor-pointer rounded-sm"
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
        <div className="border-foreground/50 rounded-lg border p-2">
          <SpeciesMap id={id} collectionHovered={collectionHovered} />
        </div>
        <div className="border-foreground/50 space-y-2 rounded-lg border p-2">
          <h4 className="mb-2 text-xl font-bold">Collections</h4>

          <div className="grid flex-col gap-2 lg:grid-cols-2">
            {collections && collections.length > 0
              ? collections.map((coll) => (
                  <CollectionListItem
                    key={coll.id}
                    id={coll.id}
                    showTrip
                    onHover={setCollectionHovered}
                  />
                ))
              : "No collections recorded yet."}
          </div>
        </div>
      </div>
      <Dialog
        open={modalImage !== undefined}
        onOpenChange={(isOpen) => (!isOpen ? setModalImage(undefined) : null)}
      >
        <DialogContent>
          {/* DialogTitle required for screenreaders */}
          <DialogTitle hidden>Species Image</DialogTitle>
          <Carousel opts={{ startIndex: modalImage }} className="pt-4">
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
        </DialogContent>
      </Dialog>
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
  pendingComponent: () => (
    <div className="px-auto mx-auto mt-36">
      <Spinner size={"xl"} />
    </div>
  ),
  onError() {
    throw notFound()
  },
  component: SpeciesDetail,
})
