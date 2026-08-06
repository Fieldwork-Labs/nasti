import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import useUserStore from "@/store/userStore"
import type { BatchAssignmentWithOrg } from "./useBatchAssignments"
import type { BatchWithCurrentLocationAndSpecies } from "./useBatches"
import type { InventoryStatusFilter } from "@/lib/testingAssignments"

/** A batch as a Testing organisation sees it: through the assignment. */
export type AssignedBatch = BatchWithCurrentLocationAndSpecies & {
  assignment: BatchAssignmentWithOrg
}

export type AssignmentInventoryFilter = {
  status?: InventoryStatusFilter
  speciesId?: string
  locationId?: string
  search: string
  sort: string
  order: string
}

/**
 * The Testing organisation's inventory.
 *
 * Assignments are the source of truth here, not the General inventory filter:
 * a Testing organisation holds whatever has been assigned to it and not yet
 * returned. Returned assignments are excluded from every list, because the seed
 * is no longer theirs.
 *
 * Two queries, not one per row: the assignments, then every batch they
 * reference in a single `in` query, merged by batch_id.
 */
export const useAssignedBatchesByFilter = (
  filter: AssignmentInventoryFilter,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const { organisation } = useUserStore()

  return useQuery<AssignedBatch[]>({
    queryKey: ["assignments", "byStatus", organisation?.id, filter],
    enabled: enabled && Boolean(organisation?.id),
    queryFn: async () => {
      if (!organisation?.id) throw new Error("No organisation found")

      let assignmentQuery = supabase
        .from("batch_testing_assignment")
        .select(
          `
          *,
          assigned_to_org:organisation!assigned_to_org_id(name),
          assigned_by_org:organisation!assigned_by_org_id(name)
        `,
        )
        .eq("assigned_to_org_id", organisation.id)
        .is("returned_at", null)

      if (filter.status === "pending") {
        assignmentQuery = assignmentQuery.is("completed_at", null)
      } else if (filter.status === "completed") {
        assignmentQuery = assignmentQuery.not("completed_at", "is", null)
      }

      const { data: assignments, error: assignmentError } =
        await assignmentQuery.order("assigned_at", { ascending: false })

      if (assignmentError) throw new Error(assignmentError.message)
      if (!assignments || assignments.length === 0) return []

      const assignmentByBatchId = new Map(
        (assignments as BatchAssignmentWithOrg[]).map((assignment) => [
          assignment.batch_id,
          assignment,
        ]),
      )

      // One query for every referenced batch. The remaining filters and the
      // sort are applied here so the server still does that work.
      let batchQuery = supabase
        .from("active_batches")
        .select(
          `*,
          collection:collection_id(
            id,
            field_name,
            code
          ),
          species:collection_id!inner(...species(
            id,
            name
          )
        )`,
        )
        .in("id", Array.from(assignmentByBatchId.keys()))

      if (filter.search) {
        batchQuery = batchQuery.ilike("code", `%${filter.search}%`)
      }
      if (filter.speciesId) {
        batchQuery = batchQuery.eq("species_id", filter.speciesId)
      }
      if (filter.locationId) {
        batchQuery = batchQuery.eq("current_location_id", filter.locationId)
      }

      const sort = filter.sort === "species_id" ? "species(name)" : filter.sort

      const { data: batches, error: batchError } = await batchQuery
        .order(sort, { ascending: filter.order === "asc" })
        .overrideTypes<
          Array<
            Omit<BatchWithCurrentLocationAndSpecies, "weights"> & {
              original_weight: number
              current_weight: number
            }
          >
        >()

      if (batchError) throw new Error(batchError.message)

      return (batches ?? []).flatMap((batch) => {
        const assignment = assignmentByBatchId.get(batch.id)
        if (!assignment) return []

        return [
          {
            ...batch,
            weights: {
              original_weight: batch.original_weight,
              current_weight: batch.current_weight,
            },
            assignment,
          } as AssignedBatch,
        ]
      })
    },
  })
}

// An assignment is completed by fn_create_quality_test, in the same
// transaction as the test that completes it. There is no separate client
// action, and no complete_testing_assignment edge function.

// Return batch/sample to owner
export const useReturnBatchFromTesting = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      assignmentId,
      subsampleWeightGrams,
      subsampleStorageLocationId,
    }: {
      assignmentId: string
      subsampleWeightGrams?: number
      subsampleStorageLocationId?: string
    }) => {
      const { error, data } = await supabase.functions.invoke(
        "return_batch_from_testing",
        {
          body: {
            assignment_id: assignmentId,
            subsample_weight_grams: subsampleWeightGrams,
            subsample_storage_location_id: subsampleStorageLocationId,
          },
        },
      )

      if (error) {
        throw new Error(error.message || "Failed to return batch")
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments", "byStatus"] })
      queryClient.invalidateQueries({ queryKey: ["batches"] })
      queryClient.invalidateQueries({ queryKey: ["subBatches"] })
    },
  })
}
