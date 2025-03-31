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
  const { data: image } = useALAImage(data?.imageIdentifier, "thumbnail")

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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <i className="max-w-56 truncate font-semibold">
                    {species?.name}
                  </i>
                </TooltipTrigger>
                <TooltipContent>{species.name}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex flex-col items-start text-xs">
            {data.commonNames.length > 0 && (
              <span>{data.commonNames[0].nameString}</span>
            )}
            {species.indigenous_name && (
              <span>
                <i>{species.indigenous_name}</i>
              </span>
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
