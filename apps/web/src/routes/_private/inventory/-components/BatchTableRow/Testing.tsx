import { Button } from "@nasti/ui/button"
import { useOpenClose } from "@nasti/ui/hooks"
import { Undo2 } from "lucide-react"
import { useState } from "react"

import { QualityTestModal } from "@/components/tests/QualityTestModal"
import { ReturnBatchModal } from "@/components/tests/ReturnBatchModal"
import { BatchAssignmentWithOrg } from "@/hooks/useBatchAssignments"
import { getAssignmentActions } from "@/lib/testingAssignments"
import { Badge } from "@nasti/ui/badge"
import { cn } from "@nasti/ui/utils"
import { useBatchDetail } from "@/hooks/useBatches"
import { BatchTableRowContainer, type BaseBatchTableRowProps } from "./Common"

// =============================================================================
// Types
// =============================================================================

type BatchTableRowTestingProps = BaseBatchTableRowProps & {
  assignment?: BatchAssignmentWithOrg
}

// =============================================================================
// Cells
// =============================================================================

/**
 * What was sent, by whom, and how much of it.
 */
const AssignmentCell = ({
  assignment,
}: {
  assignment: BatchAssignmentWithOrg
}) => {
  const isSample = assignment.assignment_type === "sample"

  return (
    <div className="flex flex-col gap-1">
      <Badge
        variant="outline"
        className={cn(
          "w-fit text-xs",
          assignment.completed_at
            ? "border-green-500 bg-green-50 text-green-700"
            : "border-orange-500 bg-orange-50 text-orange-700",
        )}
      >
        {isSample ? "Test Sample" : "Full Batch"}
        {assignment.completed_at ? " · Tested" : " · Awaiting test"}
      </Badge>
      <span className="text-muted-foreground text-xs">
        {isSample && assignment.sample_weight_grams
          ? `${assignment.sample_weight_grams}g from `
          : "From "}
        {assignment.assigned_by_org?.name ?? "unknown organisation"}
      </span>
    </div>
  )
}

const AssignmentDatesCell = ({
  assignment,
}: {
  assignment: BatchAssignmentWithOrg
}) => (
  <div className="flex flex-col text-sm">
    <span>{new Date(assignment.assigned_at).toLocaleDateString()}</span>
    {assignment.completed_at && (
      <span className="text-muted-foreground text-xs">
        Tested {new Date(assignment.completed_at).toLocaleDateString()}
      </span>
    )}
  </div>
)

// =============================================================================
// Main Component
// =============================================================================

export const BatchTableRow = ({
  batch,
  assignment,
  className,
}: BatchTableRowTestingProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const [qualityTestModalSubBatchId, setQualityTestModalSubBatchId] = useState<
    string | false
  >(false)

  const { isOpen: isReturnModalOpen, setIsOpen: setIsReturnModalOpen } =
    useOpenClose()

  // Only the detail query is needed here: the assignment arrives as a prop, and
  // a Testing organisation never deletes, so the delete-eligibility query that
  // useBatchRowData bundles would be wasted work on every row.
  const { isLoading: detailLoading } = useBatchDetail(batch.id)

  // Without an assignment there is nothing for a Testing organisation to act
  // on; the row is read-only rather than half-enabled.
  const actions = assignment
    ? getAssignmentActions(assignment)
    : { canTest: false, canReturn: false, canDelete: false }

  return (
    <>
      <BatchTableRowContainer
        batch={batch}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        className={className}
        // A quality test is recorded against a bag, so it is offered from the
        // expanded bag list rather than as a row-level button with nothing
        // selected.
        onSubBatchQualityTest={setQualityTestModalSubBatchId}
        statusCell={
          assignment ? <AssignmentCell assignment={assignment} /> : undefined
        }
        dateCell={
          assignment ? (
            <AssignmentDatesCell assignment={assignment} />
          ) : undefined
        }
        actionButtons={
          <>
            {actions.canReturn && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsReturnModalOpen(true)}
                title="Return to Owner"
              >
                <Undo2 className="mr-1 h-4 w-4" />
              </Button>
            )}
          </>
        }
        detailLoading={detailLoading}
      />

      {qualityTestModalSubBatchId && (
        <QualityTestModal
          isOpen={Boolean(qualityTestModalSubBatchId)}
          onClose={() => setQualityTestModalSubBatchId(false)}
          batchId={batch.id}
          subBatchId={qualityTestModalSubBatchId}
        />
      )}

      {assignment && (
        <ReturnBatchModal
          isOpen={isReturnModalOpen}
          onClose={() => setIsReturnModalOpen(false)}
          assignment={assignment}
        />
      )}
    </>
  )
}
