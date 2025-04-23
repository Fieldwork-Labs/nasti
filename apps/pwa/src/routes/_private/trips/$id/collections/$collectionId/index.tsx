import { useCollection } from "@/hooks/useCollection"
import { useDisplayDistance } from "@/hooks/useDisplayDistance"
import {
  createFileRoute,
  Link,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import { ChevronLeft, Pencil, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { useAuth } from "@/hooks/useAuth"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import { CollectionMap } from "@/components/collection/CollectionMap"
import { useState } from "react"
import { CollectionPhoto } from "@/components/collection/CollectionPhoto"
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch"
import { Button } from "@nasti/ui/button"

const CollectionDetail = () => {
  const { user } = useAuth()
  const { collectionId, id: tripId } = useParams({
    from: "/_private/trips/$id/collections/$collectionId/",
  })

  const collection = useCollection({ collectionId, tripId })

  const navigate = useNavigate({
    from: "/trips/$id/collections/$collectionId",
  })

  const handleBackClick = () => {
    navigate({ to: "/trips/$id" })
  }

  const [fullScreenPhoto, setFullScreenPhoto] = useState<string | null>(null)

  const displayDistance = useDisplayDistance(collection.locationCoord ?? {})
  return (
    <div className="flex flex-col gap-3 px-2">
      <div className="flex items-center justify-between align-middle">
        <div className="flex items-center text-2xl">
          <ChevronLeft onClick={handleBackClick} width={36} height={36} />{" "}
          {collection?.species?.name || collection.field_name}
        </div>
        <Link
          to={`/trips/$id/collections/$collectionId/edit`}
          params={{ id: tripId, collectionId }}
        >
          <Button variant="ghost" size={"icon"}>
            <Pencil className="h-5 w-5" />
          </Button>
        </Link>
      </div>
      <table>
        <thead>
          <tr className="text-muted-foreground text-left">
            <th>Time</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {collection.created_at && (
                <span>{new Date(collection.created_at).toLocaleString()}</span>
              )}
            </td>
            <td>
              {displayDistance && (
                <Popover>
                  <PopoverTrigger>{displayDistance} km away</PopoverTrigger>
                  <PopoverContent className="w-full">
                    {collection.locationCoord?.latitude.toFixed(6)},{" "}
                    {collection.locationCoord?.longitude.toFixed(6)}
                  </PopoverContent>
                </Popover>
              )}
            </td>
          </tr>
        </tbody>
        <thead>
          <tr className="text-muted-foreground text-left">
            <th>Collector</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {user?.id === collection.created_by
                ? "You"
                : user?.user_metadata.name || "Unknown Person"}
            </td>
          </tr>
        </tbody>
      </table>
      {Boolean(
        collection.plants_sampled_estimate ||
          collection.weight_estimate_kg ||
          collection.description,
      ) && (
        <div>
          <hr />
          <table className="table-fixed">
            <thead>
              <tr className="text-muted-foreground text-left">
                {Boolean(collection.plants_sampled_estimate) && (
                  <th>Plants Sampled</th>
                )}
                {Boolean(collection.weight_estimate_kg) && (
                  <th>Weight Estimate</th>
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                {Boolean(collection.plants_sampled_estimate) && (
                  <td className="w-1/2">
                    {collection.plants_sampled_estimate}
                  </td>
                )}
                {Boolean(collection.weight_estimate_kg) && (
                  <td>{collection.weight_estimate_kg} kg</td>
                )}
              </tr>
            </tbody>
            {collection.description && (
              <>
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{collection.description}</td>
                  </tr>
                </tbody>
              </>
            )}
          </table>
        </div>
      )}
      <Tabs defaultValue="photos">
        <TabsList className="bg-secondary-background mb-2 w-full">
          <TabsTrigger className="w-full" value="photos">
            Photos
          </TabsTrigger>
          <TabsTrigger className="w-full" value="map">
            Map
          </TabsTrigger>
        </TabsList>
        <TabsContent value="photos" className="grid grid-cols-2 gap-2">
          {collection.photos.map((photo) => {
            return (
              <CollectionPhoto
                id={photo.id}
                onClick={setFullScreenPhoto}
                key={photo.id}
              />
            )
          })}
        </TabsContent>
        <TabsContent value="map" className="">
          <CollectionMap tripId={tripId} collectionId={collectionId} />
        </TabsContent>
      </Tabs>

      {/* Full-screen overlay */}
      {fullScreenPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-2">
          <button
            onClick={() => setFullScreenPhoto(null)}
            className="absolute right-4 top-4 p-2"
            aria-label="Close photo"
          >
            <X size={28} className="text-white" />
          </button>
          <TransformWrapper>
            <TransformComponent wrapperClass="overflow-visible">
              <img src={fullScreenPhoto} alt="Full screen" />
            </TransformComponent>
          </TransformWrapper>
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute(
  "/_private/trips/$id/collections/$collectionId/",
)({
  component: CollectionDetail,
})
