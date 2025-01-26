import { useAdminOnly } from "@/hooks/useAdminOnly"
import { usePeople } from "@/hooks/usePeople"
import { getTripDetail, TripWithDetails } from "@/hooks/useTripDetail"
import { useTripSpecies } from "@/hooks/useTripSpecies"
import { getTripCoordinates, queryClient } from "@/lib/utils"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { ArrowLeftIcon, MapPin, PencilIcon } from "lucide-react"
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
import { TripSpeciesDetail } from "@/components/trips/TripSpeciesDetail"

const getTripQueryOptions = (id: string) => ({
  queryKey: ["trip", id],
  queryFn: () => getTripDetail(id),
  enabled: Boolean(id),
})

type ModalComponentNames = "details" | "location" | "people" | "species"

const TripDetail = () => {
  useAdminOnly()
  const { id } = useParams({ from: "/_private/trips/$id/" })
  const { data: instance } = useSuspenseQuery(getTripQueryOptions(id))

  const { data: people } = usePeople()
  const { data: tripSpecies } = useTripSpecies(instance?.id)

  const { open, isOpen, close } = useOpenClose()
  const [modalComponent, setModalComponent] = useState<ModalComponentNames>()

  const openModal = useCallback(
    (component: ModalComponentNames) => {
      setModalComponent(component)
      open()
    },
    [open],
  )

  const [viewState, setViewState] = useState(
    instance
      ? {
          ...getTripCoordinates(instance),
          zoom: 6.5,
        }
      : { longitude: 133.7751, latitude: -25.2744, zoom: 3 },
  )

  useEffect(() => {
    // update view state when trip location is edited
    setViewState({
      ...getTripCoordinates(instance),
      zoom: 6.5,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.location_coordinate])

  const members = useMemo(() => {
    if (instance && people && people.length > 0) {
      return instance.members.map((member) =>
        people.find((person) => person.id === member),
      )
    }
  }, [instance, people])

  if (!instance) return <div>No trip found</div>
  return (
    <div className="mt-6 flex flex-col gap-4 pb-6">
      <div>
        <h4 className="mb-2 text-xl font-bold">{instance.name}</h4>

        <Link
          to="/trips"
          className="flex items-center gap-2 text-sm text-secondary-foreground"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          <span>All Trips</span>
        </Link>
      </div>
      {(instance.location_name || instance.location_coordinate) && (
        <div className="rounded-lg border border-foreground/50 p-2">
          <div className="flex justify-between">
            <h4 className="mb-2 text-xl font-bold">{instance.location_name}</h4>
            <PencilIcon
              className="h-4 w-4 cursor-pointer"
              onClick={() => openModal("location")}
            />
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
            <PencilIcon
              className="h-4 w-4 cursor-pointer"
              onClick={() => openModal("details")}
            />
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
        </div>

        <div className="rounded-lg border border-foreground/50 p-2">
          <div className="flex justify-between">
            <h4 className="mb-2 text-xl font-bold">Members</h4>
            <PencilIcon
              className="h-4 w-4 cursor-pointer"
              onClick={() => openModal("people")}
            />
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
            <PencilIcon
              className="h-4 w-4 cursor-pointer"
              onClick={() => openModal("species")}
            />
          </div>
          {!instance.species ||
          instance.species.length === 0 ||
          !tripSpecies ? (
            <p>No species found.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {tripSpecies.map((species) => (
                <TripSpeciesDetail
                  key={species.species.ala_guid}
                  species={species.species}
                />
              ))}
            </div>
          )}
        </div>
      </div>
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
