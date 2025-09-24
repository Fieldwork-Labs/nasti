import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { BatchSplitForm } from "@/components/batches"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import {
  invalidateBatchesByFilterCache,
  type BatchFilter,
} from "@/hooks/useBatches"

type BatchSplitModalProps = {
  isOpen: boolean
  onClose: () => void
  batch: BatchWithCurrentLocationAndSpecies
  batchFilter: BatchFilter
}

export const BatchSplitModal = ({
  isOpen,
  onClose,
  batch,
  batchFilter,
}: BatchSplitModalProps) => {
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split Batch</DialogTitle>
        </DialogHeader>
        <BatchSplitForm
          parentBatch={batch}
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
