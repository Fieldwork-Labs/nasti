import { useCollection } from "@/hooks/useCollection"
import { useDisplayDistance } from "@/hooks/useDisplayDistance"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { ChevronLeft, PencilIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { useAuth } from "@/hooks/useAuth"

const CollectionDetail = () => {
  const { user } = useAuth()
  const { collectionId, id: tripId } = useParams({
    from: "/_private/trips/$id/collections/$collectionId",
  })

  const collection = useCollection({ collectionId, tripId })

  const navigate = useNavigate({
    from: "/trips/$id/collections/$collectionId",
  })

  const handleBackClick = () => {
    navigate({ to: "/trips/$id" })
  }

  console.log({ collection })

  const displayDistance = useDisplayDistance(collection.locationCoord ?? {})
  return (
    <div className="flex flex-col gap-3 px-2">
      <div className="flex items-center justify-between align-middle">
        <div className="flex items-center text-2xl">
          <ChevronLeft onClick={handleBackClick} width={36} height={36} />{" "}
          {collection?.species?.name || collection.field_name}
        </div>
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
        collection.plants_sampled_estimate || collection.weight_estimate_kg,
      ) && (
        <>
          <hr />
          <table className="table-fixed">
            <thead>
              <tr className="text-muted-foreground text-left">
                {collection.plants_sampled_estimate && <th>Plants Sampled</th>}
                {collection.weight_estimate_kg && <th>Weight Estimate</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                {collection.plants_sampled_estimate && (
                  <td className="w-1/2">
                    {collection.plants_sampled_estimate}
                  </td>
                )}
                {collection.weight_estimate_kg && (
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
        </>
      )}
    </div>
  )
}

export const Route = createFileRoute(
  "/_private/trips/$id/collections/$collectionId",
)({
  component: CollectionDetail,
})
