import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nasti/ui/tooltip"
import { ButtonLink } from "@nasti/ui/button-link"
import { LeafIcon } from "lucide-react"
import { useALASpeciesDetail } from "@nasti/common/hooks/useALASpeciesDetail"
import { TaxonName } from "@nasti/common"
import { useSpecies } from "@/hooks/useSpecies"
import { useSpeciesDisplayImage } from "@/hooks/useSpeciesDisplayImage"

export const TruncateTooltip = ({
  tooltipTrigger,
  tooltipContent,
}: {
  tooltipTrigger: React.ReactNode
  tooltipContent: React.ReactNode
}) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>{tooltipTrigger}</TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export const SpeciesListItem = ({ id }: { id: string }) => {
  const { data: species, error } = useSpecies(id)
  const { data } = useALASpeciesDetail(species?.ala_guid)
  const { image } = useSpeciesDisplayImage(id, species?.ala_guid, "thumbnail")

  if (!species || !data || error) {
    return <></>
  }

  return (
    <ButtonLink
      to="/species/$id"
      params={{ id: species.id }}
      className="bg-secondary-background flex h-20 gap-4 rounded-sm p-0"
    >
      {image ? (
        <span className="flex h-20 w-20 content-center justify-center">
          <img
            src={image}
            alt={`${species.name} Image`}
            className="w-20 rounded-l-sm object-cover text-sm"
          />
        </span>
      ) : (
        <span className="flex h-20 w-20 items-center justify-center bg-slate-500">
          <LeafIcon />
        </span>
      )}
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
              tooltipContent={<span>{species.indigenous_name}</span>}
            />
          )}
        </div>
      </div>
    </ButtonLink>
  )
}
