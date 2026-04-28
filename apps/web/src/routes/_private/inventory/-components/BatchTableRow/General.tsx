import { Button } from "@nasti/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nasti/ui/tooltip"
import { cn } from "@nasti/ui/utils"
import {
  Combine,
  FlaskConical,
  Minus,
  Plus,
  SendIcon,
  X,
  BrushCleaning,
  Microscope,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@nasti/ui/badge"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import { QualityTestModal } from "@/components/tests/QualityTestModal"
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

interface CombineMode {
  isActive: boolean
  isInitiating: boolean
  isSelected: boolean
  canCombine: boolean
  onAddToCombine: () => void
  onRemoveFromCombine: () => void
  onCancelCombine: () => void
}

interface AssignmentMode {
  isActive: boolean
  isSelected: boolean
  onAddToAssignment: () => void
  onRemoveFromAssignment: () => void
  onCancelAssignment: () => void
}

interface BatchTableRowProps extends BaseBatchTableRowProps {
  batch: BatchWithCurrentLocationAndSpecies
  onEdit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onSplit?: (
    batch: BatchWithCurrentLocationAndSpecies,
    subBatchId?: string,
  ) => void
  onClean?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onMix?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onAssignForTesting?: (batch: BatchWithCurrentLocationAndSpecies) => void

  combineMode?: CombineMode
  assignmentMode?: AssignmentMode
}

// =============================================================================
// Action Button Components
// =============================================================================

interface AssignmentModeActionsProps {
  assignmentMode: AssignmentMode
  hasActiveAssignment: boolean
}

const AssignmentModeActions = ({
  assignmentMode,
  hasActiveAssignment,
}: AssignmentModeActionsProps) => {
  if (assignmentMode.isSelected) {
    return (
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={assignmentMode.onRemoveFromAssignment}
          className="border-green-500 bg-green-100 text-green-700"
        >
          <Minus className="mr-1 h-4 w-4" />
          <span className="text-xs">Remove</span>
        </Button>
        <Button
          variant="outline"
          onClick={assignmentMode.onCancelAssignment}
          className="border-destructive/50 text-destructive hover:bg-destructive/50"
        >
          <X className="mr-1 h-4 w-4" />
          <span className="text-xs">Cancel</span>
        </Button>
      </div>
    )
  }

  if (hasActiveAssignment) {
    return (
      <Badge
        variant="outline"
        className="border-blue-500 bg-blue-50 text-xs text-blue-700"
      >
        Already Assigned
      </Badge>
    )
  }

  return (
    <Button
      variant="outline"
      onClick={assignmentMode.onAddToAssignment}
      className="border-blue-500/20 text-blue-700 hover:bg-blue-50"
    >
      <Plus className="mr-1 h-4 w-4" />
      <span className="text-xs">Add to Assignment</span>
    </Button>
  )
}

interface MergeModeActionsProps {
  combineMode: CombineMode
}

const MergeModeActions = ({ combineMode }: MergeModeActionsProps) => {
  if (combineMode.isInitiating) {
    return (
      <Button
        variant="outline"
        size="lg"
        onClick={combineMode.onCancelCombine}
        className="text-destructive border-destructive/50 hover:bg-destructive/50"
      >
        <X className="mr-1 h-4 w-4" />
        <span className="text-xs">Cancel Combine</span>
      </Button>
    )
  }

  if (combineMode.isSelected) {
    return (
      <Button
        variant="outline"
        onClick={combineMode.onRemoveFromCombine}
        className="text-accent-foreground border-accent bg-accent/20"
      >
        <Minus className="mr-1 h-4 w-4" />
        <span className="text-xs">Remove</span>
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      onClick={combineMode.onAddToCombine}
      className="text-primary border-primary/20 hover:bg-primary/10"
    >
      <Plus className="mr-1 h-4 w-4" />
      <span className="text-xs">Add to Combine</span>
    </Button>
  )
}

interface NormalModeActionsProps {
  batch: BatchWithCurrentLocationAndSpecies
  mergeDisabled: boolean
  canDelete: boolean
  hasActiveAssignment: boolean
  onSplit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onProcess?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onClean?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onMerge?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onMix?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onAssignForTesting?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onDelete?: (batchId: string) => void
  onOpenQualityTest?: () => void
}

const NormalModeActions = ({
  batch,
  mergeDisabled,
  canDelete,
  hasActiveAssignment,
  onProcess,
  onClean,
  onMix,
  onAssignForTesting,
  onDelete,
  onOpenQualityTest,
}: NormalModeActionsProps) => (
  <>
    {onClean && (
      <Button
        variant="ghost"
        size="sm"
        disabled={mergeDisabled}
        onClick={() => onClean(batch)}
        title="Clean"
      >
        <BrushCleaning className="h-4 w-4" />
      </Button>
    )}

    {onProcess && (
      <Button
        variant="ghost"
        size="sm"
        disabled={mergeDisabled}
        onClick={() => onProcess(batch)}
        title="Treat"
      >
        <FlaskConical className="h-4 w-4" />
      </Button>
    )}

    {onMix && (
      <Button
        variant="ghost"
        size="sm"
        disabled={mergeDisabled}
        onClick={() => onMix(batch)}
        title="Combine"
      >
        <Combine className="h-4 w-4" />
      </Button>
    )}

    {onOpenQualityTest && (
      <Button
        variant="ghost"
        size="sm"
        disabled={mergeDisabled}
        onClick={onOpenQualityTest}
        title="Quality Test"
      >
        <Microscope className="h-4 w-4" />
      </Button>
    )}

    {onAssignForTesting && (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={mergeDisabled || hasActiveAssignment}
              onClick={() => onAssignForTesting(batch)}
              title={
                hasActiveAssignment
                  ? "Batch already assigned"
                  : "Assign for Testing"
              }
            >
              <SendIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          {hasActiveAssignment && (
            <TooltipContent>
              Batch already has an active assignment
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    )}

    <BatchDeleteButton
      batchId={batch.id}
      canDelete={canDelete}
      disabled={mergeDisabled}
      onDelete={onDelete}
    />
  </>
)

// =============================================================================
// Main Component
// =============================================================================

export const BatchTableRow = ({
  batch,
  onEdit,
  onDelete,
  onSplit,
  onClean,
  onMix,
  onAssignForTesting,
  onSubBatchStorageMove,
  className,
  combineMode,
  assignmentMode,
}: BatchTableRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [qualityTestModalSubBatchId, setQualityTestModalSubBatchId] = useState<
    string | false
  >(false)

  const { canDelete, activeAssignment, detailLoading } = useBatchRowData(
    batch.id,
  )

  // Collapse row when entering merge or assignment mode
  useEffect(() => {
    if (combineMode?.isActive || assignmentMode?.isActive) {
      setIsExpanded(false)
    }
  }, [combineMode?.isActive, assignmentMode?.isActive])

  const mergeDisabled = Boolean(combineMode && !combineMode.canCombine)
  const hasActiveAssignment = Boolean(activeAssignment)

  // Determine row styling based on mode
  const rowClassName = cn(
    combineMode?.isSelected &&
      combineMode?.canCombine &&
      "bg-accent/20 border-accent/40",
    mergeDisabled &&
      "bg-muted-foreground/20 text-primary-foreground/40 border-transparent",
    combineMode?.isInitiating && "bg-accent/40 border-accent/60",
    assignmentMode?.isSelected && "border-green-300 bg-green-50",
  )

  // Determine which action buttons to show
  const renderActionButtons = () => {
    if (assignmentMode?.isActive) {
      return (
        <AssignmentModeActions
          assignmentMode={assignmentMode}
          hasActiveAssignment={hasActiveAssignment}
        />
      )
    }

    if (combineMode?.canCombine && combineMode?.isActive) {
      return <MergeModeActions combineMode={combineMode} />
    }

    const isOriginBatch = batch.weight_grams === null
    if (isOriginBatch) {
      return (
        <NormalModeActions
          batch={batch}
          mergeDisabled={mergeDisabled}
          canDelete={canDelete}
          hasActiveAssignment={hasActiveAssignment}
          onClean={onClean}
          onMix={onMix}
          onDelete={onDelete}
        />
      )
    }
    return (
      <NormalModeActions
        batch={batch}
        mergeDisabled={mergeDisabled}
        canDelete={canDelete}
        hasActiveAssignment={hasActiveAssignment}
        onAssignForTesting={onAssignForTesting}
        onDelete={onDelete}
      />
    )
  }

  // Determine status badge
  const statusBadge = activeAssignment ? (
    <GeneralOrgAssignmentBadge assignment={activeAssignment} />
  ) : null

  const handleSubBatchSplit = (subBatchId: string) => {
    onSplit?.(batch, subBatchId)
  }

  const handleSubBatchQualityTest = (subBatchId: string) => {
    setQualityTestModalSubBatchId(subBatchId)
  }

  return (
    <>
      <BatchTableRowContainer
        batch={batch}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        className={className}
        rowClassName={rowClassName}
        statusBadge={statusBadge}
        actionButtons={renderActionButtons()}
        onEdit={onEdit}
        detailLoading={detailLoading}
        onSubBatchQualityTest={handleSubBatchQualityTest}
        onSubBatchSplit={handleSubBatchSplit}
        onSubBatchStorageMove={
          onSubBatchStorageMove
            ? (subBatchId) => onSubBatchStorageMove(batch, subBatchId)
            : undefined
        }
      />

      {qualityTestModalSubBatchId && (
        <QualityTestModal
          isOpen={Boolean(qualityTestModalSubBatchId)}
          onClose={() => setQualityTestModalSubBatchId(false)}
          batchId={batch.id}
          subBatchId={qualityTestModalSubBatchId}
        />
      )}
    </>
  )
}
