import { useALAImage, useALASpeciesDetail } from "@nasti/common/hooks"
import { Species } from "@nasti/common/types"
import { Button } from "@nasti/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nasti/ui/tooltip"
import { cn } from "@nasti/ui/utils"
import { LeafIcon, X } from "lucide-react"
import { useParams } from "@tanstack/react-router"
import { useHydrateTripDetails } from "@/hooks/useHydrateTripDetails"
import { useSpeciesDisplayImage } from "@/hooks/useSpeciesDisplayImage"
import { TaxonName } from "@nasti/common"

const TruncateTooltip = ({
  tooltipTrigger,
  tooltipContent,
}: {
  tooltipTrigger: React.ReactNode
  tooltipContent: React.ReactNode
}) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{tooltipTrigger}</TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export const SpeciesListItem = ({
  species,
  isSelected = false,
  className,
  onClick,
  onCloseClick,
}: {
  species: Species
  isSelected?: boolean
  className?: string
  onClick?: () => void
  onCloseClick?: () => void
}) => {
  const { data } = useALASpeciesDetail(species?.ala_guid)
  const { data: alaImage } = useALAImage(data?.imageIdentifier, "thumbnail")

  // Get trip ID from route params
  const { id: tripId } = useParams({ strict: false })

  // Get species photos map from hydrated trip data
  const { data: tripData } = useHydrateTripDetails({ id: tripId || "" })

  const { image: profilePhotoImage } = useSpeciesDisplayImage(
    species?.id,
    tripData?.speciesPhotosMap,
  )
  // Priority: profile photo > ALA image > placeholder
  const image = profilePhotoImage?.image || alaImage

  if (!species || !data) {
    return <></>
  }

  return (
    <div
      className={cn(
        "border-primary flex h-[82px] gap-4 border-t p-0",
        isSelected ? "bg-primary" : "",
        className,
      )}
      onClick={onClick}
    >
      {image ? (
        <span className="flex h-20 w-20 content-center justify-center">
          <img
            src={image}
            alt={`${species.name} Image`}
            className="w-20 object-cover text-sm"
          />
        </span>
      ) : (
        <span className="flex h-20 w-20 items-center justify-center bg-slate-500">
          <LeafIcon />
        </span>
      )}
      <div className="flex flex-grow justify-between">
        <div className="text-foreground flex h-full w-full flex-col py-1 pr-2">
          <div className="flex items-center justify-between">
            <TruncateTooltip
              tooltipTrigger={
                <TaxonName
                  name={species.name}
                  className="max-w-56 truncate font-semibold"
                />
              }
              tooltipContent={species.name}
            />
          </div>
          <div className="flex flex-col items-start text-xs">
            {data.commonNames && data.commonNames?.length > 0 && (
              <span>{data.commonNames[0].nameString}</span>
            )}
            {species.indigenous_name && (
              <TruncateTooltip
                tooltipTrigger={
                  <span className="max-w-56 truncate">
                    {species.indigenous_name}
                  </span>
                }
                tooltipContent={<i>{species.indigenous_name}</i>}
              />
            )}
          </div>
        </div>
        {onCloseClick && (
          <Button
            variant="ghost"
            size="icon"
            className="p-0 hover:bg-transparent"
            onClick={onCloseClick}
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  )
}
