import { ShoppingBag } from "lucide-react"
import { DataItemMapMarker } from "../common/DataItemMapMarker"

export const CollectionMapMarker = ({
  latitude,
  longitude,
  isHovered,
  popupContents,
}: {
  latitude: number
  longitude: number
  isHovered?: boolean
  popupContents?: React.ReactNode[]
}) => {
  return (
    <DataItemMapMarker
      Icon={ShoppingBag}
      isHovered={isHovered}
      latitude={latitude}
      longitude={longitude}
      popupContents={popupContents}
      maxWidth="320px"
    />
  )
}
