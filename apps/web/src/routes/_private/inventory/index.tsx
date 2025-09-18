import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { useMemo, useState } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown, Plus } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { useToast } from "@nasti/ui/hooks"

import { BatchInventoryFilters } from "@/components/inventory/BatchInventoryFilters"
import { BatchTableRow } from "@/components/inventory/BatchTableRow"
import { BatchStorageForm } from "@/components/storage/BatchStorageForm"
import { BatchForm } from "@/components/batches/BatchForm"
import type { BatchWithCustody } from "@/hooks/useBatches"
import {
  invalidateBatchesByFilterCache,
  useBatchesByFilter,
} from "@/hooks/useBatches"

// Define search schema for URL parameters
const inventorySearchSchema = z.object({
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

function InventoryPage() {
  const navigate = Route.useNavigate()

  const searchParams = Route.useSearch()
  const { toast } = useToast()

  // Local state for modals
  const [editingBatch, setEditingBatch] = useState<BatchWithCustody | null>(
    null,
  )
  const [storageMoveBatch, setStorageMoveBatch] =
    useState<BatchWithCustody | null>(null)
  const [showCreateBatchModal, setShowCreateBatchModal] = useState(false)

  // Extract filters from URL search params
  const filters = useMemo(
    () => ({
      speciesId: searchParams.species || null,
      locationId: searchParams.location || null,
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
      speciesId: filters.speciesId || undefined,
      locationId: filters.locationId || undefined,
      search: filters.searchTerm,
      sort: sortField,
      order: sortDirection,
    }),
    [filters, sortField, sortDirection],
  )

  // Fetch batches using the filter hook
  const { data: batches = [], isLoading } = useBatchesByFilter(batchFilter)

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
      search: updatedParams,
      replace: true,
    })
  }

  // Handle filter changes
  const handleFiltersChange = (newFilters: {
    speciesId?: string | null
    collectionId?: string | null
    locationId?: string | null
    searchTerm?: string
  }) => {
    updateSearchParams({
      species: newFilters.speciesId
        ? newFilters.speciesId
        : searchParams.species,
      collection: newFilters.collectionId
        ? newFilters.collectionId
        : searchParams.collection,
      location: newFilters.locationId
        ? newFilters.locationId
        : searchParams.location,
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

  // Use batches directly since filtering and sorting is handled by the hook
  const filteredAndSortedBatches = batches

  // Action handlers
  const handleEdit = (batch: BatchWithCustody) => {
    setEditingBatch(batch)
  }

  const handleDelete = (_batchId: string) => {
    // TODO: Implement batch deletion
    toast({
      description: "Batch deletion not yet implemented",
      variant: "destructive",
    })
  }

  const handleSplit = (_batch: BatchWithCustody) => {
    // TODO: Implement batch splitting
    toast({
      description: "Batch splitting not yet implemented",
      variant: "destructive",
    })
  }

  const handleMerge = (_batch: BatchWithCustody) => {
    // TODO: Implement batch merging
    toast({
      description: "Batch merging not yet implemented",
      variant: "destructive",
    })
  }

  const handleStorageMove = (batch: BatchWithCustody) => {
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
            <h1 className="text-3xl font-bold">Batch Inventory</h1>
            <p className="text-muted-foreground">
              Manage and track your seed batches
            </p>
          </div>
          <Button
            className="gap-2"
            onClick={() => setShowCreateBatchModal(true)}
          >
            <Plus className="h-4 w-4" />
            Create Batch
          </Button>
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
            Showing {filteredAndSortedBatches.length} of {batches.length}{" "}
            batches
          </p>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          {isLoading && <div className="h-20 w-full animate-pulse space-y-4" />}
          {!isLoading && (
            <>
              {filteredAndSortedBatches.length === 0 ? (
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
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort("created_at")}
                            className="font-semibold"
                          >
                            Batch ID
                            {getSortIcon("created_at")}
                          </Button>
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Species
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
                          Storage Location
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
                      {filteredAndSortedBatches.map((batch) => (
                        <BatchTableRow
                          key={batch.id}
                          batch={batch}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onSplit={handleSplit}
                          onMerge={handleMerge}
                          onStorageMove={handleStorageMove}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Modals */}
        <Dialog
          open={Boolean(editingBatch)}
          onOpenChange={() => setEditingBatch(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Batch</DialogTitle>
            </DialogHeader>
            {editingBatch && (
              <BatchForm
                batch={editingBatch}
                onSuccess={() => {
                  setEditingBatch(null)
                  invalidateBatchesByFilterCache(batchFilter)
                }}
                onCancel={() => setEditingBatch(null)}
              />
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(storageMoveBatch)}
          onOpenChange={() => setStorageMoveBatch(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage Batch Storage</DialogTitle>
            </DialogHeader>
            {storageMoveBatch && (
              <BatchStorageForm
                batch={storageMoveBatch}
                onSuccess={() => setStorageMoveBatch(null)}
                onCancel={() => setStorageMoveBatch(null)}
              />
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={showCreateBatchModal}
          onOpenChange={setShowCreateBatchModal}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Batch</DialogTitle>
            </DialogHeader>
            <BatchForm
              onSuccess={() => {
                setShowCreateBatchModal(false)
                invalidateBatchesByFilterCache(batchFilter)
              }}
              onCancel={() => setShowCreateBatchModal(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
