import { usePeople } from "@/hooks/usePeople"
import { getTripDetail, TripWithDetails } from "@/hooks/useTripDetail"
import { useTripSpecies } from "@/hooks/useTripSpecies"
import { queryClient } from "@/lib/utils"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { ArrowLeftIcon, ShoppingBag, MapPin, PencilIcon } from "lucide-react"
import { Map, Marker } from "react-map-gl"
import mapboxgl from "mapbox-gl"
import { useCallback, useEffect, useState, useMemo } from "react"
import useOpenClose from "@/hooks/useOpenClose"
import {
  TripDetailsModal,
  TripLocationModal,
  TripPeopleModal,
  TripSpeciesModal,
} from "@/components/trips/modals"
import { useSuspenseQuery } from "@tanstack/react-query"
import { useTripMembers } from "@/hooks/useTripMembers"
import useUserStore from "@/store/userStore"
import { getTripCoordinates } from "@/components/trips/utils"
import { SpeciesListItem } from "../../species"
import { Button } from "@/components/ui/button"
import { AddCollectionModal } from "@/components/collections/CollectionFormModal"
import { useToast } from "@/hooks/use-toast"

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

  const { open, isOpen, close } = useOpenClose()
  const [modalComponent, setModalComponent] = useState<ModalComponentNames>()
  const toast = useToast()

  const openModal = useCallback(
    (component: ModalComponentNames) => {
      setModalComponent(component)
      open()
    },
    [open],
  )

  const [viewState, setViewState] = useState(
    instance?.location_coordinate
      ? {
          ...getTripCoordinates(instance),
          zoom: 6.5,
        }
      : { longitude: 133.7751, latitude: -25.2744, zoom: 3 },
  )

  useEffect(() => {
    // update view state when trip location is edited
    if (instance?.location_coordinate)
      setViewState({
        ...getTripCoordinates(instance),
        zoom: 6.5,
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.location_coordinate])

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
        className="flex items-center gap-2 text-sm text-secondary-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        <span>All Trips</span>
      </Link>
      <div className="mt-6 flex flex-col gap-4 pb-6">
        <div className="flex justify-between">
          <h2 className="mb-4 text-2xl font-semibold">{instance.name}</h2>
          {isAdmin && (
            <Button
              onClick={() => openModal("collection")}
              className="flex gap-1"
            >
              <ShoppingBag aria-label="New Collection" size={16} />{" "}
              <span>Add Collection</span>
            </Button>
          )}
        </div>
        {(instance.location_name || instance.location_coordinate) && (
          <div className="rounded-lg border border-foreground/50 p-2">
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
            <Map
              mapLib={mapboxgl as never}
              mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
              {...viewState}
              onMove={(evt) => setViewState(evt.viewState)}
              style={{ height: 460 }}
              mapStyle="mapbox://styles/mapbox/satellite-v9"
            >
              <Marker {...getTripCoordinates(instance)}>
                <div className="rounded-full bg-white bg-opacity-50 p-2">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
              </Marker>
            </Map>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-foreground/50 p-2">
            <div className="flex justify-between">
              <h4 className="mb-2 text-xl font-bold">Trip Details</h4>
              {isAdmin && (
                <PencilIcon
                  className="h-4 w-4 cursor-pointer"
                  onClick={() => openModal("details")}
                />
              )}
            </div>
            <table>
              <tr>
                <th className="justify-start bg-secondary-background text-left">
                  Trip Name
                </th>
                <td>{instance.name}</td>
              </tr>
              {instance.start_date && (
                <tr>
                  <th className="justify-start bg-secondary-background text-left">
                    Trip Start
                  </th>
                  <td>{new Date(instance.start_date).toLocaleDateString()}</td>
                </tr>
              )}
              {instance.end_date && (
                <tr>
                  <th className="justify-start bg-secondary-background text-left">
                    Trip End
                  </th>
                  <td>{new Date(instance.end_date).toLocaleDateString()}</td>
                </tr>
              )}
            </table>
            {!instance.location_coordinate && isAdmin && (
              <div
                className="flex cursor-pointer items-center gap-2 text-sm underline"
                onClick={() => openModal("location")}
              >
                <span>Add location</span>
                <PencilIcon className="h-4 w-4" />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-foreground/50 p-2">
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
          <div className="rounded-lg border border-foreground/50 p-2">
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
            <AddCollectionModal
              tripId={instance.id}
              open={isOpen && modalComponent === "collection"}
              close={close}
              onCreate={() => {
                toast.toast({ description: "Collection created successfully" })
              }}
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
  component: TripDetail,
})
