import { Button } from "@nasti/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nasti/ui/tooltip"
import { cn } from "@nasti/ui/utils"
import {
  Boxes,
  Sparkles,
  Combine,
  Edit,
  FlaskConical,
  Merge,
  Minus,
  Plus,
  SendIcon,
  Split,
  X,
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

interface MergeMode {
  isActive: boolean
  isInitiating: boolean
  isSelected: boolean
  canMerge: boolean
  onAddToMerge: () => void
  onRemoveFromMerge: () => void
  onCancelMerge: () => void
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
  onSplit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onClean?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onMerge?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onMix?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onAssignForTesting?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onSubBatchStorageMove?: (
    batch: BatchWithCurrentLocationAndSpecies,
    subBatchId: string,
  ) => void
  mergeMode?: MergeMode
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
  mergeMode: MergeMode
}

const MergeModeActions = ({ mergeMode }: MergeModeActionsProps) => {
  if (mergeMode.isInitiating) {
    return (
      <Button
        variant="outline"
        size="lg"
        onClick={mergeMode.onCancelMerge}
        className="text-destructive border-destructive/50 hover:bg-destructive/50"
      >
        <X className="mr-1 h-4 w-4" />
        <span className="text-xs">Cancel Merge</span>
      </Button>
    )
  }

  if (mergeMode.isSelected) {
    return (
      <Button
        variant="outline"
        onClick={mergeMode.onRemoveFromMerge}
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
      onClick={mergeMode.onAddToMerge}
      className="text-primary border-primary/20 hover:bg-primary/10"
    >
      <Plus className="mr-1 h-4 w-4" />
      <span className="text-xs">Add to Merge</span>
    </Button>
  )
}

interface NormalModeActionsProps {
  batch: BatchWithCurrentLocationAndSpecies
  mergeDisabled: boolean
  canDelete: boolean
  hasActiveAssignment: boolean
  onEdit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onSplit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onProcess?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onClean?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onMerge?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onMix?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onStorageMove?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onAssignForTesting?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onDelete?: (batchId: string) => void
  onOpenQualityTest: () => void
}

const NormalModeActions = ({
  batch,
  mergeDisabled,
  canDelete,
  hasActiveAssignment,
  onEdit,
  onSplit,
  onProcess,
  onClean,
  onMerge,
  onMix,
  onStorageMove,
  onAssignForTesting,
  onDelete,
  onOpenQualityTest,
}: NormalModeActionsProps) => (
  <>
    <Button
      variant="ghost"
      disabled={mergeDisabled}
      size="sm"
      onClick={() => onEdit?.(batch)}
      title="Edit"
    >
      <Edit className="h-4 w-4" />
    </Button>

    {(batch.is_treated || batch.is_cleaned) && (
      <Button
        variant="ghost"
        size="sm"
        disabled={mergeDisabled}
        onClick={() => onSplit?.(batch)}
        title="Split"
      >
        <Split className="h-4 w-4" />
      </Button>
    )}

    <Button
      variant="ghost"
      size="sm"
      disabled={mergeDisabled}
      onClick={() => onClean?.(batch)}
      title="Clean"
    >
      <Sparkles className="h-4 w-4" />
    </Button>

    <Button
      variant="ghost"
      size="sm"
      disabled={mergeDisabled}
      onClick={() => onProcess?.(batch)}
      title="Treat"
    >
      <FlaskConical className="h-4 w-4" />
    </Button>

    {(batch.is_treated || batch.is_cleaned) && (
      <Button
        variant="ghost"
        size="sm"
        disabled={mergeDisabled}
        onClick={() => onMerge?.(batch)}
        title="Merge"
      >
        <Merge className="h-4 w-4" />
      </Button>
    )}

    <Button
      variant="ghost"
      size="sm"
      disabled={mergeDisabled}
      onClick={() => onMix?.(batch)}
      title="Mix"
    >
      <Combine className="h-4 w-4" />
    </Button>

    <Button
      variant="ghost"
      size="sm"
      disabled={mergeDisabled}
      onClick={() => onStorageMove?.(batch)}
      title="Move to storage"
    >
      <Boxes className="h-4 w-4" />
    </Button>

    <Button
      variant="ghost"
      size="sm"
      disabled={mergeDisabled}
      onClick={onOpenQualityTest}
      title="Quality Test"
    >
      <FlaskConical className="h-4 w-4" />
    </Button>

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
  onProcess,
  onSplit,
  onClean,
  onMerge,
  onMix,
  onStorageMove,
  onAssignForTesting,
  onSubBatchStorageMove,
  className,
  mergeMode,
  assignmentMode,
}: BatchTableRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isQualityTestModalOpen, setIsQualityTestModalOpen] = useState(false)

  const { currentStorage, canDelete, activeAssignment, detailLoading } =
    useBatchRowData(batch.id)

  // Collapse row when entering merge or assignment mode
  useEffect(() => {
    if (mergeMode?.isActive || assignmentMode?.isActive) {
      setIsExpanded(false)
    }
  }, [mergeMode?.isActive, assignmentMode?.isActive])

  const mergeDisabled = Boolean(mergeMode && !mergeMode.canMerge)
  const hasActiveAssignment = Boolean(activeAssignment)

  // Determine row styling based on mode
  const rowClassName = cn(
    mergeMode?.isSelected &&
      mergeMode?.canMerge &&
      "bg-accent/20 border-accent/40",
    mergeDisabled &&
      "bg-muted-foreground/20 text-primary-foreground/40 border-transparent",
    mergeMode?.isInitiating && "bg-accent/40 border-accent/60",
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

    if (mergeMode?.canMerge && mergeMode?.isActive) {
      return <MergeModeActions mergeMode={mergeMode} />
    }

    return (
      <NormalModeActions
        batch={batch}
        mergeDisabled={mergeDisabled}
        canDelete={canDelete}
        hasActiveAssignment={hasActiveAssignment}
        onEdit={onEdit}
        onSplit={onSplit}
        onClean={onClean}
        onProcess={onProcess}
        onMerge={onMerge}
        onMix={onMix}
        onStorageMove={onStorageMove}
        onAssignForTesting={onAssignForTesting}
        onDelete={onDelete}
        onOpenQualityTest={() => setIsQualityTestModalOpen(true)}
      />
    )
  }

  // Determine status badge
  const statusBadge = activeAssignment ? (
    <GeneralOrgAssignmentBadge assignment={activeAssignment} />
  ) : null

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
        currentStorage={currentStorage}
        detailLoading={detailLoading}
        onSubBatchStorageMove={
          onSubBatchStorageMove
            ? (subBatchId) => onSubBatchStorageMove(batch, subBatchId)
            : undefined
        }
      />

      <QualityTestModal
        isOpen={isQualityTestModalOpen}
        onClose={() => setIsQualityTestModalOpen(false)}
        batchId={batch.id}
      />
    </>
  )
}
