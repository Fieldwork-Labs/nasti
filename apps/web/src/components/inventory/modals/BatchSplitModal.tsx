import { Dialog, DialogContent } from "@nasti/ui/dialog"
import { BatchSplitForm } from "@/components/batches"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"

type BatchSplitModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  batch: BatchWithCurrentLocationAndSpecies
  subBatchId?: string
}

export const BatchSplitModal = ({
  isOpen,
  onClose,
  batch,
  subBatchId,
  onSuccess,
}: BatchSplitModalProps) => {
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <BatchSplitForm
          parentBatch={batch}
          initialSubBatchId={subBatchId}
          onSuccess={() => {
            onClose()
            onSuccess?.()
          }}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
