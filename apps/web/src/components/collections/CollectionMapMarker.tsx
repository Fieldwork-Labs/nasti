import { ShoppingBag } from "lucide-react"
import { DataItemMapMarker } from "../common/DataItemMapMarker"

export const CollectionMapMarker = ({
  latitude,
  longitude,
  isHovered,
  popupContent,
}: {
  latitude: number
  longitude: number
  isHovered?: boolean
  popupContent?: React.ReactNode
}) => {
  return (
    <DataItemMapMarker
      Icon={ShoppingBag}
      isHovered={isHovered}
      latitude={latitude}
      longitude={longitude}
      popupContent={popupContent}
    />
  )
}
