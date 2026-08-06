import type { BatchAssignmentWithOrg } from "@/hooks/useBatchAssignments"
import { useReturnBatchFromTesting } from "@/hooks/useTestingOrgAssignments"
import { useBatchFiltersContext } from "@/routes/_private/inventory/-components/BatchFiltersContext"
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
  /**
   * Passed in rather than looked up: the inventory already fetched it, and a
   * per-row query here would re-fetch it once per open row.
   */
  assignment: BatchAssignmentWithOrg
}

export const ReturnBatchModal = ({
  isOpen,
  onClose,
  assignment,
}: ReturnBatchModalProps) => {
  const { invalidateBatchesCacheByFilter } = useBatchFiltersContext()
  const { toast } = useToast()

  // Testing org assignment actions
  const returnBatch = useReturnBatchFromTesting()

  const handleReturnBatch = async () => {
    try {
      await returnBatch.mutateAsync({ assignmentId: assignment.id })
      toast({
        description: `Batch returned to ${assignment.assigned_by_org?.name ?? "owner"}`,
      })
      invalidateBatchesCacheByFilter()
      onClose()
    } catch (error) {
      toast({
        description:
          error instanceof Error ? error.message : "Failed to return batch",
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
