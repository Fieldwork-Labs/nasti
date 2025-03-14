import { queryClient } from "@/lib/queryClient"
import { createFileRoute } from "@tanstack/react-router"
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
import { getTripsQueryOptions } from "@nasti/common/hooks"
import { ChevronRight } from "lucide-react"

export const Route = createFileRoute("/_private/trips/")({
  component: TripsList,
  pendingComponent: () => (
    <div className="px-auto mx-auto mt-36">
      <Spinner size={"xl"} />
    </div>
  ),
  loader: async () => {
    return queryClient.ensureQueryData<Trip[] | null>(getTripsQueryOptions())
  },
})

function TripsList() {
  const trips = Route.useLoaderData()
  return (
    <div>
      <div className="p-2 text-xl">Trips</div>
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
        <TabsContent value="map">Show map here</TabsContent>
      </Tabs>
    </div>
  )
}
