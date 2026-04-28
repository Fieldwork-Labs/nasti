import { Button } from "@nasti/ui/button"
import { useOpenClose } from "@nasti/ui/hooks"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nasti/ui/tooltip"
import { FlaskConical, Microscope, Undo2 } from "lucide-react"
import { useState } from "react"

import { QualityTestModal } from "@/components/tests/QualityTestModal"
import { ReturnBatchModal } from "@/components/tests/ReturnBatchModal"
import { BatchAssignmentWithOrg } from "@/hooks/useBatchAssignments"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import { Badge } from "@nasti/ui/badge"
import { cn } from "@nasti/ui/utils"
import {
  BatchDeleteButton,
  BatchTableRowContainer,
  GeneralOrgAssignmentBadge,
  useBatchRowData,
  type BaseBatchTableRowProps,
} from "./Common"

// =============================================================================
// Types
// =============================================================================

type BatchTableRowTestingProps = BaseBatchTableRowProps

// =============================================================================
// Action Button Components
// =============================================================================

interface TestingOrgActionsProps {
  assignment?: BatchAssignmentWithOrg | null
  onReturn: () => void
}

interface ActionsProps extends TestingOrgActionsProps {
  batch: BatchWithCurrentLocationAndSpecies
  canDelete: boolean
  onProcess?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onDelete?: (batchId: string) => void
  onOpenQualityTest?: () => void
}

const Actions = ({
  batch,
  canDelete,
  onProcess,
  onDelete,
  onOpenQualityTest,
  onReturn,
}: ActionsProps) => (
  <>
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onProcess?.(batch)}
      title="Process"
    >
      <FlaskConical className="h-4 w-4" />
    </Button>

    <Button
      variant="ghost"
      size="sm"
      onClick={onOpenQualityTest}
      title="Quality Test"
    >
      <Microscope className="h-4 w-4" />
    </Button>

    <Button
      variant="ghost"
      size="sm"
      onClick={onReturn}
      title="Return to Owner"
    >
      <Undo2 className="mr-1 h-4 w-4" />
    </Button>

    <BatchDeleteButton
      batchId={batch.id}
      canDelete={canDelete}
      onDelete={onDelete}
    />
  </>
)

/**
 * Badge showing assignment status for testing orgs (batch received)
 */
export const TestingOrgAssignmentBadge = ({
  assignment,
}: {
  assignment: BatchAssignmentWithOrg
}) => {
  if (!assignment) return null
  console.log({ assignment })

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              assignment.completed_at
                ? "border-green-500 bg-green-50 text-green-700"
                : "border-orange-500 bg-orange-50 text-orange-700",
            )}
          >
            {assignment.assignment_type === "sample"
              ? "Test Sample"
              : "Full Batch"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {assignment.assignment_type === "sample"
              ? `${assignment.sample_weight_grams}g sample from `
              : "Full batch from "}
            {assignment.assigned_by_org?.name}
          </p>
          <p className="text-muted-foreground text-xs">
            Assigned: {new Date(assignment.assigned_at).toLocaleDateString()}
          </p>
          {assignment.completed_at && (
            <p className="text-muted-foreground text-xs">
              Completed:{" "}
              {new Date(assignment.completed_at).toLocaleDateString()}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export const BatchTableRow = ({
  batch,
  onDelete,
  onProcess,
  className,
}: BatchTableRowTestingProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const [qualityTestModalSubBatchId, setQualityTestModalSubBatchId] = useState<
    string | false
  >(false)

  const handleSubBatchQualityTest = (subBatchId: string) => {
    setQualityTestModalSubBatchId(subBatchId)
  }

  const { isOpen: isReturnModalOpen, setIsOpen: setIsReturnModalOpen } =
    useOpenClose()

  const { canDelete, activeAssignment, detailLoading } = useBatchRowData(
    batch.id,
  )

  // Determine which action buttons to show
  const renderActionButtons = () => {
    return (
      <Actions
        batch={batch}
        assignment={activeAssignment}
        canDelete={canDelete}
        onProcess={onProcess}
        onDelete={onDelete}
        onReturn={() => setIsReturnModalOpen(true)}
      />
    )
  }

  // Determine status badge based on org type
  const getStatusBadge = () => {
    if (activeAssignment) {
      return <TestingOrgAssignmentBadge assignment={activeAssignment} />
    }

    if (activeAssignment) {
      return <GeneralOrgAssignmentBadge assignment={activeAssignment} />
    }

    return null
  }

  return (
    <>
      <BatchTableRowContainer
        batch={batch}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        className={className}
        onSubBatchQualityTest={handleSubBatchQualityTest}
        statusBadge={getStatusBadge()}
        actionButtons={renderActionButtons()}
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
      <ReturnBatchModal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        batchId={batch.id}
      />
    </>
  )
}
