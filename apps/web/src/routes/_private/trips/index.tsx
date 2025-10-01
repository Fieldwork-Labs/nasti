import useUserStore from "@/store/userStore"
import { Trip } from "@nasti/common/types"
import { Button } from "@nasti/ui/button"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ChevronDownIcon, ChevronUpIcon, MapPin, PlusIcon } from "lucide-react"
import mapboxgl, { MapMouseEvent } from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { useCallback, useEffect, useState, useRef } from "react"
import Map, { Layer, Marker, Popup, Source, useMap } from "react-map-gl"

import { TripFormProvider, TripFormWizard } from "@/components/trips/TripWizard"

import { Pagination, usePagination } from "@/components/common/pagination"
import {
  TripFilterData,
  TripFilterForm,
} from "@/components/trips/TripFilterForm"
import { useTripFormWizard } from "@/components/trips/TripWizard/useTripFormWizard"
import {
  getTripCoordinates,
  TripWithLocation,
  tripWithLocationFilter,
} from "@/components/trips/utils"
import {
  getTripsSearchQueryOptions,
  useTripsSearch,
} from "@/hooks/useTripSearch"
import { useViewState } from "@nasti/common/hooks"
import { queryClient } from "@nasti/common/utils"
import { Spinner } from "@nasti/ui/spinner"
import { useIbraRegions } from "@/hooks/useIbra"
import { isNumber } from "lodash"
import { FeatureCollection } from "geojson"

interface TripsMapProps {
  trips: Trip[]
}

export function IbraLayer() {
  const { current: map } = useMap()
  const [zoom, setZoom] = useState(0)
  const [ids, setIds] = useState<number[]>()

  const { data: ibra } = useIbraRegions(zoom, ids)
  const { data: ibraIndex } = useIbraRegions(1)
  // ibraState is kept separately so there's no flash of the layer when loading
  const [ibraState, setIbraState] = useState<FeatureCollection | undefined>(
    ibra,
  )
  useEffect(() => {
    if (ibra) {
      setIbraState(ibra)
    }
  }, [ibra])

  const hoveredFeatureId = useRef<string | number | null>(null)

  const handleMouseMove = useCallback(
    (event: MapMouseEvent) => {
      if (!map) return
      const features = map.queryRenderedFeatures(event.point)
      const feature = features?.[0]
      // If a feature is already hovered, reset its state
      if (
        hoveredFeatureId.current !== null &&
        feature?.id !== hoveredFeatureId.current
      ) {
        map.setFeatureState(
          { source: "ibra", id: hoveredFeatureId.current },
          { hover: false },
        )
      }

      // Set hover state for the new feature
      if (feature?.id) {
        hoveredFeatureId.current = feature.id
        map.setFeatureState({ source: "ibra", id: feature.id }, { hover: true })
      }
    },
    [map],
  )

  const getIdsOnMap = useCallback(() => {
    const features = map?.queryRenderedFeatures({ layers: ["ibra-index"] })
    if (features?.length) {
      const mapIds = new Set(
        features
          // do not use .id, must use .properties.id
          .map(({ properties }) => properties?.id)
          .filter((x): x is number => Boolean(x) && isNumber(x)),
      )

      setIds(Array.from(mapIds))
    }
  }, [map])

  const handleMapZoom = useCallback(() => {
    if (!map) return
    setZoom(map.getZoom())
    getIdsOnMap()
  }, [map, getIdsOnMap])

  useEffect(() => {
    map?.on("mousemove", handleMouseMove)
    map?.on("moveend", getIdsOnMap)
    map?.on("zoomend", handleMapZoom)

    return () => {
      map?.off("mousemove", handleMouseMove)
      map?.off("moveend", getIdsOnMap)
      map?.off("zoomend", handleMapZoom)
    }
  }, [handleMouseMove, getIdsOnMap, handleMapZoom, map])

  if (!ibraState) return null
  return (
    <>
      {/* ibraIndex allows the map to know which feature IDs to load when zoomed in */}
      <Source id="ibra-index" type="geojson" data={ibraIndex} />
      <Layer
        id="ibra-index"
        source="ibra-index"
        type="line"
        paint={{
          "line-opacity": 0,
        }}
      />
      <Source id="ibra" type="geojson" data={ibraState}>
        <Layer
          id="ibra"
          source="ibra"
          type="line"
          paint={{
            "line-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "#ff23e3",
              "#e049e3",
            ],
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              3,
              2,
            ],
          }}
        />
        <Layer
          id="ibra-label"
          source="ibra" // Make sure to specify the source
          type="symbol"
          layout={{
            "text-field": ["concat", ["get", "code"], "\n", ["get", "name"]],
            "text-size": 16,
            "text-font": ["Open Sans Bold"],
            "text-offset": [0, 0],
            "text-anchor": "center",
            "text-allow-overlap": false,
          }}
          paint={{
            "text-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              1,
              0,
            ],
            "text-color": "#000000",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 2,
            "text-halo-blur": 3,
          }}
        />
      </Source>
    </>
  )
}

const TripsMap = ({ trips }: TripsMapProps) => {
  const [showPopup, setShowPopup] = useState<TripWithLocation | null>(null)

  // Calculate bounds based on all trip coordinates
  const initialViewState = useViewState(
    trips
      .filter(tripWithLocationFilter)
      .map(getTripCoordinates)
      .map(({ longitude, latitude }) => [longitude, latitude]),
  )

  return (
    <Map
      mapLib={mapboxgl as never}
      mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
      initialViewState={initialViewState}
      style={{ height: 540 }}
      mapStyle="mapbox://styles/mapbox/satellite-v9"
    >
      <IbraLayer />
      {trips.filter(tripWithLocationFilter).map((trip) => (
        <Marker {...getTripCoordinates(trip)} key={trip.id}>
          <div className="rounded-full bg-white/50 p-2">
            <MapPin
              className="text-primary h-5 w-5 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                setShowPopup(trip)
              }}
            />
          </div>
        </Marker>
      ))}
      {showPopup && (
        <Popup
          onClose={() => setShowPopup(null)}
          {...getTripCoordinates(showPopup)}
        >
          <Link
            to={"/trips/$id"}
            params={{ id: showPopup.id }}
            className="text-primary"
          >
            {showPopup?.name} trip
          </Link>
        </Popup>
      )}
    </Map>
  )
}

const NewTripButton = () => {
  const { open } = useTripFormWizard()
  return (
    <Button className="flex gap-1" onClick={open}>
      <PlusIcon aria-label="New Trip" size={16} /> <span>New</span>
    </Button>
  )
}

const TripTableRow = ({ trip }: { trip: Trip }) => {
  return (
    <tr className="border-t">
      <td className="px-4 py-2">
        <Link to={`/trips/$id`} params={{ id: trip.id }}>
          {trip.name}
        </Link>
      </td>
      <td className="px-4 py-2">
        {trip.start_date && new Date(trip.start_date).toLocaleDateString()}
      </td>
      <td className="px-4 py-2">
        {trip.end_date && new Date(trip.end_date).toLocaleDateString()}
      </td>
      <td className="px-4 py-2">{trip.location_name}</td>
    </tr>
  )
}

const SortableTableHeader = ({
  children,
  sortParam,
  sortOrder,
  onSort,
}: {
  children: React.ReactNode
  sortParam: keyof Trip
  sortOrder: "asc" | "desc"
  onSort: (param: keyof Trip, order: "asc" | "desc") => void
}) => {
  return (
    <th
      className="cursor-pointer px-4 py-2 text-left"
      onClick={() => onSort(sortParam, sortOrder === "asc" ? "desc" : "asc")}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortOrder === "asc" ? (
          <ChevronUpIcon className="size-4" />
        ) : (
          <ChevronDownIcon className="size-4" />
        )}
      </span>
    </th>
  )
}

const PAGE_SIZE = 10

const TripsList = () => {
  const [searchDetails, setSearchDetails] = useState<
    TripFilterData | undefined
  >()

  const { nextPage, prevPage, setPage, page } = usePagination(1, PAGE_SIZE)

  const { trips, isLoading, isEmpty, totalPages } = useTripsSearch({
    ...searchDetails,
    options: { pageSize: PAGE_SIZE, page },
  })

  const handleNextPage = useCallback(() => {
    if (page < totalPages) nextPage()
  }, [page, totalPages, nextPage])

  const handlePrevPage = useCallback(() => {
    if (page > 1) prevPage()
  }, [page, prevPage])

  const handleSetPage = useCallback(
    (newPage: number) => {
      if (newPage >= 1 && newPage <= totalPages) {
        setPage(newPage)
      }
    },
    [totalPages, setPage],
  )

  const handleSort = useCallback((param: keyof Trip, order: "asc" | "desc") => {
    setSearchDetails((prev) => ({
      ...prev,
      sortParam: param,
      sortOrder: order,
    }))
  }, [])

  const { isAdmin } = useUserStore()

  return (
    <TripFormProvider>
      <div className="flex flex-col gap-4">
        <div className="flex justify-between">
          <h2 className="text-2xl font-semibold">Trips</h2>
          {isAdmin && <NewTripButton />}
        </div>
        <TripFilterForm
          isLoading={isLoading}
          onSetSearchDetails={setSearchDetails}
        />
        <div className="flex justify-end">
          <div className="flex justify-end md:w-fit">
            <Pagination
              pageCount={totalPages}
              page={page}
              nextPage={handleNextPage}
              prevPage={handlePrevPage}
              setPage={handleSetPage}
              className="mx-0 justify-end"
            />
          </div>
        </div>
        {isEmpty ? (
          <p>No trips found.</p>
        ) : (
          <>
            <TripsMap trips={trips} />

            <div className="overflow-x-auto">
              <table className="min-w-full overflow-hidden rounded-lg">
                <thead>
                  <tr>
                    <SortableTableHeader
                      onSort={handleSort}
                      sortParam="name"
                      sortOrder={
                        (searchDetails?.sortParam === "name" &&
                          searchDetails?.sortOrder) ||
                        "asc"
                      }
                    >
                      Name
                    </SortableTableHeader>
                    <SortableTableHeader
                      onSort={handleSort}
                      sortParam="start_date"
                      sortOrder={
                        (searchDetails?.sortParam === "start_date" &&
                          searchDetails?.sortOrder) ||
                        "asc"
                      }
                    >
                      Start Date
                    </SortableTableHeader>
                    <SortableTableHeader
                      onSort={handleSort}
                      sortParam="end_date"
                      sortOrder={
                        (searchDetails?.sortParam === "end_date" &&
                          searchDetails?.sortOrder) ||
                        "asc"
                      }
                    >
                      End Date
                    </SortableTableHeader>
                    <SortableTableHeader
                      onSort={handleSort}
                      sortParam="location_name"
                      sortOrder={
                        (searchDetails?.sortParam === "location_name" &&
                          searchDetails?.sortOrder) ||
                        "asc"
                      }
                    >
                      Location Name
                    </SortableTableHeader>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip) => (
                    <TripTableRow key={trip.id} trip={trip} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <TripFormWizard />
      </div>
    </TripFormProvider>
  )
}

export const Route = createFileRoute("/_private/trips/")({
  component: TripsList,
  pendingComponent: () => (
    <div className="px-auto mx-auto mt-36">
      <Spinner size={"xl"} />
    </div>
  ),
  loader: async () => {
    const qOptions = getTripsSearchQueryOptions()
    return queryClient.ensureQueryData(qOptions)
  },
})
