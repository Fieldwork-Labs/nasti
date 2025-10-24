import { createFileRoute } from "@tanstack/react-router"
import { motion } from "motion/react"
import { z } from "zod"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import { useToast } from "@nasti/ui/hooks"

import {
  BatchInventoryFilters,
  BatchStatus,
} from "@/components/inventory/BatchInventoryFilters"
import { BatchTableRow } from "@/components/inventory/BatchTableRow"
import { CompleteMergeButton } from "@/components/inventory/CompleteMergeButton"
import {
  BatchEditModal,
  BatchSplitModal,
  BatchStorageModal,
  BatchMergeModal,
} from "@/components/inventory/modals"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import { useBatchesByFilter } from "@/hooks/useBatches"
import { useMeasure, useWindowSize } from "@uidotdev/usehooks"
import { BatchProcessingModal } from "@/components/inventory/modals/BatchProcessingModal"

// Define search schema for URL parameters
const inventorySearchSchema = z.object({
  status: z.enum(["any", "unprocessed", "processed"]).default("any").optional(),
  species: z.string().optional(),
  collection: z.string().optional(),
  location: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(["created_at", "collection_id", "organisation_id"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
})

export const Route = createFileRoute("/_private/inventory/")({
  component: InventoryPage,
  validateSearch: inventorySearchSchema,
})

type SortField = "created_at" | "collection_id" | "organisation_id"
type SortDirection = "asc" | "desc"

const MotionCard = motion.create(Card)

function InventoryPage() {
  const navigate = Route.useNavigate()

  const searchParams = Route.useSearch()
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

  // Extract filters from URL search params
  const filters = useMemo(
    () => ({
      status: searchParams.status,
      species: searchParams.species || null,
      location: searchParams.location || null,
      searchTerm: searchParams.search || "",
    }),
    [searchParams],
  )

  // Extract sorting from URL search params
  const sortField: SortField = searchParams.sort || "created_at"
  const sortDirection: SortDirection =
    (searchParams.order as SortDirection) || "desc"

  const batchFilter = useMemo(
    () => ({
      status: filters.status,
      speciesId: filters.species || undefined,
      locationId: filters.location || undefined,
      search: filters.searchTerm,
      sort: sortField,
      order: sortDirection,
    }),
    [filters, sortField, sortDirection],
  )

  // Fetch batches using the filter hook
  const { data: batches = [], isLoading: isLoadingBatches } =
    useBatchesByFilter(batchFilter)

  const isLoading = isLoadingBatches

  // Get selected batches for merge modal
  const selectedBatchesForMerge = mergeState
    ? batches.filter((batch) => mergeState.selectedBatchIds.includes(batch.id))
    : []

  // Update URL search parameters
  const updateSearchParams = (
    newParams: z.infer<typeof inventorySearchSchema>,
  ) => {
    const cleanNewParams = Object.fromEntries(
      Object.entries(newParams).filter(
        ([_, value]) => value !== null && value !== "",
      ),
    )
    const updatedParams = { ...searchParams, ...cleanNewParams }

    navigate({
      from: "/inventory",
      search: updatedParams,
      replace: true,
    })
  }

  // Handle filter changes
  const handleFiltersChange = (newFilters: {
    status?: BatchStatus
    speciesId?: string | null
    collectionId?: string | null
    locationId?: string | null
    searchTerm?: string
  }) => {
    const definedFilters = Object.fromEntries(
      Object.entries(newFilters).filter(
        ([_, value]) => value !== undefined && value !== "",
      ),
    )
    // filter out undefined values from searchParams, we only care about nulls and defined values except for 'unprocessed'
    const newParams: Record<string, string | boolean | undefined> =
      Object.fromEntries(
        Object.entries(searchParams).filter(
          ([_, value]) => value !== undefined && value !== "",
        ),
      )
    // replace nulls with undefined
    for (const [key, value] of Object.entries(definedFilters)) {
      newParams[key] = value ?? undefined
    }

    updateSearchParams({
      ...newParams,
      search:
        newFilters.searchTerm !== undefined
          ? newFilters.searchTerm
          : searchParams.search,
    })
  }

  // Handle sorting
  const handleSort = (field: SortField) => {
    const newDirection =
      sortField === field && sortDirection === "asc" ? "desc" : "asc"

    updateSearchParams({
      sort: field,
      order: newDirection,
    })
  }

  // Action handlers
  const handleEdit = (batch: BatchWithCurrentLocationAndSpecies) => {
    setEditingBatch(batch)
  }

  const handleDelete = (_batchId: string) => {
    // TODO: Implement batch deletion
    toast({
      description: "Batch deletion not yet implemented",
      variant: "destructive",
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
        batch.collection_id === mergeState.initiatingBatch.collection_id,
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
            filters={filters}
            onFiltersChange={handleFiltersChange}
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
                            onClick={() => handleSort("collection_id")}
                            className="font-semibold"
                          >
                            Collection
                            {getSortIcon("collection_id")}
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
                          mergeMode={getMergeModeForBatch(batch)}
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

        {/* Modals */}
        {editingBatch && (
          <BatchEditModal
            isOpen={Boolean(editingBatch)}
            onClose={() => setEditingBatch(null)}
            batch={editingBatch}
            batchFilter={batchFilter}
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
            batchFilter={batchFilter}
          />
        )}

        {processingBatch && (
          <BatchProcessingModal
            isOpen={Boolean(processingBatch)}
            onClose={() => setPocessingBatch(null)}
            batch={processingBatch}
            batchFilter={batchFilter}
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
            batchFilter={batchFilter}
          />
        )}
      </div>
    </div>
  )
}
