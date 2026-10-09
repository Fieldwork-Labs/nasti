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
 * One bag as a Testing organisation sees it: a bag it holds, and the open
 * assignment(s) its seed came from. A bag that was sent is its own assignment's
 * bag; a split child carries its parent's assignment, and a merged bag carries
 * every assignment its sources did. Two bags of one batch are two rows.
 */
export type AssignedBag = {
  /** Never empty: a held bag with no open assignment is not testing work. */
  assignments: BatchAssignmentWithOrg[]
  subBatchId: string
  weights: {
    original_weight: number | null
    current_weight: number | null
  }
  containerName: string | null
  currentLocationId: string | null
  parent: AssignedBagParent
}

/** The organisation that sent the seed. One batch, so one owner. */
export const getAssignedBagSender = (bag: AssignedBag) =>
  bag.assignments[0]?.assigned_by_org?.name ?? null

/** When the earliest of the bag's seed arrived. */
export const getAssignedBagAssignedAt = (bag: AssignedBag) =>
  bag.assignments.reduce(
    (earliest, assignment) =>
      assignment.assigned_at < earliest ? assignment.assigned_at : earliest,
    bag.assignments[0].assigned_at,
  )

/**
 * Tested once every assignment the bag carries has been tested. A merged bag
 * whose sources were tested separately is only done when all of them were.
 */
export const isAssignedBagTested = (bag: AssignedBag) =>
  bag.assignments.every((assignment) => Boolean(assignment.completed_at))

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
      return (getAssignedBagSender(a) ?? "").localeCompare(
        getAssignedBagSender(b) ?? "",
      )
    default:
      return (
        new Date(getAssignedBagAssignedAt(a)).getTime() -
        new Date(getAssignedBagAssignedAt(b)).getTime()
      )
  }
}

/**
 * The Testing organisation's inventory: one row per bag it holds that carries
 * seed from an open assignment.
 *
 * Bags rather than assignments, because a laboratory may split and merge what
 * it was sent: an assignment's seed can end up in several bags, and one merged
 * bag can carry several assignments' seed. fn_testing_held_bags follows lineage
 * to pair each held bag with its assignments. An assignment closes once the
 * laboratory holds none of its seed, so closed work appears in no list.
 *
 * Four queries, none of them per row: the bag/assignment pairs, the
 * assignments, the bags, and their parent batches for context.
 *
 * Filtering and sorting happen here rather than in the database because the
 * list is assembled from several sources and is small — a laboratory's open
 * work, not an entire inventory.
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

      const { data: pairs, error: pairError } = await supabase.rpc(
        "fn_testing_held_bags",
      )

      if (pairError) throw new Error(pairError.message)
      if (!pairs || pairs.length === 0) return []

      const assignmentIdsByBag = new Map<string, string[]>()
      for (const pair of pairs) {
        assignmentIdsByBag.set(pair.sub_batch_id, [
          ...(assignmentIdsByBag.get(pair.sub_batch_id) ?? []),
          pair.assignment_id,
        ])
      }
      const subBatchIds = [...assignmentIdsByBag.keys()]

      const { data: assignments, error: assignmentError } = await supabase
        .from("batch_testing_assignment")
        .select(
          `
          *,
          assigned_to_org:organisation!assigned_to_org_id(name),
          assigned_by_org:organisation!assigned_by_org_id(name)
        `,
        )
        .in("id", [...new Set(pairs.map((pair) => pair.assignment_id))])

      if (assignmentError) throw new Error(assignmentError.message)

      const assignmentById = new Map(
        (assignments as BatchAssignmentWithOrg[]).map((assignment) => [
          assignment.id,
          assignment,
        ]),
      )

      // The held bags themselves. fn_testing_held_bags only returns bags with
      // seed in them, which is also what active_sub_batches shows the holder.
      const { data: bags, error: bagError } = await supabase
        .from("active_sub_batches")
        .select(
          "*, container:containers!sub_batches_container_id_fkey(id, name)",
        )
        .in("id", subBatchIds)

      if (bagError) throw new Error(bagError.message)

      const typedBags = (bags ?? []) as ((typeof bags)[number] & {
        container: { id: string; name: string } | null
      })[]

      // Parent metadata for context: what species, which collection. A batch
      // with no collection of its own (cleaned from a combined batch) carries
      // its species itself.
      const { data: parents, error: parentError } = await supabase
        .from("batches")
        .select(
          `id, code, collection_id, species_id,
           species:species_id(id, name),
           collection:collection_id(id, code, species_id, species:species_id(id, name))`,
        )
        .in("id", [
          ...new Set(
            typedBags.flatMap((bag) => (bag.batch_id ? [bag.batch_id] : [])),
          ),
        ])

      if (parentError) throw new Error(parentError.message)

      const parentById = new Map(
        (parents ?? []).map((parent) => {
          const collection = parent.collection as {
            id: string
            code: string | null
            species_id: string | null
            species: { id: string; name: string } | null
          } | null
          const batchSpecies = parent.species as {
            id: string
            name: string
          } | null

          return [
            parent.id,
            {
              id: parent.id,
              code: parent.code,
              collection_id: parent.collection_id,
              collection_code: collection?.code ?? null,
              species_id: collection?.species_id ?? parent.species_id ?? null,
              species_name:
                collection?.species?.name ?? batchSpecies?.name ?? null,
            } satisfies AssignedBagParent,
          ]
        }),
      )

      const assembled = typedBags.flatMap<AssignedBag>((bag) => {
        if (!bag.id || !bag.batch_id) return []

        const parent = parentById.get(bag.batch_id)
        const bagAssignments = (assignmentIdsByBag.get(bag.id) ?? []).flatMap(
          (id) => {
            const assignment = assignmentById.get(id)
            return assignment ? [assignment] : []
          },
        )

        if (!parent || bagAssignments.length === 0) return []

        return [
          {
            assignments: bagAssignments,
            subBatchId: bag.id,
            weights: {
              original_weight: bag.original_weight ?? null,
              current_weight: bag.current_weight ?? 0,
            },
            containerName: bag.container?.name ?? null,
            currentLocationId: bag.current_location_id ?? null,
            parent,
          },
        ]
      })

      const search = filter.search.trim().toLowerCase()

      const filtered = assembled.filter((row) => {
        if (filter.status === "pending" && isAssignedBagTested(row)) {
          return false
        }
        if (filter.status === "completed" && !isAssignedBagTested(row)) {
          return false
        }
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
 * By bag, not by assignment: after a split or merge one assignment's seed may
 * be in several bags. Each assignment the bag carries closes once the
 * laboratory holds none of its seed. To keep part of a bag, split it first and
 * return the rest; what is kept stays on the list until returned or used up.
 */
export const useReturnBagFromTesting = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ subBatchId }: { subBatchId: string }) => {
      const { error, data } = await supabase.functions.invoke(
        "return_batch_from_testing",
        {
          body: { sub_batch_id: subBatchId },
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
