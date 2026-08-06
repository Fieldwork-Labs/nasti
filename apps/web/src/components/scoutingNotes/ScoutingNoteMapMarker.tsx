import { Binoculars } from "lucide-react"
import { DataItemMapMarker } from "../common/DataItemMapMarker"

export const ScoutingNoteMapMarker = ({
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
      Icon={Binoculars}
      isHovered={isHovered}
      latitude={latitude}
      longitude={longitude}
      popupContents={popupContents}
      maxWidth="320px"
    />
  )
}
