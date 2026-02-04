import { Binoculars } from "lucide-react"
import { DataItemMapMarker } from "../common/DataItemMapMarker"

export const ScoutingNoteMapMarker = ({
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
      Icon={Binoculars}
      isHovered={isHovered}
      latitude={latitude}
      longitude={longitude}
      popupContent={popupContent}
    />
  )
}
