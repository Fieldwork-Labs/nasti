import { queryClient } from "@/lib/queryClient"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Trip } from "@nasti/common/types"
import { Spinner } from "@nasti/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nasti/ui/card"
import { getTripsQueryOptions, useViewState } from "@nasti/common/hooks"
import { ChevronRight, MapPin, RefreshCwIcon } from "lucide-react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { useEffect, useRef, useState } from "react"
import Map, { Marker, Popup } from "react-map-gl"
import { parsePostGISPoint } from "@nasti/common/utils"
import { cn } from "@nasti/ui/utils"

export type TripWithLocation = Omit<Trip, "location_coordinate"> & {
  location_coordinate: string
}

export const tripWithLocationFilter = (trip: Trip): trip is TripWithLocation =>
  Boolean(trip.location_coordinate)

export const getTripCoordinates = (
  trip: Trip,
): { latitude: number; longitude: number } => {
  const wkbString = trip.location_coordinate
  if (!wkbString) throw new Error("No location coordinate")
  return parsePostGISPoint(wkbString)
}

export const Route = createFileRoute("/_private/trips/")({
  component: TripsList,
  pendingComponent: () => (
    <div className="px-auto mx-auto mt-36">
      <Spinner size={"xl"} />
    </div>
  ),
  loader: async () => {
    const queryOptions = getTripsQueryOptions()
    const trips = await queryClient.ensureQueryData<Trip[] | null>(queryOptions)
    return { trips }
  },
})

const TripsMap = ({ trips }: { trips: Trip[] }) => {
  const [showPopup, setShowPopup] = useState<TripWithLocation | null>(null)
  const [mapHeight, setMapHeight] = useState("calc(100vh - 100px)")
  const mapContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateMapHeight = () => {
      if (mapContainerRef.current) {
        // Get the top position of the map container
        const topPosition = mapContainerRef.current.getBoundingClientRect().top
        // Calculate remaining viewport height
        setMapHeight(`calc(100vh - ${topPosition}px)`)
      }
    }

    // Initial calculation
    updateMapHeight()

    // Add resize listener
    window.addEventListener("resize", updateMapHeight)

    // Cleanup
    return () => window.removeEventListener("resize", updateMapHeight)
  }, [])

  // Calculate bounds based on all trip coordinates
  const initialViewState = useViewState(
    trips
      .filter(tripWithLocationFilter)
      .map(getTripCoordinates)
      .map(({ longitude, latitude }) => [longitude, latitude]),
  )

  return (
    <div ref={mapContainerRef} className="w-full" style={{ height: mapHeight }}>
      <Map
        mapLib={mapboxgl as never}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
        initialViewState={initialViewState}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
      >
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
    </div>
  )
}

function TripsList() {
  const { trips } = Route.useLoaderData()
  const navigate = useNavigate({ from: "/trips" })
  const queryOptions = getTripsQueryOptions()
  const refetch = () => queryClient.refetchQueries(queryOptions)

  const state = queryClient.getQueryState(queryOptions.queryKey)
  const isFetching = state?.fetchStatus === "fetching"

  return (
    <div>
      <div className="flex items-center justify-between align-middle">
        <div className="p-2 text-2xl">Trips</div>
        <div className="p-2">
          <RefreshCwIcon
            onClick={refetch}
            className={cn("h-5 w-5", isFetching ? "animate-spin" : "")}
          />
        </div>
      </div>
      <Tabs defaultValue="list">
        <TabsList className="bg-secondary-background mb-2 w-full">
          <TabsTrigger className="w-full" value="list">
            List
          </TabsTrigger>
          <TabsTrigger className="w-full" value="map">
            Map
          </TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="">
          {trips?.map((trip) => (
            <Card
              className="flex flex-row rounded-none bg-inherit p-0"
              key={trip.id}
              onClick={() =>
                navigate({ to: "/trips/$id", params: { id: trip.id } })
              }
            >
              <div className="flex flex-grow flex-col">
                <CardHeader className="p-3">
                  <CardTitle>{trip.name}</CardTitle>
                  <CardDescription>{trip.location_name}</CardDescription>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  {trip.start_date &&
                    new Date(trip.start_date).toLocaleDateString()}{" "}
                  -{" "}
                  {trip.end_date &&
                    new Date(trip.end_date).toLocaleDateString()}
                </CardContent>
              </div>
              <div className="text-secondary flex w-1/6 flex-col justify-center pr-2">
                <ChevronRight height={45} width={45} />
              </div>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="map">
          <TripsMap trips={trips ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
