import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import { useToast } from "@nasti/ui/hooks"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { motion } from "motion/react"
import { useState } from "react"
import { z } from "zod"

import { BatchInventoryFilters } from "@/components/inventory/BatchInventoryFilters"
import { BatchTableRow } from "./BatchTableRow/Testing"
import { BatchStorageModal } from "@/components/inventory/modals"
import { BatchProcessingModal } from "@/components/inventory/modals/BatchProcessingModal"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import { useBatchDelete } from "@/hooks/useBatches"
import { useBatchFiltersContext, type SortField } from "./BatchFiltersContext"

// Define search schema for URL parameters
export const inventorySearchSchemaTesting = z.object({
  status: z.enum(["any", "pending", "completed"]).default("any").optional(),
  speciesId: z.string().optional(),
  collection: z.string().optional(),
  locationId: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(["created_at", "species_id", "organisation_id"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
})

export function InventoryPageTesting() {
  const { toast } = useToast()

  // Local state for modals
  const [storageMoveBatch, setStorageMoveBatch] =
    useState<BatchWithCurrentLocationAndSpecies | null>(null)
  const [processingBatch, setPocessingBatch] =
    useState<BatchWithCurrentLocationAndSpecies | null>(null)

  const {
    data: batches = [],
    isLoading,
    invalidateBatchesCacheByFilter,
    handleSort,
    sortField,
    sortDirection,
  } = useBatchFiltersContext()

  const { mutateAsync: deleteBatch } = useBatchDelete()

  const handleDelete = async (_batchId: string) => {
    const deleted = await deleteBatch(_batchId)
    if (deleted)
      toast({
        description: "Batch successfully deleted",
      })
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

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{"Testing Assignments"}</h1>
            <p className="text-muted-foreground">
              Manage batches assigned for testing and quality assurance
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-6">
          <BatchInventoryFilters statuses={["any", "pending", "completed"]} />
        </Card>

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Showing {batches.length} of {batches.length} batches
          </p>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
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
                            Collection
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
                          onDelete={handleDelete}
                          onStorageMove={handleStorageMove}
                          onProcess={setPocessingBatch}
                        />
                      ))}
                    </tbody>
                  </motion.table>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Modals */}

        {storageMoveBatch && (
          <BatchStorageModal
            isOpen={Boolean(storageMoveBatch)}
            onClose={() => setStorageMoveBatch(null)}
            batch={storageMoveBatch}
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
      </div>
    </div>
  )
}
