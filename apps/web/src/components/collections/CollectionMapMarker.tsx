import { cn } from "@nasti/utils"
import { ShoppingBag } from "lucide-react"
import { useState } from "react"
import { Marker, Popup } from "react-map-gl"

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
  const [showPopup, setShowPopup] = useState(false)

  return (
    <>
      <Marker
        latitude={latitude}
        longitude={longitude}
        onClick={() => setShowPopup(popupContent ? true : false)}
      >
        <div
          className={cn(
            "cursor-pointer rounded-full transition-all duration-300",
            isHovered ? "bg-white p-3" : "bg-white/50 p-2",
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
      {showPopup && popupContent && (
        <Popup
          onClose={() => setShowPopup(false)}
          latitude={latitude}
          longitude={longitude}
          closeOnClick={false}
          closeButton={true}
          anchor="bottom"
          offset={25}
        >
          {popupContent}
        </Popup>
      )}
    </>
  )
}
