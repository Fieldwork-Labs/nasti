import { useHydrateTripDetails } from "@/hooks/useHydrateTripDetails"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nasti/ui/card"
import { Spinner } from "@nasti/ui/spinner"
import { cn } from "@nasti/ui/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"

import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import {
  ChevronLeft,
  ChevronRight,
  LeafIcon,
  PlusCircle,
  RefreshCwIcon,
} from "lucide-react"
import { useMemo } from "react"
import {
  Collection,
  CollectionPhotoSignedUrl,
  Person,
  Species,
} from "@nasti/common/types"
import { useALASpeciesImage } from "@nasti/common/hooks"

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

  if (!collection) return <></>

  return (
    <Card
      className="flex flex-row rounded-none bg-inherit p-0"
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
          <CardTitle className="m-0 text-lg">
            {species?.name ? (
              <i>{species.name}</i>
            ) : collection.field_name && collection.field_name !== "" ? (
              collection.field_name
            ) : (
              "Uknown species"
            )}
          </CardTitle>
          <CardDescription>{person?.name || "Unknown person"}</CardDescription>
        </CardHeader>
        <CardContent className="px-3 pb-3 text-sm">
          {collection.created_at &&
            new Date(collection.created_at).toLocaleString()}
        </CardContent>
      </div>
      <div className="text-secondary flex w-1/6 flex-col justify-center pr-2">
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

const TripDetail = () => {
  const { id } = useParams({ from: "/_private/trips/$id" })
  const { data, isFetching, isError, refetch, isRefetching } =
    useHydrateTripDetails({ id })
  const navigate = useNavigate()

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
      <Tabs defaultValue="collections">
        <TabsList className="bg-secondary-background mb-2 w-full">
          <TabsTrigger className="w-full" value="collections">
            Collections
          </TabsTrigger>
          {data.species && data.species.length > 0 && (
            <TabsTrigger className="w-full" value="species">
              Species
            </TabsTrigger>
          )}
          {data.people && data.people.length > 0 && (
            <TabsTrigger className="w-full" value="people">
              People
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="collections">
          <CollectionListTab id={id} />
        </TabsContent>
      </Tabs>
    </div>
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
