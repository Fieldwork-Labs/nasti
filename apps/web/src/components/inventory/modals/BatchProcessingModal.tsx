import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"

import { BatchTreatmentForm } from "@/components/batches/BatchTreatmentForm"

type BatchTreatmentModalProps = {
  isOpen: boolean
  onClose: () => void
  batch: BatchWithCurrentLocationAndSpecies
  onSuccess?: () => void
}

export const BatchProcessingModal = ({
  isOpen,
  onClose,
  batch,
  onSuccess,
}: BatchTreatmentModalProps) => {
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Treat Batch</DialogTitle>
        </DialogHeader>
        <BatchTreatmentForm
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
