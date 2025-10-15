import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nasti/ui/tooltip"
import { useSpecies } from "@/hooks/useSpecies"

import { useCollection } from "@/hooks/useCollection"
import { useOpenClose } from "@nasti/ui/hooks"
import { usePeople } from "@/hooks/usePeople"
import { LeafIcon } from "lucide-react"
import { useCollectionPhotos } from "@/hooks/useCollectionPhotos"
import { CollectionDetailModal } from "./CollectionDetailModal"
import { useTripDetail } from "@/hooks/useTripDetail"
import { Spinner } from "@nasti/ui/spinner"
import { useALASpeciesImage } from "@nasti/common/hooks"

export const CollectionListItem = ({
  id,
  showTrip = false,
  onHover,
  onClick,
}: {
  id: string
  showTrip?: boolean
  onClick?: () => void
  onHover?: (id: string | undefined) => void
}) => {
  const { data: collection, error } = useCollection(id)
  const { data: species } = useSpecies(collection?.species_id)
  const image = useALASpeciesImage({ guid: species?.ala_guid })
  const { photos, signedUrlsIsLoading } = useCollectionPhotos(id)
  const { data: trip } = useTripDetail(collection?.trip_id ?? undefined)

  const photo = photos?.[0]?.signedUrl ?? image

  const { data: people } = usePeople()

  if (!collection || error) {
    return <></>
  }

  const speciesName = species?.name ?? collection.field_name

  const creator = people?.find((person) => person.id === collection.created_by)
  const details = [
    collection.plants_sampled_estimate
      ? `${collection.plants_sampled_estimate} plants`
      : undefined,
    collection.weight_estimate_kg
      ? `${collection.weight_estimate_kg} kg`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      onMouseOver={() => (onHover ? onHover(id) : null)}
      onMouseLeave={() => (onHover ? onHover(undefined) : null)}
      onClick={onClick}
      className="bg-secondary-background text-primary-foreground hover:bg-primary/90 h-26 flex cursor-pointer gap-2 rounded-sm"
    >
      {signedUrlsIsLoading && (
        <span className="h-26 flex w-20 items-center justify-center bg-slate-500">
          <Spinner className="h-6 w-6" />
        </span>
      )}
      {!signedUrlsIsLoading && (
        <>
          {photo ? (
            <span className="h-26 flex w-20 content-center justify-center">
              <img
                src={photo}
                alt={`${speciesName} Image`}
                className="w-20 rounded-l-sm object-cover text-sm"
              />
            </span>
          ) : (
            <span className="h-26 flex w-20 items-center justify-center bg-slate-500">
              <LeafIcon />
            </span>
          )}
        </>
      )}
      <div className="text-foreground flex h-full w-full flex-col py-1 pr-2">
        <div className="flex items-center justify-start gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <i className="max-w-56 truncate font-semibold">{speciesName}</i>
              </TooltipTrigger>
              <TooltipContent>{speciesName}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {showTrip && <span className="text-xs">{trip?.name}</span>}
        </div>
        <div>{collection.code}</div>
        <div className="flex flex-col text-start text-xs">
          {details && <span>{details}</span>}
          {creator && <span>{creator.name ?? "Unknown Person"}</span>}
          {<span>{new Date(collection.created_at).toLocaleString()}</span>}
        </div>
      </div>
    </div>
  )
}

export const CollectionListItemWithModal = ({
  id,
  showTrip = false,
  onHover,
}: {
  id: string
  showTrip?: boolean
  onHover?: (id: string | undefined) => void
}) => {
  const { open, isOpen, close } = useOpenClose()

  return (
    <>
      <CollectionListItem
        id={id}
        showTrip={showTrip}
        onHover={onHover}
        onClick={open}
      />
      <CollectionDetailModal id={id} open={isOpen} onClose={close} />
    </>
  )
}
