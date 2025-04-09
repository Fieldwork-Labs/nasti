import { useHydrateTripDetails } from "@/hooks/useHydrateTripDetails"
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

import { useALASpeciesImage } from "@nasti/common/hooks"
import {
  CollectionPhotoSignedUrl,
  CollectionWithCoord,
  Person,
  Species,
} from "@nasti/common/types"
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
import { PendingCollectionPhoto } from "@/hooks/useCollectionPhotosMutate"
import { getFile } from "@/lib/persistFiles"

const existingPhotoTypeGuard = (
  photo: CollectionPhotoSignedUrl | PendingCollectionPhoto | null,
): photo is CollectionPhotoSignedUrl =>
  Boolean(photo && "signedUrl" in photo && photo.signedUrl)

// Create a cache to store promises by photo ID to prevent re-rendering issues
const photoPromiseCache = new Map()

const getPhotoUrl = (
  photo: CollectionPhotoSignedUrl | PendingCollectionPhoto | null,
  image: string | null | undefined,
) => {
  // For existing photos or fallbacks, return immediately
  if (!photo) {
    if (image) return { read: () => image }
    else return { read: () => null }
  } else if (existingPhotoTypeGuard(photo)) {
    return { read: () => photo.signedUrl }
  }

  // For IndexedDB photos, use our cache
  const photoId = photo.id

  // Check if we already have this photo in our cache
  if (!photoPromiseCache.has(photoId)) {
    let resolvePromise: (value: string | null) => void = () => {}
    // Create a promise that we can resolve later
    const promise = new Promise<string | null>((resolve) => {
      resolvePromise = resolve
    })

    // Store both the promise and its status in our cache
    const cache = {
      promise,
      status: "pending",
      url: null as string | null,
    }

    photoPromiseCache.set(photoId, cache)

    // Start loading asynchronously
    ;(async () => {
      try {
        console.log("looking for file")
        const file = await getFile(photoId)
        console.log("file", file)
        if (!file) throw new Error("Photo file not found")

        const objectUrl = URL.createObjectURL(file)
        console.log("url", objectUrl)

        // Update our cache and resolve the promise
        cache.url = objectUrl
        cache.status = "success"
        resolvePromise(objectUrl)
      } catch (e) {
        console.log("Error loading photo")
        console.log(e)
        console.log(photo)

        // Fall back to image if available
        const fallback = image || null
        cache.url = fallback
        cache.status = "error"
        resolvePromise(fallback)
      }
    })()
  }

  // Get our cached item
  const cachedItem = photoPromiseCache.get(photoId)

  return {
    read() {
      if (cachedItem.status === "pending") {
        throw cachedItem.promise
      }
      return cachedItem.url
    },
  }
}

const Photo = ({
  photo,
  species,
}: {
  photo: CollectionPhotoSignedUrl | PendingCollectionPhoto | null
  species?: Species | null
}) => {
  const image = useALASpeciesImage({ guid: species?.ala_guid })
  const collPhoto = getPhotoUrl(photo, image).read()

  return (
    <span className="flex h-24 w-24 content-center justify-center">
      <img
        src={collPhoto ?? undefined}
        alt={`${species?.name} Image`}
        className="w-24 object-cover text-sm"
      />
    </span>
  )
}

const CollectionListItem = ({
  collection,
  photo,
  species,
  person,
}: {
  collection: CollectionWithCoord
  photo: CollectionPhotoSignedUrl | PendingCollectionPhoto | null
  species?: Species | null
  person?: Person | null
}) => {
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
        <Photo photo={photo} species={species} />
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

export const TripCollectionList = ({ id }: { id: string }) => {
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
      {} as Record<
        string,
        Array<CollectionPhotoSignedUrl | PendingCollectionPhoto>
      >,
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
