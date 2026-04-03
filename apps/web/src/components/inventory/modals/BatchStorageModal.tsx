import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { BatchStorageForm } from "@/components/inventory/BatchStorageForm"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"

type BatchStorageModalProps = {
  isOpen: boolean
  onClose: () => void
  batch: BatchWithCurrentLocationAndSpecies
  /** Pre-select a specific sub-batch for storage move */
  subBatchId?: string
}

export const BatchStorageModal = ({
  isOpen,
  onClose,
  batch,
  subBatchId,
}: BatchStorageModalProps) => {
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Storage</DialogTitle>
        </DialogHeader>
        <BatchStorageForm
          batch={batch}
          subBatchId={subBatchId}
          onSuccess={onClose}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
