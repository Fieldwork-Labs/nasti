import { cn } from "@nasti/ui/utils"
import { ChevronLeftIcon, ChevronRightIcon, LucideProps } from "lucide-react"
import { useState } from "react"
import { Marker, Popup } from "react-map-gl"

export const DataItemMapMarker = ({
  latitude,
  longitude,
  isHovered,
  popupContents,
  popupLabels,
  maxWidth = "240px",
  Icon,
}: {
  latitude: number
  longitude: number
  isHovered?: boolean
  popupContents?: React.ReactNode[]
  popupLabels?: string[]
  maxWidth?: string
  Icon: React.ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>
  >
}) => {
  const [showPopup, setShowPopup] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const count = popupContents?.length ?? 0

  return (
    <>
      <Marker
        latitude={latitude}
        longitude={longitude}
        onClick={() => {
          setActiveIndex(0)
          setShowPopup(count > 0)
        }}
      >
        <div
          className={cn(
            "relative cursor-pointer rounded-full transition-all duration-300",
            isHovered ? "bg-white p-3" : "bg-white/50 p-2",
          )}
        >
          <Icon
            className={cn(
              "text-primary transition-all duration-300",
              isHovered ? "h-6 w-6" : "h-5 w-5",
            )}
          />
          {count > 1 && (
            <span className="bg-primary absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold text-white">
              {count}
            </span>
          )}
        </div>
      </Marker>
      {showPopup && count > 0 && (
        <Popup
          onClose={() => setShowPopup(false)}
          latitude={latitude}
          longitude={longitude}
          closeOnClick={false}
          closeButton={true}
          anchor="bottom"
          offset={25}
          maxWidth={maxWidth}
        >
          <div className="flex flex-col gap-2">
            {count > 1 && (
              <div className="flex items-center justify-between gap-2 pr-3 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => setActiveIndex((i) => (i - 1 + count) % count)}
                  className="hover:text-primary flex items-center"
                  aria-label="Previous"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                  Previous
                </button>
                <span className="text-secondary-foreground">
                  {activeIndex + 1} of {count}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveIndex((i) => (i + 1) % count)}
                  className="hover:text-primary flex items-center"
                  aria-label="Next"
                >
                  Next
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            )}
            {popupLabels?.[activeIndex] && (
              <div className="text-secondary-foreground text-xs font-semibold uppercase tracking-wide">
                {popupLabels[activeIndex]}
              </div>
            )}
            {popupContents![activeIndex]}
          </div>
        </Popup>
      )}
    </>
  )
}
