import { usePeople } from "@/hooks/usePeople"
import { getTripDetail, TripWithDetails } from "@/hooks/useTripDetail"
import { useTripSpecies } from "@/hooks/useTripSpecies"
import { parsePostGISPoint } from "@nasti/common/utils"
import { queryClient } from "@nasti/common/utils"
import {
  createFileRoute,
  Link,
  notFound,
  useParams,
} from "@tanstack/react-router"
import { ArrowLeftIcon, ShoppingBag, MapPin, PencilIcon } from "lucide-react"
import { Map, Marker } from "react-map-gl"
import mapboxgl from "mapbox-gl"
import { useCallback, useEffect, useState, useMemo } from "react"
import { useOpenClose } from "@nasti/ui/hooks"
import {
  TripDetailsModal,
  TripLocationModal,
  TripPeopleModal,
  TripSpeciesModal,
} from "@/components/trips/modals"
import { useTripMembers } from "@/hooks/useTripMembers"
import useUserStore from "@/store/userStore"
import { getTripCoordinates } from "@/components/trips/utils"
import { SpeciesListItem } from "../../species"
import { Button } from "@nasti/ui/button"
import { AddCollectionWizardModal } from "@/components/collections/CollectionFormModal"

import { useCollectionsByTrip } from "@/hooks/useCollectionsByTrip"
import { useViewState } from "@nasti/common/hooks"
import { CollectionListItem } from "@/components/collections/CollectionListItem"
import { Spinner } from "@nasti/ui/spinner"
import { CollectionMapMarker } from "@/components/collections/CollectionMapMarker"
import { useSuspenseQuery } from "@tanstack/react-query"

const getTripQueryOptions = (id: string) => ({
  queryKey: ["trip", id],
  queryFn: () => getTripDetail(id),
  enabled: Boolean(id),
})

type ModalComponentNames =
  | "details"
  | "location"
  | "people"
  | "species"
  | "collection"

const TripDetail = () => {
  const { id } = useParams({ from: "/_private/trips/$id/" })
  const { isAdmin } = useUserStore()
  const { data: instance } = useSuspenseQuery(getTripQueryOptions(id))

  const { data: tripMembers } = useTripMembers(instance?.id)
  const { data: people } = usePeople()
  const { data: tripSpecies } = useTripSpecies(instance?.id)
  const { data: collections, isPending: isPendingCollections } =
    useCollectionsByTrip(id)

  const { open, isOpen, close } = useOpenClose()
  const [modalComponent, setModalComponent] = useState<ModalComponentNames>()
  const [collectionHovered, setCollectionHovered] = useState<string>()

  const openModal = useCallback(
    (component: ModalComponentNames) => {
      setModalComponent(component)
      open()
    },
    [open],
  )

  const coords: [number, number][] = useMemo(
    () =>
      (instance?.location_coordinate ? [getTripCoordinates(instance)] : [])
        .concat(
          collections
            ?.filter(({ location }) => Boolean(location))
            .map(({ location }) => parsePostGISPoint(location!)) ?? [],
        )

        .map((coord) => [coord.longitude, coord.latitude]),
    [collections, instance],
  )

  const initViewState = useViewState(coords)

  const [viewState, setViewState] = useState(initViewState)

  useEffect(() => {
    setViewState(initViewState)
  }, [initViewState])

  const members = useMemo(() => {
    if (tripMembers && people && people.length > 0) {
      return tripMembers.map((member) =>
        people.find((p) => p.id === member.user_id),
      )
    }
  }, [tripMembers, people])

  if (!instance) return <div>No trip found</div>
  return (
    <div className="mt-2">
      <Link
        to="/trips"
        className="text-secondary-foreground flex items-center gap-2 text-sm"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        <span>All Trips</span>
      </Link>
      <div className="mt-6 flex flex-col gap-4 pb-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="mb-4 text-2xl font-semibold">{instance.name}</h2>
          <div className="flex items-center gap-4">
            <span className="bg-secondary-background rounded-lg p-2">
              {instance.start_date &&
                new Date(instance.start_date).toLocaleDateString()}{" "}
              -{" "}
              {instance.end_date &&
                new Date(instance.end_date).toLocaleDateString()}
            </span>
            {isAdmin && (
              <Button
                size={"icon"}
                onClick={() => openModal("details")}
                title="Edit trip details"
                className="bg-transparent"
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {(instance.location_name || instance.location_coordinate) && (
          <div className="border-foreground/50 rounded-lg border p-2">
            <div className="flex justify-between">
              <h4 className="mb-2 text-xl font-bold">
                {instance.location_name}
              </h4>

              {isAdmin && (
                <PencilIcon
                  className="h-4 w-4 cursor-pointer"
                  onClick={() => openModal("location")}
                />
              )}
            </div>
            {instance.location_coordinate && (
              <Map
                mapLib={mapboxgl as never}
                mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
                {...viewState}
                onMove={(evt) => setViewState(evt.viewState)}
                style={{ height: 460 }}
                mapStyle="mapbox://styles/mapbox/satellite-v9"
              >
                <Marker {...getTripCoordinates(instance)}>
                  <div className="rounded-full bg-white/50 p-2">
                    <MapPin className="text-primary h-5 w-5" />
                  </div>
                </Marker>

                {collections
                  ?.filter(({ location }) => Boolean(location))
                  .map((coll) => {
                    const species = tripSpecies?.find(
                      ({ species_id }) => species_id === coll.species_id,
                    )

                    return (
                      <CollectionMapMarker
                        {...parsePostGISPoint(coll.location!)}
                        key={coll.id}
                        isHovered={collectionHovered === coll.id}
                        popupContent={
                          coll.species_id ? (
                            <Link
                              className="text-primary"
                              to="/species/$id"
                              params={{ id: coll.species_id }}
                            >
                              {species?.species.name}
                            </Link>
                          ) : (
                            <span className="text-primary">
                              {coll.field_name}
                            </span>
                          )
                        }
                      />
                    )
                  })}
              </Map>
            )}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="col-span-2 flex flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="border-foreground/50 rounded-lg border p-2">
                <div className="flex justify-between">
                  <h4 className="mb-2 text-xl font-bold">Members</h4>
                  {isAdmin && (
                    <PencilIcon
                      className="h-4 w-4 cursor-pointer"
                      onClick={() => openModal("people")}
                    />
                  )}
                </div>
                {!members || members.length === 0 ? (
                  <p>No members found.</p>
                ) : (
                  members.map((member) =>
                    member ? (
                      <p key={member.id}>{member.name ?? "Uknown person"}</p>
                    ) : null,
                  )
                )}
              </div>
            </div>
            <div className="border-foreground/50 space-y-2 rounded-lg border p-2">
              <div className="flex justify-between">
                <h4 className="mb-2 text-xl font-bold">Collections</h4>
                {isAdmin && (
                  <Button
                    onClick={() => openModal("collection")}
                    className="flex gap-1 px-2 py-1"
                  >
                    <ShoppingBag aria-label="New Collection" size={12} />{" "}
                    <span className="text-sm">Add Collection</span>
                  </Button>
                )}
              </div>

              <div className="grid flex-col gap-2 lg:grid-cols-2">
                {isPendingCollections && <Spinner />}
                {!collections ||
                  (collections.length === 0 && "No collections yet")}
                {collections?.map((coll) => (
                  <CollectionListItem
                    key={coll.id}
                    id={coll.id}
                    onHover={setCollectionHovered}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="border-foreground/50 rounded-lg border p-2">
            <div className="flex justify-between">
              <h4 className="mb-2 text-xl font-bold">Species</h4>
              {isAdmin && (
                <PencilIcon
                  className="h-4 w-4 cursor-pointer"
                  onClick={() => openModal("species")}
                />
              )}
            </div>
            {!instance.species ||
            instance.species.length === 0 ||
            !tripSpecies ||
            tripSpecies.length === 0 ? (
              <p>No species found.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {tripSpecies.map((species) => (
                  <SpeciesListItem key={species.id} id={species.species_id} />
                ))}
              </div>
            )}
          </div>
        </div>
        {isAdmin && (
          <>
            <TripDetailsModal
              isOpen={isOpen && modalComponent === "details"}
              trip={instance}
              close={close}
            />
            <TripLocationModal
              isOpen={isOpen && modalComponent === "location"}
              trip={instance}
              close={close}
            />
            <TripPeopleModal
              isOpen={isOpen && modalComponent === "people"}
              trip={instance}
              close={close}
            />
            <TripSpeciesModal
              isOpen={isOpen && modalComponent === "species"}
              trip={instance}
              close={close}
            />
            <AddCollectionWizardModal
              tripId={instance.id}
              open={isOpen && modalComponent === "collection"}
              close={close}
            />
          </>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_private/trips/$id/")({
  loader: async ({ params }) => {
    const { id } = params

    return queryClient.ensureQueryData<TripWithDetails | null>(
      getTripQueryOptions(id),
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
  component: TripDetail,
})
