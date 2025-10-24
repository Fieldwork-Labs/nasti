import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import {
  invalidateBatchesByFilterCache,
  type BatchFilter,
} from "@/hooks/useBatches"
import { BatchProcessingForm } from "@/components/batches/BatchProcessingForm"

type BatchProcessingModalProps = {
  isOpen: boolean
  onClose: () => void
  batch: BatchWithCurrentLocationAndSpecies
  batchFilter: BatchFilter
}

export const BatchProcessingModal = ({
  isOpen,
  onClose,
  batch,
  batchFilter,
}: BatchProcessingModalProps) => {
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Process Batch</DialogTitle>
        </DialogHeader>
        <BatchProcessingForm
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
