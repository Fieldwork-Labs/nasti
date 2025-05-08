import {
  CollectionWithCoordAndPhotos,
  useHydrateTripDetails,
} from "@/hooks/useHydrateTripDetails"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nasti/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nasti/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nasti/ui/tooltip"
import { cn } from "@nasti/ui/utils"

import type { Person, Species } from "@nasti/common/types"
import { Button } from "@nasti/ui/button"
import { ChevronRight, LeafIcon, SortAsc, SortDesc, X } from "lucide-react"
import MiniSearch from "minisearch"
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { useGeoLocation } from "@/contexts/location"
import { useCollectionCreate } from "@/hooks/useCollectionCreate"
import { Input } from "@nasti/ui/input"
import "mapbox-gl/dist/mapbox-gl.css"
import { Link } from "@tanstack/react-router"
import { useDisplayDistance } from "@/hooks/useDisplayDistance"
import { CollectionPhoto as Photo } from "../collection/CollectionPhotos/CollectionPhoto"

const CollectionListItem = ({
  collection,
  species,
  person,
}: {
  collection: CollectionWithCoordAndPhotos
  species?: Species | null
  person?: Person | null
}) => {
  const { getIsMutating, getIsPending } = useCollectionCreate({
    tripId: collection.trip_id ?? "",
  })

  const displayDistance = useDisplayDistance(collection.locationCoord ?? {})

  const isMutating = getIsMutating({ id: collection.id })
  const isPending = getIsPending({ id: collection.id })

  const firstPhoto =
    collection.photos && collection.photos.length > 0
      ? collection.photos[0]
      : null
  if (!collection || !collection.trip_id) return <></>

  return (
    <Link
      to={"/trips/$id/collections/$collectionId"}
      params={{
        id: collection.trip_id,
        collectionId: collection.id,
      }}
    >
      <Card
        className={cn(
          "flex max-h-[98px] flex-row rounded-none bg-inherit p-0",
          isPending && "border-green-500 bg-gray-400/10",
          isMutating &&
            "animate-pulse border-green-600 bg-amber-50/20 dark:bg-amber-950/10",
        )}
        key={collection.id}
      >
        <Suspense
          fallback={
            <span className="flex h-24 w-24 items-center justify-center bg-slate-500">
              <LeafIcon className="h-8 w-8" />
            </span>
          }
        >
          <Photo id={firstPhoto?.id} species={species} className="h-24 w-24" />
        </Suspense>

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
            <CardDescription>
              {person?.name || "Unknown person"}
            </CardDescription>
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
    </Link>
  )
}

type CollectionWithSpecies = CollectionWithCoordAndPhotos & {
  species?: Species
}

export const TripCollectionList = ({ id }: { id: string }) => {
  const [sortMode, setSortMode] = useState<
    "created_at-asc" | "created_at-desc" | "distance-asc" | "distance-desc"
  >("created_at-desc")
  const [searchValue, setSearchValue] = useState("")
  const isSearching = useRef(false)
  const { data } = useHydrateTripDetails({ id })
  const { getDistanceKm } = useGeoLocation()

  const miniSearchRef = useRef<MiniSearch<CollectionWithSpecies> | null>(null)

  const previousCollectionsRef = useRef<CollectionWithSpecies[]>([])
  const searchableCollections = useMemo(() => {
    const collections = data.trip?.collections ?? []
    if (collections.length === 0) return []

    // Use a stable reference check to avoid unnecessary recalculations
    if (
      previousCollectionsRef.current?.length === collections.length &&
      JSON.stringify(previousCollectionsRef.current) ===
        JSON.stringify(collections)
    ) {
      return previousCollectionsRef.current
    }

    const result = collections.map((coll) => {
      if (coll.species_id && data.species) {
        return {
          ...coll,
          species: data.species.find((sp) => sp.id === coll.species_id),
        }
      }
      return coll
    })

    previousCollectionsRef.current = result
    return result
  }, [data.trip?.collections, data.species])

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
  }, [searchResults, sortMode])

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

  // Effect for updating the search index when collections change
  useEffect(() => {
    if (!miniSearchRef.current) return

    miniSearchRef.current.removeAll()
    miniSearchRef.current.addAll(searchableCollections)

    // Don't update search results here - let the second effect handle that
  }, [searchableCollections])

  // Separate effect for updating search results when search value changes
  useEffect(() => {
    if (!miniSearchRef.current || !searchableCollections.length) return

    if (searchValue.length > 0) {
      const searchMatches = miniSearchRef.current
        .search(searchValue, { prefix: true })
        .map((item) => item.id)

      setSearchResults(
        searchableCollections.filter((coll) => searchMatches.includes(coll.id)),
      )
    } else {
      setSearchResults(searchableCollections)
    }
  }, [searchValue]) // Only depend on searchValue, not searchableCollections

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
  }, [searchValue, resetSearch, searchableCollections])

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
