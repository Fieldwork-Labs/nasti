import { useAdminOnly } from "@/hooks/useAdminOnly"
import { useSpecies, useSpeciesList } from "@/hooks/useSpecies"
import { createFileRoute } from "@tanstack/react-router"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePagination, Pagination } from "@/components/common/pagination"
import { Modal, type ModalProps } from "@/components/ui/modal"

import { ButtonLink } from "@/components/ui/buttonLink"
import { LeafIcon, PencilIcon, PlusIcon } from "lucide-react"
import { useALAImage } from "@/hooks/useALAImage"
import { useSpeciesDetail } from "@/hooks/useALASpeciesDetail"
import useOpenClose from "@/hooks/useOpenClose"
import { SpeciesIndigNameForm } from "@/components/species/SpeciesIndigNameForm"
import { useSpeciesForm, SpeciesForm } from "@/components/species/SpeciesForm"
import { Button } from "@/components/ui/button"

const AddSpeciesModal = ({
  open,
  onOpenChange,
  onCreate,
}: ModalProps & { onCreate: () => void }) => {
  const { onSubmit, ...formProps } = useSpeciesForm({
    onCreate: (_) => {
      if (onCreate) onCreate()
      if (onOpenChange) onOpenChange(false)
    },
  })
  return (
    <Modal
      title="New species"
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      onCancel={() => (onOpenChange ? onOpenChange(false) : undefined)}
    >
      <SpeciesForm {...formProps} />
    </Modal>
  )
}

export const SpeciesListItem = ({ id }: { id: string }) => {
  const { data: species, error } = useSpecies(id)
  const { data } = useSpeciesDetail(species?.ala_guid)
  const { data: image } = useALAImage(data?.imageIdentifier, "thumbnail")

  const { open, isOpen, close } = useOpenClose()

  if (!species || !data || error) {
    return <></>
  }

  return (
    <>
      <ButtonLink
        to="/species/$id"
        params={{ id: species.id }}
        className="flex h-20 gap-4 rounded-sm bg-secondary-background p-0"
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
                    {species?.name}
                  </i>
                </TooltipTrigger>
                <TooltipContent>{species.name}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <PencilIcon className="h-3 w-3 cursor-pointer" onClick={open} />
          </div>
          <div className="flex flex-col text-xs">
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
      </ButtonLink>
      <Modal open={isOpen} title={`Edit ${species.name}`}>
        <SpeciesIndigNameForm
          onCancel={close}
          onSuccess={close}
          instance={species}
        />
      </Modal>
    </>
  )
}

const SpeciesList = () => {
  useAdminOnly()
  const { page, prevPage, nextPage, setPage, pageSize } = usePagination()
  const { data, count, isLoading, error, invalidate } = useSpeciesList(
    page,
    pageSize,
  )
  const { isOpen, setIsOpen, open } = useOpenClose()
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <div className="flex justify-between">
        <h2 className="mb-4 text-2xl font-semibold">Species</h2>
        <Button onClick={open} className="flex gap-1">
          <PlusIcon aria-label="New Trip" size={16} /> <span>Add new</span>
        </Button>
      </div>
      {!data || data.length === 0 ? (
        <p>No species found.</p>
      ) : (
        <div className="grid md:grid-cols-2 md:gap-2 lg:grid-cols-3 lg:gap-2">
          {data?.map((species) => (
            <SpeciesListItem key={species.id} id={species.id} />
          ))}
        </div>
      )}
      <Pagination
        page={page}
        pageCount={count ? Math.ceil(count / pageSize) : 0}
        nextPage={nextPage}
        prevPage={prevPage}
        setPage={setPage}
      />
      {isOpen && (
        <AddSpeciesModal
          open={isOpen}
          onOpenChange={setIsOpen}
          onCreate={invalidate}
        />
      )}
    </div>
  )
}

export const Route = createFileRoute("/_private/species/")({
  component: SpeciesList,
})
