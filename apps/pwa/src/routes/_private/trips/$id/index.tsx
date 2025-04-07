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

import { useALASpeciesImage, useViewState } from "@nasti/common/hooks"
import {
  CollectionPhotoSignedUrl,
  CollectionWithCoord,
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
  SortAsc,
  SortDesc,
  X,
} from "lucide-react"
import MiniSearch from "minisearch"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import Map, { Marker, Popup } from "react-map-gl"
import { useGeoLocation } from "@/contexts/location"
import { ButtonLink } from "@nasti/ui/button-link"
import { SpeciesSelectList } from "@/components/species/SpeciesSelectList"
import { Input } from "@nasti/ui/input"
import { useCollectionCreate } from "@/hooks/useCollectionCreate"

const CollectionListItem = ({
  collection,
  photo,
  species,
  person,
}: {
  collection: CollectionWithCoord
  photo: CollectionPhotoSignedUrl | null
  species?: Species | null
  person?: Person | null
}) => {
  const image = useALASpeciesImage({ guid: species?.ala_guid })
  const collPhoto = photo?.signedUrl ?? image
  const { getDistanceKm } = useGeoLocation()
  const { getIsMutating, getIsPending } = useCollectionCreate({
    tripId: collection.trip_id ?? "",
  })

  const displayDistance = useMemo(() => {
    const collLocation = collection?.locationCoord
    const distance = collLocation ? getDistanceKm(collLocation) : undefined
    if (distance === undefined) return undefined
    return distance > 10 ? distance?.toFixed(0) : distance.toFixed(2)
  }, [getDistanceKm, collection])

  const isMutating = getIsMutating({ id: collection.id })
  const isPending = getIsPending({ id: collection.id })

  if (!collection) return <></>

  return (
    <Card
      className={cn(
        "flex max-h-24 flex-row rounded-none bg-inherit p-0",
        isPending && "border-green-500 bg-gray-400/10",
        isMutating &&
          "animate-pulse border-green-600 bg-amber-50/20 dark:bg-amber-950/10",
      )}
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

type CollectionWithSpecies = CollectionWithCoord & { species?: Species }

const CollectionListTab = ({ id }: { id: string }) => {
  const [sortMode, setSortMode] = useState<
    "created_at-asc" | "created_at-desc" | "distance-asc" | "distance-desc"
  >("created_at-desc")
  const [searchValue, setSearchValue] = useState("")
  const isSearching = useRef(false)
  const { data } = useHydrateTripDetails({ id })
  const { getDistanceKm } = useGeoLocation()

  const miniSearchRef = useRef<MiniSearch<CollectionWithSpecies> | null>(null)

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

  const searchableCollections: CollectionWithSpecies[] = useMemo(() => {
    const collections = data.trip?.collections ?? []
    if (collections.length === 0) return []
    return collections.map((coll) => {
      if (coll.species_id && data.species)
        return {
          ...coll,
          // add the species for ease of searching
          species: data.species.find((sp) => sp.id === coll.species_id),
        }
      return coll
    })
  }, [data.trip?.collections])

  const [searchResults, setSearchResults] = useState<
    Array<CollectionWithSpecies>
  >(searchableCollections)

  const sortedSearchResults = useMemo(() => {
    const sorted = [...searchResults].sort((a, b) => {
      if (sortMode.startsWith("created_at")) {
        return (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      } else if (sortMode.startsWith("distance")) {
        const aDistance = a?.locationCoord
          ? getDistanceKm(a.locationCoord)
          : 100000000
        const bDistance = b?.locationCoord
          ? getDistanceKm(b.locationCoord)
          : 100000000
        return (aDistance ?? 100000000) - (bDistance ?? 100000000)
      }
      return 1
    })

    if (sortMode.split("-")[1] === "desc") return sorted.reverse()
    return sorted
  }, [searchResults, sortMode, getDistanceKm])

  // Initialize miniSearch
  useEffect(() => {
    if (!miniSearchRef.current) {
      miniSearchRef.current = new MiniSearch<CollectionWithSpecies>({
        fields: ["field_name", "description", "species.name"],
        searchOptions: {
          fuzzy: 0.2,
        },
        extractField: (document, fieldName) => {
          // Access nested fields
          return (
            fieldName
              .split(".")
              // sorry this is necessary due to poor type inference of minisearch library
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .reduce((doc: any, key: string) => doc && doc[key], document)
          )
        },
      })
    }
  }, [])

  // Update search index and results when collections change
  useEffect(() => {
    if (!miniSearchRef.current) return

    miniSearchRef.current.removeAll()
    miniSearchRef.current.addAll(searchableCollections)

    // If there's a search in progress, update the results
    if (searchValue.length > 0) {
      const searchMatches = miniSearchRef.current
        .search(searchValue, { prefix: true })
        .map((item) => item.id)

      setSearchResults(
        searchableCollections.filter((coll) => searchMatches.includes(coll.id)),
      )
    } else {
      // If no search is active, show all collections
      setSearchResults(searchableCollections)
    }
  }, [searchableCollections, searchValue])

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newSearchValue = e.target.value
      isSearching.current = true
      setSearchValue(newSearchValue)

      if (newSearchValue.length === 0) {
        setSearchResults(searchableCollections)
        return
      }

      if (!miniSearchRef.current) return

      const searchMatches = miniSearchRef.current
        .search(newSearchValue, { prefix: true })
        .map((item) => item.id)

      setSearchResults(
        searchableCollections.filter((coll) => searchMatches.includes(coll.id)),
      )
    },
    [searchableCollections],
  )

  const resetSearch = useCallback(() => {
    setSearchValue("")
    setSearchResults(searchableCollections)
    isSearching.current = false
  }, [setSearchValue, setSearchResults])

  useEffect(() => {
    if (isSearching.current && searchValue.length === 0) resetSearch()
  }, [searchValue, resetSearch, isSearching.current])

  if (!data) return <></>
  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full justify-between gap-1 px-1 text-sm">
        <Input
          placeholder="Search collections"
          className={`transition-all duration-500 ease-in-out ${
            isSearching.current ? "w-full flex-grow" : "w-full"
          }`}
          value={searchValue}
          onChange={handleSearchChange}
        />
        {isSearching.current && (
          <Button
            onClick={resetSearch}
            className="text-xs opacity-100 transition-opacity duration-500 ease-in-out"
            variant={"outline"}
            size={"icon"}
          >
            <X height={14} width={14} />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={"outline"}
              size="default"
              className="text-md space-x-2 transition-all duration-500 ease-in-out"
            >
              {sortMode.split("-")[1] === "desc" && (
                <SortDesc aria-label="Settings" size={14} />
              )}
              {sortMode.split("-")[1] === "asc" && (
                <SortAsc aria-label="Settings" size={14} />
              )}
              {!isSearching.current ? (
                <span className="opacity-100 transition-opacity duration-300 ease-in-out">
                  {sortMode.startsWith("created_at") ? "Created" : "Distance"}
                </span>
              ) : (
                <span className="w-0 overflow-hidden opacity-0 transition-all duration-300 ease-in-out">
                  {sortMode.startsWith("created_at") ? "Created" : "Distance"}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-md">
            <DropdownMenuItem onClick={() => setSortMode("created_at-desc")}>
              Newest first
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortMode("created_at-asc")}>
              Oldest first
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortMode("distance-desc")}>
              Furthest first
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortMode("distance-asc")}>
              Closest first
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div>
        {sortedSearchResults.map((coll) => {
          const person = data.people?.find(
            (person) => person.id === coll.created_by,
          )
          return (
            <CollectionListItem
              key={coll.id}
              collection={coll}
              photo={collectionPhotosMap[coll.id]?.[0]}
              species={coll.species}
              person={person}
            />
          )
        })}
        {data.trip && data.trip.collections.length === 0 && (
          <div className="text-center">
            <span className="p-4 text-xl">No collections recorded yet</span>
          </div>
        )}
      </div>
    </div>
  )
}

const CollectionsMap = ({ id }: { id: string }) => {
  const { data } = useHydrateTripDetails({ id })
  const { location } = useGeoLocation()

  const [showPopup, setShowPopup] = useState<CollectionWithCoord | null>(null)
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
    data.trip?.collections.filter((col) => Boolean(col.locationCoord)) ?? []

  const initialCollectionCoords: Array<[number, number]> = collections.map(
    ({ locationCoord }) => [locationCoord!.longitude, locationCoord!.latitude],
  )

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
          <Marker {...col.locationCoord!} key={col.id}>
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
            {...showPopup.locationCoord!}
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
  const { id } = useParams({ from: "/_private/trips/$id/" })
  const { data, isFetching, isError, refetch, isRefetching } =
    useHydrateTripDetails({ id })
  const navigate = useNavigate()

  const [isOpenSettings, setIsOpenSettings] = useState<SettingsDrawers>()

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
        <ButtonLink
          to="/trips/$id/collections/new"
          className="fab from-secondary to-primary z-50 flex items-center justify-center bg-gradient-to-br"
        >
          <PlusCircle width={42} height={42} />
        </ButtonLink>
      </Tabs>
      <SpeciesDrawer
        species={data.species}
        tripId={id}
        isOpen={isOpenSettings === "species"}
        onOpenChange={(isOpen) =>
          setIsOpenSettings(isOpen ? "species" : undefined)
        }
      />
    </div>
  )
}

const SpeciesDrawer = ({
  species,
  tripId,
  isOpen,
  onOpenChange,
}: {
  species?: Species[] | null
  tripId: string
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}) => {
  const navigate = useNavigate()
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
        <SpeciesSelectList
          species={species ?? undefined}
          onSelectSpecies={(sp) =>
            navigate({
              to: "/trips/$id/collections/new",
              params: { id: tripId },
              search: { speciesId: sp.id },
            })
          }
        />
      </DrawerContent>
    </Drawer>
  )
}

export const Route = createFileRoute("/_private/trips/$id/")({
  component: TripDetail,
  pendingComponent: () => (
    <div className="px-auto mx-auto mt-36">
      <Spinner size={"xl"} />
    </div>
  ),
})
