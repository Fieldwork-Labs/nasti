import { AddCollectionWizardModal } from "@/components/collections/CollectionFormModal"
import {
  TripDetailsModal,
  TripLocationModal,
  TripPeopleModal,
  TripSpeciesModal,
} from "@/components/trips/modals"
import { getTripCoordinates } from "@/components/trips/utils"
import {
  getTripDetailQueryOptions,
  TripWithDetails,
} from "@/hooks/useTripDetail"
import { TripSpeciesWithDetails, useTripSpecies } from "@/hooks/useTripSpecies"
import useUserStore from "@/store/userStore"
import { parsePostGISPoint, queryClient } from "@nasti/common/utils"
import { Button } from "@nasti/ui/button"
import { useOpenClose } from "@nasti/ui/hooks"
import {
  createFileRoute,
  Link,
  notFound,
  useParams,
} from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  Binoculars,
  MapPin,
  PencilIcon,
  ShoppingBag,
} from "lucide-react"
import mapboxgl from "mapbox-gl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Map, Marker } from "react-map-gl"
import { SpeciesListItem } from "../../species"

import { CollectionListItem } from "@/components/collections/CollectionListItem"
import { CollectionMapMarker } from "@/components/collections/CollectionMapMarker"
import { AddScoutingNoteWizardModal } from "@/components/scoutingNotes/ScoutingNoteFormModal"
import { ScoutingNoteListItem } from "@/components/scoutingNotes/ScoutingNoteListItem"
import { ScoutingNoteMapMarker } from "@/components/scoutingNotes/ScoutingNoteMapMarker"
import { useCollectionsByTrip } from "@/hooks/useCollectionsByTrip"
import { useScoutingNotesByTrip } from "@/hooks/useScoutingNotesByTrip"
import { Collection, ScoutingNote } from "@nasti/common"
import { useViewState } from "@nasti/common/hooks"
import { Spinner } from "@nasti/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import { useSuspenseQuery } from "@tanstack/react-query"

type ModalComponentNames =
  | "details"
  | "location"
  | "people"
  | "species"
  | "collection"
  | "scoutingNote"

const TripDetail = () => {
  const { id } = useParams({ from: "/_private/trips/$id/" })
  const { isAdmin } = useUserStore()
  const { data: instance } = useSuspenseQuery(getTripDetailQueryOptions(id))

  const { data: tripSpecies } = useTripSpecies(instance?.id)
  const tripSpeciesMap = useMemo(() => {
    return (
      tripSpecies?.reduce(
        (acc, species) => ({
          ...acc,
          [species.species_id]: species,
        }),
        {} as Record<string, TripSpeciesWithDetails>,
      ) ?? {}
    )
  }, [tripSpecies])

  const { data: collections, isPending: isPendingCollections } =
    useCollectionsByTrip(id)
  const { data: scoutingNotes, isPending: isPendingScoutingNotes } =
    useScoutingNotesByTrip(id)

  const { open, isOpen, close } = useOpenClose()
  const [modalComponent, setModalComponent] = useState<ModalComponentNames>()
  const [itemHovered, setItemHovered] = useState<string>()

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
          <div className="flex gap-6">
            <div className="bg-secondary-background flex items-center gap-2 rounded-lg pl-2">
              <h4 className="text-lg">Members</h4>
              {isAdmin && (
                <Button
                  size={"icon"}
                  onClick={() => openModal("people")}
                  title="Edit trip details"
                  className="hover:text-primary-foreground cursor-pointer bg-transparent text-black"
                >
                  <PencilIcon className="h-4 w-4 cursor-pointer" />
                </Button>
              )}
            </div>
            <div className="bg-secondary-background flex items-center gap-2 rounded-lg pl-2">
              <span className="">
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
                  className="hover:text-primary-foreground cursor-pointer bg-transparent text-black"
                >
                  <PencilIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
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
                    const species = coll.species_id
                      ? tripSpeciesMap[coll.species_id]
                      : null

                    return (
                      <CollectionMapMarker
                        {...parsePostGISPoint(coll.location!)}
                        key={coll.id}
                        isHovered={itemHovered === coll.id}
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
                {scoutingNotes
                  ?.filter(({ location }) => Boolean(location))
                  .map((sn) => {
                    const species = sn.species_id
                      ? tripSpeciesMap[sn.species_id]
                      : null

                    return (
                      <ScoutingNoteMapMarker
                        {...parsePostGISPoint(sn.location!)}
                        key={sn.id}
                        isHovered={itemHovered === sn.id}
                        popupContent={
                          sn.species_id ? (
                            <Link
                              className="text-primary"
                              to="/species/$id"
                              params={{ id: sn.species_id }}
                            >
                              {species?.species.name}
                            </Link>
                          ) : (
                            <span className="text-primary">
                              {sn.field_name}
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
            {/* <div className="grid gap-4 lg:grid-cols-2">
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
            </div> */}
            <Tabs defaultValue="collections">
              <TabsList>
                <TabsTrigger
                  value="collections"
                  className="flex items-center gap-1"
                >
                  <ShoppingBag /> Collections
                </TabsTrigger>
                <TabsTrigger
                  value="scoutingNotes"
                  className="flex items-center gap-1"
                >
                  {" "}
                  <Binoculars /> Scouting Notes
                </TabsTrigger>
              </TabsList>
              <TabsContent value="collections">
                <CollectionsList
                  setItemHovered={setItemHovered}
                  onAddNew={() => openModal("collection")}
                  canEdit={isAdmin}
                  isLoading={isPendingCollections}
                  collections={collections}
                />
              </TabsContent>
              <TabsContent value="scoutingNotes">
                <ScoutingNotesList
                  setItemHovered={setItemHovered}
                  onAddNew={() => openModal("scoutingNote")}
                  canEdit={isAdmin}
                  isLoading={isPendingScoutingNotes}
                  scoutingNotes={scoutingNotes}
                />
              </TabsContent>
            </Tabs>
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
            <AddScoutingNoteWizardModal
              tripId={instance.id}
              open={isOpen && modalComponent === "scoutingNote"}
              close={close}
            />
          </>
        )}
      </div>
    </div>
  )
}

const CollectionsList = ({
  setItemHovered,
  onAddNew,
  canEdit,
  isLoading,
  collections,
}: {
  canEdit: boolean
  onAddNew: () => void
  setItemHovered: React.Dispatch<React.SetStateAction<string | undefined>>
  isLoading: boolean
  collections: Collection[] | undefined
}) => {
  return (
    <div className="border-foreground/50 space-y-2 rounded-lg border p-2">
      <div className="flex justify-between">
        <h4 className="mb-2 text-xl font-bold">Collections</h4>
        {canEdit && (
          <Button onClick={onAddNew} className="flex gap-1 px-2 py-1">
            <ShoppingBag aria-label="New Collection" size={12} />{" "}
            <span className="text-sm">Add Collection</span>
          </Button>
        )}
      </div>

      <div className="grid flex-col gap-2 lg:grid-cols-2">
        {isLoading && <Spinner />}
        {!collections || (collections.length === 0 && "No collections yet")}
        {collections?.map((coll) => (
          <CollectionListItem
            key={coll.id}
            id={coll.id}
            onHover={setItemHovered}
          />
        ))}
      </div>
    </div>
  )
}

const ScoutingNotesList = ({
  setItemHovered,
  onAddNew,
  canEdit,
  isLoading,
  scoutingNotes,
}: {
  canEdit: boolean
  onAddNew: () => void
  setItemHovered: React.Dispatch<React.SetStateAction<string | undefined>>
  isLoading: boolean
  scoutingNotes: ScoutingNote[] | undefined
}) => {
  return (
    <div className="border-foreground/50 space-y-2 rounded-lg border p-2">
      <div className="flex justify-between">
        <h4 className="mb-2 text-xl font-bold">Scouting Notes</h4>
        {canEdit && (
          <Button onClick={onAddNew} className="flex gap-1 px-2 py-1">
            <Binoculars aria-label="New Scouting Note" size={12} />{" "}
            <span className="text-sm">Add Scouting Note</span>
          </Button>
        )}
      </div>

      <div className="grid flex-col gap-2 lg:grid-cols-2">
        {isLoading && <Spinner />}
        {!scoutingNotes ||
          (scoutingNotes.length === 0 && "No Scouting Notes yet")}
        {scoutingNotes?.map((sn) => (
          <ScoutingNoteListItem
            key={sn.id}
            id={sn.id}
            onHover={setItemHovered}
          />
        ))}
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_private/trips/$id/")({
  loader: async ({ params }) => {
    const { id } = params

    return queryClient.ensureQueryData<TripWithDetails | null>(
      getTripDetailQueryOptions(id),
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
