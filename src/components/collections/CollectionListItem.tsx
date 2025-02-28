import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSpecies } from "@/hooks/useSpecies"

import { useALAImage } from "@/hooks/useALAImage"
import { useSpeciesDetail } from "@/hooks/useALASpeciesDetail"
import { useCollection } from "@/hooks/useCollection"
import useOpenClose from "@/hooks/useOpenClose"
import { usePeople } from "@/hooks/usePeople"
import { LeafIcon } from "lucide-react"
import { useCollectionPhotos } from "@/hooks/useCollectionPhotos"
import { CollectionDetailModal } from "./CollectionDetailModal"

export const CollectionListItem = ({
  id,
  onHover,
}: {
  id: string
  onHover?: (id: string | undefined) => void
}) => {
  const { data: collection, error } = useCollection(id)
  const { data: species } = useSpecies(collection?.species_id)
  const { data: speciesData } = useSpeciesDetail(species?.ala_guid)
  const { data: image } = useALAImage(speciesData?.imageIdentifier, "thumbnail")
  const { photos } = useCollectionPhotos(id)

  const photo = photos?.[0].signedUrl ?? image

  const { open, isOpen, close } = useOpenClose()

  const { data: people } = usePeople()
  if (!collection || error) {
    return <></>
  }

  const speciesName = species?.name ?? collection.field_name

  const creator = people?.find((person) => person.id === collection.created_by)

  return (
    <>
      <div
        onMouseOver={() => (onHover ? onHover(id) : null)}
        onMouseLeave={() => (onHover ? onHover(undefined) : null)}
        onClick={open}
        className="flex h-20 cursor-pointer gap-2 rounded-sm bg-secondary-background text-primary-foreground hover:bg-primary/90"
      >
        {photo ? (
          <span className="flex h-20 w-20 content-center justify-center">
            <img
              src={photo}
              alt={`${speciesName} Image`}
              className="w-20 rounded-l-sm object-cover text-sm"
            />
          </span>
        ) : (
          <span className="flex h-20 w-20 items-center justify-center bg-slate-500">
            <LeafIcon />
          </span>
        )}
        <div className="flex h-full w-full flex-col py-1 pr-2 text-foreground">
          <div className="flex items-center justify-between">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <i className="max-w-56 truncate font-semibold">
                    {speciesName}
                  </i>
                </TooltipTrigger>
                <TooltipContent>{speciesName}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex flex-col text-start text-xs">
            {collection?.plants_sampled_estimate && (
              <span>{collection?.plants_sampled_estimate} Plants</span>
            )}
            {collection?.weight_estimate_kg && (
              <span>{collection?.weight_estimate_kg} kg</span>
            )}
            {creator && <span>{creator.name ?? "Unknown Person"}</span>}
          </div>
        </div>
      </div>
      <CollectionDetailModal
        collection={collection}
        open={isOpen}
        onClose={close}
      />
    </>
  )
}
