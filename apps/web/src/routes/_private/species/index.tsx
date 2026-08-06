import { useSpeciesList } from "@/hooks/useSpecies"
import { createFileRoute } from "@tanstack/react-router"
import { usePagination, Pagination } from "@/components/common/pagination"
import { Modal, type ModalProps } from "@nasti/ui/modal"

import { PlusIcon } from "lucide-react"
import { useOpenClose } from "@nasti/ui/hooks"
import { useSpeciesForm, SpeciesForm } from "@/components/species/SpeciesForm"
import { Button } from "@nasti/ui/button"
import useUserStore from "@/store/userStore"
import { SpeciesListItem } from "@/components/species/SpeciesListItem"

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

const SpeciesList = () => {
  const { page, prevPage, nextPage, setPage, pageSize } = usePagination()
  const { data, count, isLoading, error, invalidate } = useSpeciesList(
    page,
    pageSize,
  )
  const { isOpen, setIsOpen, open } = useOpenClose()
  const { isAdmin } = useUserStore()
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <div className="flex justify-between">
        <h2 className="mb-4 text-2xl font-semibold">Species</h2>
        {isAdmin && (
          <Button onClick={open} className="flex gap-1">
            <PlusIcon aria-label="New Trip" size={16} /> <span>Add new</span>
          </Button>
        )}
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
      {isAdmin && isOpen && (
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
