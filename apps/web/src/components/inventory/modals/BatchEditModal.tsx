import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { BatchForm } from "@/components/batches"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import {
  invalidateBatchesByFilterCache,
  type BatchFilter,
} from "@/hooks/useBatches"

type BatchEditModalProps = {
  isOpen: boolean
  onClose: () => void
  batch: BatchWithCurrentLocationAndSpecies
  batchFilter: BatchFilter
}

export const BatchEditModal = ({
  isOpen,
  onClose,
  batch,
  batchFilter,
}: BatchEditModalProps) => {
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Batch</DialogTitle>
        </DialogHeader>
        <BatchForm
          batch={batch}
          onSuccess={() => {
            onClose()
            invalidateBatchesByFilterCache(batchFilter)
          }}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
