import { Spinner } from "@nasti/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"

import { Button } from "@nasti/ui/button"
import {
  createFileRoute,
  Link,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import {
  Binoculars,
  ChevronLeft,
  LeafIcon,
  PlusCircle,
  ShoppingBag,
} from "lucide-react"

import { TripDataList } from "@/components/trip/TripDataList"
import { TripCollectionsMap } from "@/components/trip/TripCollectionsMap"
import {
  SpeciesDrawer,
  SpeciesDrawerProvider,
  useSpeciesDrawer,
} from "@/components/trip/TripSpeciesDrawer"
import { useOpenClose } from "@nasti/ui/hooks"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { useTripDetails } from "@/hooks/useTripDetails"
import { useSpeciesForTrip } from "@/hooks/useSpeciesForTrip"

const NewDataButton = () => {
  const { isOpen, setIsOpen } = useOpenClose()
  const { id } = useParams({ from: "/_private/trips/$id/" })

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button className="fab from-secondary to-primary bg-linear-to-br z-50 flex items-center justify-center">
          <PlusCircle width={42} height={42} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="mb-6 w-80">
        <div className="space-y-2">
          <h3 className="mb-3 text-sm font-medium">Add New</h3>

          <div className="space-y-1">
            <Link
              to="/trips/$id/collections/new"
              params={{ id }}
              className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-gray-50"
              onClick={() => setIsOpen(false)}
            >
              <div className="shrink-0">
                <ShoppingBag className="size-4 text-gray-600" />
              </div>
              <p className="text-lg font-medium">{"New Collection"}</p>
            </Link>
            <Link
              to="/trips/$id/scouting-notes/new"
              params={{ id }}
              className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-gray-50"
              onClick={() => setIsOpen(false)}
            >
              <div className="shrink-0">
                <Binoculars className="size-4 text-gray-600" />
              </div>
              <p className="text-lg font-medium">{"New Scouting Note"}</p>
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const TripDetail = () => {
  const { id } = useParams({ from: "/_private/trips/$id/" })
  const tripDetailsQuery = useTripDetails({ tripId: id })
  const tripSpeciesQuery = useSpeciesForTrip(id)
  const navigate = useNavigate()

  const { setIsOpen } = useSpeciesDrawer()

  const handleBackClick = () => {
    navigate({ to: "/trips" })
  }

  const isPending = tripDetailsQuery.isPending || tripSpeciesQuery.isPending
  const isError = tripDetailsQuery.isError || tripSpeciesQuery.isError
  const trip = tripDetailsQuery.data
  const species = tripSpeciesQuery.data

  if (isPending)
    return (
      <div className="px-auto mx-auto mt-36 flex flex-col items-center text-center">
        <Spinner size={"xl"} />
        <span className="text-2xl">Syncing Trip Data</span>
      </div>
    )

  if (isError && !trip)
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
          {trip?.name}
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
            Data List
          </TabsTrigger>
          {trip?.collections && trip.collections.length > 0 && (
            <TabsTrigger className="w-full" value="map">
              Map
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="list">
          <TripDataList id={id} />
        </TabsContent>
        <TabsContent value="map">
          <TripCollectionsMap id={id} />
        </TabsContent>
        <NewDataButton />
      </Tabs>
      <SpeciesDrawer species={species} tripId={id} />
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
