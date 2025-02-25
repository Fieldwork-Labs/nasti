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
import useUserStore from "@/store/userStore"
import { LeafIcon, PencilIcon } from "lucide-react"
import { UpdateCollectionModal } from "./CollectionFormModal"

export const CollectionListItem = ({ id }: { id: string }) => {
  const { data: collection, error } = useCollection(id)
  const { data: species } = useSpecies(collection?.species_id)
  const { data: speciesData } = useSpeciesDetail(species?.ala_guid)
  const { data: image } = useALAImage(speciesData?.imageIdentifier, "thumbnail")
  const { isAdmin } = useUserStore()

  // @ts-expect-error Leaving this here for when we have a 'details' modal
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { open, isOpen, close } = useOpenClose()
  const {
    open: openUpdateModal,
    isOpen: isOpenUpdateModal,
    close: closeUpdateModal,
  } = useOpenClose()

  const { data: people } = usePeople()
  if (!collection || !speciesData || error) {
    return <></>
  }

  const speciesName = species?.name ?? collection.field_name
  console.log({ people, collection })
  const creator = people?.find((person) => person.id === collection.created_by)

  return (
    <>
      <div
        onClick={() => console.log("todo - collection view detail modal ")}
        className="flex h-20 gap-2 rounded-sm bg-secondary-background text-primary-foreground hover:bg-primary/90"
      >
        {image ? (
          <span className="flex h-20 w-20 content-center justify-center">
            <img
              src={image}
              alt={`${name} Image`}
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

            {isAdmin && (
              <PencilIcon
                className="h-3 w-3 cursor-pointer"
                onClick={() => openUpdateModal()}
              />
            )}
          </div>
          <div className="flex flex-col text-start text-xs">
            {collection?.plants_sampled_estimate && (
              <span>{collection?.plants_sampled_estimate} Plants</span>
            )}
            {collection?.weight_estimate_kg && (
              <span>{collection?.weight_estimate_kg} kg</span>
            )}
            {creator && <span>{creator.name ?? "Unkown Person"}</span>}
          </div>
        </div>
      </div>
      {/* <Modal open={isOpen} title={`Edit ${species.name}`}>
        <SpeciesIndigNameForm
          onCancel={close}
          onSuccess={close}
          instance={species}
        />
      </Modal> */}
      <UpdateCollectionModal
        instance={collection}
        open={isOpenUpdateModal}
        close={closeUpdateModal}
      />
    </>
  )
}
