import { useReturnBatchFromTesting } from "@/hooks/useTestingOrgAssignments"
import { useBatchFiltersContext } from "@/routes/_private/inventory/-components/BatchFiltersContext"
import { useBatchRowData } from "@/routes/_private/inventory/-components/BatchTableRow/Common"
import { Button } from "@nasti/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { useToast } from "@nasti/ui/hooks"

type ReturnBatchModalProps = {
  isOpen: boolean
  onClose: () => void
  batchId: string
}

export const ReturnBatchModal = ({
  isOpen,
  onClose,
  batchId,
}: ReturnBatchModalProps) => {
  const { invalidateBatchesCacheByFilter } = useBatchFiltersContext()
  const { activeAssignment } = useBatchRowData(batchId)
  const { toast } = useToast()

  // Testing org assignment actions
  const returnBatch = useReturnBatchFromTesting()

  const handleReturnBatch = async () => {
    if (!activeAssignment) return
    try {
      await returnBatch.mutateAsync({ assignmentId: activeAssignment.id })
      toast({
        description: `Batch returned to ${activeAssignment.assigned_by_org?.name ?? "owner"}`,
      })
      invalidateBatchesCacheByFilter()
    } catch {
      toast({
        description: "Failed to return batch",
        variant: "destructive",
      })
    }
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Return Batch</DialogTitle>
        </DialogHeader>
        Please confirm you would like to return the batch to the original owner.
        <div className="flex w-full justify-end gap-2">
          <Button
            type="button"
            className="cursor-pointer"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button className="cursor-pointer" onClick={handleReturnBatch}>
            Return Batch
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
