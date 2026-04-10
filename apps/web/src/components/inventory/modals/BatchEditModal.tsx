import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { BatchForm } from "@/components/batches"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"

type BatchEditModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  batch: BatchWithCurrentLocationAndSpecies
}

export const BatchEditModal = ({
  isOpen,
  onClose,
  batch,
  onSuccess,
}: BatchEditModalProps) => {
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Batch Notes</DialogTitle>
        </DialogHeader>
        <BatchForm
          batch={batch}
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
