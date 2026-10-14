import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { Loader2 } from "lucide-react"

import { CleaningBaggingForm } from "@/components/batches/CleaningBaggingForm"
import { useBatchCleaning } from "@/hooks/useCleanBatch"

type CleaningBaggingModalProps = {
  isOpen: boolean
  cleaningId: string
  onClose: () => void
  onSuccess?: () => void
}

export const CleaningBaggingModal = ({
  isOpen,
  cleaningId,
  onClose,
  onSuccess,
}: CleaningBaggingModalProps) => {
  const { data: cleaning, isLoading, error } = useBatchCleaning(cleaningId)

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bag and store cleaned batches</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex min-h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {error && (
          <p className="text-destructive text-sm">
            Failed to load cleaning outputs: {error.message}
          </p>
        )}
        {cleaning && (
          <CleaningBaggingForm
            cleaning={cleaning}
            onCancel={onClose}
            onSuccess={() => {
              onClose()
              onSuccess?.()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
