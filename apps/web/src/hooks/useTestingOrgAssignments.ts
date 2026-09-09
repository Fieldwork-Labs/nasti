import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import useUserStore from "@/store/userStore"
import type { BatchAssignmentWithOrg } from "./useBatchAssignments"
import type { InventoryStatusFilter } from "@/lib/testingAssignments"

/** The parent batch, for context only — the bag is the physical unit. */
export type AssignedBagParent = {
  id: string
  code: string | null
  collection_id: string | null
  species_id: string | null
  species_name: string | null
  collection_code: string | null
}

/**
 * One bag as a Testing organisation sees it: through the assignment that sent
 * it. One of these per assignment, never per parent batch — two bags of one
 * batch are two rows.
 */
export type AssignedBag = {
  assignment: BatchAssignmentWithOrg
  subBatchId: string
  weights: {
    original_weight: number | null
    current_weight: number | null
  }
  containerName: string | null
  currentLocationId: string | null
  parent: AssignedBagParent
}

export type AssignmentInventoryFilter = {
  status?: InventoryStatusFilter
  speciesId?: string
  locationId?: string
  search: string
  sort: string
  order: string
}

type AssignedBagSortField = "created_at" | "species_id" | "organisation_id"

const compareAssignedBags = (
  a: AssignedBag,
  b: AssignedBag,
  sort: string,
): number => {
  switch (sort as AssignedBagSortField) {
    case "species_id":
      return (a.parent.species_name ?? "").localeCompare(
        b.parent.species_name ?? "",
      )
    case "organisation_id":
      return (a.assignment.assigned_by_org?.name ?? "").localeCompare(
        b.assignment.assigned_by_org?.name ?? "",
      )
    default:
      return (
        new Date(a.assignment.assigned_at).getTime() -
        new Date(b.assignment.assigned_at).getTime()
      )
  }
}

/**
 * The Testing organisation's inventory: one row per open assignment.
 *
 * Assignments are the source of truth, not the General inventory filter — a
 * laboratory holds whatever has been sent to it and not yet closed. Closed
 * assignments appear in no list, because the seed is no longer its business.
 *
 * Three queries, none of them per row: the assignments, the exact bags they
 * name, and the parent batches for context. Deliberately not `active_batches`:
 * that view aggregates every bag of a batch and drops rows at zero weight, so a
 * consumed bag would vanish from the list while its assignment was still open,
 * and two bags of one batch would collapse into a single entry.
 *
 * Filtering and sorting happen here rather than in the database because the
 * list is assembled from three sources and is small — a laboratory's open
 * assignments, not an entire inventory.
 */
export const useAssignedBagsByFilter = (
  filter: AssignmentInventoryFilter,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const { organisation } = useUserStore()

  return useQuery<AssignedBag[]>({
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
        .is("closed_at", null)

      if (filter.status === "pending") {
        assignmentQuery = assignmentQuery.is("completed_at", null)
      } else if (filter.status === "completed") {
        assignmentQuery = assignmentQuery.not("completed_at", "is", null)
      }

      const { data: assignments, error: assignmentError } =
        await assignmentQuery.order("assigned_at", { ascending: false })

      if (assignmentError) throw new Error(assignmentError.message)
      if (!assignments || assignments.length === 0) return []

      const rows = assignments as BatchAssignmentWithOrg[]

      // The exact bags, by sub_batch_id. RLS already limits these to bags this
      // organisation may see, so a missing row means the bag went away rather
      // than that the filter was too broad.
      const { data: bags, error: bagError } = await supabase
        .from("active_sub_batches")
        .select(
          "*, container:containers!sub_batches_container_id_fkey(id, name)",
        )
        .in(
          "id",
          rows.map((assignment) => assignment.sub_batch_id),
        )

      if (bagError) throw new Error(bagError.message)

      const bagById = new Map(
        (bags ?? []).map((bag) => [
          bag.id as string,
          bag as (typeof bags)[number] & {
            container: { id: string; name: string } | null
          },
        ]),
      )

      // Parent metadata for context: what species, which collection.
      const { data: parents, error: parentError } = await supabase
        .from("batches")
        .select(
          `id, code, collection_id,
           collection:collection_id(id, code, species_id, species:species_id(id, name))`,
        )
        .in(
          "id",
          rows.map((assignment) => assignment.batch_id),
        )

      if (parentError) throw new Error(parentError.message)

      const parentById = new Map(
        (parents ?? []).map((parent) => {
          const collection = parent.collection as {
            id: string
            code: string | null
            species_id: string | null
            species: { id: string; name: string } | null
          } | null

          return [
            parent.id,
            {
              id: parent.id,
              code: parent.code,
              collection_id: parent.collection_id,
              collection_code: collection?.code ?? null,
              species_id: collection?.species_id ?? null,
              species_name: collection?.species?.name ?? null,
            } satisfies AssignedBagParent,
          ]
        }),
      )

      const assembled = rows.flatMap<AssignedBag>((assignment) => {
        const bag = bagById.get(assignment.sub_batch_id)
        const parent = parentById.get(assignment.batch_id)

        // A bag consumed to zero leaves active_sub_batches while its assignment
        // is still open. Keep the row: the assignment is what the laboratory
        // acts on, and it still needs closing.
        if (!parent) return []

        return [
          {
            assignment,
            subBatchId: assignment.sub_batch_id,
            weights: {
              original_weight: bag?.original_weight ?? null,
              current_weight: bag?.current_weight ?? 0,
            },
            containerName: bag?.container?.name ?? null,
            currentLocationId: bag?.current_location_id ?? null,
            parent,
          },
        ]
      })

      const search = filter.search.trim().toLowerCase()

      const filtered = assembled.filter((row) => {
        if (search && !(row.parent.code ?? "").toLowerCase().includes(search)) {
          return false
        }
        if (filter.speciesId && row.parent.species_id !== filter.speciesId) {
          return false
        }
        if (filter.locationId && row.currentLocationId !== filter.locationId) {
          return false
        }
        return true
      })

      const direction = filter.order === "asc" ? 1 : -1
      return filtered.sort(
        (a, b) => compareAssignedBags(a, b, filter.sort) * direction,
      )
    },
  })
}

// An assignment is completed by fn_create_quality_test, in the same
// transaction as the test that completes it. There is no separate client
// action, and no complete_testing_assignment edge function.

/**
 * Hand a bag back to the organisation that sent it.
 *
 * No retained-subsample arguments: a laboratory keeping part of the seed splits
 * the bag first through the ordinary split, and the child is theirs without an
 * assignment of its own.
 */
export const useReturnBagFromTesting = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assignmentId }: { assignmentId: string }) => {
      const { error, data } = await supabase.functions.invoke(
        "return_batch_from_testing",
        {
          body: { assignment_id: assignmentId },
        },
      )

      if (error) {
        throw new Error(error.message || "Failed to return bag")
      }

      return data
    },
    onSuccess: () => {
      // Returning moves custody, so both organisations' views of the bag, its
      // parent batch and that batch's weight all change at once.
      for (const key of [
        ["assignments"],
        ["batches"],
        ["subBatches"],
        ["batch-assignment"],
        ["batch-assignments"],
        ["batch-storage"],
      ]) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })
}
