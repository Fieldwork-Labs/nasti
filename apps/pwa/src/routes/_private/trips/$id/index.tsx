import { useHydrateTripDetails } from "@/hooks/useHydrateTripDetails"
import { Spinner } from "@nasti/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import { cn } from "@nasti/ui/utils"

import { Button } from "@nasti/ui/button"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { ChevronLeft, LeafIcon, PlusCircle, RefreshCwIcon } from "lucide-react"

import { TripCollectionList } from "@/components/trip/TripCollectionsList"
import { TripCollectionsMap } from "@/components/trip/TripCollectionsMap"
import {
  SpeciesDrawer,
  SpeciesDrawerProvider,
  useSpeciesDrawer,
} from "@/components/trip/TripSpeciesDrawer"
import { ButtonLink } from "@nasti/ui/button-link"

const TripDetail = () => {
  const { id } = useParams({ from: "/_private/trips/$id/" })
  const { data, isFetching, isError, refetch, isRefetching } =
    useHydrateTripDetails({ id })
  const navigate = useNavigate()

  const { setIsOpen } = useSpeciesDrawer()

  const handleBackClick = () => {
    navigate({ to: "/trips" })
  }

  if (isFetching)
    return (
      <div className="px-auto mx-auto mt-36 flex flex-col items-center text-center">
        <Spinner size={"xl"} />
        <span className="text-2xl">Syncing Trip Data</span>
      </div>
    )

  if (isError && !data)
    return (
      <div className="px-auto mx-auto mt-36 flex flex-col items-center text-center">
        <span className="text-2xl text-orange-600/80">
          Unable to load trip data
        </span>
      </div>
    )

  return (
    <div>
      <div className="flex items-center justify-between align-middle">
        <div className="flex items-center p-2 text-2xl">
          <ChevronLeft onClick={handleBackClick} width={36} height={36} />{" "}
          {data.trip?.name}
        </div>
        <div className="p-2">
          <RefreshCwIcon
            onClick={refetch}
            className={cn("h-5 w-5", isRefetching ? "animate-spin" : "")}
          />
        </div>
      </div>
      <div className="flex justify-end p-1">
        <Button
          variant={"outline"}
          size="default"
          className="text-md space-x-2"
          onClick={() => setIsOpen(true)}
        >
          <LeafIcon aria-label="Species" size={18} /> <span>Species</span>
        </Button>
      </div>
      <Tabs defaultValue="list">
        <TabsList className="bg-secondary-background mb-2 w-full">
          <TabsTrigger className="w-full" value="list">
            Collection List
          </TabsTrigger>
          {data.trip?.collections && data.trip.collections.length > 0 && (
            <TabsTrigger className="w-full" value="map">
              Map
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="list">
          <TripCollectionList id={id} />
        </TabsContent>
        <TabsContent value="map">
          <TripCollectionsMap id={id} />
        </TabsContent>
        <ButtonLink
          to="/trips/$id/collections/new"
          className="fab from-secondary to-primary z-50 flex items-center justify-center bg-gradient-to-br"
        >
          <PlusCircle width={42} height={42} />
        </ButtonLink>
      </Tabs>
      <SpeciesDrawer species={data.species} tripId={id} />
    </div>
  )
}

export const Route = createFileRoute("/_private/trips/$id/")({
  component: (props) => (
    <SpeciesDrawerProvider>
      <TripDetail {...props} />
    </SpeciesDrawerProvider>
  ),
  pendingComponent: () => (
    <div className="px-auto mx-auto mt-36">
      <Spinner size={"xl"} />
    </div>
  ),
})
