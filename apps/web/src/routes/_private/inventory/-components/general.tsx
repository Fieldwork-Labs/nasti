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
import { CompleteMergeButton } from "@/components/inventory/CompleteMergeButton"
import {
  AssignBatchesForTestingModal,
  BatchEditModal,
  BatchMergeModal,
  BatchSplitModal,
  BatchStorageModal,
} from "@/components/inventory/modals"
import { BatchProcessingModal } from "@/components/inventory/modals/BatchProcessingModal"
import { useAssignmentMode } from "@/hooks/useAssignmentMode"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import { useBatchDelete } from "@/hooks/useBatches"
import { useOrganisationLinks } from "@/hooks/useTestingOrgs"

import { useMeasure, useWindowSize } from "@uidotdev/usehooks"
import { useBatchFiltersContext, type SortField } from "./BatchFiltersContext"

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
  const [storageMoveBatch, setStorageMoveBatch] =
    useState<BatchWithCurrentLocationAndSpecies | null>(null)
  const [splittingBatch, setSplittingBatch] =
    useState<BatchWithCurrentLocationAndSpecies | null>(null)
  const [processingBatch, setPocessingBatch] =
    useState<BatchWithCurrentLocationAndSpecies | null>(null)

  // Merge mode state
  const [mergeState, setMergeState] = useState<{
    isActive: boolean
    initiatingBatch: BatchWithCurrentLocationAndSpecies
    selectedBatchIds: string[]
  } | null>(null)
  const [showMergeModal, setShowMergeModal] = useState(false)

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

  const handleAddToMerge = (batchId: string) => {
    setMergeState((prev) =>
      prev
        ? {
            ...prev,
            selectedBatchIds: [...prev.selectedBatchIds, batchId],
          }
        : null,
    )
  }

  const handleRemoveFromMerge = (batchId: string) => {
    setMergeState((prev) =>
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

  const handleCancelMerge = () => {
    setMergeState(null)
  }

  const handleCompleteMerge = () => {
    if (mergeState && mergeState.selectedBatchIds.length >= 2) {
      setShowMergeModal(true)
    }
  }

  const handleStorageMove = (batch: BatchWithCurrentLocationAndSpecies) => {
    setStorageMoveBatch(batch)
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

  const getMergeModeForBatch = (batch: BatchWithCurrentLocationAndSpecies) => {
    if (!mergeState) return undefined
    return {
      isActive: mergeState.isActive,
      isInitiating: batch.id === mergeState.initiatingBatch.id,
      isSelected: mergeState.selectedBatchIds.includes(batch.id),
      canMerge:
        batch.collection_id === mergeState.initiatingBatch.collection_id &&
        batch.code === mergeState.initiatingBatch.code,
      onAddToMerge: () => handleAddToMerge(batch.id),
      onRemoveFromMerge: () => handleRemoveFromMerge(batch.id),
      onCancelMerge: handleCancelMerge,
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
                        <p>Create your first batch to get started.</p>
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
                            className="font-semibold"
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
                            className="font-semibold"
                          >
                            Species
                            {getSortIcon("species_id")}
                          </Button>
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Storage
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Weight (g)
                        </th>
                        <th className="px-4 py-3 text-left">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort("created_at")}
                            className="font-semibold"
                          >
                            Created
                            {getSortIcon("created_at")}
                          </Button>
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
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
                          onStorageMove={handleStorageMove}
                          onProcess={setPocessingBatch}
                          onMerge={handleMerge}
                          onAssignForTesting={
                            hasTestingOrgLinks
                              ? handleAssignForTesting
                              : undefined
                          }
                          mergeMode={getMergeModeForBatch(batch)}
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

        {/* Complete Merge Button */}
        {mergeState && mergeState.selectedBatchIds.length > 0 && (
          <CompleteMergeButton
            selectedCount={mergeState.selectedBatchIds.length}
            onCompleteMerge={handleCompleteMerge}
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

        {storageMoveBatch && (
          <BatchStorageModal
            isOpen={Boolean(storageMoveBatch)}
            onClose={() => setStorageMoveBatch(null)}
            batch={storageMoveBatch}
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
