import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import { ArrowDown, ArrowUp, ArrowUpDown, Merge, X } from "lucide-react"
import { motion } from "motion/react"
import { useState } from "react"
import { z } from "zod"

import { SubBatchMergeModal } from "@/components/batches/SubBatchMergeModal"
import { BatchInventoryFilters } from "@/components/inventory/BatchInventoryFilters"
import { useSubBatches } from "@/hooks/useSubBatches"
import { BagTableRow } from "./BatchTableRow/Testing"
import { useBatchFiltersContext, type SortField } from "./BatchFiltersContext"
import { TestingTestHistory } from "./TestingTestHistory"

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

type MergeSelection = {
  batchId: string
  batchCode: string | null
  subBatchIds: string[]
}

/**
 * The merge modal works on full bag records, which the inventory rows do not
 * carry. useSubBatches reads them for the laboratory's own bags of the batch.
 */
const TestingMergeModal = ({
  selection,
  onClose,
  onSuccess,
}: {
  selection: MergeSelection
  onClose: () => void
  onSuccess: () => void
}) => {
  const { data: subBatches } = useSubBatches(selection.batchId)
  const selected =
    subBatches?.filter((subBatch) =>
      selection.subBatchIds.includes(subBatch.id),
    ) ?? []

  if (selected.length < 2) return null

  return (
    <SubBatchMergeModal
      isOpen
      onClose={onClose}
      onSuccess={onSuccess}
      subBatches={selected}
    />
  )
}

export function InventoryPageTesting() {
  const {
    assignedBags,
    isLoading,
    error,
    handleSort,
    sortField,
    sortDirection,
  } = useBatchFiltersContext()

  const [mergeSelection, setMergeSelection] = useState<MergeSelection | null>(
    null,
  )
  const [showMergeModal, setShowMergeModal] = useState(false)

  // Merging stays within one batch, so a bag can only be merged when the
  // laboratory holds another bag of the same batch.
  const bagCountByBatch = new Map<string, number>()
  for (const bag of assignedBags) {
    bagCountByBatch.set(
      bag.parent.id,
      (bagCountByBatch.get(bag.parent.id) ?? 0) + 1,
    )
  }

  const toggleMergeBag = (subBatchId: string) => {
    setMergeSelection((current) =>
      current
        ? {
            ...current,
            subBatchIds: current.subBatchIds.includes(subBatchId)
              ? current.subBatchIds.filter((id) => id !== subBatchId)
              : [...current.subBatchIds, subBatchId],
          }
        : current,
    )
  }

  const endMerge = () => {
    setShowMergeModal(false)
    setMergeSelection(null)
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
              Bags sent to you for testing and quality assurance
            </p>
          </div>
        </div>

        <Tabs defaultValue="bags" className="space-y-6">
          <TabsList>
            <TabsTrigger value="bags">Bags</TabsTrigger>
            <TabsTrigger value="results">Test results</TabsTrigger>
          </TabsList>

          <TabsContent value="results">
            <TestingTestHistory />
          </TabsContent>

          <TabsContent value="bags" className="space-y-6">
            {/* Filters */}
            <Card className="p-6">
              <BatchInventoryFilters
                statuses={["any", "pending", "completed"]}
              />
            </Card>

            {/* Results Summary */}
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                {isLoading || error
                  ? null
                  : `Showing ${assignedBags.length} bag${assignedBags.length === 1 ? "" : "s"}`}
              </p>
              {mergeSelection && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">
                    Pick bags of {mergeSelection.batchCode ?? "this batch"} to
                    merge
                  </span>
                  <Button
                    size="sm"
                    disabled={mergeSelection.subBatchIds.length < 2}
                    onClick={() => setShowMergeModal(true)}
                  >
                    <Merge className="mr-1 h-4 w-4" />
                    Merge ({mergeSelection.subBatchIds.length})
                  </Button>
                  <Button variant="outline" size="sm" onClick={endMerge}>
                    <X className="mr-1 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {/* Table */}
            <Card className="overflow-hidden">
              {isLoading && (
                <div className="h-20 w-full animate-pulse space-y-4" />
              )}
              {/* A failed query is not an empty inventory, and must not read as one. */}
              {!isLoading && error && (
                <div className="p-8 text-center">
                  <h3 className="mb-2 text-lg font-semibold">
                    Could not load assignments
                  </h3>
                  <p className="text-muted-foreground">
                    {error.message ??
                      "Something went wrong fetching your assignments."}
                  </p>
                </div>
              )}
              {!isLoading && !error && (
                <>
                  {assignedBags.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="text-muted-foreground">
                        <h3 className="mb-2 text-lg font-semibold">
                          No bags to test
                        </h3>
                        <p>Bags sent to you for testing will appear here.</p>
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
                            <th className="px-4 py-3 text-left">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSort("organisation_id")}
                                className="font-semibold"
                              >
                                Owner
                                {getSortIcon("organisation_id")}
                              </Button>
                            </th>
                            <th className="text-foreground px-4 py-3 text-left font-semibold">
                              Status
                            </th>
                            <th className="text-foreground px-4 py-3 text-left font-semibold">
                              Bag
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
                                Assigned
                                {getSortIcon("created_at")}
                              </Button>
                            </th>
                            <th className="px-4 py-3 text-left font-semibold">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignedBags.map((bag) => (
                            <BagTableRow
                              key={bag.subBatchId}
                              bag={bag}
                              canMerge={
                                (bagCountByBatch.get(bag.parent.id) ?? 0) > 1
                              }
                              onStartMerge={() =>
                                setMergeSelection({
                                  batchId: bag.parent.id,
                                  batchCode: bag.parent.code,
                                  subBatchIds: [bag.subBatchId],
                                })
                              }
                              mergeMode={{
                                isActive: Boolean(mergeSelection),
                                isSelectable:
                                  mergeSelection?.batchId === bag.parent.id,
                                isSelected: Boolean(
                                  mergeSelection?.subBatchIds.includes(
                                    bag.subBatchId,
                                  ),
                                ),
                                onToggle: () => toggleMergeBag(bag.subBatchId),
                              }}
                            />
                          ))}
                        </tbody>
                      </motion.table>
                    </div>
                  )}
                </>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {mergeSelection && showMergeModal && (
        <TestingMergeModal
          selection={mergeSelection}
          onClose={() => setShowMergeModal(false)}
          onSuccess={endMerge}
        />
      )}
    </div>
  )
}
