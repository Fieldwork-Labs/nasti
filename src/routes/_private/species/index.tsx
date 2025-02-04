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
import { Modal } from "@/components/ui/modal"

import { ButtonLink } from "@/components/ui/buttonLink"
import { LeafIcon, PencilIcon, PlusIcon } from "lucide-react"
import { useALAImage } from "@/hooks/useALAImage"
import { useSpeciesDetail } from "@/hooks/useALASpeciesDetail"
import useOpenClose from "@/hooks/useOpenClose"
import { SpeciesIndigNameForm } from "@/components/species/SpeciesIndigNameForm"

export const SpeciesListItem = ({ id }: { id: string }) => {
  console.log("loading species", { id })
  const { data: species, error } = useSpecies(id)
  console.log("species", { species })
  const { data } = useSpeciesDetail(species?.ala_guid)
  const { data: image } = useALAImage(data?.imageIdentifier, true)
  const { open, isOpen, close } = useOpenClose()

  if (!species || !data || error) {
    return <></>
  }

  return (
    <>
      <div className="flex h-20 gap-4 rounded-sm bg-secondary-background">
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
        <div className="flex w-full flex-col py-1 pr-2">
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
          <div className="flex flex-col text-sm">
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
      </div>
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
  const { data, count, isLoading, error } = useSpeciesList(page, pageSize)

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <div className="flex justify-between">
        <h2 className="mb-4 text-2xl font-semibold">Species</h2>
        <ButtonLink className="flex gap-1">
          <PlusIcon aria-label="New Trip" size={16} /> <span>Add new</span>
        </ButtonLink>
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
    </div>
  )
}

export const Route = createFileRoute("/_private/species/")({
  component: SpeciesList,
})
