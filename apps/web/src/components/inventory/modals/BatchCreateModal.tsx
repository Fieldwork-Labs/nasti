import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { BatchForm } from "@/components/batches"
import {
  invalidateBatchesByFilterCache,
  type BatchFilter,
} from "@/hooks/useBatches"

type BatchCreateModalProps = {
  isOpen: boolean
  onClose: () => void
  batchFilter: BatchFilter
}

export const BatchCreateModal = ({
  isOpen,
  onClose,
  batchFilter,
}: BatchCreateModalProps) => {
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Batch</DialogTitle>
        </DialogHeader>
        <BatchForm
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
