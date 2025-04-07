import { TripsMap } from "@/components/trip/TripsMap"
import { queryClient } from "@/lib/queryClient"
import { getTripsQueryOptions } from "@nasti/common/hooks"
import { Trip } from "@nasti/common/types"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nasti/ui/card"
import { Spinner } from "@nasti/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import { cn } from "@nasti/ui/utils"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ChevronRight, RefreshCwIcon } from "lucide-react"
import "mapbox-gl/dist/mapbox-gl.css"

export type TripWithLocation = Omit<Trip, "location_coordinate"> & {
  location_coordinate: string
}

export const tripWithLocationFilter = (trip: Trip): trip is TripWithLocation =>
  Boolean(trip.location_coordinate)

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
              <div className="text-secondary flex shrink flex-col justify-center pr-2">
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
