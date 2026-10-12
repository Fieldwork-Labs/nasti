import { Button } from "@nasti/ui/button"
import { cn } from "@nasti/ui/utils"
import {
  Combine,
  Minus,
  Plus,
  X,
  BrushCleaning,
  Microscope,
} from "lucide-react"
import { useEffect, useState } from "react"
import { queryClient } from "@nasti/common/utils"

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

interface BatchTableRowProps extends BaseBatchTableRowProps {
  batch: BatchWithCurrentLocationAndSpecies
  onEdit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onSplit?: (
    batch: BatchWithCurrentLocationAndSpecies,
    subBatchId?: string,
  ) => void
  onClean?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onCombine?: (batch: BatchWithCurrentLocationAndSpecies) => void

  combineMode?: CombineMode
}

// =============================================================================
// Action Button Components
// =============================================================================

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
  onSplit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onClean?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onMerge?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onCombine?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onDelete?: (batchId: string) => void
  onOpenQualityTest?: () => void
}

const NormalModeActions = ({
  batch,
  mergeDisabled,
  canDelete,
  onClean,
  onCombine,
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

    {onCombine && (
      <Button
        variant="ghost"
        size="sm"
        disabled={mergeDisabled}
        onClick={() => onCombine(batch)}
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
  onCombine,
  onSubBatchStorageMove,
  className,
  combineMode,
}: BatchTableRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [qualityTestModalSubBatchId, setQualityTestModalSubBatchId] = useState<
    string | false
  >(false)

  const { canDelete, activeAssignments, detailLoading } = useBatchRowData(
    batch.id,
  )

  // Opening a row refetches its tests, so refresh the list too: the row's
  // latest quality statistics come from the list, and a test recorded
  // elsewhere (e.g. by a testing lab) would otherwise leave them stale.
  const handleToggleExpand = () => {
    if (!isExpanded) {
      queryClient.invalidateQueries({ queryKey: ["batches", "byFilter"] })
    }
    setIsExpanded(!isExpanded)
  }

  // Collapse row when entering merge mode
  useEffect(() => {
    if (combineMode?.isActive) {
      setIsExpanded(false)
    }
  }, [combineMode?.isActive])

  const mergeDisabled = Boolean(combineMode && !combineMode.canCombine)
  // "Some of this batch is out at a laboratory" — no longer "the batch is out",
  // since bags leave individually and siblings stay put.
  const hasActiveAssignment = activeAssignments.size > 0

  // Determine row styling based on mode
  const rowClassName = cn(
    combineMode?.isSelected &&
      combineMode?.canCombine &&
      "bg-accent/20 border-accent/40",
    mergeDisabled &&
      "bg-muted-foreground/20 text-primary-foreground/40 border-transparent",
    combineMode?.isInitiating && "bg-accent/40 border-accent/60",
  )

  // Determine which action buttons to show
  const renderActionButtons = () => {
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
          onClean={onClean}
          // a combined batch (no collection of its own) is cleaned, not
          // combined again
          onCombine={batch.collection_id ? onCombine : undefined}
          onDelete={onDelete}
        />
      )
    }
    return (
      <NormalModeActions
        batch={batch}
        mergeDisabled={mergeDisabled}
        canDelete={canDelete}
        onDelete={onDelete}
      />
    )
  }

  // Determine status badge
  const statusBadge = hasActiveAssignment ? (
    <GeneralOrgAssignmentBadge assignments={[...activeAssignments.values()]} />
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
        onToggleExpand={handleToggleExpand}
        className={className}
        rowClassName={rowClassName}
        statusBadge={statusBadge}
        actionButtons={renderActionButtons()}
        onEdit={onEdit}
        detailLoading={detailLoading}
        assignedBagIds={new Set(activeAssignments.keys())}
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
