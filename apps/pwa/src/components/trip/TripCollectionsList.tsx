import {
  CollectionWithCoordAndPhotos,
  ScoutingNoteWithCoordAndPhotos,
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
import { cn } from "@nasti/ui/utils"

import type { Person, Species } from "@nasti/common/types"
import { Button } from "@nasti/ui/button"
import {
  Binoculars,
  CheckCircle,
  ChevronRight,
  FilterIcon,
  LeafIcon,
  ShoppingBag,
  SortAsc,
  SortDesc,
  X,
} from "lucide-react"
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
import { useDisplayDistance } from "@/hooks/useDisplayDistance"
import {
  TripCollectionPhotos,
  TripScoutingNotePhotos,
} from "@/hooks/usePhotosForTrip"
import { useScoutingNoteCreate } from "@/hooks/useScoutingNoteCreate"
import { Input } from "@nasti/ui/input"
import { Link } from "@tanstack/react-router"
import { CollectionPhoto as Photo } from "../collection/CollectionPhotos/CollectionPhoto"

// Base interface for entities that can be displayed in the list
interface DisplayableEntity {
  id: string
  trip_id?: string | null
  field_name?: string | null
  created_at?: string | null
  locationCoord?: { latitude: number; longitude: number } | null
  photos?: TripCollectionPhotos | TripScoutingNotePhotos | null
  dataType: "collection" | "scoutingNote"
}

// Configuration for entity-specific details
interface EntityListItemConfig {
  linkBasePath: string
  entityParamName: string
}

const collectionConfig: EntityListItemConfig = {
  linkBasePath: "/trips/$id/collections/$collectionId",
  entityParamName: "collectionId",
}

const scoutingNoteConfig: EntityListItemConfig = {
  linkBasePath: "/trips/$id/scouting-notes/$scoutingNoteId",
  entityParamName: "scoutingNoteId",
}

// Generic list item component
interface EntityListItemProps<TEntity extends DisplayableEntity> {
  entity: TEntity
  species?: Species | null
  person?: Person | null
  config: EntityListItemConfig
  isPending?: boolean
  isMutating?: boolean
}

function EntityListItem<TEntity extends DisplayableEntity>({
  entity,
  species,
  person,
  config,
  isMutating,
  isPending,
}: EntityListItemProps<TEntity>) {
  const displayDistance = useDisplayDistance(entity.locationCoord ?? {})

  const firstPhoto =
    entity.photos && entity.photos.length > 0 ? entity.photos[0] : null

  if (!entity || !entity.trip_id) return null

  const linkParams = {
    id: entity.trip_id,
    [config.entityParamName]: entity.id,
  }

  const Icon = (() => {
    switch (entity.dataType) {
      case "collection":
        return ShoppingBag
      case "scoutingNote":
        return Binoculars
    }
  })()

  return (
    <Link to={config.linkBasePath} params={linkParams}>
      <Card
        className={cn(
          "flex max-h-[98px] flex-row rounded-none bg-inherit p-0",
          isPending && "border-green-500 bg-gray-400/10",
          isMutating &&
            "animate-pulse border-green-600 bg-amber-50/20 dark:bg-amber-950/10",
        )}
        key={entity.id}
      >
        <Suspense
          fallback={
            <span className="flex h-24 w-24 items-center justify-center bg-slate-500">
              <LeafIcon className="h-8 w-8" />
            </span>
          }
        >
          <Photo
            id={firstPhoto?.id}
            species={species}
            className="h-24 w-24"
            overlay={<Icon className="h-10 w-10" />}
          />
        </Suspense>

        <div className="flex flex-grow flex-col">
          <CardHeader className="p-2">
            <CardTitle className="m-0 w-52 truncate overflow-ellipsis text-lg md:w-96">
              {species?.name ? (
                <i>{species.name}</i>
              ) : entity.field_name && entity.field_name !== "" ? (
                entity.field_name
              ) : (
                "Unknown species"
              )}
            </CardTitle>
            <CardDescription>
              {person?.name || "Unknown person"}
            </CardDescription>
          </CardHeader>
          <CardContent className="w-60 truncate overflow-ellipsis px-3 pb-3 text-xs">
            {entity.created_at && new Date(entity.created_at).toLocaleString()}{" "}
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
  dataType: "collection"
}

type ScoutingNoteWithSpecies = ScoutingNoteWithCoordAndPhotos & {
  species?: Species
  dataType: "scoutingNote"
}

type DataWithSpecies = CollectionWithSpecies | ScoutingNoteWithSpecies

export const CollectionListItem = ({
  collection,
  species,
  person,
}: {
  collection: CollectionWithSpecies
  species?: Species | null
  person?: Person | null
}) => {
  const { getIsMutating, getIsPending } = useCollectionCreate({
    tripId: collection.trip_id ?? "",
  })
  const isPending = getIsPending({ id: collection.id })
  return (
    <EntityListItem
      entity={collection}
      species={species}
      person={person}
      config={collectionConfig}
      isPending={Boolean(isPending)}
      isMutating={getIsMutating({ id: collection.id, includeChildren: true })}
    />
  )
}

export const ScoutingNoteListItem = ({
  scoutingNote,
  species,
  person,
}: {
  scoutingNote: ScoutingNoteWithSpecies
  species?: Species | null
  person?: Person | null
}) => {
  const { getIsMutating, getIsPending } = useScoutingNoteCreate({
    tripId: scoutingNote.trip_id ?? "",
  })
  const isPending = getIsPending({ id: scoutingNote.id })
  return (
    <EntityListItem
      entity={scoutingNote}
      species={species}
      person={person}
      config={scoutingNoteConfig}
      isPending={Boolean(isPending)}
      isMutating={getIsMutating({ id: scoutingNote.id, includeChildren: true })}
    />
  )
}

export const TripCollectionList = ({ id }: { id: string }) => {
  const [sortMode, setSortMode] = useState<
    "created_at-asc" | "created_at-desc" | "distance-asc" | "distance-desc"
  >("created_at-desc")
  const [typeFilter, setTypeFilter] = useState<
    "collection" | "scoutingNote" | null
  >(null)
  const [searchValue, setSearchValue] = useState("")
  const isSearching = useRef(false)
  const { data } = useHydrateTripDetails({ id })
  const { getDistanceKm } = useGeoLocation()

  const miniSearchRef = useRef<MiniSearch<DataWithSpecies> | null>(null)

  const speciesMap = useMemo(() => {
    const species = data.species ?? []
    return species.reduce(
      (acc, species) => {
        acc[species.id] = species
        return acc
      },
      {} as Record<string, Species>,
    )
  }, [data.species])

  const peopleMap = useMemo(() => {
    const people = data.people ?? []
    return people.reduce(
      (acc, person) => {
        acc[person.id] = person
        return acc
      },
      {} as Record<string, Person>,
    )
  }, [data.people])

  const previousDataRef = useRef<DataWithSpecies[]>([])
  const searchableData = useMemo(() => {
    const collections = data.trip?.collections ?? []
    const scoutingNotes = data.trip?.scoutingNotes ?? []
    if (collections.length === 0 && scoutingNotes.length === 0) return []

    // Use a stable reference check to avoid unnecessary recalculations
    if (
      previousDataRef.current?.length === collections.length &&
      JSON.stringify(previousDataRef.current) === JSON.stringify(collections)
    ) {
      return previousDataRef.current
    }

    const result = [
      ...collections.map((coll) => {
        return {
          ...coll,
          dataType: "collection" as const,
          species: coll.species_id ? speciesMap[coll.species_id] : undefined,
        }
      }),
      ...scoutingNotes.map((coll) => {
        return {
          ...coll,
          dataType: "scoutingNote" as const,
          species: coll.species_id ? speciesMap[coll.species_id] : undefined,
        }
      }),
    ]

    previousDataRef.current = result
    return result
  }, [data.trip?.collections, speciesMap])

  const [searchResults, setSearchResults] =
    useState<Array<DataWithSpecies>>(searchableData)

  const sortedSearchResults = useMemo(() => {
    let sorted = searchResults.sort((a, b) => {
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

    if (sortMode.split("-")[1] === "desc") sorted = sorted.reverse()

    return sorted.filter(
      (item) => typeFilter === null || item.dataType === typeFilter,
    )
  }, [searchResults, sortMode, typeFilter])

  // Initialize miniSearch
  useEffect(() => {
    if (!miniSearchRef.current) {
      miniSearchRef.current = new MiniSearch<DataWithSpecies>({
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
    miniSearchRef.current.addAll(searchableData)

    // Don't update search results here - let the second effect handle that
  }, [searchableData])

  // Separate effect for updating search results when search value changes
  useEffect(() => {
    if (!miniSearchRef.current || !searchableData.length) return

    if (searchValue.length > 0) {
      const searchMatches = miniSearchRef.current
        .search(searchValue, { prefix: true })
        .map((item) => item.id)

      setSearchResults(
        searchableData.filter((coll) => searchMatches.includes(coll.id)),
      )
    } else {
      setSearchResults(searchableData)
    }
  }, [searchValue]) // Only depend on searchValue, not searchableData

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newSearchValue = e.target.value
      isSearching.current = true
      setSearchValue(newSearchValue)

      if (newSearchValue.length === 0) {
        setSearchResults(searchableData)
        return
      }

      if (!miniSearchRef.current) return

      const searchMatches = miniSearchRef.current
        .search(newSearchValue, { prefix: true })
        .map((item) => item.id)

      setSearchResults(
        searchableData.filter((coll) => searchMatches.includes(coll.id)),
      )
    },
    [searchableData],
  )

  const resetSearch = useCallback(() => {
    setSearchValue("")
    setSearchResults(searchableData)
    isSearching.current = false
  }, [setSearchValue, setSearchResults])

  useEffect(() => {
    if (isSearching.current && searchValue.length === 0) resetSearch()
  }, [searchValue, resetSearch, searchableData])

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
              <FilterIcon aria-label="Data type filter" size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-md">
            <DropdownMenuItem
              className="flex w-full justify-between"
              onClick={() => setTypeFilter(null)}
            >
              All {typeFilter === null && <CheckCircle size={14} />}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex w-full justify-between"
              onClick={() => setTypeFilter("collection")}
            >
              Collections{" "}
              {typeFilter === "collection" && <CheckCircle size={14} />}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex w-full justify-between"
              onClick={() => setTypeFilter("scoutingNote")}
            >
              Scouting Notes
              {typeFilter === "scoutingNote" && <CheckCircle size={14} />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
        {sortedSearchResults.map((item) => {
          const person = item.created_by
            ? peopleMap[item.created_by]
            : undefined
          if (item.dataType === "collection")
            return (
              <CollectionListItem
                key={item.id}
                collection={item}
                species={item.species}
                person={person}
              />
            )
          if (item.dataType === "scoutingNote")
            return (
              <ScoutingNoteListItem
                key={item.id}
                scoutingNote={item}
                species={item.species}
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
