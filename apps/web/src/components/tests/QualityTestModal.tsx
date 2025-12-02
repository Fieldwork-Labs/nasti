import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { QualityTestForm } from "./QualityTestForm"
import type { QualityTest } from "@nasti/common/types"
import { useBatchFiltersContext } from "@/routes/_private/inventory/-components/BatchFiltersContext"

type QualityTestModalProps = {
  isOpen: boolean
  onClose: () => void
  batchId: string
  existingTest?: QualityTest
}

export const QualityTestModal = ({
  isOpen,
  onClose,
  batchId,
  existingTest,
}: QualityTestModalProps) => {
  const { invalidateBatchesCacheByFilter } = useBatchFiltersContext()
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existingTest ? "Edit Quality Test" : "Record Quality Test"}
          </DialogTitle>
        </DialogHeader>
        <QualityTestForm
          batchId={batchId}
          existingTest={existingTest}
          onSuccess={() => {
            invalidateBatchesCacheByFilter()
            onClose()
          }}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
