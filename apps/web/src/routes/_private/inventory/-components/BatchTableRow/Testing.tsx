import { Button } from "@nasti/ui/button"
import { useOpenClose } from "@nasti/ui/hooks"
import { FlaskConical, Undo2 } from "lucide-react"
import { useState } from "react"

import { QualityTestModal } from "@/components/tests/QualityTestModal"
import { ReturnBatchModal } from "@/components/tests/ReturnBatchModal"
import type { AssignedBag } from "@/hooks/useTestingOrgAssignments"
import { getAssignmentActions } from "@/lib/testingAssignments"
import { Badge } from "@nasti/ui/badge"
import { cn } from "@nasti/ui/utils"

// =============================================================================
// Types
// =============================================================================

type BagTableRowTestingProps = {
  bag: AssignedBag
  className?: string
}

// =============================================================================
// Cells
// =============================================================================

/**
 * Who sent it, and whether it has been tested yet.
 *
 * There is no sample-versus-full-batch distinction to draw any more: a sample
 * is a bag that was split off before being sent, so by the time it arrives here
 * it is simply a bag.
 */
const AssignmentCell = ({ bag }: { bag: AssignedBag }) => (
  <div className="flex flex-col gap-1">
    <Badge
      variant="outline"
      className={cn(
        "w-fit text-xs",
        bag.assignment.completed_at
          ? "border-green-500 bg-green-50 text-green-700"
          : "border-orange-500 bg-orange-50 text-orange-700",
      )}
    >
      {bag.assignment.completed_at ? "Tested" : "Awaiting test"}
    </Badge>
    <span className="text-muted-foreground text-xs">
      From {bag.assignment.assigned_by_org?.name ?? "unknown organisation"}
    </span>
  </div>
)

/**
 * The bag itself. The container is named because the seed arrived in it; the
 * sender's storage location is deliberately not shown, and is not readable.
 */
const BagCell = ({ bag }: { bag: AssignedBag }) => (
  <div className="flex flex-col text-sm">
    <span>{bag.containerName ?? "Unlabelled container"}</span>
    <span className="text-muted-foreground font-mono text-xs">
      {bag.subBatchId.slice(0, 8)}
    </span>
  </div>
)

const AssignmentDatesCell = ({ bag }: { bag: AssignedBag }) => (
  <div className="flex flex-col text-sm">
    <span>{new Date(bag.assignment.assigned_at).toLocaleDateString()}</span>
    {bag.assignment.completed_at && (
      <span className="text-muted-foreground text-xs">
        Tested {new Date(bag.assignment.completed_at).toLocaleDateString()}
      </span>
    )}
  </div>
)

// =============================================================================
// Main Component
// =============================================================================

/**
 * One row per assigned bag.
 *
 * Deliberately not built on BatchTableRowContainer: that renders a parent batch
 * and expands into its bag list, which is the wrong unit here and would invite
 * a Testing organisation to reason about siblings it cannot see. The bag is the
 * whole row.
 */
export const BagTableRow = ({ bag, className }: BagTableRowTestingProps) => {
  const [isQualityTestOpen, setIsQualityTestOpen] = useState(false)

  const { isOpen: isReturnModalOpen, setIsOpen: setIsReturnModalOpen } =
    useOpenClose()

  // A bag consumed to zero keeps its row until the assignment is closed, but
  // there is nothing left to test.
  const hasSeedLeft = (bag.weights.current_weight ?? 0) > 0

  const actions = getAssignmentActions(bag.assignment, {
    hasVisibleSubBatch: hasSeedLeft,
  })

  return (
    <>
      <tr className={cn("hover:bg-muted/50 border-b", className)}>
        <td className="px-4 py-3 font-mono text-sm">
          {bag.parent.code ?? "—"}
        </td>
        <td className="px-4 py-3 text-sm">
          <div className="flex flex-col">
            <span>{bag.parent.species_name ?? "Unknown species"}</span>
            <span className="text-muted-foreground text-xs">
              {bag.parent.collection_code ?? ""}
            </span>
          </div>
        </td>
        <td className="px-4 py-3">
          <AssignmentCell bag={bag} />
        </td>
        <td className="px-4 py-3">
          <BagCell bag={bag} />
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {bag.weights.current_weight ?? 0}
        </td>
        <td className="px-4 py-3">
          <AssignmentDatesCell bag={bag} />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {actions.canTest && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsQualityTestOpen(true)}
                title="Record quality test"
              >
                <FlaskConical className="h-4 w-4" />
              </Button>
            )}

            {actions.canReturn && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsReturnModalOpen(true)}
                title="Return to owner"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </td>
      </tr>

      {isQualityTestOpen && (
        <QualityTestModal
          isOpen={isQualityTestOpen}
          onClose={() => setIsQualityTestOpen(false)}
          batchId={bag.parent.id}
          subBatchId={bag.subBatchId}
        />
      )}

      <ReturnBatchModal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        bag={bag}
      />
    </>
  )
}
