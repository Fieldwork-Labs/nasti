import type { AssignedBag } from "@/hooks/useTestingOrgAssignments"
import { useReturnBagFromTesting } from "@/hooks/useTestingOrgAssignments"
import { useBatchFiltersContext } from "@/routes/_private/inventory/-components/BatchFiltersContext"
import { Button } from "@nasti/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { useToast } from "@nasti/ui/hooks"

type ReturnBagModalProps = {
  isOpen: boolean
  onClose: () => void
  /**
   * Passed in rather than looked up: the inventory already fetched it, and a
   * per-row query here would re-fetch it once per open row.
   */
  bag: AssignedBag
}

export const ReturnBatchModal = ({
  isOpen,
  onClose,
  bag,
}: ReturnBagModalProps) => {
  const { invalidateBatchesCacheByFilter } = useBatchFiltersContext()
  const { toast } = useToast()

  const returnBag = useReturnBagFromTesting()

  const ownerName = bag.assignment.assigned_by_org?.name ?? "the owner"
  const remainingWeight = bag.weights.current_weight ?? 0

  const handleReturnBag = async () => {
    try {
      await returnBag.mutateAsync({ assignmentId: bag.assignment.id })
      toast({ description: `Bag returned to ${ownerName}` })
      invalidateBatchesCacheByFilter()
      onClose()
    } catch (error) {
      toast({
        description:
          error instanceof Error ? error.message : "Failed to return bag",
        variant: "destructive",
      })
    }
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Return bag</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <p>
            Return this bag to <span className="font-medium">{ownerName}</span>?
          </p>

          <dl className="bg-muted/50 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded p-3">
            <dt className="text-muted-foreground">Batch</dt>
            <dd className="font-mono">{bag.parent.code ?? "—"}</dd>

            <dt className="text-muted-foreground">Container</dt>
            <dd>{bag.containerName ?? "Unlabelled"}</dd>

            <dt className="text-muted-foreground">Remaining</dt>
            <dd className="tabular-nums">{remainingWeight}g</dd>
          </dl>

          <p className="text-muted-foreground">
            The whole bag goes back. To keep some of the seed, split it first —
            what you split off stays with your organisation.
          </p>
        </div>

        <div className="flex w-full justify-end gap-2">
          <Button
            type="button"
            className="cursor-pointer"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="cursor-pointer"
            onClick={handleReturnBag}
            disabled={returnBag.isPending}
          >
            {returnBag.isPending ? "Returning…" : "Return bag"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
