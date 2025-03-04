import { cn } from "@/lib/utils"
import { ShoppingBag } from "lucide-react"
import { Marker } from "react-map-gl"

export const CollectionMapMarker = ({
  latitude,
  longitude,
  isHovered,
}: {
  latitude: number
  longitude: number
  isHovered?: boolean
}) => {
  return (
    <Marker latitude={latitude} longitude={longitude}>
      <div
        className={cn(
          "rounded-full transition-all duration-300",
          isHovered ? "bg-white p-3" : "bg-white bg-opacity-50 p-2",
        )}
      >
        <ShoppingBag
          className={cn(
            "text-primary transition-all duration-300",
            isHovered ? "h-6 w-6" : "h-5 w-5",
          )}
        />
      </div>
    </Marker>
  )
}
