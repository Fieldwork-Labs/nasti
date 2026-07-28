import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import type { BatchCleaningWithOutputs } from "@/hooks/useCleanBatch"

import { BatchCleaningForm } from "@/components/batches/BatchCleaningForm"

type BatchCleaningModalProps = {
  isOpen: boolean
  onClose: () => void
  batch: BatchWithCurrentLocationAndSpecies
  instance?: BatchCleaningWithOutputs
  onSuccess?: () => void
}

export const BatchCleaningModal = ({
  isOpen,
  onClose,
  batch,
  instance,
  onSuccess,
}: BatchCleaningModalProps) => {
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="h-screen max-w-2xl overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {instance ? "Edit Cleaning Record" : "Clean Batch"}
          </DialogTitle>
        </DialogHeader>
        <BatchCleaningForm
          batch={batch}
          instance={instance}
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
