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
}

export const BatchStorageModal = ({
  isOpen,
  onClose,
  batch,
}: BatchStorageModalProps) => {
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Batch Storage</DialogTitle>
        </DialogHeader>
        <BatchStorageForm
          batch={batch}
          onSuccess={onClose}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
