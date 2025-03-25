import { useHydrateTripDetails } from "@/hooks/useHydrateTripDetails"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nasti/ui/card"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@nasti/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@nasti/ui/dropdown-menu"
import { Spinner } from "@nasti/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nasti/ui/tooltip"
import { cn } from "@nasti/ui/utils"

import {
  useALAImage,
  useALASpeciesDetail,
  useALASpeciesImage,
  useViewState,
} from "@nasti/common/hooks"
import {
  Collection,
  CollectionPhotoSignedUrl,
  Person,
  Species,
} from "@nasti/common/types"
import { Button } from "@nasti/ui/button"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import {
  ChevronLeft,
  ChevronRight,
  LeafIcon,
  PlusCircle,
  RefreshCwIcon,
  Settings,
  ShoppingBag,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { parsePostGISPoint } from "@nasti/common/utils"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import Map, { Marker, Popup } from "react-map-gl"
import { useGeoLocation } from "@/contexts/location"

const CollectionListItem = ({
  collection,
  photo,
  species,
  person,
}: {
  collection: Collection | null
  photo: CollectionPhotoSignedUrl | null
  species?: Species | null
  person?: Person | null
}) => {
  const image = useALASpeciesImage({ guid: species?.ala_guid })
  const collPhoto = photo?.signedUrl ?? image
  const { getDistanceKm } = useGeoLocation()

  const displayDistance = useMemo(() => {
    const collLocation = collection?.location
      ? parsePostGISPoint(collection?.location)
      : undefined
    const distance = collLocation ? getDistanceKm(collLocation) : undefined
    if (distance === undefined) return undefined
    return distance > 10 ? distance?.toFixed(0) : distance.toFixed(2)
  }, [getDistanceKm, collection])

  if (!collection) return <></>

  return (
    <Card
      className="flex max-h-24 flex-row rounded-none bg-inherit p-0"
      key={collection.id}
    >
      {collPhoto ? (
        <span className="flex h-24 w-24 content-center justify-center">
          <img
            src={collPhoto}
            alt={`${species?.name} Image`}
            className="w-24 object-cover text-sm"
          />
        </span>
      ) : (
        <span className="flex h-24 w-24 items-center justify-center bg-slate-500">
          <LeafIcon className="h-8 w-8" />
        </span>
      )}

      <div className="flex flex-grow flex-col">
        <CardHeader className="p-2">
          <CardTitle className="m-0 w-52 truncate overflow-ellipsis text-lg md:w-96">
            {species?.name ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <i>{species.name}</i>
                  </TooltipTrigger>
                  <TooltipContent>{species.name}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : collection.field_name && collection.field_name !== "" ? (
              collection.field_name
            ) : (
              "Uknown species"
            )}
          </CardTitle>
          <CardDescription>{person?.name || "Unknown person"}</CardDescription>
        </CardHeader>
        <CardContent className="w-60 truncate overflow-ellipsis px-3 pb-3 text-xs">
          {collection.created_at &&
            new Date(collection.created_at).toLocaleString()}{" "}
          {displayDistance && (
            <span className="text-secondary">{displayDistance} km away</span>
          )}
        </CardContent>
      </div>
      <div className="text-secondary flex shrink flex-col justify-center pr-2">
        <ChevronRight height={45} width={45} />
      </div>
    </Card>
  )
}

const CollectionListTab = ({ id }: { id: string }) => {
  const { data } = useHydrateTripDetails({ id })

  const collectionPhotosMap = useMemo(() => {
    if (!data.trip?.collectionPhotos) return {}
    return data.trip.collectionPhotos.reduce(
      (acc, photo) => {
        if (!acc[photo.collection_id]) acc[photo.collection_id] = []
        acc[photo.collection_id].push(photo)
        return acc
      },
      {} as Record<string, CollectionPhotoSignedUrl[]>,
    )
  }, [data.trip?.collectionPhotos])

  if (!data) return <></>
  return (
    <>
      {data.trip?.collections.map((coll) => {
        const species = data.species?.find(
          (species) => species.id === coll.species_id,
        )
        const person = data.people?.find(
          (person) => person.id === coll.created_by,
        )
        return (
          <CollectionListItem
            key={coll.id}
            collection={coll}
            photo={collectionPhotosMap[coll.id]?.[0]}
            species={species}
            person={person}
          />
        )
      })}
      {data.trip && data.trip.collections.length === 0 && (
        <div className="text-center">
          <span className="p-4 text-xl">No collections recorded yet</span>
        </div>
      )}
      {/* <Link to="data/new" className="z-50"> */}
      <button className="fab from-secondary to-primary flex items-center justify-center bg-gradient-to-br">
        <PlusCircle width={42} height={42} />
      </button>
      {/* </Link> */}
    </>
  )
}

const CollectionsMap = ({ id }: { id: string }) => {
  const { data } = useHydrateTripDetails({ id })
  const { location } = useGeoLocation()

  const [showPopup, setShowPopup] = useState<Collection | null>(null)
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

  const collections =
    data.trip?.collections.filter((col) => Boolean(col.location)) ?? []

  const initialCollectionCoords: Array<[number, number]> = collections
    .map((col) => parsePostGISPoint(col.location!))
    .map(({ longitude, latitude }) => [longitude, latitude])

  if (location) {
    console.log({ location })
    initialCollectionCoords.push([location.longitude, location.latitude])
  }
  // Calculate bounds based on all trip coordinates
  const initialViewState = useViewState(initialCollectionCoords)

  return (
    <div ref={mapContainerRef} className="w-full" style={{ height: mapHeight }}>
      <Map
        mapLib={mapboxgl as never}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
        initialViewState={initialViewState}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
      >
        {location && (
          <Marker {...location}>
            <div className="h-4 w-4 rounded-full border border-blue-400 bg-blue-500" />
          </Marker>
        )}
        {collections.map((col) => (
          <Marker {...parsePostGISPoint(col.location!)} key={col.id}>
            <div className="rounded-full bg-white/50 p-2">
              <ShoppingBag
                className="text-primary h-5 w-5 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPopup(col)
                }}
              />
            </div>
          </Marker>
        ))}
        {showPopup && (
          <Popup
            onClose={() => setShowPopup(null)}
            {...parsePostGISPoint(showPopup.location!)}
          >
            {/* <Link
              to={"/trips/$id"}
              params={{ id: showPopup.id }}
              className="text-primary"
            >
              {showPopup?.name} trip
            </Link> */}
          </Popup>
        )}
      </Map>
    </div>
  )
}

type SettingsDrawers = "species" | "people"

const TripDetail = () => {
  const { id } = useParams({ from: "/_private/trips/$id" })
  const { data, isFetching, isError, refetch, isRefetching } =
    useHydrateTripDetails({ id })
  const navigate = useNavigate()

  const [isOpenSettings, setIsOpenSettings] = useState<SettingsDrawers>()
  console.log({ isOpenSettings })
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
      <div className="flex justify-end p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={"outline"}
              size="default"
              className="text-md space-x-2"
            >
              <Settings aria-label="Settings" size={18} /> <span>Settings</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-md">
            <DropdownMenuItem onClick={() => setIsOpenSettings("species")}>
              Species
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsOpenSettings("people")}>
              People
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
          <CollectionListTab id={id} />
        </TabsContent>
        <TabsContent value="map">
          <CollectionsMap id={id} />
        </TabsContent>
      </Tabs>
      <SpeciesDrawer
        species={data.species}
        isOpen={isOpenSettings === "species"}
        onOpenChange={(isOpen) =>
          setIsOpenSettings(isOpen ? "species" : undefined)
        }
      />
    </div>
  )
}

export const SpeciesListItem = ({ species }: { species: Species }) => {
  const { data } = useALASpeciesDetail(species?.ala_guid)
  const { data: image } = useALAImage(data?.imageIdentifier, "thumbnail")

  if (!species || !data) {
    return <></>
  }

  return (
    <div className="border-primary flex h-20 gap-4 border-t p-0">
      {image ? (
        <span className="flex h-20 w-20 content-center justify-center">
          <img
            src={image}
            alt={`${species.name} Image`}
            className="w-20 object-cover text-sm"
          />
        </span>
      ) : (
        <span className="flex h-20 w-20 items-center justify-center bg-slate-500">
          <LeafIcon />
        </span>
      )}
      <div className="text-foreground flex h-full w-full flex-col py-1 pr-2">
        <div className="flex items-center justify-between">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <i className="max-w-56 truncate font-semibold">
                  {species?.name}
                </i>
              </TooltipTrigger>
              <TooltipContent>{species.name}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex flex-col items-start text-xs">
          {data.commonNames.length > 0 && (
            <span>{data.commonNames[0].nameString}</span>
          )}
          {species.indigenous_name && (
            <span>
              <i>{species.indigenous_name}</i>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const SpeciesDrawer = ({
  species,
  isOpen,
  onOpenChange,
}: {
  species?: Species[] | null
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}) => {
  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex justify-between">
            <DrawerTitle>Target Species</DrawerTitle>
            <DrawerClose>
              <X />
            </DrawerClose>
          </div>
          <DrawerDescription>
            Select a species to record a collection
          </DrawerDescription>
        </DrawerHeader>
        {species && species.length > 0 && (
          <div className="border-primary overflow-y-scroll border-b">
            {species.map((sp) => (
              <SpeciesListItem key={sp.id} species={sp} />
            ))}
          </div>
        )}
        {!species ||
          (species.length === 0 && (
            <div className="text-muted-foreground p-4 text-center">
              No species configured for this trip.
            </div>
          ))}
      </DrawerContent>
    </Drawer>
  )
}

export const Route = createFileRoute("/_private/trips/$id")({
  component: TripDetail,
  pendingComponent: () => (
    <div className="px-auto mx-auto mt-36">
      <Spinner size={"xl"} />
    </div>
  ),
})
