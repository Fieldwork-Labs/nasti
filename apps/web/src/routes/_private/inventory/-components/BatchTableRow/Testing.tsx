import { Button } from "@nasti/ui/button"
import { useOpenClose } from "@nasti/ui/hooks"
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  Merge,
  Minus,
  Pencil,
  Plus,
  Split,
  Undo2,
} from "lucide-react"
import { useState } from "react"

import { BatchSplitModal } from "@/components/inventory/modals/BatchSplitModal"
import { QualityTestModal } from "@/components/tests/QualityTestModal"
import { ReturnBatchModal } from "@/components/tests/ReturnBatchModal"
import {
  getAssignedBagAssignedAt,
  getAssignedBagSender,
  isAssignedBagTested,
  type AssignedBag,
} from "@/hooks/useTestingOrgAssignments"
import {
  useBagTestResults,
  type TestingTestHistoryRow,
} from "@/hooks/useTestingTestHistory"
import { getAssignmentActions } from "@/lib/testingAssignments"
import { QualityTestStats } from "./Common"
import { Badge } from "@nasti/ui/badge"
import { cn } from "@nasti/ui/utils"

// =============================================================================
// Types
// =============================================================================

/**
 * Picking bags to merge. Merging stays within one batch, so only that batch's
 * bags can be picked while a merge is under way.
 */
export type BagMergeMode = {
  isActive: boolean
  isSelectable: boolean
  isSelected: boolean
  onToggle: () => void
}

type BagTableRowTestingProps = {
  bag: AssignedBag
  className?: string
  /** Whether the laboratory holds another bag of this batch to merge with. */
  canMerge: boolean
  onStartMerge: () => void
  mergeMode: BagMergeMode
}

// =============================================================================
// Cells
// =============================================================================

/** The organisation that sent the seed here for testing. */
const OwnerCell = ({ bag }: { bag: AssignedBag }) => (
  <span className="text-sm">
    {getAssignedBagSender(bag) ?? "Unknown organisation"}
  </span>
)

/**
 * Whether the bag has been tested yet.
 *
 * There is no sample-versus-full-batch distinction to draw any more: a sample
 * is a bag that was split off before being sent, so by the time it arrives here
 * it is simply a bag.
 */
const StatusCell = ({ bag }: { bag: AssignedBag }) => {
  const isTested = isAssignedBagTested(bag)

  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit text-xs",
        isTested
          ? "border-green-500 bg-green-50 text-green-700"
          : "border-orange-500 bg-orange-50 text-orange-700",
      )}
    >
      {isTested ? "Tested" : "Awaiting test"}
    </Badge>
  )
}

/**
 * The bag itself. The container is named because the seed arrived in it; the
 * sender's storage location is deliberately not shown, and is not readable.
 */
const BagCell = ({ bag }: { bag: AssignedBag }) => (
  <span className="text-sm">{bag.containerName ?? "Unlabelled container"}</span>
)

const AssignmentDatesCell = ({ bag }: { bag: AssignedBag }) => {
  // A merged bag counts as tested once all of its seed has been
  const testedAt = isAssignedBagTested(bag)
    ? bag.assignments
        .map((assignment) => assignment.completed_at ?? "")
        .sort()
        .at(-1)
    : null

  return (
    <div className="flex flex-col text-sm">
      <span>
        {new Date(getAssignedBagAssignedAt(bag)).toLocaleDateString()}
      </span>
      {testedAt && (
        <span className="text-muted-foreground text-xs">
          Tested {new Date(testedAt).toLocaleDateString()}
        </span>
      )}
    </div>
  )
}

const MergeModeActions = ({ mergeMode }: { mergeMode: BagMergeMode }) => {
  if (!mergeMode.isSelectable) return null

  if (mergeMode.isSelected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={mergeMode.onToggle}
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
      size="sm"
      onClick={mergeMode.onToggle}
      className="text-primary border-primary/20 hover:bg-primary/10"
    >
      <Plus className="mr-1 h-4 w-4" />
      <span className="text-xs">Add to merge</span>
    </Button>
  )
}

/**
 * The tests carried by a bag, shown beneath its row. Includes tests recorded on
 * the bags this one was split or merged from.
 */
const BagTestResults = ({
  results,
  subBatchId,
  onEdit,
}: {
  results: TestingTestHistoryRow[]
  subBatchId: string
  onEdit: (row: TestingTestHistoryRow) => void
}) => (
  <div className="flex flex-col gap-2">
    {results.map((row) => (
      <div
        key={row.test.id}
        className="flex flex-wrap items-center gap-3 text-sm"
      >
        <span className="font-mono">
          {row.test.tested_at
            ? new Date(row.test.tested_at).toLocaleDateString()
            : "—"}
        </span>
        <span>{row.test.result.test_type}</span>
        {row.test.statistics ? (
          <QualityTestStats
            statistics={row.test.statistics}
            repeatsCount={row.test.result.repeats.length}
          />
        ) : (
          <span className="text-muted-foreground text-xs">No statistics</span>
        )}
        {row.test.sub_batch_id !== subBatchId && (
          <Badge variant="secondary" className="text-xs">
            Tested before this bag was split or merged
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(row)}
          title="Edit test"
          className="h-6 w-6 p-0"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </div>
    ))}
  </div>
)

// =============================================================================
// Main Component
// =============================================================================

/**
 * One row per held bag.
 *
 * Deliberately not built on BatchTableRowContainer: that renders a parent batch
 * and expands into its bag list, which is the wrong unit here and would invite
 * a Testing organisation to reason about siblings it cannot see. The bag is the
 * whole row — including bags the laboratory split off or merged itself.
 */
export const BagTableRow = ({
  bag,
  className,
  canMerge,
  onStartMerge,
  mergeMode,
}: BagTableRowTestingProps) => {
  const [isQualityTestOpen, setIsQualityTestOpen] = useState(false)
  const [isSplitOpen, setIsSplitOpen] = useState(false)
  const [isResultsOpen, setIsResultsOpen] = useState(false)
  const [editingTest, setEditingTest] = useState<TestingTestHistoryRow | null>(
    null,
  )

  const { data: testResults } = useBagTestResults(bag.subBatchId)

  const { isOpen: isReturnModalOpen, setIsOpen: setIsReturnModalOpen } =
    useOpenClose()

  // A held bag always has seed in it; the check guards a stale list.
  const hasSeedLeft = (bag.weights.current_weight ?? 0) > 0

  const actions = getAssignmentActions(bag.assignments[0], {
    hasVisibleSubBatch: hasSeedLeft,
  })

  return (
    <>
      <tr
        className={cn(
          "hover:bg-muted/50 border-b",
          mergeMode.isActive && !mergeMode.isSelectable && "opacity-50",
          mergeMode.isSelected && "bg-accent/20",
          className,
        )}
      >
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
          <OwnerCell bag={bag} />
        </td>
        <td className="px-4 py-3">
          <StatusCell bag={bag} />
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
          {mergeMode.isActive ? (
            <MergeModeActions mergeMode={mergeMode} />
          ) : (
            <div className="flex items-center gap-1">
              {testResults.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsResultsOpen((open) => !open)}
                  title={`${isResultsOpen ? "Hide" : "View"} test results (${testResults.length})`}
                  aria-expanded={isResultsOpen}
                >
                  <ClipboardList className="h-4 w-4" />
                  {isResultsOpen ? (
                    <ChevronDown className="ml-1 h-3 w-3" />
                  ) : (
                    <ChevronRight className="ml-1 h-3 w-3" />
                  )}
                  <span className="ml-1 text-xs">{testResults.length}</span>
                </Button>
              )}

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

              {hasSeedLeft && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSplitOpen(true)}
                  title="Split"
                >
                  <Split className="h-4 w-4" />
                </Button>
              )}

              {hasSeedLeft && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canMerge}
                  onClick={onStartMerge}
                  title={
                    canMerge
                      ? "Merge with other bags of this batch"
                      : "No other bags of this batch to merge with"
                  }
                >
                  <Merge className="h-4 w-4" />
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
          )}
        </td>
      </tr>

      {isResultsOpen && testResults.length > 0 && (
        <tr className="bg-muted/20 border-b">
          <td colSpan={8} className="px-4 py-3">
            <BagTestResults
              results={testResults}
              subBatchId={bag.subBatchId}
              onEdit={setEditingTest}
            />
          </td>
        </tr>
      )}

      {editingTest && (
        <QualityTestModal
          isOpen
          onClose={() => setEditingTest(null)}
          batchId={editingTest.test.batch_id}
          subBatchId={editingTest.test.sub_batch_id}
          existingTest={editingTest.test}
        />
      )}

      {isQualityTestOpen && (
        <QualityTestModal
          isOpen={isQualityTestOpen}
          onClose={() => setIsQualityTestOpen(false)}
          batchId={bag.parent.id}
          subBatchId={bag.subBatchId}
        />
      )}

      <BatchSplitModal
        isOpen={isSplitOpen}
        onClose={() => setIsSplitOpen(false)}
        batch={bag.parent}
        subBatchId={bag.subBatchId}
      />

      <ReturnBatchModal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        bag={bag}
      />
    </>
  )
}
