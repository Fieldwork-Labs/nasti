import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import { useToast } from "@nasti/ui/hooks"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { z } from "zod"

import { BatchInventoryFilters } from "@/components/inventory/BatchInventoryFilters"
import { BatchTableRow } from "./BatchTableRow/General"
import { CompleteAssignmentButton } from "@/components/inventory/CompleteAssignmentButton"
import {
  AssignBatchesForTestingModal,
  BatchEditModal,
  BatchMergeModal,
  BatchMixModal,
  BatchSplitModal,
  BatchStorageModal,
} from "@/components/inventory/modals"
import { BatchProcessingModal } from "@/components/inventory/modals/BatchProcessingModal"
import { BatchCleaningModal } from "@/components/inventory/modals/BatchCleaningModal"
import { useAssignmentMode } from "@/hooks/useAssignmentMode"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import { useBatchDelete } from "@/hooks/useBatches"
import { useOrganisationLinks } from "@/hooks/useTestingOrgs"

import { useMeasure, useWindowSize } from "@uidotdev/usehooks"
import { useBatchFiltersContext, type SortField } from "./BatchFiltersContext"
import { CompleteCombineButton } from "@/components/inventory/CompleteCombineButton"

// Define search schema for URL parameters
export const inventorySearchSchemaGeneral = z.object({
  status: z.enum(["any", "unprocessed", "processed"]).default("any").optional(),
  speciesId: z.string().optional(),
  collection: z.string().optional(),
  locationId: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(["created_at", "species_id", "organisation_id"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
})

const MotionCard = motion.create(Card)

export function InventoryPageGeneral() {
  const { toast } = useToast()

  // Local state for modals
  const [editingBatch, setEditingBatch] =
    useState<BatchWithCurrentLocationAndSpecies | null>(null)
  const [splittingBatch, setSplittingBatch] =
    useState<BatchWithCurrentLocationAndSpecies | null>(null)
  const [processingBatch, setPocessingBatch] =
    useState<BatchWithCurrentLocationAndSpecies | null>(null)
  const [cleaningBatch, setCleaningBatch] =
    useState<BatchWithCurrentLocationAndSpecies | null>(null)
  const [subBatchStorageMove, setSubBatchStorageMove] = useState<{
    batch: BatchWithCurrentLocationAndSpecies
    subBatchId: string
  } | null>(null)

  // Merge mode state
  const [mergeState, setMergeState] = useState<{
    isActive: boolean
    initiatingBatch: BatchWithCurrentLocationAndSpecies
    selectedBatchIds: string[]
  } | null>(null)
  const [showMergeModal, setShowMergeModal] = useState(false)

  // Combine mode state
  const [combineState, setCombineState] = useState<{
    isActive: boolean
    initiatingBatch: BatchWithCurrentLocationAndSpecies
    selectedBatchIds: string[]
  } | null>(null)
  const [showCombineModal, setShowCombineModal] = useState(false)

  // Check org type and linked testing organisations
  const { data: organisationLinks } = useOrganisationLinks()
  const hasTestingOrgLinks = Boolean(
    organisationLinks && organisationLinks.length > 0,
  )

  // Fetch batches using the unified hook
  const {
    data: batches = [],
    isLoading,
    invalidateBatchesCacheByFilter,
    handleSort,
    sortField,
    sortDirection,
  } = useBatchFiltersContext()

  const selectedBatchesForCombine = combineState
    ? batches.filter((batch) =>
        combineState.selectedBatchIds.includes(batch.id),
      )
    : []

  // Assignment mode hook (only for General orgs)
  const {
    assignmentState,
    showAssignmentModal,
    selectedBatchesForAssignment,
    handleAssignForTesting,
    handleCompleteAssignment,
    handleCloseAssignmentModal,
    getAssignmentModeForBatch,
  } = useAssignmentMode(batches)

  const { mutateAsync: deleteBatch } = useBatchDelete()

  // Get selected batches for merge modal
  const selectedBatchesForMerge = mergeState
    ? batches.filter((batch) => mergeState.selectedBatchIds.includes(batch.id))
    : []

  // Action handlers
  const handleEdit = (batch: BatchWithCurrentLocationAndSpecies) => {
    setEditingBatch(batch)
  }

  const handleDelete = async (_batchId: string) => {
    const deleted = await deleteBatch(_batchId)
    if (deleted)
      toast({
        description: "Batch successfully deleted",
      })
  }

  const handleSplit = (batch: BatchWithCurrentLocationAndSpecies) => {
    setSplittingBatch(batch)
  }

  const handleMerge = (batch: BatchWithCurrentLocationAndSpecies) => {
    setMergeState({
      isActive: true,
      initiatingBatch: batch,
      selectedBatchIds: [batch.id],
    })
  }

  const handleCombine = (batch: BatchWithCurrentLocationAndSpecies) => {
    setCombineState({
      isActive: true,
      initiatingBatch: batch,
      selectedBatchIds: [batch.id],
    })
  }

  const handleAddToCombine = (batchId: string) => {
    setCombineState((prev) =>
      prev
        ? {
            ...prev,
            selectedBatchIds: [...prev.selectedBatchIds, batchId],
          }
        : null,
    )
  }

  const handleRemoveFromCombine = (batchId: string) => {
    setCombineState((prev) =>
      prev
        ? {
            ...prev,
            selectedBatchIds: prev.selectedBatchIds.filter(
              (id) => id !== batchId,
            ),
          }
        : null,
    )
  }

  const handleCancelCombine = () => {
    setCombineState(null)
  }

  const handleCompleteCombine = () => {
    if (combineState && combineState.selectedBatchIds.length >= 2) {
      setShowCombineModal(true)
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-4 w-4" />
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-1 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-1 h-4 w-4" />
    )
  }

  // calculations of offset for merge state
  const windowSize = useWindowSize()
  const [ref, { width }] = useMeasure()
  const initialWidth = useRef(width)
  const mergeStateRatchet = useRef(false)
  useEffect(() => {
    if (!mergeStateRatchet.current && mergeState?.isActive) {
      initialWidth.current = width
      mergeStateRatchet.current = true
    }
  }, [mergeState?.isActive, width])

  const offset = ((windowSize?.width ?? 0) - (initialWidth.current ?? 0)) / 2

  const getCombineModeForBatch = (
    batch: BatchWithCurrentLocationAndSpecies,
  ) => {
    if (!combineState) return undefined
    const batchCodePrefix = batch.code?.split("-")[0]
    const initiatingBatchCodePrefix =
      combineState.initiatingBatch.code?.split("-")[0]
    const isSameCodePrefix = batchCodePrefix === initiatingBatchCodePrefix

    return {
      isActive: combineState.isActive,
      isInitiating: batch.id === combineState.initiatingBatch.id,
      isSelected: combineState.selectedBatchIds.includes(batch.id),
      canCombine: isSameCodePrefix,
      onAddToCombine: () => handleAddToCombine(batch.id),
      onRemoveFromCombine: () => handleRemoveFromCombine(batch.id),
      onCancelCombine: handleCancelCombine,
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Batch Inventory</h1>
            <p className="text-muted-foreground">
              Manage and track your seed batches
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-6">
          <BatchInventoryFilters
            statuses={["any", "unprocessed", "processed"]}
          />
        </Card>

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Showing {batches.length} of {batches.length} batches
          </p>
        </div>

        {/* Table */}
        <MotionCard
          ref={ref}
          animate={{
            width: mergeState?.isActive ? "100vw" : "auto",
            x: mergeState?.isActive ? offset * -1 : 0, // Calculate offset from container edge
            borderRadius: mergeState?.isActive ? 0 : 8, // Adjust as needed
          }}
          transition={{
            duration: 0.5,
          }}
          className="overflow-hidden"
        >
          {isLoading && <div className="h-20 w-full animate-pulse space-y-4" />}
          {!isLoading && (
            <>
              {batches.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-muted-foreground">
                    {batches.length === 0 ? (
                      <div>
                        <h3 className="mb-2 text-lg font-semibold">
                          No Batches Found
                        </h3>
                        <p>
                          Record your first seed collection to get started with
                          batches.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <h3 className="mb-2 text-lg font-semibold">
                          No Matching Batches
                        </h3>
                        <p>Try adjusting your filters to see more results.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <motion.table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort("created_at")}
                            className="text-foreground font-semibold"
                          >
                            Batch Code
                            {getSortIcon("created_at")}
                          </Button>
                        </th>
                        <th className="px-4 py-3 text-left">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort("species_id")}
                            className="text-foreground font-semibold"
                          >
                            Species
                            {getSortIcon("species_id")}
                          </Button>
                        </th>
                        <th className="text-foreground px-4 py-3 text-left font-semibold">
                          Status
                        </th>
                        <th className="text-foreground px-4 py-3 text-right font-semibold">
                          Weight (g)
                        </th>
                        <th className="px-4 py-3 text-left">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort("created_at")}
                            className="text-foreground font-semibold"
                          >
                            Created
                            {getSortIcon("created_at")}
                          </Button>
                        </th>
                        <th className="text-foreground px-4 py-3 text-left font-semibold">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((batch) => (
                        <BatchTableRow
                          key={batch.id}
                          batch={batch}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onSplit={handleSplit}
                          onClean={setCleaningBatch}
                          onProcess={setPocessingBatch}
                          onMerge={handleMerge}
                          onMix={handleCombine}
                          onSubBatchStorageMove={(batch, subBatchId) =>
                            setSubBatchStorageMove({ batch, subBatchId })
                          }
                          onAssignForTesting={
                            hasTestingOrgLinks
                              ? handleAssignForTesting
                              : undefined
                          }
                          combineMode={getCombineModeForBatch(batch)}
                          assignmentMode={getAssignmentModeForBatch(batch)}
                        />
                      ))}
                    </tbody>
                  </motion.table>
                </div>
              )}
            </>
          )}
        </MotionCard>

        {/* Complete Combine Button */}
        {combineState && combineState.selectedBatchIds.length > 0 && (
          <CompleteCombineButton
            selectedCount={combineState.selectedBatchIds.length}
            onCompleteCombine={handleCompleteCombine}
          />
        )}

        {/* Complete Assignment Button */}
        {assignmentState && assignmentState.selectedBatchIds.length > 0 && (
          <CompleteAssignmentButton
            selectedCount={assignmentState.selectedBatchIds.length}
            onCompleteAssignment={handleCompleteAssignment}
          />
        )}

        {/* Modals */}
        {editingBatch && (
          <BatchEditModal
            isOpen={Boolean(editingBatch)}
            onClose={() => setEditingBatch(null)}
            batch={editingBatch}
            onSuccess={invalidateBatchesCacheByFilter}
          />
        )}

        {subBatchStorageMove && (
          <BatchStorageModal
            isOpen={Boolean(subBatchStorageMove)}
            onClose={() => setSubBatchStorageMove(null)}
            batch={subBatchStorageMove.batch}
            subBatchId={subBatchStorageMove.subBatchId}
          />
        )}

        {splittingBatch && (
          <BatchSplitModal
            isOpen={Boolean(splittingBatch)}
            onClose={() => setSplittingBatch(null)}
            batch={splittingBatch}
            onSuccess={invalidateBatchesCacheByFilter}
          />
        )}

        {processingBatch && (
          <BatchProcessingModal
            isOpen={Boolean(processingBatch)}
            onClose={() => setPocessingBatch(null)}
            batch={processingBatch}
            onSuccess={invalidateBatchesCacheByFilter}
          />
        )}

        {cleaningBatch && (
          <BatchCleaningModal
            isOpen={Boolean(cleaningBatch)}
            onClose={() => setCleaningBatch(null)}
            batch={cleaningBatch}
            onSuccess={invalidateBatchesCacheByFilter}
          />
        )}

        {mergeState && selectedBatchesForMerge.length > 0 && (
          <BatchMergeModal
            isOpen={showMergeModal}
            onClose={() => {
              setShowMergeModal(false)
              setMergeState(null) // Reset merge state after modal closes
            }}
            selectedBatches={selectedBatchesForMerge}
            onSuccess={invalidateBatchesCacheByFilter}
          />
        )}

        {showCombineModal && selectedBatchesForCombine.length > 0 && (
          <BatchMixModal
            isOpen={showCombineModal}
            onClose={() => {
              setShowCombineModal(false)
              setCombineState(null)
            }}
            selectedBatches={selectedBatchesForCombine}
            onSuccess={invalidateBatchesCacheByFilter}
          />
        )}

        {showAssignmentModal &&
          assignmentState &&
          selectedBatchesForAssignment.length > 0 && (
            <AssignBatchesForTestingModal
              isOpen={showAssignmentModal}
              onClose={handleCloseAssignmentModal}
              selectedBatches={selectedBatchesForAssignment}
              onSuccess={invalidateBatchesCacheByFilter}
            />
          )}
      </div>
    </div>
  )
}
