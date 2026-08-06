import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { motion } from "motion/react"
import { z } from "zod"

import { BatchInventoryFilters } from "@/components/inventory/BatchInventoryFilters"
import { BagTableRow } from "./BatchTableRow/Testing"
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
  const {
    assignedBags,
    isLoading,
    error,
    handleSort,
    sortField,
    sortDirection,
  } = useBatchFiltersContext()

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

        {/* Filters */}
        <Card className="p-6">
          <BatchInventoryFilters statuses={["any", "pending", "completed"]} />
        </Card>

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            {isLoading || error
              ? null
              : `Showing ${assignedBags.length} bag${assignedBags.length === 1 ? "" : "s"}`}
          </p>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          {isLoading && <div className="h-20 w-full animate-pulse space-y-4" />}
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
                            Collection
                            {getSortIcon("species_id")}
                          </Button>
                        </th>
                        <th className="text-foreground px-4 py-3 text-left font-semibold">
                          Assignment
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
                        <BagTableRow key={bag.assignment.id} bag={bag} />
                      ))}
                    </tbody>
                  </motion.table>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
