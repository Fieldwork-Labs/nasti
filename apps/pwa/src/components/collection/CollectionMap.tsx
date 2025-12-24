import { useCollection } from "@/hooks/useCollection"
import { ShoppingBag } from "lucide-react"
import { LocationMap } from "../common/LocationMap"

export const CollectionMap = ({
  tripId,
  collectionId,
}: {
  tripId: string
  collectionId: string
}) => {
  const collection = useCollection({ tripId, collectionId })

  if (!collection.locationCoord) return null

  return (
    <LocationMap
      coord={collection.locationCoord}
      Marker={() => (
        <div className="rounded-full bg-white/50 p-2">
          <ShoppingBag className="text-primary h-5 w-5 cursor-pointer" />
        </div>
      )}
    />
  )
}
