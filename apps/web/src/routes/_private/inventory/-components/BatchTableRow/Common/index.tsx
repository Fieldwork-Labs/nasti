import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@nasti/ui/alert-dialog"
import { Button } from "@nasti/ui/button"
import { useOpenClose } from "@nasti/ui/hooks"
import {
  BrushCleaning,
  Calendar,
  ChevronDown,
  ChevronRight,
  Edit,
  FileWarningIcon,
  FlaskConical,
  MicroscopeIcon,
  Pencil,
  Trash2,
} from "lucide-react"
import { useState, type ReactNode } from "react"

import { CollectionListItem } from "@/components/collections/CollectionListItem"
import { QualityTestModal } from "@/components/tests/QualityTestModal"
import { useActiveBatchAssignment } from "@/hooks/useBatchAssignments"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import {
  useBatchDetail,
  useBatchHistory,
  useCanDeleteBatch,
} from "@/hooks/useBatches"
import { useBatchTests } from "@/hooks/useBatchTests"
import useUserStore from "@/store/userStore"
import { TaxonName } from "@nasti/common"
import type { QualityTest } from "@nasti/common/types"
import { Badge } from "@nasti/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  withTooltip,
} from "@nasti/ui/tooltip"
import { cn } from "@nasti/ui/utils"
import { SubBatchesTable } from "./SubBatches"
import { useSubBatches } from "@/hooks/useSubBatches"

// =============================================================================
// Types
// =============================================================================

export type BatchType = BatchWithCurrentLocationAndSpecies

export interface BaseBatchTableRowProps {
  batch: BatchType
  onProcess?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onDelete?: (batchId: string) => void
  onSubBatchStorageMove?: (
    batch: BatchWithCurrentLocationAndSpecies,
    subBatchId: string,
  ) => void
  className?: string
}

// =============================================================================
// Shared Sub-components
// =============================================================================

const ParentBatchBadge = withTooltip(
  <Badge variant="secondary">Parent batch</Badge>,
)

export const NeedsProcessingIcon = withTooltip(
  <FileWarningIcon className="h-4 w-4 text-orange-600" />,
)

export const StatusCleanedIcon = withTooltip(
  <BrushCleaning className="h-4 w-4" />,
)
export const StatusTreatedIcon = withTooltip(
  <FlaskConical className="h-4 w-4" />,
)

export const StatusTestedIcon = withTooltip(
  <MicroscopeIcon className="h-4 w-4" />,
)

/**
 * Displays the quality test history for a batch, including tests from parent batches
 */
export const BatchTestHistory = ({
  batch,
}: {
  batch: BatchWithCurrentLocationAndSpecies
}) => {
  const [editingTest, setEditingTest] = useState<QualityTest | null>(null)
  const { isOpen: isEditModalOpen, setIsOpen: setIsEditModalOpen } =
    useOpenClose()

  const { data: tests, isPending: isPendingTests } = useBatchTests(batch.id)
  const { data: history, isPending: isPendingBatchHistory } = useBatchHistory(
    batch.id,
  )
  const hasTests = tests?.length && tests.length > 0
  const { data: parentTests, isPending: isPendingParentTests } = useBatchTests(
    !hasTests && history?.parent_batch_id
      ? history?.parent_batch_id
      : undefined,
  )

  const isParentTests =
    !isPendingTests &&
    tests?.length === 0 &&
    parentTests?.length &&
    parentTests.length > 0
  const displayTests = (isParentTests ? parentTests : tests) ?? []

  const handleEditTest = (test: QualityTest) => {
    setEditingTest(test)
    setIsEditModalOpen(true)
  }

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false)
    setEditingTest(null)
  }

  if (isPendingTests || isPendingBatchHistory || isPendingParentTests)
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-1/4 rounded bg-gray-200"></div>
      </div>
    )

  return (
    <>
      <div className="flex flex-col gap-2 rounded-sm border border-gray-400 p-2">
        <span className="text-sm">Quality Test History</span>
        {displayTests.length > 0 ? (
          <div className="bg-muted/20 max-h-32 space-y-2 overflow-y-auto rounded-lg p-3">
            {displayTests.map((test) => (
              <div key={test.id} className="flex items-center gap-3 text-sm">
                {test.tested_at && (
                  <div className="flex items-center gap-2">
                    <Calendar className="text-sm" />
                    <span className="font-mono text-sm">
                      {new Date(test.tested_at).toLocaleDateString()}
                    </span>
                    {isParentTests && (
                      <ParentBatchBadge>
                        This test was carried out on the parent batch
                      </ParentBatchBadge>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {test.result.test_type}
                </div>
                <QualityTestStats
                  statistics={test.statistics}
                  repeatsCount={test.result.repeats.length}
                />
                {!isParentTests && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditTest(test)}
                    title="Edit test"
                    className="h-6 w-6 cursor-pointer p-0"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground text-xs">No tests found</div>
        )}
      </div>

      {editingTest && (
        <QualityTestModal
          isOpen={isEditModalOpen}
          onClose={handleCloseEditModal}
          batchId={batch.id}
          subBatchId={editingTest.sub_batch_id}
          existingTest={editingTest}
        />
      )}
    </>
  )
}

/**
 * Displays quality test statistics in a consistent format
 */
export const QualityTestStats = ({
  statistics,
  repeatsCount,
}: {
  statistics: QualityTest["statistics"]
  repeatsCount?: number
}) => (
  <div className="flex gap-2">
    <div className="flex items-center gap-2">
      <span className="text-sm">
        TSW{" "}
        <span className="font-mono font-bold">
          {statistics.tpsu.toFixed(3)}g
        </span>
      </span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm">
        PLS{" "}
        <span className="font-mono font-bold">
          {(statistics.pls * 100).toFixed(2)}%{" "}
          {statistics.standardError && (
            <span>± {statistics.standardError?.toFixed(3)}%</span>
          )}
        </span>
      </span>
    </div>
    {repeatsCount !== undefined && (
      <div className="flex items-center gap-2">
        <span className="text-sm">
          Reps
          <span className="font-mono font-bold"> {repeatsCount}</span>
        </span>
      </div>
    )}
  </div>
)

/**
 * Displays the Species Name
 */
export const BatchSpeciesNameField = ({
  batch,
}: {
  batch: BatchWithCurrentLocationAndSpecies
}) => {
  if (!batch.species) return null
  return <TaxonName name={batch.species.name} className="text-sm" />
}

/**
 * Displays the status of the batch
 */
export const BatchStatusField = ({
  batch,
}: {
  batch: BatchWithCurrentLocationAndSpecies
}) => {
  return (
    <span className="flex gap-1 text-sm">
      {batch.is_treated && <StatusTreatedIcon>Treated</StatusTreatedIcon>}
      {batch.is_cleaned && <StatusCleanedIcon>Cleaned</StatusCleanedIcon>}
      {batch.latest_quality_statistics && (
        <StatusTestedIcon>Tested</StatusTestedIcon>
      )}
    </span>
  )
}

/**
 * Displays the count of sub-batches for a batch
 */
export const BatchSubBatchCountField = ({
  batch,
}: {
  batch: BatchWithCurrentLocationAndSpecies
}) => {
  const { data: subBatches } = useSubBatches(batch.id)
  return <span className="font-mono text-sm">{subBatches?.length ?? 0}</span>
}

/**
 * Displays the latest quality statistics for a batch
 */
export const LatestQualityStatistics = ({
  statistics,
}: {
  statistics: NonNullable<
    BatchWithCurrentLocationAndSpecies["latest_quality_statistics"]
  >
}) => (
  <div className="space-y-2 border-t pt-2">
    <div className="text-muted-foreground text-xs">
      Latest Quality Statistics
    </div>
    <div className="grid grid-cols-6 gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">
          TSW <span className="font-bold">{statistics.tpsu.toFixed(3)}g</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">
          PLS{" "}
          <span className="font-bold">
            {(statistics.pls * 100).toFixed(2)}%
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">
          PSU Number <span className="font-bold">{statistics.psuCount}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">
          PLS Number<span className="font-bold"> {statistics.plsCount}</span>
        </span>
      </div>
    </div>
  </div>
)

/**
 * Delete button with confirmation dialog
 */
export const BatchDeleteButton = ({
  batchId,
  canDelete,
  disabled,
  onDelete,
}: {
  batchId: string
  canDelete: boolean
  disabled?: boolean
  onDelete?: (batchId: string) => void
}) => (
  <TooltipProvider>
    <Tooltip>
      <AlertDialog>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || !canDelete}
              className="cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={canDelete ? "Delete" : "Cannot delete batch"}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this batch? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete?.(batchId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!canDelete && (
        <TooltipContent>
          Cannot delete: batch has splits, merges, or processing events
        </TooltipContent>
      )}
    </Tooltip>
  </TooltipProvider>
)

// =============================================================================
// Batch Row Data Hook
// =============================================================================

/**
 * Custom hook that fetches all common data needed for batch table rows
 */
export const useBatchRowData = (batchId: string) => {
  const { data: batchDetail, isLoading: detailLoading } =
    useBatchDetail(batchId)
  const { data: canDeleteData } = useCanDeleteBatch(batchId)
  const { data: activeAssignment } = useActiveBatchAssignment(batchId)

  return {
    batchDetail,
    detailLoading,
    canDelete: canDeleteData?.canDelete ?? true,
    activeAssignment,
  }
}

// =============================================================================
// Expanded Details Components
// =============================================================================

interface BatchExpandedDetailsProps {
  batch: BatchType
  detailLoading: boolean
  onEdit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onSubBatchStorageMove?: (subBatchId: string) => void
  onSubBatchSplit?: (subBatchId: string) => void
  onSubBatchQualityTest?: (subBatchId: string) => void
}

/**
 * The expanded details section shown when a row is clicked
 */
export const BatchExpandedDetails = ({
  batch,
  detailLoading,
  onEdit,
  onSubBatchStorageMove,
  onSubBatchSplit,
  onSubBatchQualityTest,
}: BatchExpandedDetailsProps) => {
  return (
    <div className="space-y-4">
      <h4 className="text-lg">Batch Details</h4>
      <div className="flex flex-col gap-2">
        <span className="font-semibold">Collection</span>
        <BatchCollectionDetails batch={batch} />
      </div>
      {detailLoading ? (
        <BatchDetailsSkeleton />
      ) : (
        <BatchDetailsContent batch={batch} onEdit={onEdit} />
      )}
      <SubBatchesTable
        batchId={batch.id}
        onStorageMove={onSubBatchStorageMove}
        onSubBatchSplit={onSubBatchSplit}
        onSubBatchQualityTest={onSubBatchQualityTest}
      />
      {batch.latest_quality_statistics && (
        <LatestQualityStatistics statistics={batch.latest_quality_statistics} />
      )}
      <BatchTestHistory batch={batch} />
    </div>
  )
}

const BatchCollectionDetails = ({ batch }: { batch: BatchType }) => {
  const { organisation } = useUserStore()
  const isTesting = organisation?.type === "Testing"

  if (!batch.collection_id) return null
  // don't show the collection modal for testing orgs
  if (isTesting) return
  return (
    <span className="lg:max-w-1/2">
      <CollectionListItem id={batch.collection_id} />
    </span>
  )
}

const BatchDetailsSkeleton = () => (
  <div className="animate-pulse space-y-2">
    <div className="h-4 w-1/4 rounded bg-gray-200"></div>
    <div className="h-4 w-1/3 rounded bg-gray-200"></div>
    <div className="h-4 w-1/2 rounded bg-gray-200"></div>
  </div>
)

const BatchDetailsContent = ({
  batch,
  onEdit,
}: {
  batch: BatchType
  onEdit?: (batch: BatchWithCurrentLocationAndSpecies) => void
}) => {
  const hasBatchWeight = batch.weights?.current_weight || batch.weight_grams
  return (
    <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-3">
      {hasBatchWeight && (
        <div>
          <span className="font-medium">Total Weight:</span>
          <div className="mt-1 text-xs">
            {batch.weights?.current_weight ? (
              <>
                <div>Current: {batch.weights.current_weight}g</div>
                {batch.weights.current_weight !==
                  batch.weights.original_weight && (
                  <div className="text-muted-foreground">
                    Original: {batch.weights.original_weight}g
                  </div>
                )}
              </>
            ) : (
              batch.weight_grams && <div>{batch.weight_grams}g</div>
            )}
          </div>
        </div>
      )}

      <div className="md:col-span-2 lg:col-span-3">
        <div className="flex items-center gap-1">
          <span className="font-medium">Notes:</span>
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(batch)}
              title="Notes"
            >
              <Edit className="h-6 w-6" />
            </Button>
          )}
        </div>
        <div className="text-muted-foreground mt-1 text-xs">{batch.notes}</div>
      </div>
    </div>
  )
}

// =============================================================================
// Main Row Cell Components
// =============================================================================

/**
 * Weight cell with current and original weights
 */
export const WeightCell = ({ batch }: { batch: BatchType }) => (
  <div className="flex flex-col items-end gap-0.5">
    <span className="text-sm font-medium">{batch.weights?.current_weight}</span>
    {batch.weights &&
      batch.weights.current_weight !== batch.weights.original_weight && (
        <span className="text-muted-foreground text-xs">
          of {batch.weights.original_weight}
        </span>
      )}
  </div>
)

/**
 * Created date cell
 */
export const CreatedDateCell = ({ batch }: { batch: BatchType }) => (
  <div className="flex items-center gap-2">
    <Calendar className="h-4 w-4 text-gray-500" />
    <span className="text-sm">
      {new Date(batch.created_at || "").toLocaleDateString()}
    </span>
  </div>
)

/**
 * Expand/collapse button with batch code
 */
export const BatchCodeCell = ({
  batch,
  isExpanded,
  onToggle,
  statusBadge,
}: {
  batch: BatchType
  isExpanded: boolean
  onToggle: () => void
  statusBadge?: ReactNode
}) => {
  const hasWeight = batch.weight_grams !== null

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>
      <span className="font-mono text-sm">{batch.code}</span>
      {!hasWeight && (
        <NeedsProcessingIcon>Requires processing</NeedsProcessingIcon>
      )}
      {statusBadge}
    </div>
  )
}

// =============================================================================
// Assignment Status Badges
// =============================================================================

interface AssignmentBadgeProps {
  assignment: NonNullable<ReturnType<typeof useActiveBatchAssignment>["data"]>
}

/**
 * Badge showing assignment status for general orgs (batch sent out)
 */
export const GeneralOrgAssignmentBadge = ({
  assignment,
}: AssignmentBadgeProps) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger>
        <Badge
          variant="outline"
          className="border-blue-500 bg-blue-50 text-xs text-blue-700"
        >
          {assignment.assignment_type === "sample"
            ? "Sample Out"
            : "Processing"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {assignment.assignment_type === "sample"
            ? `${assignment.sample_weight_grams}g sample sent to `
            : "Full batch sent to "}
          {assignment.assigned_to_org?.name}
        </p>
        <p className="text-muted-foreground text-xs">
          Assigned: {new Date(assignment.assigned_at).toLocaleDateString()}
        </p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

// =============================================================================
// Row Container Component
// =============================================================================

interface BatchTableRowContainerProps {
  batch: BatchType
  isExpanded: boolean
  onToggleExpand: () => void
  className?: string
  rowClassName?: string
  statusBadge?: ReactNode
  actionButtons: ReactNode
  detailLoading: boolean
  onEdit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onSubBatchQualityTest?: (subBatchId: string) => void
  onSubBatchSplit?: (subBatchId: string) => void
  onSubBatchStorageMove?: (subBatchId: string) => void
}

/**
 * Generic container for batch table rows that handles the common structure
 */
export const BatchTableRowContainer = ({
  batch,
  isExpanded,
  onToggleExpand,
  className,
  rowClassName,
  statusBadge,
  actionButtons,
  detailLoading,
  onEdit,
  onSubBatchSplit,
  onSubBatchQualityTest,
  onSubBatchStorageMove,
}: BatchTableRowContainerProps) => (
  <>
    <tr
      className={cn(
        "hover:bg-muted/50 cursor-pointer border-b transition-colors",
        rowClassName,
        className,
      )}
      onClick={onToggleExpand}
    >
      <td className="px-4 py-3">
        <BatchCodeCell
          batch={batch}
          isExpanded={isExpanded}
          onToggle={onToggleExpand}
          statusBadge={statusBadge}
        />
      </td>

      <td className="px-4 py-3">
        <BatchSpeciesNameField batch={batch} />
      </td>

      <td className="px-4 py-3">
        <BatchStatusField batch={batch} />
      </td>

      <td className="px-4 py-3">
        <BatchSubBatchCountField batch={batch} />
      </td>

      <td className="px-4 py-3 text-right">
        <WeightCell batch={batch} />
      </td>

      <td className="px-4 py-3">
        <CreatedDateCell batch={batch} />
      </td>

      <td className="px-4 py-3">
        <div className="[&_button]:h-8 [&_button]:cursor-pointer [&_button]:px-1">
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {actionButtons}
          </div>
        </div>
      </td>
    </tr>

    {isExpanded && (
      <tr className="bg-muted/25 border-b">
        <td colSpan={7} className="px-4 py-4">
          <BatchExpandedDetails
            batch={batch}
            detailLoading={detailLoading}
            onEdit={onEdit}
            onSubBatchStorageMove={onSubBatchStorageMove}
            onSubBatchSplit={onSubBatchSplit}
            onSubBatchQualityTest={onSubBatchQualityTest}
          />
        </td>
      </tr>
    )}
  </>
)
