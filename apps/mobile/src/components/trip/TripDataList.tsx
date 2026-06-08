import {
  CollectionWithCoordAndPhotos,
  ScoutingNoteWithCoordAndPhotos,
} from "@/hooks/useTripDetails/types"
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
import { Suspense, useCallback, useMemo, useState } from "react"

import { useGeoLocation } from "@/contexts/location"
import { useDisplayDistance } from "@/hooks/useDisplayDistance"
import { useOrgMembers } from "@/hooks/useOrgMembers"
import {
  TripCollectionPhotos,
  TripScoutingNotePhotos,
} from "@/hooks/usePhotosForTrip"
import { useSpeciesList } from "@/hooks/useSpeciesList"
import { Input } from "@nasti/ui/input"
import { Link } from "@tanstack/react-router"
import { Photo } from "../common/Photo"
import { useSpeciesDisplayImage } from "@/hooks/useSpeciesDisplayImage"
import { TaxonName } from "@nasti/common"
import { useTripDetails } from "@/hooks/useTripDetails"
import { useSpeciesPhotosMap, useTripPhotoMaps } from "@/hooks/useTripPhotoMaps"

// Base interface for entities that can be displayed in the list
interface DisplayableEntity {
  id: string
  trip_id?: string | null
  species_id?: string | null
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
  speciesPhotosMap?: Parameters<typeof useSpeciesDisplayImage>[1]
}

function EntityListItem<TEntity extends DisplayableEntity>({
  entity,
  species,
  person,
  config,
  isMutating,
  isPending,
  speciesPhotosMap,
}: EntityListItemProps<TEntity>) {
  const displayDistance = useDisplayDistance(entity.locationCoord ?? {})
  const { image: speciesProfileImage } = useSpeciesDisplayImage(
    entity?.species_id ?? undefined,
    speciesPhotosMap,
  )
  const firstPhoto =
    entity.photos && entity.photos.length > 0 ? entity.photos[0] : null

  const photoId = speciesProfileImage?.id ?? firstPhoto?.id

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
            id={photoId}
            species={species}
            className="h-24 w-24"
            overlay={<Icon className="h-10 w-10" />}
          />
        </Suspense>

        <div className="flex flex-grow flex-col">
          <CardHeader className="p-2">
            <CardTitle className="m-0 w-52 truncate overflow-ellipsis text-lg md:w-96">
              {species?.name ? (
                <TaxonName name={species.name} />
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
  speciesPhotosMap,
}: {
  collection: CollectionWithSpecies
  species?: Species | null
  person?: Person | null
  speciesPhotosMap?: Parameters<typeof useSpeciesDisplayImage>[1]
}) => {
  return (
    <EntityListItem
      entity={collection}
      species={species}
      person={person}
      config={collectionConfig}
      speciesPhotosMap={speciesPhotosMap}
    />
  )
}

export const ScoutingNoteListItem = ({
  scoutingNote,
  species,
  person,
  speciesPhotosMap,
}: {
  scoutingNote: ScoutingNoteWithSpecies
  species?: Species | null
  person?: Person | null
  speciesPhotosMap?: Parameters<typeof useSpeciesDisplayImage>[1]
}) => {
  return (
    <EntityListItem
      entity={scoutingNote}
      species={species}
      person={person}
      config={scoutingNoteConfig}
      speciesPhotosMap={speciesPhotosMap}
    />
  )
}

export const TripDataList = ({ id }: { id: string }) => {
  const [sortMode, setSortMode] = useState<
    "created_at-asc" | "created_at-desc" | "distance-asc" | "distance-desc"
  >("created_at-desc")
  const [typeFilter, setTypeFilter] = useState<
    "collection" | "scoutingNote" | null
  >(null)
  const [searchValue, setSearchValue] = useState("")
  const { data: trip } = useTripDetails({ tripId: id })
  const { data: species } = useSpeciesList()
  const { data: peopleResponse } = useOrgMembers()
  const { collectionPhotosMap, scoutingNotePhotosMap } = useTripPhotoMaps({
    tripId: id,
  })
  const { speciesPhotosMap } = useSpeciesPhotosMap({ tripId: id })
  const { getDistanceKm } = useGeoLocation()

  const speciesMap = useMemo(() => {
    return (
      species?.reduce(
        (acc, species) => {
          acc[species.id] = species
          return acc
        },
        {} as Record<string, Species>,
      ) ?? {}
    )
  }, [species])

  const peopleMap = useMemo(() => {
    const people = peopleResponse?.data ?? []
    return people.reduce(
      (acc, person) => {
        acc[person.id] = person
        return acc
      },
      {} as Record<string, Person>,
    )
  }, [peopleResponse?.data])

  const searchableData = useMemo(() => {
    const collections = trip?.collections ?? []
    const scoutingNotes = trip?.scoutingNotes ?? []
    return [
      ...collections.map((coll) => {
        return {
          ...coll,
          photos: collectionPhotosMap[coll.id] ?? [],
          dataType: "collection" as const,
          species: coll.species_id ? speciesMap[coll.species_id] : undefined,
        }
      }),
      ...scoutingNotes.map((sn) => {
        return {
          ...sn,
          photos: scoutingNotePhotosMap[sn.id] ?? [],
          dataType: "scoutingNote" as const,
          species: sn.species_id ? speciesMap[sn.species_id] : undefined,
        }
      }),
    ]
  }, [
    trip?.collections,
    trip?.scoutingNotes,
    speciesMap,
    collectionPhotosMap,
    scoutingNotePhotosMap,
  ])

  const miniSearch = useMemo(() => {
    const search = new MiniSearch<DataWithSpecies>({
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
    search.addAll(searchableData)
    return search
  }, [searchableData])

  const searchResults = useMemo(() => {
    if (searchValue.length === 0) return searchableData

    const searchMatches = new Set(
      miniSearch.search(searchValue, { prefix: true }).map((item) => item.id),
    )

    return searchableData.filter((item) => searchMatches.has(item.id))
  }, [miniSearch, searchValue, searchableData])

  const sortedSearchResults = useMemo(() => {
    let sorted = [...searchResults].sort((a, b) => {
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
  }, [getDistanceKm, searchResults, sortMode, typeFilter])

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchValue(e.target.value)
    },
    [],
  )

  const resetSearch = useCallback(() => {
    setSearchValue("")
  }, [])

  const isSearching = searchValue.length > 0

  if (!trip) return <></>
  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full justify-between gap-1 px-1 text-sm">
        <Input
          placeholder="Search collections"
          className={`transition-all duration-500 ease-in-out ${
            isSearching ? "w-full flex-grow" : "w-full"
          }`}
          value={searchValue}
          onChange={handleSearchChange}
        />
        {isSearching && (
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
              {!isSearching ? (
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
                speciesPhotosMap={speciesPhotosMap}
              />
            )
          if (item.dataType === "scoutingNote")
            return (
              <ScoutingNoteListItem
                key={item.id}
                scoutingNote={item}
                species={item.species}
                person={person}
                speciesPhotosMap={speciesPhotosMap}
              />
            )
        })}
        {trip.collections.length === 0 && (
          <div className="text-center">
            <span className="p-4 text-xl">No collections recorded yet</span>
          </div>
        )}
      </div>
    </div>
  )
}
